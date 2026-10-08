/* ─── সব তথ্য এক জায়গায় — Durable Object (SQLite) ───
   একটাই কপি (নাম "main"), তাই একসাথে দুই কাজ এলেও একটার পর একটা চলে — কোনো লেখা হারায় না।

   একটা নিউজের ধাপ (status):
     new → working (AI লিখছে) → ready (অনুমোদনের অপেক্ষায়) → approved (পোস্টের লাইনে) → posted
     লিখতে না পারলে failed; পোস্ট ৩ বার ব্যর্থ হলে post_failed; বাদ দিলে rejected।
   অনুমোদনের সময় পাতায় আঁকা কার্ডের JPG `cards`-এ জমা থাকে — পোস্ট হয় সেটাই, হুবহু যা মালিক দেখেছেন। */
import { DurableObject } from 'cloudflare:workers';
import { DEFAULT_SLOTS } from './util.js';

const COLS = 'id, url, status, headline, body, category, source, date_label, caption, image_url, error, attempts, created_at, approved_at, posted_at, fb_post_id';
const MAX_CARD = 1_900_000;                 // SQLite-এর এক ঘরে ২ MB পর্যন্ত
const STUCK_MS = 150 * 1000;                // "লিখছে" অবস্থায় আড়াই মিনিটের বেশি থাকলে কাজটা মাঝপথে থেমেছে ধরা হয়
const MAX_CLAIMS = 2;                       // দুবার থামলে আর নয় — কারণসহ "সমস্যা"-তে
const DAY = 86400000;

export class NewsStore extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS drafts (
        id TEXT PRIMARY KEY, url TEXT NOT NULL, status TEXT NOT NULL,
        headline TEXT, body TEXT, category TEXT, source TEXT, date_label TEXT, caption TEXT, image_url TEXT,
        error TEXT, attempts INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL, claim_at INTEGER, approved_at INTEGER, posted_at INTEGER, fb_post_id TEXT);
      CREATE INDEX IF NOT EXISTS drafts_status ON drafts(status, created_at);
      CREATE TABLE IF NOT EXISTS cards (id TEXT PRIMARY KEY, jpeg BLOB NOT NULL, created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL);
    `);
    /* v2 (৮ অক্টোবর): কতবার লেখা শুরু হয়েছে — মাঝপথে থেমে বারবার আটকে থাকা ঠেকাতে */
    const cols = this.sql.exec('PRAGMA table_info(drafts)').toArray().map(c => c.name);
    if (!cols.includes('claims')) this.sql.exec('ALTER TABLE drafts ADD COLUMN claims INTEGER NOT NULL DEFAULT 0');
  }

  _get(id) { return this.sql.exec(`SELECT ${COLS} FROM drafts WHERE id = ?`, id).toArray()[0] || null; }
  _kv(k, fallback) { const r = this.sql.exec('SELECT v FROM kv WHERE k = ?', k).toArray()[0]; return r ? JSON.parse(r.v) : fallback; }
  _setKv(k, v) { this.sql.exec('INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v', k, JSON.stringify(v)); }
  _need(id, ...statuses) {
    const d = this._get(id);
    if (!d) throw new Error('নিউজটা পাওয়া যায়নি');
    if (statuses.length && !statuses.includes(d.status)) throw new Error('এই অবস্থায় এটা করা যায় না — পাতা রিফ্রেশ করুন');
    return d;
  }

  /* ── লিংক যোগ — আগে যোগ করা লিংক আবার নয় (বাদ দেওয়াটা ছাড়া) ── */
  addLinks(urls, now = Date.now()) {
    const added = [], skipped = [];
    for (const url of urls) {
      const old = this.sql.exec("SELECT id FROM drafts WHERE url = ? AND status != 'rejected'", url).toArray()[0];
      if (old) { skipped.push(url); continue; }
      const id = now.toString(36) + Math.random().toString(36).slice(2, 7);
      this.sql.exec("INSERT INTO drafts (id, url, status, created_at) VALUES (?, ?, 'new', ?)", id, url, now++);
      added.push(id);
    }
    return { added, skipped };
  }

  /* ── পরের লেখার কাজ নেওয়া (একবারে একটাই, একজনই) ── */
  claimNext(now = Date.now()) {
    for (;;) {
      const d = this.sql.exec(
        "SELECT id, url, status, claims FROM drafts WHERE status = 'new' OR (status = 'working' AND claim_at < ?) ORDER BY created_at LIMIT 1",
        now - STUCK_MS).toArray()[0];
      if (!d) return null;
      if (d.status === 'working' && d.claims >= MAX_CLAIMS) {
        this.sql.exec("UPDATE drafts SET status = 'failed', attempts = attempts + 1, error = ? WHERE id = ?",
          'অনেকক্ষণ চেষ্টা করেও লেখা যায়নি — "আবার চেষ্টা" চাপুন; না হলে অন্য সাইটের লিংক দিন', d.id);
        continue;
      }
      this.sql.exec("UPDATE drafts SET status = 'working', claim_at = ?, claims = claims + 1 WHERE id = ?", now, d.id);
      return { id: d.id, url: d.url };
    }
  }
  saveWritten(id, f) {
    this.sql.exec(`UPDATE drafts SET status = 'ready', headline = ?, body = ?, category = ?, source = ?, date_label = ?,
      caption = ?, image_url = ?, error = NULL WHERE id = ? AND status = 'working'`,
      f.headline, f.body, f.category, f.source, f.date_label, f.caption, f.image_url || '', id);
    return this._get(id);
  }
  writeFailed(id, msg) {
    this.sql.exec("UPDATE drafts SET status = 'failed', error = ?, attempts = attempts + 1 WHERE id = ? AND status = 'working'", msg, id);
  }
  pendingCount() {
    return this.sql.exec("SELECT COUNT(*) AS n FROM drafts WHERE status IN ('new', 'working')").one().n;
  }

  /* ── পাতার তালিকা (ছবির বাইট ছাড়া) ── */
  list(now = Date.now()) {
    return this.sql.exec(`SELECT ${COLS} FROM drafts
      WHERE status != 'rejected' AND (status != 'posted' OR posted_at > ?)
      ORDER BY created_at DESC LIMIT 300`, now - 3 * DAY).toArray();
  }

  /* ── মালিকের হাতের কাজ ── */
  edit(id, f) {
    this._need(id, 'ready');
    const keys = ['headline', 'body', 'category', 'source', 'date_label', 'caption', 'image_url'];
    for (const k of keys) if (typeof f[k] === 'string') this.sql.exec(`UPDATE drafts SET ${k} = ? WHERE id = ?`, f[k].slice(0, 3000), id);
    return this._get(id);
  }
  approve(id, jpeg, caption, now = Date.now()) {
    this._need(id, 'ready');
    if (!jpeg || jpeg.byteLength < 1000) throw new Error('কার্ডের ছবি আসেনি — আবার চেষ্টা করুন');
    if (jpeg.byteLength > MAX_CARD) throw new Error('কার্ডের ছবি খুব বড়');
    this.sql.exec('INSERT INTO cards (id, jpeg, created_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET jpeg = excluded.jpeg, created_at = excluded.created_at', id, jpeg, now);
    this.sql.exec("UPDATE drafts SET status = 'approved', caption = ?, approved_at = ?, attempts = 0, error = NULL WHERE id = ?", String(caption || '').slice(0, 5000), now, id);
    return this._get(id);
  }
  unapprove(id) {
    this._need(id, 'approved', 'post_failed');
    this.sql.exec('DELETE FROM cards WHERE id = ?', id);
    this.sql.exec("UPDATE drafts SET status = 'ready', approved_at = NULL, error = NULL WHERE id = ?", id);
    return this._get(id);
  }
  reject(id) {
    this._need(id, 'new', 'working', 'ready', 'failed', 'approved', 'post_failed');
    this.sql.exec('DELETE FROM cards WHERE id = ?', id);
    this.sql.exec("UPDATE drafts SET status = 'rejected' WHERE id = ?", id);
    return { id, status: 'rejected' };
  }
  /* লেখা আবার (AI) — ব্যর্থ বা অপেক্ষমাণ; পোস্ট ব্যর্থ হলে আবার লাইনে */
  retry(id) {
    const d = this._need(id, 'failed', 'ready', 'post_failed');
    if (d.status === 'post_failed') this.sql.exec("UPDATE drafts SET status = 'approved', attempts = 0, error = NULL WHERE id = ?", id);
    else this.sql.exec("UPDATE drafts SET status = 'new', error = NULL, claims = 0 WHERE id = ?", id);
    return this._get(id);
  }
  card(id) {
    return this.sql.exec('SELECT jpeg FROM cards WHERE id = ?', id).toArray()[0]?.jpeg || null;
  }

  /* ── সময়সূচি ── */
  settings() {
    return { slots: this._kv('slots', DEFAULT_SLOTS), lastSlot: this._kv('lastSlot', null) };
  }
  setSlots(slots) { this._setKv('slots', slots); return this.settings(); }

  /* ── পোস্ট ── */
  nextApproved() {
    const d = this.sql.exec(`SELECT ${COLS} FROM drafts WHERE status = 'approved' ORDER BY approved_at LIMIT 1`).toArray()[0];
    return d ? { ...d, jpeg: this.card(d.id) } : null;
  }
  markPosted(id, fbPostId, slotKey, now = Date.now()) {
    this.sql.exec("UPDATE drafts SET status = 'posted', posted_at = ?, fb_post_id = ?, error = NULL WHERE id = ?", now, fbPostId, id);
    if (slotKey) this._setKv('lastSlot', slotKey);
  }
  markPostError(id, msg) {
    this.sql.exec(`UPDATE drafts SET attempts = attempts + 1, error = ?,
      status = CASE WHEN attempts + 1 >= 3 THEN 'post_failed' ELSE status END WHERE id = ?`, msg, id);
  }

  /* ── পরিষ্কার — বাদ দেওয়া ৩ দিন, পোস্ট হওয়া ১৪ দিন পরে মোছে; পোস্ট হওয়া কার্ডের ছবি ৩ দিন পরে ── */
  cleanup(now = Date.now()) {
    this.sql.exec("DELETE FROM cards WHERE id IN (SELECT id FROM drafts WHERE status = 'posted' AND posted_at < ?)", now - 3 * DAY);
    this.sql.exec("DELETE FROM drafts WHERE (status = 'rejected' AND created_at < ?) OR (status = 'posted' AND posted_at < ?)", now - 3 * DAY, now - 14 * DAY);
  }

  /* ── লগইনে বারবার ভুল — ১৫ মিনিটে ১০ বার ভুল হলে ১৫ মিনিট বন্ধ ── */
  loginGate(ok, now = Date.now()) {
    const recent = this._kv('loginFails', []).filter(t => t > now - 15 * 60000);
    if (recent.length >= 10) return false;
    if (!ok) { recent.push(now); this._setKv('loginFails', recent); }
    return true;
  }
}

/* ─── আমার বাংলাদেশ — নিউজ কার্ড অটোমেশন ───
   মালিক লিংক দেন → সাইট নিউজ পড়ে, DeepSeek হেডলাইন-বিস্তারিত লেখে → পাতায় কার্ড আঁকা হয় (নিউজের ছবি বা নিজের ছবি)
   → মালিক দেখে অনুমোদন দেন → ঠিক করা সময়ে ফেসবুক পেজে পোস্ট (প্রতি ৫ মিনিটের cron দেখে সময় হলো কি না)।
   পোস্টের আগে মালিকের অনুমোদন বাধ্যতামূলক (মালিকের কথা, ৮ অক্টোবর ২০২৬)।
   কার্ড আঁকা হয় ব্রাউজারে (public/card.js) — সেখানে বাংলা যুক্তাক্ষর নিখুঁত আসে, সার্ভারে আঁকলে ভেঙে যেতে পারে। */
import { NewsStore } from './store.js';
import { readArticle } from './article.js';
import { writeCard } from './ai.js';
import { fbTokenSet, listPages, postPhoto } from './facebook.js';
import { bnDateLabel, buildCaption, cleanCaption, dueSlot, extractUrls, parseSlots, upcomingSlots } from './util.js';

export { NewsStore };

const store = env => env.STORE.get(env.STORE.idFromName('main'));
const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });
const fail = (msg, status = 400) => json({ error: msg }, status);

/* ── লগইন — একটাই পাসওয়ার্ড (ADMIN_PASSWORD); কুকিতে মেয়াদ + HMAC। পাসওয়ার্ড বদলালে সব পুরনো লগইন বাতিল ── */
const enc = s => new TextEncoder().encode(s);
const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey('raw', enc(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, enc(msg)));
}
async function same(a, b) {
  const [x, y] = await Promise.all([hmac('cmp', a), hmac('cmp', b)]);
  return crypto.subtle.timingSafeEqual(enc(x), enc(y));
}
const SESSION_DAYS = 30;
async function makeSession(env) {
  const exp = Date.now() + SESSION_DAYS * 86400000;
  return `${exp}.${await hmac(env.ADMIN_PASSWORD + '|session', String(exp))}`;
}
async function signedIn(req, env) {
  if (!env.ADMIN_PASSWORD) return false;
  const m = (req.headers.get('Cookie') || '').match(/(?:^|;\s*)s=([^;]+)/);
  if (!m) return false;
  const [exp, sig] = m[1].split('.');
  if (!(Number(exp) > Date.now())) return false;
  return same(sig || '', await hmac(env.ADMIN_PASSWORD + '|session', exp));
}
const cookie = (req, value, maxAge) =>
  `s=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${new URL(req.url).protocol === 'https:' ? '; Secure' : ''}`;

/* ── একটা লিংক লেখা (পড়া + AI) ── */
export async function processOne(env) {
  const s = store(env);
  const d = await s.claimNext(Date.now());
  if (!d) return null;
  try {
    const art = await readArticle(d.url, env);
    const ai = await writeCard(art, d.url, env);
    const source = ai.source || art.siteName || new URL(d.url).hostname.replace(/^www\./, '');
    await s.saveWritten(d.id, {
      ...ai, source, date_label: bnDateLabel(), image_url: art.image,
      caption: buildCaption({ headline: ai.headline, body: ai.body }),
    });
    return { id: d.id, status: 'ready' };
  } catch (e) {
    await s.writeFailed(d.id, String(e.message || e));
    return { id: d.id, status: 'failed', error: String(e.message || e) };
  }
}

/* ── একটা কার্ড বাছা সব পেজে — যে পেজে আগেই গেছে সেখানে আবার নয়। কোনো পেজে না গেলে কারণসহ Error ── */
async function publish(env, s, item, slotKey) {
  const pages = await s.fbPages();
  const done = JSON.parse(item.fb_posts || '{}');
  const errs = [];
  if (!item.jpeg) errs.push('কার্ডের ছবি পাওয়া যায়নি');
  else {
    let all = [];
    try { all = await listPages(env); } catch (e) { errs.push(String(e.message || e)); }
    if (!errs.length) {
      for (const p of pages) {
        if (done[p.id]) continue;
        const page = all.find(x => x.id === p.id);
        if (!page) { errs.push(`${p.name}: এই পেজে পোস্ট করার অনুমতি নেই`); continue; }
        try { done[p.id] = { post: await postPhoto(env, page, item.jpeg, cleanCaption(item.caption)), name: page.name }; }
        catch (e) { errs.push(`${p.name}: ${e.message || e}`); }
      }
    }
  }
  await s.setPosts(item.id, done);
  if (errs.length) {
    await s.markPostError(item.id, errs.join(' • '));
    throw new Error(errs.join(' • '));
  }
  await s.markPosted(item.id, Object.values(done)[0]?.post || '', slotKey);
  return done;
}
const fbReady = async (env, s) => fbTokenSet(env) && (await s.fbPages()).length > 0;

/* ── সময় হলে পরের অনুমোদিত কার্ড পোস্ট ── */
export async function postIfDue(env, now = Date.now()) {
  const s = store(env);
  if (!(await fbReady(env, s))) return { skipped: 'ফেসবুক যুক্ত নয় বা পেজ বাছা হয়নি' };
  const { slots, lastSlot } = await s.settings();
  const slot = dueSlot(slots, now);
  if (!slot || slot === lastSlot) return { skipped: 'এখন পোস্টের সময় নয়' };
  const item = await s.claimForPost(null, now);
  if (!item) return { skipped: 'লাইনে কোনো অনুমোদিত কার্ড নেই' };
  try { return { posted: item.id, pages: await publish(env, s, item, slot), slot }; }
  catch (e) { return { error: String(e.message || e) }; }
}

/* ── মালিকের "এখনই পোস্ট করুন" — সময়ের অপেক্ষা ছাড়া, কয়েক সেকেন্ডে। পোস্টের সময়সূচিতে হাত দেয় না ── */
export async function postNow(env, id) {
  const s = store(env);
  if (!(await fbReady(env, s))) throw new Error('ফেসবুক যুক্ত নয় বা কোনো পেজ বাছা হয়নি — সেটিংস দেখুন');
  const item = await s.claimForPost(id, Date.now());
  if (!item) throw new Error('এটা এখন পোস্ট করা যায় না — পাতা রিফ্রেশ করে দেখুন');
  return { posted: item.id, pages: await publish(env, s, item, null) };
}

/* ── নিউজের ছবি নিজের ঠিকানা দিয়ে — পাতার canvas-এ অন্য সাইটের ছবি আঁকলে JPG বানানো যায় না ── */
async function proxyImage(u) {
  let url;
  try { url = new URL(u); } catch { return fail('ছবির লিংক ঠিক নয়'); }
  if (!/^https?:$/.test(url.protocol)) return fail('ছবির লিংক ঠিক নয়');
  const res = await fetch(url.href, { headers: { 'User-Agent': 'Mozilla/5.0', Referer: url.origin + '/', Accept: 'image/*' } });
  const type = res.headers.get('Content-Type') || '';
  if (!res.ok || !type.startsWith('image/')) return fail('ছবিটা আনা যায়নি', 502);
  return new Response(res.body, { headers: { 'Content-Type': type, 'Cache-Control': 'private, max-age=86400' } });
}

async function api(req, env, ctx, path) {
  const s = store(env);
  const method = req.method;

  if (path === '/api/login' && method === 'POST') {
    if (!env.ADMIN_PASSWORD) return fail('পাসওয়ার্ড বসানো হয়নি — Cloudflare-এর গোপন সেটিংসে ADMIN_PASSWORD দিন', 500);
    const { password = '' } = await req.json().catch(() => ({}));
    const ok = await same(String(password), env.ADMIN_PASSWORD);
    if (!(await s.loginGate(ok))) return fail('অনেকবার ভুল হয়েছে — ১৫ মিনিট পরে চেষ্টা করুন', 429);
    if (!ok) return fail('পাসওয়ার্ড ভুল', 401);
    return json({ ok: true }, 200, { 'Set-Cookie': cookie(req, await makeSession(env), SESSION_DAYS * 86400) });
  }
  if (path === '/api/logout' && method === 'POST') return json({ ok: true }, 200, { 'Set-Cookie': cookie(req, '', 0) });

  if (!(await signedIn(req, env))) return fail('লগইন করুন', 401);

  if (path === '/api/state' && method === 'GET') {
    const [drafts, settings, pages] = await Promise.all([s.list(), s.settings(), s.fbPages()]);
    return json({
      drafts, slots: settings.slots,
      upcoming: upcomingSlots(settings.slots, Date.now(), 40, settings.lastSlot),
      health: { ai: !!env.DEEPSEEK_API_KEY, fbToken: fbTokenSet(env), fbPages: pages, fb: fbTokenSet(env) && pages.length > 0 },
    });
  }
  if (path === '/api/links' && method === 'POST') {
    const { text = '' } = await req.json().catch(() => ({}));
    const urls = extractUrls(text);
    if (!urls.length) return fail('কোনো লিংক পাওয়া যায়নি');
    if (urls.length > 30) return fail('একবারে ৩০টার বেশি লিংক নয়');
    return json(await s.addLinks(urls, Date.now()));
  }
  if (path === '/api/process' && method === 'POST') return json({ result: await processOne(env) });
  if (path === '/api/img' && method === 'GET') return proxyImage(new URL(req.url).searchParams.get('u') || '');
  /* ফেসবুক পেজ — মালিকের সব পেজের তালিকা, আর কোনগুলোতে পোস্ট হবে */
  if (path === '/api/fb/pages' && method === 'GET') {
    try {
      const [all, chosen] = await Promise.all([listPages(env), s.fbPages()]);
      return json({ pages: all.map(p => ({ id: p.id, name: p.name, category: p.category, selected: chosen.some(c => c.id === p.id) })) });
    } catch (e) { return fail(String(e.message || e)); }
  }
  if (path === '/api/fb/pages' && method === 'PUT') {
    const { ids = [] } = await req.json().catch(() => ({}));
    try {
      const all = await listPages(env);
      const chosen = all.filter(p => ids.includes(p.id)).map(p => ({ id: p.id, name: p.name }));
      if (ids.length && chosen.length !== ids.length) return fail('কোনো একটা পেজ পাওয়া যায়নি — তালিকা রিফ্রেশ করুন');
      return json({ pages: await s.setFbPages(chosen) });
    } catch (e) { return fail(String(e.message || e)); }
  }
  if (path === '/api/settings' && method === 'PUT') {
    const { slots = '' } = await req.json().catch(() => ({}));
    try { return json(await s.setSlots(parseSlots(slots))); } catch (e) { return fail(e.message); }
  }

  const m = path.match(/^\/api\/drafts\/([a-z0-9]+)(?:\/([a-z.]+))?$/);
  if (m) {
    const [, id, action] = m;
    try {
      if (!action && method === 'PATCH') return json(await s.edit(id, await req.json()));
      if (action === 'card.jpg' && method === 'GET') {
        const jpeg = await s.card(id);
        return jpeg ? new Response(jpeg, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' } }) : fail('কার্ড নেই', 404);
      }
      if (action === 'approve' && method === 'POST') {
        const form = await req.formData();
        const file = form.get('card');
        if (!file || typeof file === 'string') return fail('কার্ডের ছবি আসেনি');
        return json(await s.approve(id, await file.arrayBuffer(), form.get('caption') || '', Date.now()));
      }
      if (action === 'post' && method === 'POST') return json(await postNow(env, id));
      if (action === 'unapprove' && method === 'POST') return json(await s.unapprove(id));
      if (action === 'reject' && method === 'POST') return json(await s.reject(id));
      if (action === 'retry' && method === 'POST') return json(await s.retry(id));
    } catch (e) { return fail(String(e.message || e)); }
  }
  return fail('পাওয়া যায়নি', 404);
}

export default {
  async fetch(req, env, ctx) {
    const path = new URL(req.url).pathname;
    if (path.startsWith('/api/')) {
      try { return await api(req, env, ctx, path); }
      catch (e) { console.error(e); return fail('সার্ভারে সমস্যা — আবার চেষ্টা করুন', 500); }
    }
    return env.ASSETS.fetch(req);
  },

  /* প্রতি ৫ মিনিটে: বাকি লিংক লেখা (একবারে ৩টা পর্যন্ত), সময় হলে পোস্ট, পুরনো জিনিস পরিষ্কার */
  async scheduled(event, env, ctx) {
    for (let i = 0; i < 3; i++) if (!(await processOne(env))) break;
    const r = await postIfDue(env);
    console.log('cron', JSON.stringify(r));
    await store(env).cleanup();
  },
};

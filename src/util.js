/* ─── ছোট ছোট নিয়ম — বাংলাদেশের সময়, পোস্টের সময়সূচি, লিংক বের করা, AI-এর উত্তর পড়া ───
   সব হিসাব বাংলাদেশের সময়ে (UTC+6, দিনের আলো সংরক্ষণ নেই)। এখানে বাইরের কিছু নেই, তাই test/unit.test.js-এ সরাসরি পরীক্ষা হয়। */

const BD_OFFSET_MS = 6 * 3600 * 1000;
const MONTHS = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];

/* বাংলাদেশে এখন কোন দিন, দিনের কত মিনিট */
export function bdNow(ms = Date.now()) {
  const d = new Date(ms + BD_OFFSET_MS);
  return { date: d.toISOString().slice(0, 10), minutes: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

/* কার্ডের তারিখ — মালিকের রেফারেন্স কার্ডের মতো: "০৪ জুন ২০২৫" (বাংলা অঙ্ক, দুই অঙ্কের দিন, পুরো সাল) */
const BN = s => String(s).replace(/\d/g, c => '০১২৩৪৫৬৭৮৯'[c]);
export function bnDateLabel(ms = Date.now()) {
  const d = new Date(ms + BD_OFFSET_MS);
  return `${BN(String(d.getUTCDate()).padStart(2, '0'))} ${MONTHS[d.getUTCMonth()]} ${BN(d.getUTCFullYear())}`;
}

/* পোস্টের সময় — শুরুতে সকাল ৮টা থেকে রাত ১০টা, প্রতি ঘণ্টায় একটা (দিনে ১৫টা); সাইটের "সময়সূচি" থেকে বদলানো যায় */
export const DEFAULT_SLOTS = Array.from({ length: 15 }, (_, i) => `${String(8 + i).padStart(2, '0')}:00`);

const toMin = s => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));

/* "৮:৩০, 14:00 …" ধরনের লেখা থেকে সময়ের তালিকা (বাংলা অঙ্কও চলে)। ভুল থাকলে কারণসহ Error */
export function parseSlots(text) {
  const en = String(text || '').replace(/[০-৯]/g, c => String('০১২৩৪৫৬৭৮৯'.indexOf(c)));
  const parts = en.split(/[\s,;]+/).filter(Boolean);
  const out = new Set();
  for (const p of parts) {
    const m = p.match(/^(\d{1,2})[:.](\d{2})$/);
    if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) throw new Error(`"${p}" সময়টা বোঝা যায়নি — যেমন লিখুন 08:00 বা 14:30`);
    out.add(`${m[1].padStart(2, '0')}:${m[2]}`);
  }
  if (!out.size) throw new Error('অন্তত একটা সময় দিন');
  return [...out].sort();
}

/* এই মুহূর্তে কোন সময়ের পোস্ট বাকি — সময় পেরোনোর পর `windowMin` মিনিট পর্যন্ত। ফেরত: "2026-10-08 14:00" বা null */
export function dueSlot(slots, ms = Date.now(), windowMin = 30) {
  const { date, minutes } = bdNow(ms);
  let best = null;
  for (const s of slots) {
    const m = toMin(s);
    if (m <= minutes && minutes - m < windowMin) best = s;
  }
  return best ? `${date} ${best}` : null;
}

/* সামনের পোস্টের সময়গুলো (লাইনে থাকা কার্ড কখন যাবে দেখাতে)। `used` = শেষ যে সময়ে পোস্ট হয়েছে */
export function upcomingSlots(slots, ms = Date.now(), count = 20, used = null) {
  const out = [];
  const cur = dueSlot(slots, ms);
  if (cur && cur !== used) out.push(cur);
  const { minutes } = bdNow(ms);
  for (let day = 0; out.length < count && day < 30; day++) {
    const { date } = bdNow(ms + day * 86400000);
    for (const s of slots) {
      if (out.length >= count) break;
      if (day === 0 && toMin(s) <= minutes) continue;
      out.push(`${date} ${s}`);
    }
  }
  return out;
}

/* লেখা থেকে লিংক — এক লাইনে একটা বা এলোমেলো, দুটোই চলে; শেষের দাঁড়ি-কমা বাদ */
export function extractUrls(text) {
  const found = String(text || '').match(/https?:\/\/[^\s<>"'`]+/g) || [];
  const clean = found.map(u => u.replace(/[)\].,;:!?।'"]+$/, ''));
  const out = [];
  for (const u of clean) {
    try { const x = new URL(u); if (!out.includes(x.href)) out.push(x.href); } catch { /* ভাঙা লিংক বাদ */ }
  }
  return out;
}

/* AI-এর উত্তর থেকে প্রথম পুরো JSON — আগে-পরে বাড়তি লেখা বা ```json থাকলেও */
export function parseAiJson(text) {
  const s = String(text || '').replace(/```json|```/g, '');
  let depth = 0, start = -1, inStr = false, esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '{') { if (depth === 0) start = i; depth++; }
    else if (c === '}' && depth > 0) { depth--; if (depth === 0) return JSON.parse(s.slice(start, i + 1)); }
  }
  throw new Error('AI-এর উত্তর বোঝা যায়নি');
}

/* ফেসবুক পোস্টের লেখা — হেডলাইন আর বিস্তারিত। ⚠ কোনো লিংক নয়: লিংক থাকলে ফেসবুক পোস্টের রিচ কমিয়ে দেয়
   (মালিকের নির্দেশ, ৮ অক্টোবর ২০২৬) */
export function buildCaption({ headline, body }) {
  return [headline, body].filter(Boolean).join('\n\n');
}

/* পোস্টের ঠিক আগে — হাতে লেখা ক্যাপশনেও লিংক থাকলে সরে যায় */
export function cleanCaption(text) {
  return String(text || '')
    .replace(/🔗\s*/gu, '')
    .replace(/(?:https?:\/\/|www\.)\S+/gi, '')
    .split('\n').map(l => l.trimEnd()).join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

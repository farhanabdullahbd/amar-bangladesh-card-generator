/* ─── DeepSeek দিয়ে কার্ডের লেখা — হেডলাইন, ছোট বিস্তারিত, ক্যাটাগরি, সূত্র ───
   key থাকে শুধু Cloudflare-এর গোপন সেটিংসে (DEEPSEEK_API_KEY), কখনো পাতার কোডে নয়।
   ⚠ খবরের তথ্য ভুল হলে বড় ক্ষতি — তাই নির্দেশে জোর দেওয়া: নিজে কিছু বানাবে না, নাম-সংখ্যা-তারিখ হুবহু।
   তারপরও পোস্টের আগে মালিক নিজে দেখে অনুমোদন দেন। */
import { parseAiJson } from './util.js';

const CATEGORIES = ['রাজনীতি', 'জাতীয়', 'অর্থনীতি', 'খেলাধুলা', 'বিনোদন', 'প্রযুক্তি', 'আন্তর্জাতিক', 'শিক্ষা', 'ধর্ম', 'অপরাধ', 'স্বাস্থ্য'];

const SYSTEM = `তুমি একজন অভিজ্ঞ বাংলা সংবাদ সম্পাদক। তোমাকে একটা নিউজের মূল লেখা দেওয়া হবে।
সেটা পড়ে একটা ফটো কার্ডের জন্য লেখা বানাবে। উত্তর দেবে শুধু একটা JSON object — আর কোনো লেখা নয়।

নিয়ম:
- শুধু নিউজের লেখায় যা আছে তা-ই লিখবে। নিজে থেকে কোনো তথ্য, মত বা অনুমান যোগ করবে না।
- মানুষের নাম, পদবি, সংখ্যা, টাকার অঙ্ক, তারিখ, জায়গার নাম হুবহু রাখবে।
- শুদ্ধ, সহজ, প্রমিত বাংলায় লিখবে; বানান সাবধানে।
- headline: ৪৫–৬৫ অক্ষর, ছোট ও জোরালো, খবরের মূল কথা।
- body: ১৫০–২০০ অক্ষর, ২–৩ বাক্যে খবরের মূল তথ্য।
- category: এর যেকোনো একটা — ${CATEGORIES.join('/')}
- source: যে নিউজ সাইটের খবর, তার বাংলা নাম (যেমন প্রথম আলো, আমার দেশ)।

শুধু এই JSON: {"headline":"...","body":"...","category":"...","source":"..."}`;

export async function writeCard(article, url, env) {
  if (!env.DEEPSEEK_API_KEY) throw new Error('DeepSeek-এর key বসানো নেই (Cloudflare-এর গোপন সেটিংসে DEEPSEEK_API_KEY)');
  const res = await fetch(`${env.DEEPSEEK_BASE || 'https://api.deepseek.com'}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.DEEPSEEK_API_KEY}` },
    body: JSON.stringify({
      model: env.DEEPSEEK_MODEL || 'deepseek-flash',
      reasoning_effort: env.DEEPSEEK_EFFORT || 'low',   // সারাংশে বেশি ভাবনার দরকার নেই — কম খরচ, তাড়াতাড়ি
      temperature: 0.4,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `নিউজের লিংক: ${url}\nসাইট: ${article.siteName || ''}\nশিরোনাম: ${article.title || ''}\n\nনিউজের লেখা:\n${article.text}` },
      ],
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 402 || /insufficient/i.test(data?.error?.message || '')) throw new Error('DeepSeek-এ ব্যালান্স নেই — রিচার্জ করতে হবে');
  if (res.status === 401) throw new Error('DeepSeek-এর key ভুল বা বাতিল');
  if (!res.ok || data.error) throw new Error(`DeepSeek: ${data?.error?.message || res.status}`);
  const j = parseAiJson(data.choices?.[0]?.message?.content);
  if (!j.headline || !j.body) throw new Error('AI হেডলাইন বা বিস্তারিত দেয়নি — আবার লেখান');
  return {
    headline: String(j.headline).trim(),
    body: String(j.body).trim(),
    category: CATEGORIES.includes(j.category) ? j.category : 'জাতীয়',
    source: String(j.source || '').trim(),
  };
}

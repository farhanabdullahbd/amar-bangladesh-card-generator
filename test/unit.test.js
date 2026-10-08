/* ছোট নিয়মের পরীক্ষা — চালানো: npm test */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bdNow, bnDateLabel, DEFAULT_SLOTS, parseSlots, dueSlot, upcomingSlots, extractUrls, parseAiJson, buildCaption, cleanCaption } from '../src/util.js';

/* বাংলাদেশ সময় ৮ অক্টোবর ২০২৬, দুপুর ২:১০ = UTC ০৮:১০ */
const T = Date.UTC(2026, 9, 8, 8, 10);

test('বাংলাদেশের সময় আর কার্ডের তারিখ', () => {
  assert.deepEqual(bdNow(T), { date: '2026-10-08', minutes: 14 * 60 + 10 });
  assert.equal(bnDateLabel(T), '০৮ অক্টোবর ২০২৬');
  assert.equal(bnDateLabel(Date.UTC(2026, 9, 8, 19, 0)), '০৯ অক্টোবর ২০২৬');   // রাত ১টা — পরের দিন
});

test('শুরুর সময়সূচি — সকাল ৮টা থেকে রাত ১০টা, দিনে ১৫টা', () => {
  assert.equal(DEFAULT_SLOTS.length, 15);
  assert.equal(DEFAULT_SLOTS[0], '08:00');
  assert.equal(DEFAULT_SLOTS.at(-1), '22:00');
});

test('সময় লেখা পড়া — বাংলা অঙ্ক, ডট, এলোমেলো ক্রম; ভুল হলে কারণ', () => {
  assert.deepEqual(parseSlots('14:30, ৮:০০\n9.15 08:00'), ['08:00', '09:15', '14:30']);
  assert.throws(() => parseSlots('25:00'), /বোঝা যায়নি/);
  assert.throws(() => parseSlots('দুপুর'), /বোঝা যায়নি/);
  assert.throws(() => parseSlots(' '), /অন্তত একটা/);
});

test('কোন সময়ের পোস্ট বাকি — সময় পেরোনোর পর আধা ঘণ্টা পর্যন্ত', () => {
  assert.equal(dueSlot(['14:00', '15:00'], T), '2026-10-08 14:00');
  assert.equal(dueSlot(['14:00'], T + 25 * 60000), null);                    // ২:৩৫ — সময় পেরিয়ে গেছে
  assert.equal(dueSlot(['14:30'], T), null);                                  // এখনো আসেনি
});

test('সামনের সময়গুলো — এখনকারটা ব্যবহার হয়ে গেলে বাদ, দিন পেরোলে পরের দিন', () => {
  assert.deepEqual(upcomingSlots(['14:00', '20:00'], T, 3), ['2026-10-08 14:00', '2026-10-08 20:00', '2026-10-09 14:00']);
  assert.deepEqual(upcomingSlots(['14:00', '20:00'], T, 2, '2026-10-08 14:00'), ['2026-10-08 20:00', '2026-10-09 14:00']);
});

test('লেখা থেকে লিংক — দাঁড়ি-কমা বাদ, একই লিংক একবার', () => {
  assert.deepEqual(
    extractUrls('দেখুন https://www.prothomalo.com/a/1। আর https://x.com/b?c=1, আবার https://www.prothomalo.com/a/1'),
    ['https://www.prothomalo.com/a/1', 'https://x.com/b?c=1']);
  assert.deepEqual(extractUrls('লিংক নেই'), []);
});

test('AI-এর উত্তর — বাড়তি লেখা, ```json, লেখার ভেতরে বন্ধনী থাকলেও', () => {
  assert.deepEqual(parseAiJson('এই নিন:\n```json\n{"headline":"দাম {বাড়ল}","body":"x"}\n```'), { headline: 'দাম {বাড়ল}', body: 'x' });
  assert.throws(() => parseAiJson('দুঃখিত'), /বোঝা যায়নি/);
});

test('ফেসবুকের লেখা — হেডলাইন আর বিস্তারিত, কোনো লিংক নয়', () => {
  assert.equal(buildCaption({ headline: 'হ', body: 'ব', url: 'https://a.b/c' }), 'হ\n\nব');
  assert.equal(cleanCaption('হেডলাইন\n\nবিস্তারিত দেখুন www.x.com/y\n\n🔗 https://a.b/c?d=1'), 'হেডলাইন\n\nবিস্তারিত দেখুন');
  assert.equal(cleanCaption('লিংক ছাড়া লেখা'), 'লিংক ছাড়া লেখা');
});

test('নিউজ পাতার og: ট্যাগ — property/name, এক বা দুই উদ্ধৃতি, &amp;', async () => {
  const { parseMeta } = await import('../src/article.js');
  const m = parseMeta(`<meta content="https://x.com/a.jpg?w=1&amp;h=2" property="og:image"><meta name='description' content='বিবরণ'>
    <meta property="og:site_name" content="প্রথম আলো"><meta property="og:title" content="শিরোনাম &quot;উদ্ধৃতি&quot;">`);
  assert.equal(m.image, 'https://x.com/a.jpg?w=1&h=2');
  assert.equal(m.siteName, 'প্রথম আলো');
  assert.equal(m.title, 'শিরোনাম "উদ্ধৃতি"');
  assert.equal(m.description, 'বিবরণ');
});

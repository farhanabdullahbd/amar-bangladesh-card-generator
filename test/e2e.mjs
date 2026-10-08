/* ─── পুরো পথের পরীক্ষা — এই কম্পিউটারে, আসল কিছু না ছুঁয়ে ───
   নকল নিউজ সাইট, নকল Jina, নকল DeepSeek আর নকল ফেসবুক (এক node সার্ভারে) + `wrangler dev` (আসল Worker কোড)
   + আসল ব্রাউজার (Playwright)। লগইন → লিংক → AI লেখা → কার্ড আঁকা → ঠিক করে অনুমোদন → সময় হলে পোস্ট।
   চালানো: npm run test:e2e   (কার্ডের ছবি test/.out/card.png-এ — বাংলা ঠিক আসছে কি না চোখে দেখার জন্য) */
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const root = resolve(import.meta.dirname, '..');
const OUT = resolve(root, 'test/.out');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const MOCK = 8790, APP = 8788;
const M = `http://127.0.0.1:${MOCK}`, A = `http://127.0.0.1:${APP}`;
const PASS = 'test-pass-123';

const ok = [], bad = [];
const check = (n, c, d = '') => (c ? ok : bad).push(`${c ? '✓' : '✗'} ${n}${d ? ' — ' + d : ''}`);
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 30000) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) return null; await wait(400); } };

/* ── নকল বাইরের দুনিয়া ── */
const logos = readFileSync(resolve(root, 'public/logos.js'), 'utf8');
const PHOTO = Buffer.from(logos.match(/MAP_LOGO_B64 = "data:image\/png;base64,([^"]+)"/)[1], 'base64');
const seen = { deepseek: [], fb: [] };
let deepseekBroke = true;   // দ্বিতীয় নিউজে প্রথমবার ব্যালান্স শেষ দেখাবে
const ARTICLE = 'ঢাকায় আজ নতুন মেট্রো লাইনের উদ্বোধন হয়েছে। প্রধান উপদেষ্টা সকাল ১০টায় উদ্বোধন করেন। প্রতিদিন ৫০ হাজার যাত্রী চলাচল করবে।';
const mock = createServer(async (req, res) => {
  let body = Buffer.alloc(0);
  for await (const c of req) body = Buffer.concat([body, c]);
  const send = (code, type, data) => { res.writeHead(code, { 'Content-Type': type }); res.end(data); };
  const u = req.url;
  if (u.startsWith('/news/')) return send(200, 'text/html; charset=utf-8',
    `<html><head><meta property="og:title" content="মেট্রো উদ্বোধন"><meta property="og:site_name" content="নমুনা খবর">
     <meta property="og:image" content="/photo.png"></head><body><p>${ARTICLE}</p></body></html>`);
  if (u === '/photo.png') return send(200, 'image/png', PHOTO);
  if (u.startsWith('/jina/')) return send(200, 'text/plain; charset=utf-8', `Title: মেট্রো উদ্বোধন\n\nMarkdown Content:\n${ARTICLE}`);
  if (u === '/deepseek/chat/completions') {
    const j = JSON.parse(body.toString());
    seen.deepseek.push({ auth: req.headers.authorization, ...j });
    if (j.messages[1].content.includes('/news/2') && deepseekBroke) {
      deepseekBroke = false;
      return send(402, 'application/json', JSON.stringify({ error: { message: 'Insufficient Balance' } }));
    }
    const card = { headline: 'ঢাকায় নতুন মেট্রো লাইনের উদ্বোধন, দিনে চলবে ৫০ হাজার যাত্রী', body: 'প্রধান উপদেষ্টা আজ সকাল ১০টায় নতুন মেট্রো লাইনের উদ্বোধন করেন। প্রতিদিন প্রায় ৫০ হাজার যাত্রী এই লাইনে চলাচল করতে পারবেন।', category: 'জাতীয়', source: 'নমুনা খবর' };
    return send(200, 'application/json', JSON.stringify({ choices: [{ message: { content: 'এই নিন: ' + JSON.stringify(card) } }] }));
  }
  if (u.startsWith('/graph/') && req.method === 'POST') {
    const text = body.toString('latin1');
    const cap = body.toString('utf8').match(/name="caption"\r\n\r\n([\s\S]*?)\r\n--/);
    seen.fb.push({ url: u, caption: cap?.[1] || '', jpeg: text.includes('\xFF\xD8\xFF'), token: /name="access_token"\r\n\r\ntok\r\n/.test(text) });
    return send(200, 'application/json', JSON.stringify({ id: 'ph1', post_id: 'PAGE1_777' }));
  }
  send(404, 'text/plain', 'not found');
});
await new Promise(r => mock.listen(MOCK, '127.0.0.1', r));

/* ── Windows-এ workerd চালাতে Visual C++ runtime লাগে। না থাকলে msvcp140.dll, vcruntime140.dll, vcruntime140_1.dll
   node_modules/@cloudflare/workerd-windows-64/bin-এ রাখলেই চলে (যেমন কোনো Java JRE-এর bin থেকে) ── */
if (process.platform === 'win32') {
  const w = spawnSync(resolve(root, 'node_modules/@cloudflare/workerd-windows-64/bin/workerd.exe'), ['--version']);
  if (w.status !== 0) {
    console.error('workerd চলছে না — Visual C++ runtime লাগবে (উপরের মন্তব্য দেখুন)');
    mock.close();
    process.exit(1);
  }
}

/* ── Worker চালু (আসল কোড, নকল ঠিকানাগুলোর সাথে) ── */
const vars = {
  ADMIN_PASSWORD: PASS, DEEPSEEK_API_KEY: 'test-key', DEEPSEEK_BASE: `${M}/deepseek`, JINA_BASE: `${M}/jina/`,
  FB_GRAPH_BASE: `${M}/graph`, FB_PAGE_ID: 'PAGE1', FB_PAGE_TOKEN: 'tok',
};
const args = ['wrangler', 'dev', '--port', String(APP), '--ip', '127.0.0.1', '--test-scheduled', '--persist-to', 'test/.out/state', '--log-level', 'warn',
  ...Object.entries(vars).flatMap(([k, v]) => ['--var', `${k}:${v}`])];
const wr = spawn('npx', args, { cwd: root, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
let wrLog = '';
wr.stdout.on('data', d => { wrLog += d; });
wr.stderr.on('data', d => { wrLog += d; });
const stop = () => {
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(wr.pid), '/T', '/F'], { stdio: 'ignore' });
  else wr.kill();
  mock.close();
};
const up = await until(async () => { try { return (await fetch(A + '/')).ok; } catch { return false; } }, 90000);
check('সাইট চালু হলো', !!up, up ? '' : wrLog.slice(-400));

const br = await chromium.launch({ headless: true });
try {
  const noAuth = await fetch(A + '/api/state');
  check('লগইন ছাড়া তথ্য পাওয়া যায় না', noAuth.status === 401);

  const ctx = await br.newContext({ viewport: { width: 1200, height: 900 } });
  const pg = await ctx.newPage();
  const crashes = [];
  pg.on('pageerror', e => crashes.push(String(e).slice(0, 200)));
  await pg.goto(A + '/', { waitUntil: 'domcontentloaded' });

  /* লগইন */
  await pg.locator('#password').fill('ভুল');
  await pg.locator('#loginForm button').click();
  check('ভুল পাসওয়ার্ডে ঢোকা যায় না', !!(await until(async () => /পাসওয়ার্ড ভুল/.test(await pg.locator('#loginMsg').innerText()), 10000)));
  await pg.locator('#password').fill(PASS);
  await pg.locator('#loginForm button').click();
  check('সঠিক পাসওয়ার্ডে ঢুকল', !!(await until(async () => await pg.locator('#app').isVisible(), 10000)));
  check('AI আর ফেসবুক চালু দেখায়', /AI চালু/.test(await pg.locator('#health').innerText()) && /ফেসবুক যুক্ত/.test(await pg.locator('#health').innerText()));

  /* দুটো লিংক — একটায় DeepSeek ব্যালান্স শেষ দেখাবে */
  await pg.locator('#links').fill(`${M}/news/1\n${M}/news/2`);
  await pg.locator('#addLinks').click();
  const counts = async () => pg.evaluate(() => Object.fromEntries([...document.querySelectorAll('#tabs button b')].map(b => [b.parentElement.dataset.tab, b.textContent])));
  const done = await until(async () => { const c = await counts(); return c.ready === '১' && c.failed === '১' ? c : null; }, 40000);
  check('একটা লেখা হলো, একটা ব্যর্থ', !!done, JSON.stringify(await counts()));
  check('DeepSeek-এ key গেল, নিউজের লেখাও গেল', seen.deepseek[0]?.auth === 'Bearer test-key' && seen.deepseek[0]?.messages[1].content.includes('৫০ হাজার যাত্রী') && seen.deepseek[0]?.response_format?.type === 'json_object');
  await pg.locator('#tabs [data-tab="failed"]').click();
  check('ব্যর্থটায় কারণ বাংলায়', /ব্যালান্স নেই/.test(await pg.locator('#list').innerText()), await pg.locator('#list').innerText());
  await pg.locator('#list [data-act="retry"]').click();
  check('আবার চেষ্টায় লেখা হলো', !!(await until(async () => (await counts()).ready === '২', 30000)), JSON.stringify(await counts()));

  /* কার্ড দেখা, ঠিক করা */
  await pg.locator('#tabs [data-tab="ready"]').click();
  await pg.locator('#list [data-open]').first().click();
  await until(async () => await pg.locator('#editor').isVisible(), 10000);
  await wait(2500);
  check('হেডলাইন AI থেকে এল', /মেট্রো লাইনের উদ্বোধন/.test(await pg.locator('#fHeadline').inputValue()));
  check('সূত্র আর তারিখ বসল', (await pg.locator('#fSource').inputValue()) === 'নমুনা খবর' && /অক্টোবর|নভেম্বর|ডিসেম্বর|জানুয়ারি/.test(await pg.locator('#fDate').inputValue()));
  check('ফেসবুকের লেখায় নিউজের লিংক', (await pg.locator('#fCaption').inputValue()).includes(`🔗 ${M}/news/`));
  const photoDrawn = await pg.evaluate(() => {
    const d = document.getElementById('canvas').getContext('2d').getImageData(0, 0, 1279, 888).data;
    let colors = new Set();
    for (let i = 0; i < d.length; i += 4 * 997) colors.add(`${d[i]>>4},${d[i+1]>>4},${d[i+2]>>4}`);
    return colors.size;
  });
  check('নিউজের ছবি কার্ডে বসল (নিজের ঠিকানা দিয়ে আনা)', photoDrawn > 8, `রঙ ${photoDrawn}`);
  await pg.locator('#fHeadline').fill('ঢাকায় নতুন মেট্রো লাইন চালু, প্রতিদিন যাবেন ৫০ হাজার যাত্রী');
  await pg.locator('#fCaption').fill('সম্পাদিত লেখা: ঢাকায় নতুন মেট্রো লাইন চালু');
  await wait(800);
  writeFileSync(resolve(OUT, 'card.png'), Buffer.from((await pg.evaluate(() => document.getElementById('canvas').toDataURL('image/png'))).split(',')[1], 'base64'));

  /* অনুমোদন */
  await pg.locator('#approve').click();
  check('অনুমোদনের পর লাইনে গেল', !!(await until(async () => (await counts()).approved === '১' && !(await pg.locator('#editor').isVisible()), 15000)));
  const st = await pg.evaluate(() => fetch('/api/state').then(r => r.json()));
  const appr = st.drafts.find(d => d.status === 'approved');
  check('সম্পাদিত হেডলাইন সংরক্ষিত', appr?.headline === 'ঢাকায় নতুন মেট্রো লাইন চালু, প্রতিদিন যাবেন ৫০ হাজার যাত্রী');
  const cardRes = await pg.evaluate(id => fetch(`/api/drafts/${id}/card.jpg`).then(async r => ({ type: r.headers.get('content-type'), size: (await r.arrayBuffer()).byteLength })), appr?.id);
  check('কার্ডের JPG জমা আছে', cardRes.type === 'image/jpeg' && cardRes.size > 50000, JSON.stringify(cardRes));

  /* সময় হয়নি — পোস্ট হয় না */
  const bd = new Date(Date.now() + 6 * 3600e3);
  const later = `${String((bd.getUTCHours() + 2) % 24).padStart(2, '0')}:00`;
  await pg.locator('#tabs [data-tab="schedule"]').click();
  await pg.locator('#slots').fill(later);
  await pg.locator('#saveSlots').click();
  await until(async () => /সংরক্ষণ হয়েছে/.test(await pg.locator('#slotsMsg').innerText()), 5000);
  await fetch(`${A}/__scheduled?cron=*/5+*+*+*+*`);
  await wait(1500);
  check('সময়ের আগে পোস্ট হয় না', seen.fb.length === 0);

  /* এখনকার সময় দিলে পোস্ট হয় — একবারই */
  const now = `${String(bd.getUTCHours()).padStart(2, '0')}:${String(bd.getUTCMinutes()).padStart(2, '0')}`;
  await pg.locator('#slots').fill(`${now}, ${later}`);
  await pg.locator('#saveSlots').click();
  await wait(800);
  await fetch(`${A}/__scheduled?cron=*/5+*+*+*+*`);
  await until(async () => seen.fb.length > 0, 10000);
  check('সময় হলে ফেসবুকে পোস্ট গেল', seen.fb.length === 1, JSON.stringify(seen.fb.map(f => f.url)));
  check('পোস্টে কার্ডের JPG, টোকেন আর সম্পাদিত লেখা', seen.fb[0]?.jpeg && seen.fb[0]?.token && seen.fb[0]?.caption === 'সম্পাদিত লেখা: ঢাকায় নতুন মেট্রো লাইন চালু', JSON.stringify(seen.fb[0] || {}));
  check('পেজের ঠিকানায় পোস্ট', seen.fb[0]?.url === '/graph/v23.0/PAGE1/photos');
  await fetch(`${A}/__scheduled?cron=*/5+*+*+*+*`);
  await wait(1500);
  check('একই সময়ে দ্বিতীয়বার পোস্ট হয় না', seen.fb.length === 1);
  const st2 = await pg.evaluate(() => fetch('/api/state').then(r => r.json()));
  check('পোস্ট হয়েছে বলে লেখা, ফেসবুকের আইডিসহ', st2.drafts.some(d => d.status === 'posted' && d.fb_post_id === 'PAGE1_777'));
  check('একই লিংক আবার দিলে যোগ হয় না', (await pg.evaluate(u => fetch('/api/links', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: u }) }).then(r => r.json()), `${M}/news/1`)).skipped?.length === 1);

  /* ফোনের মাপে */
  await pg.setViewportSize({ width: 390, height: 840 });
  await pg.locator('#tabs [data-tab="ready"]').click();
  await pg.locator('#list [data-open]').first().click();
  await wait(1500);
  const overflow = await pg.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1 || document.querySelector('.editor').scrollWidth > window.innerWidth + 1);
  check('ফোনে পাশে সরে যায় না', !overflow);
  await pg.screenshot({ path: resolve(OUT, 'phone-editor.png') });
  check('পাতায় কোনো ক্র্যাশ নেই', crashes.length === 0, crashes.join(' | '));
} catch (e) {
  check('পরীক্ষা মাঝপথে থেমে গেল', false, String(e.message || e).split('\n')[0]);
} finally {
  await br.close();
  stop();
}

ok.forEach(l => console.log('  ' + l));
bad.forEach(l => console.log('  ' + l));
console.log(bad.length ? `\n❌ ${bad.length}টি ব্যর্থ` : `\n✅ ${ok.length}টি পরীক্ষা সব ঠিক`);
process.exit(bad.length ? 1 : 0);

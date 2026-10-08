/* ─── পুরো পথের পরীক্ষা — এই কম্পিউটারে, আসল কিছু না ছুঁয়ে ───
   নকল নিউজ সাইট, নকল Jina, নকল DeepSeek আর নকল ফেসবুক (এক node সার্ভারে) + `wrangler dev` (আসল Worker কোড)
   + আসল ব্রাউজার (Playwright)। লগইন → লিংক → AI লেখা → কার্ড আঁকা → ঠিক করে অনুমোদন → সময় হলে পোস্ট।
   আটকে থাকা সাইট (সময়সীমা পেরোলে কারণসহ "সমস্যা") আর ১ MB-এর বেশি বড় নিউজ পাতাও পরীক্ষা হয়।
   চালানো: npm run test:e2e   (ছবিগুলো test/.out/-এ — কার্ড, ফোনের পাতা, সেটিংস — চোখে দেখার জন্য) */
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
let deepseekBroke = true;
let failPage2Once = false;
let blockPage2 = false, page2Calls = 0;   // ফেসবুক PAGE2 সাময়িক আটকে রাখলে (কোড 368)   // দুই পেজের একটায় একবার ব্যর্থ — আবার চেষ্টায় শুধু সেটায় যায় কি না   // দ্বিতীয় নিউজে প্রথমবার ব্যালান্স শেষ দেখাবে
const ARTICLE = 'ঢাকায় আজ নতুন মেট্রো লাইনের উদ্বোধন হয়েছে। প্রধান উপদেষ্টা সকাল ১০টায় উদ্বোধন করেন। প্রতিদিন ৫০ হাজার যাত্রী চলাচল করবে।';
const HEAD = '<meta property="og:title" content="মেট্রো উদ্বোধন"><meta property="og:site_name" content="নমুনা খবর"><meta property="og:image" content="/photo.png?a=1&amp;b=2">';
/* প্রথম আলোর মতো বড় পাতা — <head>-এর পরে ২ MB */
const BIG = `<html><head>${HEAD}</head><body>${'<p>' + 'অনেক লেখা '.repeat(40) + '</p>'.repeat(1)}`.padEnd(2_000_000, ' ') + '</body></html>';
const mock = createServer(async (req, res) => {
  let body = Buffer.alloc(0);
  for await (const c of req) body = Buffer.concat([body, c]);
  const send = (code, type, data) => { res.writeHead(code, { 'Content-Type': type }); res.end(data); };
  const u = req.url;
  if (u.includes('/slow')) return;   // কখনো উত্তর দেয় না
  if (u === '/news/big') return send(200, 'text/html; charset=utf-8', BIG);
  if (u.startsWith('/news/')) return send(200, 'text/html; charset=utf-8', `<html><head>${HEAD}</head><body><p>${ARTICLE}</p></body></html>`);
  if (u.startsWith('/photo.png')) return send(200, 'image/png', PHOTO);
  if (u.startsWith('/jina/')) return send(200, 'text/plain; charset=utf-8', `Title: মেট্রো উদ্বোধন\n\nMarkdown Content:\n${ARTICLE}`);
  if (u === '/deepseek/chat/completions') {
    const j = JSON.parse(body.toString());
    seen.deepseek.push({ auth: req.headers.authorization, ...j });
    if (j.messages[1].content.includes('/news/2') && deepseekBroke) {
      deepseekBroke = false;
      return send(402, 'application/json', JSON.stringify({ error: { message: 'Insufficient Balance' } }));
    }
    const card = { headline: 'ঢাকায় নতুন মেট্রো লাইনের উদ্বোধন, দিনে চলবে ৫০ হাজার যাত্রী', body: 'প্রধান উপদেষ্টা আজ সকাল ১০টায় নতুন মেট্রো লাইনের উদ্বোধন করেন। প্রতিদিন প্রায় ৫০ হাজার যাত্রী এই লাইনে চলাচল করতে পারবেন।', subject: 'মেট্রো রেল', source: 'নমুনা খবর' };
    return send(200, 'application/json', JSON.stringify({ choices: [{ message: { content: 'এই নিন: ' + JSON.stringify(card) } }] }));
  }
  if (u.startsWith('/graph/v23.0/me/accounts')) {
    if (!u.includes('access_token=utok')) return send(400, 'application/json', JSON.stringify({ error: { code: 190, message: 'bad token' } }));
    return send(200, 'application/json', JSON.stringify({ data: [
      { id: 'PAGE1', name: 'Amar Bangladesh', category: 'Non-profit', access_token: 'tok1' },
      { id: 'PAGE2', name: 'Amar Bangladesh News', category: 'News', access_token: 'tok2' },
      { id: 'PAGE3', name: 'অন্য পেজ', category: 'Shop', access_token: 'tok3' },
    ] }));
  }
  if (u.startsWith('/graph/') && req.method === 'POST') {
    const text = body.toString('latin1');
    const page = u.match(/\/graph\/v23\.0\/(\w+)\/photos/)?.[1];
    const tok = text.match(/name="access_token"\r\n\r\n(\w+)\r\n/)?.[1];
    if (page === 'PAGE2') page2Calls++;
    if (page === 'PAGE2' && blockPage2) return send(400, 'application/json', JSON.stringify({ error: { code: 368, message: 'You have been temporarily blocked from performing this action.' } }));
    if (page === 'PAGE2' && failPage2Once) { failPage2Once = false; return send(400, 'application/json', JSON.stringify({ error: { code: 1, message: 'সাময়িক সমস্যা' } })); }
    const cap = body.toString('utf8').match(/name="caption"\r\n\r\n([\s\S]*?)\r\n--/);
    seen.fb.push({ page, tok, caption: cap?.[1] || '', jpeg: text.includes('\xFF\xD8\xFF') });
    return send(200, 'application/json', JSON.stringify({ id: 'ph', post_id: `${page}_${seen.fb.length}` }));
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
  FB_GRAPH_BASE: `${M}/graph`, FB_USER_TOKEN: 'utok', FETCH_TIMEOUT_MS: '3000',
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
  check('লগইন ছাড়া তথ্য পাওয়া যায় না', (await fetch(A + '/api/state')).status === 401);

  const ctx = await br.newContext({ viewport: { width: 1200, height: 900 } });
  const pg = await ctx.newPage();
  const crashes = [];
  pg.on('pageerror', e => crashes.push(String(e).slice(0, 200)));
  pg.on('dialog', d => d.accept());
  const api = path => pg.evaluate(p => fetch(p).then(r => r.json()), path);
  const drafts = async () => (await api('/api/state')).drafts;
  await pg.goto(A + '/', { waitUntil: 'domcontentloaded' });

  /* লগইন */
  await pg.locator('#password').fill('ভুল');
  await pg.locator('#loginForm button').click();
  check('ভুল পাসওয়ার্ডে ঢোকা যায় না', !!(await until(async () => /পাসওয়ার্ড ভুল/.test(await pg.locator('#loginMsg').innerText()), 10000)));
  await pg.locator('#password').fill(PASS);
  await pg.locator('#loginForm button').click();
  check('সঠিক পাসওয়ার্ডে ঢুকল, তিন ধাপের পাতা', !!(await until(async () => await pg.locator('#home').isVisible(), 10000)));
  check('পেজ বাছা না থাকলে সতর্কবার্তা', /পেজ বাছুন/.test(await pg.locator('#banner').innerText()));
  await pg.locator('#openSettings').click();
  check('সেটিংসে পেজের তালিকা এল', !!(await until(async () => (await pg.locator('#fbPageList .page-opt').count()) === 3, 15000)));
  await pg.locator('#fbPageList .page-opt:has-text("Amar Bangladesh News") input').check();
  await pg.locator('#fbPageList .page-opt:has-text("Amar Bangladesh") >> nth=0 >> input').check();
  await pg.locator('#saveFbPages').click();
  check('দুটো পেজ সংরক্ষণ হলো', !!(await until(async () => /Amar Bangladesh, Amar Bangladesh News|Amar Bangladesh News, Amar Bangladesh/.test(await pg.locator('#fbPagesMsg').innerText()), 8000)), await pg.locator('#fbPagesMsg').innerText());
  await pg.locator('#closeSettings').click();
  await pg.reload();
  await until(async () => await pg.locator('#home').isVisible(), 10000);
  check('পেজ বাছার পরে কোনো সতর্কবার্তা নেই', (await pg.locator('#banner').innerText()).trim() === '');

  /* লিংক — সাধারণ, ব্যালান্স-শেষ, আটকে থাকা সাইট, ২ MB পাতা */
  await pg.locator('#links').fill(`${M}/news/1\n${M}/news/2\n${M}/slow/3\n${M}/news/big`);
  await pg.locator('#addLinks').click();
  check('যোগ হওয়ার বার্তা', !!(await until(async () => /৪টা কার্ড তৈরি হচ্ছে/.test(await pg.locator('#addMsg').innerText()), 10000)));
  const settled = await until(async () => { const d = await drafts(); return d.every(x => !['new', 'working'].includes(x.status)) ? d : null; }, 60000);
  const st = Object.fromEntries((settled || []).map(d => [d.url.replace(M, ''), d]));
  check('সাধারণ নিউজ লেখা হলো', st['/news/1']?.status === 'ready', JSON.stringify(st['/news/1']?.status));
  check('২ MB-এর নিউজ পাতাও লেখা হলো, ছবির ঠিকানা ঠিক', st['/news/big']?.status === 'ready' && st['/news/big']?.image_url === `${M}/photo.png?a=1&b=2`, `${st['/news/big']?.status} ${st['/news/big']?.image_url}`);
  check('আটকে থাকা সাইট — সময়সীমার পরে কারণসহ সমস্যা', st['/slow/3']?.status === 'failed' && /সাড়া দেয়নি/.test(st['/slow/3']?.error), `${st['/slow/3']?.status} ${st['/slow/3']?.error}`);
  check('ব্যালান্স শেষ — কারণ বাংলায়', st['/news/2']?.status === 'failed' && /ব্যালান্স নেই/.test(st['/news/2']?.error));
  check('DeepSeek-এ key, নিউজের লেখা আর নতুন মডেল গেল', seen.deepseek[0]?.auth === 'Bearer test-key' && seen.deepseek[0]?.messages[1].content.includes('৫০ হাজার যাত্রী') && seen.deepseek[0]?.model === 'deepseek-flash' && seen.deepseek[0]?.reasoning_effort === 'low');
  check('ধাপ ২-এ ৪টা (২টা সমস্যা আগে)', (await pg.locator('#cTodo').innerText()) === '৪' && (await pg.locator('#todo .c').first().getAttribute('class')).includes('failed'));
  await pg.locator(`#todo .c.failed:has-text("/news/2") [data-act="retry"]`).click();
  check('আবার চেষ্টায় লেখা হলো', !!(await until(async () => (await drafts()).find(d => d.url.endsWith('/news/2'))?.status === 'ready', 30000)));
  await pg.locator(`#todo .c.failed:has-text("/slow/3") [data-act="reject"]`).click();
  check('সমস্যার নিউজ বাদ দেওয়া গেল', !!(await until(async () => !(await drafts()).some(d => d.url.endsWith('/slow/3')), 10000)));

  /* কার্ড দেখা, ঠিক করা */
  await until(async () => (await pg.locator('#todo [data-open]').count()) === 3, 10000);
  await pg.locator('#todo .c:has-text("নমুনা খবর") [data-open]').first().click();
  await until(async () => await pg.locator('#editor').isVisible(), 10000);
  await wait(2500);
  check('হেডলাইন AI থেকে এল', /মেট্রো লাইনের উদ্বোধন/.test(await pg.locator('#fHeadline').inputValue()));
  const photoDrawn = await pg.evaluate(() => {
    const d = document.getElementById('canvas').getContext('2d').getImageData(0, 0, 1279, 888).data;
    const colors = new Set();
    for (let i = 0; i < d.length; i += 4 * 997) colors.add(`${d[i] >> 4},${d[i + 1] >> 4},${d[i + 2] >> 4}`);
    return colors.size;
  });
  check('নিউজের ছবি কার্ডে বসল', photoDrawn > 8, `রঙ ${photoDrawn}`);
  check('বাড়তি ঘরগুলো শুরুতে লুকানো', !(await pg.locator('#fCaption').isVisible()));
  await pg.locator('#fHeadline').fill('ঢাকায় নতুন মেট্রো লাইন চালু, প্রতিদিন যাবেন ৫০ হাজার যাত্রী');
  await pg.locator('.more summary').click();
  check('ফেসবুকের লেখায় কোনো লিংক নেই', !/https?:|🔗/.test(await pg.locator('#fCaption').inputValue()), await pg.locator('#fCaption').inputValue());
  await pg.locator('#fCaption').fill('সম্পাদিত লেখা: ঢাকায় নতুন মেট্রো লাইন চালু\n\n🔗 https://x.com/y');
  await wait(800);
  writeFileSync(resolve(OUT, 'card.png'), Buffer.from((await pg.evaluate(() => document.getElementById('canvas').toDataURL('image/png'))).split(',')[1], 'base64'));

  /* অনুমোদন */
  await pg.locator('#approve').click();
  check('অনুমোদনের পর ধাপ ৩-এ গেল', !!(await until(async () => (await pg.locator('#cQueue').innerText()) === '১' && !(await pg.locator('#editor').isVisible()), 15000)));
  check('ধাপ ৩-এ পোস্টের সময় লেখা', /আজ|কাল/.test(await pg.locator('#queue .when').first().innerText()), await pg.locator('#queue').innerText());
  const appr = (await drafts()).find(d => d.status === 'approved');
  check('সম্পাদিত হেডলাইন সংরক্ষিত', appr?.headline === 'ঢাকায় নতুন মেট্রো লাইন চালু, প্রতিদিন যাবেন ৫০ হাজার যাত্রী');
  const cardRes = await pg.evaluate(id => fetch(`/api/drafts/${id}/card.jpg`).then(async r => ({ type: r.headers.get('content-type'), size: (await r.arrayBuffer()).byteLength })), appr?.id);
  check('কার্ডের JPG জমা আছে', cardRes.type === 'image/jpeg' && cardRes.size > 50000, JSON.stringify(cardRes));

  /* সেটিংস — সময় যোগ, সরানো, শুরুর মতো */
  await pg.locator('#openSettings').click();
  check('সেটিংসে ১৫টা সময়, সংযোগ চালু', (await pg.locator('#slotList .slot').count()) === 15 && /চালু/.test(await pg.locator('#sAi').innerText()) && /২টা পেজে/.test(await pg.locator('#sFb').innerText()));
  await pg.locator('#newSlot').fill('23:45');
  await pg.locator('#addSlot').click();
  check('সময় যোগ হলো', !!(await until(async () => (await pg.locator('#slotList .slot').count()) === 16, 8000)) && /রাত ১১:৪৫/.test(await pg.locator('#slotList').innerText()));
  await pg.locator('#slotList [data-del="23:45"]').click();
  check('সময় সরানো গেল', !!(await until(async () => (await pg.locator('#slotList .slot').count()) === 15, 8000)));
  await pg.screenshot({ path: resolve(OUT, 'settings.png'), fullPage: true });
  await pg.locator('#closeSettings').click();

  /* সময় হয়নি — পোস্ট হয় না; এখনকার সময় দিলে হয়, একবারই */
  const bd = new Date(Date.now() + 6 * 3600e3);
  const later = `${String((bd.getUTCHours() + 2) % 24).padStart(2, '0')}:00`;
  const setSlots = s => pg.evaluate(v => fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slots: v }) }), s);
  await setSlots(later);
  await fetch(`${A}/__scheduled?cron=*/5+*+*+*+*`);
  await wait(1500);
  check('সময়ের আগে পোস্ট হয় না', seen.fb.length === 0);
  const now = `${String(bd.getUTCHours()).padStart(2, '0')}:${String(bd.getUTCMinutes()).padStart(2, '0')}`;
  await setSlots(`${now}, ${later}`);
  await fetch(`${A}/__scheduled?cron=*/5+*+*+*+*`);
  await until(async () => seen.fb.length > 0, 10000);
  await until(async () => seen.fb.length >= 2, 10000);
  check('সময় হলে দুই পেজেই পোস্ট গেল (নিজের নিজের টোকেনে)', seen.fb.length === 2 && seen.fb.some(f => f.page === 'PAGE1' && f.tok === 'tok1') && seen.fb.some(f => f.page === 'PAGE2' && f.tok === 'tok2'), JSON.stringify(seen.fb.map(f => [f.page, f.tok])));
  check('বাছা হয়নি এমন পেজে যায়নি', !seen.fb.some(f => f.page === 'PAGE3'));
  check('পোস্টে কার্ডের JPG আর সম্পাদিত লেখা — লিংক সরে গেছে', seen.fb.every(f => f.jpeg && f.caption === 'সম্পাদিত লেখা: ঢাকায় নতুন মেট্রো লাইন চালু'), JSON.stringify(seen.fb.map(f => f.caption)));
  await fetch(`${A}/__scheduled?cron=*/5+*+*+*+*`);
  await wait(1500);
  check('একই সময়ে দ্বিতীয়বার পোস্ট হয় না', seen.fb.length === 2);
  check('পোস্ট হয়েছে বলে লেখা, দুই পেজের পোস্টসহ', (await drafts()).some(d => d.status === 'posted' && Object.keys(JSON.parse(d.fb_posts || '{}')).length === 2));
  await pg.reload();
  await until(async () => await pg.locator('#home').isVisible(), 10000);
  check('"পোস্ট হয়ে গেছে"-তে দেখায়', (await pg.locator('#cDone').innerText()) === '১');
  check('একই লিংক আবার দিলে যোগ হয় না', (await pg.evaluate(u => fetch('/api/links', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: u }) }).then(r => r.json()), `${M}/news/1`)).skipped?.length === 1);

  /* এখনই পোস্ট — কার্ডের পাতা থেকে (অনুমোদন + পোস্ট), আর ধাপ ৩ থেকে */
  await pg.locator('#links').fill(`${M}/news/5`);
  await pg.locator('#addLinks').click();
  await until(async () => (await drafts()).find(d => d.url.endsWith('/news/5'))?.status === 'ready', 30000);
  await pg.reload();
  await until(async () => await pg.locator('#home').isVisible(), 10000);
  const id2 = (await drafts()).find(d => d.url.endsWith('/news/2')).id;
  await pg.locator(`#todo [data-open="${id2}"]`).click();
  await until(async () => await pg.locator('#editor').isVisible(), 10000);
  await wait(1500);
  check('কার্ডের পাতায় "এখনই পোস্ট" বোতাম', await pg.locator('#approveNow').isVisible());
  failPage2Once = true;
  await pg.locator('#approveNow').click();
  const half = await until(async () => { const d = (await drafts()).find(x => x.id === id2); return d?.status === 'approved' && d.error ? d : null; }, 15000);
  check('একটা পেজে ব্যর্থ — কার্ড লাইনে থাকে, কারণসহ', !!half && /Amar Bangladesh News/.test(half.error) && seen.fb.length === 3, `${half?.status} ${half?.error} ${seen.fb.length}`);
  await until(async () => (await pg.locator(`#queue [data-act="post"][data-id="${id2}"]`).count()) === 1, 10000);
  await pg.locator(`#queue [data-act="post"][data-id="${id2}"]`).click();
  check('আবার চেষ্টায় শুধু বাকি পেজে গেল — আগেরটায় দুবার নয়', !!(await until(async () => (await drafts()).find(d => d.id === id2)?.status === 'posted', 15000)) && seen.fb.length === 4 && seen.fb.slice(2).map(f => f.page).sort().join() === 'PAGE1,PAGE2', JSON.stringify(seen.fb.slice(2).map(f => f.page)));
  const id5 = (await drafts()).find(d => d.url.endsWith('/news/5')).id;
  await pg.locator(`#todo [data-open="${id5}"]`).click();
  await until(async () => await pg.locator('#editor').isVisible(), 10000);
  await wait(1500);
  await pg.locator('#approve').click();
  await until(async () => (await pg.locator(`#queue [data-act="post"][data-id="${id5}"]`).count()) === 1, 15000);
  await pg.locator(`#queue [data-act="post"][data-id="${id5}"]`).click();
  check('ধাপ ৩ থেকে "এখনই পোস্ট" — দুই পেজে', !!(await until(async () => seen.fb.length === 6, 15000)) && !!(await until(async () => (await drafts()).find(d => d.id === id5)?.status === 'posted', 10000)));
  await fetch(`${A}/__scheduled?cron=*/5+*+*+*+*`);
  await wait(1500);
  check('এখনই পোস্টের পরে cron আবার পোস্ট করে না', seen.fb.length === 6);
  check('পোস্ট না হওয়া কার্ড ছাড়া কিছু লাইনে নেই', !(await drafts()).some(d => ['approved', 'posting'].includes(d.status)));

  /* ফেসবুক একটা পেজ সাময়িক আটকে রাখলে — বাকি পেজে যায়, আটকানো পেজে ৩ ঘণ্টা চেষ্টা নয়, পরে "বাকি পেজে আবার চেষ্টা" */
  await pg.locator('#links').fill(`${M}/news/6\n${M}/news/7`);
  await pg.locator('#addLinks').click();
  await until(async () => (await drafts()).filter(d => /news\/[67]$/.test(d.url) && d.status === 'ready').length === 2, 40000);
  await pg.reload();
  await until(async () => await pg.locator('#home').isVisible(), 10000);
  const approveNowFor = async id => {
    await pg.locator(`#todo [data-open="${id}"]`).click();
    await until(async () => await pg.locator('#editor').isVisible(), 10000);
    await wait(1500);
    await pg.locator('#approveNow').click();
    await until(async () => (await drafts()).find(d => d.id === id)?.status === 'posted', 15000);
  };
  const id6 = (await drafts()).find(d => d.url.endsWith('/news/6')).id;
  const id7 = (await drafts()).find(d => d.url.endsWith('/news/7')).id;
  blockPage2 = true;
  const before = seen.fb.length, calls0 = page2Calls;
  await approveNowFor(id6);
  const d6 = (await drafts()).find(d => d.id === id6);
  check('একটা পেজ আটকে থাকলেও অন্য পেজে গেল, কারণ লেখা', d6?.status === 'posted' && /আটকে/.test(d6?.error || '') && seen.fb.length === before + 1 && seen.fb.at(-1).page === 'PAGE1', `${d6?.status} ${d6?.error}`);
  await approveNowFor(id7);
  check('আটকানো পেজে কিছুক্ষণ আর চেষ্টাই হয় না (বারবার চেষ্টায় আটক বাড়ে)', page2Calls === calls0 + 1 && seen.fb.length === before + 2, `PAGE2 ডাক ${page2Calls - calls0}`);
  blockPage2 = false;
  await pg.reload();
  await until(async () => await pg.locator('#home').isVisible(), 10000);
  await pg.locator('#doneBox summary').click();
  await pg.locator(`#done [data-act="repost"][data-id="${id6}"]`).click();
  const fixed = await until(async () => { const d = (await drafts()).find(x => x.id === id6); return d?.status === 'posted' && !d.error ? d : null; }, 15000);
  check('"বাকি পেজে আবার চেষ্টা" — শুধু আটকানো পেজে গেল', !!fixed && Object.keys(JSON.parse(fixed.fb_posts)).length === 2 && seen.fb.at(-1).page === 'PAGE2' && seen.fb.length === before + 3, JSON.stringify(seen.fb.slice(before).map(f => f.page)));

  /* ফোনের মাপে — পাশে সরে না; ছবি রাখা হয় চোখে দেখার জন্য */
  await pg.setViewportSize({ width: 390, height: 840 });
  await pg.reload();
  await until(async () => await pg.locator('#home').isVisible(), 10000);
  await wait(1500);
  const wide = () => pg.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check('ফোনে মূল পাতা পাশে সরে যায় না', !(await wide()));
  await pg.screenshot({ path: resolve(OUT, 'phone-home.png'), fullPage: true });
  await pg.locator('#todo [data-open]').first().click();
  await wait(2000);
  check('ফোনে কার্ডের পাতা পাশে সরে যায় না', !(await pg.evaluate(() => document.querySelector('.editor').scrollWidth > window.innerWidth + 1)));
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

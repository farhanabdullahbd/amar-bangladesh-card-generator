/* ─── নিউজ পড়া — লিংক থেকে মূল লেখা, শিরোনাম, সাইটের নাম আর প্রধান ছবি ───
   ছবি আর সাইটের নাম আসে পাতার og: ট্যাগ থেকে (প্রায় সব নিউজ সাইটে থাকে)। মূল লেখা আসে Jina Reader থেকে
   (r.jina.ai — পাতা থেকে বিজ্ঞাপন-মেনু বাদ দিয়ে শুধু খবরটা দেয়)। লেখা না পেলে og: বিবরণ দিয়েই চলে।
   ⚠ পাতার শুধু <head> পড়া হয় (৮ অক্টোবর ২০২৬): প্রথম আলোর মতো পাতা ১ MB-এর বেশি; পুরোটা পড়তে গিয়ে Cloudflare-এর
   ফ্রি প্ল্যানের প্রসেসিং-সীমা (প্রতি কাজে ১০ ms CPU) পেরিয়ে কাজ মাঝপথে থেমে যেত, নিউজ "লিখছে…" হয়ে আটকে থাকত।
   প্রতিটা ডাক সময়সীমায় বাঁধা — কোনো সাইট সাড়া না দিলে অনন্তকাল অপেক্ষা নয়। */

const UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';
const MAX_TEXT = 8000;
const HEAD_LIMIT = 400_000;

const timeout = (env, ms) => AbortSignal.timeout(Number(env.FETCH_TIMEOUT_MS) || ms);
const isTimeout = e => /timeout|abort/i.test(`${e?.name} ${e?.message}`);

/* <head> পর্যন্ত পড়ে থামা */
async function readHead(res) {
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let html = '';
  while (html.length < HEAD_LIMIT) {
    const { done, value } = await reader.read();
    if (done) break;
    const from = Math.max(0, html.length - 8);
    html += dec.decode(value, { stream: true });
    const i = html.slice(from).search(/<\/head>/i);
    if (i >= 0) { html = html.slice(0, from + i); break; }
  }
  reader.cancel().catch(() => {});
  return html;
}

const unescape = s => s.replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|#39|lt|gt);/gi, (m, c) => {
  const k = c.toLowerCase();
  if (k[0] === '#') return String.fromCodePoint(k[1] === 'x' ? parseInt(k.slice(2), 16) : Number(k.slice(1)));
  return { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' }[k] ?? m;
});

export function parseMeta(html) {
  const m = {};
  const take = (k, v) => { if (v && !m[k]) m[k] = unescape(v.trim()); };
  for (const tag of html.match(/<meta\s[^>]*>/gi) || []) {
    const attr = {};
    for (const a of tag.matchAll(/([a-z:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) attr[a[1].toLowerCase()] = a[2] ?? a[3];
    const p = (attr.property || attr.name || '').toLowerCase();
    const c = attr.content;
    if (p === 'og:image' || p === 'og:image:url' || p === 'og:image:secure_url') take('image', c);
    else if (p === 'twitter:image' || p === 'twitter:image:src') take('image2', c);
    else if (p === 'og:title') take('title', c);
    else if (p === 'og:site_name') take('siteName', c);
    else if (p === 'og:description' || p === 'description') take('description', c);
  }
  return m;
}

async function readMeta(url, env) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'text/html', 'Accept-Language': 'bn,en;q=0.8' },
    redirect: 'follow', signal: timeout(env, 15000),
  });
  if (!res.ok) throw new Error(`নিউজের পাতা খোলেনি (${res.status})`);
  const m = parseMeta(await readHead(res));
  const image = m.image || m.image2 || '';
  return { ...m, image: image ? new URL(image, res.url).href : '' };
}

async function readText(url, env) {
  const res = await fetch((env.JINA_BASE || 'https://r.jina.ai/') + url, { headers: { Accept: 'text/plain' }, signal: timeout(env, 20000) });
  if (!res.ok) throw new Error(`Jina ${res.status}`);
  return (await res.text()).slice(0, MAX_TEXT);
}

export async function readArticle(url, env) {
  const [meta, text] = await Promise.all([
    readMeta(url, env).catch(e => ({ error: isTimeout(e) ? 'নিউজের সাইট সাড়া দেয়নি' : e.message })),
    readText(url, env).catch(() => ''),
  ]);
  const body = text || [meta.title, meta.description].filter(Boolean).join('\n');
  if (!body) throw new Error(meta.error || 'নিউজের লেখা পড়া যায়নি — লিংকটা ঠিক আছে কি না দেখুন');
  return { text: body, image: meta.image || '', siteName: meta.siteName || '', title: meta.title || '' };
}

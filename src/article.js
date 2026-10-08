/* ─── নিউজ পড়া — লিংক থেকে মূল লেখা, শিরোনাম, সাইটের নাম আর প্রধান ছবি ───
   ছবি আর সাইটের নাম আসে পাতার og: ট্যাগ থেকে (প্রায় সব নিউজ সাইটে থাকে)। মূল লেখা আসে Jina Reader থেকে
   (r.jina.ai — পাতা থেকে বিজ্ঞাপন-মেনু বাদ দিয়ে শুধু খবরটা দেয়)। লেখা না পেলে og: বিবরণ দিয়েই চলে। */

const UA = 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';
const MAX_TEXT = 8000;

async function readMeta(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html', 'Accept-Language': 'bn,en;q=0.8' }, redirect: 'follow' });
  if (!res.ok) throw new Error(`নিউজের পাতা খোলেনি (${res.status})`);
  const m = {};
  const take = (k, v) => { if (v && !m[k]) m[k] = v.trim(); };
  await new HTMLRewriter()
    .on('meta', {
      element(e) {
        const p = (e.getAttribute('property') || e.getAttribute('name') || '').toLowerCase();
        const c = e.getAttribute('content');
        if (p === 'og:image' || p === 'og:image:url' || p === 'og:image:secure_url') take('image', c);
        else if (p === 'twitter:image' || p === 'twitter:image:src') take('image2', c);
        else if (p === 'og:title') take('title', c);
        else if (p === 'og:site_name') take('siteName', c);
        else if (p === 'og:description' || p === 'description') take('description', c);
      },
    })
    .transform(res)
    .arrayBuffer();
  const image = m.image || m.image2 || '';
  return { ...m, image: image ? new URL(image, res.url).href : '' };
}

async function readText(url, env) {
  const res = await fetch((env.JINA_BASE || 'https://r.jina.ai/') + url, { headers: { Accept: 'text/plain' } });
  if (!res.ok) throw new Error(`Jina ${res.status}`);
  return (await res.text()).slice(0, MAX_TEXT);
}

export async function readArticle(url, env) {
  const [meta, text] = await Promise.all([
    readMeta(url).catch(e => ({ error: e.message })),
    readText(url, env).catch(() => ''),
  ]);
  const body = text || [meta.title, meta.description].filter(Boolean).join('\n');
  if (!body) throw new Error(meta.error || 'নিউজের লেখা পড়া যায়নি — লিংকটা ঠিক আছে কি না দেখুন');
  return { text: body, image: meta.image || '', siteName: meta.siteName || '', title: meta.title || '' };
}

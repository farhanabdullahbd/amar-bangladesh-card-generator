/* ─── ফেসবুক পেজে ছবিসহ পোস্ট (Graph API) ───
   লাগে পেজের আইডি (FB_PAGE_ID) আর পেজের স্থায়ী টোকেন (FB_PAGE_TOKEN) — দুটোই Cloudflare-এর গোপন সেটিংসে।
   ব্যক্তিগত প্রোফাইলে পোস্ট করা যায় না, শুধু পেজে। */

/* বসানোর সময় আগে-পরে ফাঁকা জায়গা থেকে গেলেও চলে */
const conf = env => ({ id: String(env.FB_PAGE_ID || '').trim(), token: String(env.FB_PAGE_TOKEN || '').trim() });
export const fbReady = env => { const c = conf(env); return !!(c.id && c.token); };
/* কোন ঘরটা নেই — সেটিংসে দেখানোর জন্য */
export const fbMissing = env => { const c = conf(env); return [!c.id && 'FB_PAGE_ID', !c.token && 'FB_PAGE_TOKEN'].filter(Boolean); };

export async function postPhoto(env, jpeg, caption) {
  const base = env.FB_GRAPH_BASE || 'https://graph.facebook.com';
  const ver = env.FB_GRAPH_VERSION || 'v23.0';
  const form = new FormData();
  form.append('source', new Blob([jpeg], { type: 'image/jpeg' }), 'card.jpg');
  form.append('caption', caption || '');
  form.append('published', 'true');
  const c = conf(env);
  form.append('access_token', c.token);
  const res = await fetch(`${base}/${ver}/${c.id}/photos`, { method: 'POST', body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    const e = data.error || {};
    if (e.code === 190) throw new Error('ফেসবুকের টোকেন বাতিল বা মেয়াদ শেষ — নতুন টোকেন বসাতে হবে');
    if (e.code === 200 || e.code === 10) throw new Error('ফেসবুক পেজে পোস্ট করার অনুমতি নেই — টোকেনের অনুমতি দেখুন');
    throw new Error(`ফেসবুক: ${e.message || res.status}`);
  }
  return data.post_id || data.id || '';
}

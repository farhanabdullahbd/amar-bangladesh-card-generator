/* ─── ফেসবুক পেজে ছবিসহ পোস্ট (Graph API) — একসাথে কয়েকটা পেজে ───
   গোপন সেটিংসে একটাই জিনিস: মালিকের স্থায়ী লগইন-টোকেন (FB_USER_TOKEN)। সেটা দিয়ে মালিক যে পেজগুলো চালান তার
   তালিকা আর প্রতিটা পেজের নিজের টোকেন ফেসবুক থেকে আনা হয়। কোন পেজে পোস্ট হবে, সেটা মালিক সাইটের সেটিংসে বাছেন
   (৮ অক্টোবর ২০২৬: প্রথমে এক পেজের ব্যবস্থা ছিল, ভুল পেজে পোস্ট যাওয়ার পর মালিক দুই পেজে একসাথে চাইলেন)।
   ব্যক্তিগত প্রোফাইলে পোস্ট করা যায় না, শুধু পেজে। */

const base = env => `${env.FB_GRAPH_BASE || 'https://graph.facebook.com'}/${env.FB_GRAPH_VERSION || 'v23.0'}`;
const userToken = env => String(env.FB_USER_TOKEN || '').trim();
export const fbTokenSet = env => !!userToken(env);

function fbError(e = {}, status) {
  /* ফেসবুকের স্প্যাম-পাহারা (কোড 368) — পেজে কিছুক্ষণের জন্য পোস্ট আটকে রাখে; বারবার চেষ্টা করলে আরও দেরি হয় */
  if (e.code === 368 || /temporarily blocked/i.test(e.message || '')) {
    return Object.assign(new Error('ফেসবুক এই পেজে কিছুক্ষণের জন্য পোস্ট আটকে রেখেছে'), { blocked: true });
  }
  if (e.code === 190) return new Error('ফেসবুকের টোকেন বাতিল বা মেয়াদ শেষ — নতুন টোকেন বসাতে হবে');
  if (e.code === 200 || e.code === 10) return new Error('এই পেজে পোস্ট করার অনুমতি নেই — টোকেনের অনুমতি দেখুন');
  return new Error(`ফেসবুক: ${e.message || status}`);
}

/* মালিক যে পেজগুলো চালান — প্রতিটার নাম, আইডি আর পোস্ট করার টোকেন */
export async function listPages(env) {
  if (!fbTokenSet(env)) throw new Error('ফেসবুকের টোকেন বসানো নেই (Cloudflare-এর Secret-এ FB_USER_TOKEN)');
  const url = `${base(env)}/me/accounts?fields=id,name,category,access_token&limit=100&access_token=${encodeURIComponent(userToken(env))}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw fbError(data.error, res.status);
  return (data.data || []).map(p => ({ id: String(p.id), name: p.name || '', category: p.category || '', token: p.access_token }));
}

export async function postPhoto(env, page, jpeg, caption) {
  const form = new FormData();
  form.append('source', new Blob([jpeg], { type: 'image/jpeg' }), 'card.jpg');
  form.append('caption', caption || '');
  form.append('published', 'true');
  form.append('access_token', page.token);
  const res = await fetch(`${base(env)}/${page.id}/photos`, { method: 'POST', body: form, signal: AbortSignal.timeout(60000) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw fbError(data.error, res.status);
  return data.post_id || data.id || '';
}

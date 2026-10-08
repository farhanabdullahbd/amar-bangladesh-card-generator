/* ─── ড্যাশবোর্ড — তিন ধাপ: লিংক দিন → দেখে অনুমোদন দিন → পোস্টের অপেক্ষা; আলাদা সেটিংস ───
   (৮ অক্টোবর ২০২৬: মালিকের কথায় আগের ছয় ট্যাবের পাতা সহজ করা হলো) */
(function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const BN = s => String(s).replace(/\d/g, d => '০১২৩৪৫৬৭৮৯'[d]);

  let state = { drafts: [], slots: [], upcoming: [], health: {} };
  let editing = null;       // যে নিউজটা খোলা
  let photo = null;         // কার্ডের ছবি (Image)
  let processing = false;

  async function call(path, opts = {}) {
    const res = await fetch(path, { credentials: 'same-origin', ...opts });
    const ct = res.headers.get('Content-Type') || '';
    const data = ct.includes('json') ? await res.json() : null;
    if (res.status === 401 && path !== '/api/login') { showLogin(); throw new Error('লগইন করুন'); }
    if (!res.ok) throw new Error(data?.error || `সমস্যা হয়েছে (${res.status}) — আবার চেষ্টা করুন`);
    return data;
  }
  const post = (path, body) => call(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  const say = (el, text, kind = '') => { el.textContent = text; el.className = 'msg ' + kind; };
  const cleanCap = t => String(t || '').replace(/🔗\s*/gu, '').replace(/(?:https?:\/\/|www\.)\S+/gi, '')
    .split('\n').map(l => l.trimEnd()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  let toastTimer = null;
  const toast = text => { const t = $('toast'); t.textContent = text; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 3000); };

  /* ── পাতা বদল ── */
  function show(view) {
    $('login').hidden = view !== 'login';
    $('bar').hidden = view === 'login';
    $('home').hidden = view !== 'home';
    $('settings').hidden = view !== 'settings';
    window.scrollTo(0, 0);
  }
  function showLogin() { $('editor').hidden = true; show('login'); $('password').focus(); }
  $('openSettings').onclick = () => { renderSettings(); show('settings'); };
  $('closeSettings').onclick = () => { show('home'); render(); };

  /* ── লগইন ── */
  $('loginForm').onsubmit = async e => {
    e.preventDefault();
    say($('loginMsg'), 'ঢুকছি…');
    try {
      await post('/api/login', { password: $('password').value });
      $('password').value = '';
      say($('loginMsg'), '');
      show('home');
      await refresh();
    } catch (err) { say($('loginMsg'), err.message, 'err'); }
  };
  $('logout').onclick = async () => { await post('/api/logout').catch(() => {}); showLogin(); };

  /* ── সময় দেখানো ── */
  const bdToday = off => new Date(Date.now() + 6 * 3600e3 + off * 86400e3).toISOString().slice(0, 10);
  const timeLabel = t => {
    const [h, m] = t.split(':').map(Number);
    const part = h < 5 ? 'রাত' : h < 12 ? 'সকাল' : h < 15 ? 'দুপুর' : h < 18 ? 'বিকেল' : h < 20 ? 'সন্ধ্যা' : 'রাত';
    return `${part} ${BN(((h + 11) % 12) + 1)}:${BN(String(m).padStart(2, '0'))}`;
  };
  const slotLabel = key => {
    const [date, t] = key.split(' ');
    const day = date === bdToday(0) ? 'আজ' : date === bdToday(1) ? 'কাল' : `${BN(Number(date.slice(8)))} তারিখ`;
    return `${day} ${timeLabel(t)}`;
  };
  const ago = ms => {
    const min = Math.round((Date.now() - ms) / 60000);
    if (min < 1) return 'এইমাত্র';
    if (min < 60) return `${BN(min)} মিনিট আগে`;
    if (min < 1440) return `${BN(Math.round(min / 60))} ঘণ্টা আগে`;
    return new Date(ms).toLocaleDateString('bn-BD', { day: 'numeric', month: 'long' });
  };

  /* ── অবস্থা আনা ও আঁকা ── */
  async function refresh() {
    state = await call('/api/state');
    render();
    if (state.drafts.some(d => d.status === 'new' || d.status === 'working')) runQueue();
  }

  const newsImg = d => d.image_url ? `/api/img?u=${encodeURIComponent(d.image_url)}` : '';
  const pic = (src, cls = '') => src
    ? `<img class="${cls}" src="${esc(src)}" alt="" loading="lazy" onerror="this.outerHTML='<div class=&quot;noimg&quot;></div>'">`
    : '<div class="noimg"></div>';

  function render() {
    const h = state.health || {};
    const by = (...st) => state.drafts.filter(d => st.includes(d.status));

    /* সতর্কবার্তা — শুধু দরকার হলে */
    const notes = [];
    if (!h.ai) notes.push('<div class="note bad">⚠️ লেখার AI চালু নেই — DeepSeek-এর key বসানো হয়নি। সেটিংসে দেখুন।</div>');
    if (!h.fbToken) notes.push('<div class="note warn">ℹ️ ফেসবুক এখনো যুক্ত হয়নি। অনুমোদিত কার্ড জমা থাকবে; যুক্ত হলে সময়মতো পোস্ট হবে।</div>');
    else if (!h.fb) notes.push('<div class="note warn">ℹ️ কোন ফেসবুক পেজে পোস্ট হবে, এখনো বাছা হয়নি — ⚙️ সেটিংসে পেজ বাছুন।</div>');
    $('banner').innerHTML = notes.join('');

    /* ধাপ ২ — লেখা হচ্ছে, অনুমোদন বাকি, সমস্যা */
    const todo = [...by('failed'), ...by('ready'), ...by('new', 'working')];
    $('cTodo').textContent = todo.length ? BN(todo.length) : '';
    $('todo').innerHTML = todo.length ? todo.map(cardItem).join('')
      : '<div class="empty">এখন কিছু নেই। উপরে লিংক দিলে কার্ড এখানে আসবে।</div>';
    $('todo').style.display = todo.length ? '' : 'block';

    /* ধাপ ৩ — পোস্টের অপেক্ষায় */
    const queue = by('approved').sort((a, b) => a.approved_at - b.approved_at);
    const stuck = [...by('posting'), ...by('post_failed')];
    $('cQueue').textContent = queue.length + stuck.length ? BN(queue.length + stuck.length) : '';
    $('queue').innerHTML = (queue.length || stuck.length)
      ? [...stuck.map(d => queueRow(d, null)), ...queue.map((d, i) => queueRow(d, state.upcoming[i]))].join('')
      : '<div class="empty">এখন কিছু নেই। ধাপ ২-এ অনুমোদন দিলে এখানে আসবে।</div>';

    /* পোস্ট হয়ে গেছে */
    const done = by('posted').sort((a, b) => b.posted_at - a.posted_at);
    $('cDone').textContent = done.length ? BN(done.length) : '';
    $('done').innerHTML = done.length ? done.map(doneRow).join('') : '<div class="empty">গত ৩ দিনে কিছু পোস্ট হয়নি।</div>';
  }

  function cardItem(d) {
    if (d.status === 'new' || d.status === 'working') {
      return `<div class="c working"><div class="pic"><div class="spin"></div></div><div class="body">
        <div class="h">কার্ড তৈরি হচ্ছে…</div><div class="m">${esc(d.url)}</div><div class="m">সাধারণত আধা মিনিট লাগে</div>
        <div class="actions"><button class="btn light" data-act="reject" data-id="${d.id}">বাতিল</button></div></div></div>`;
    }
    if (d.status === 'failed') {
      return `<div class="c failed"><div class="pic">⚠️ হয়নি</div><div class="body">
        <div class="m">${esc(d.url)}</div><div class="err">${esc(d.error || 'লেখা যায়নি')}</div>
        <div class="actions"><button class="btn primary" data-act="retry" data-id="${d.id}">আবার চেষ্টা</button><button class="btn light" data-act="reject" data-id="${d.id}">বাদ দিন</button></div></div></div>`;
    }
    return `<div class="c"><div class="pic">${newsImg(d) ? pic(newsImg(d)) : 'ছবি নেই'}</div><div class="body">
      <div class="h">${esc(d.headline)}</div><div class="m">${esc(d.source)} · ${ago(d.created_at)}</div>
      <div class="actions"><button class="btn primary" data-open="${d.id}">দেখুন ও অনুমোদন দিন</button></div></div></div>`;
  }

  function queueRow(d, slot) {
    const card = `/api/drafts/${d.id}/card.jpg`;
    let when, extra = '', acts;
    if (d.status === 'posting') {
      when = '<span class="when wait">পোস্ট হচ্ছে…</span>';
      acts = '';
    } else if (d.status === 'post_failed') {
      when = '<span class="when bad">পোস্ট হয়নি</span>';
      extra = `<div class="err">${esc(d.error || '')}</div>`;
      acts = `<button class="btn primary small" data-act="retry" data-id="${d.id}">আবার চেষ্টা</button><button class="btn light small" data-act="reject" data-id="${d.id}">বাদ দিন</button>`;
    } else {
      when = !state.health.fb ? '<span class="when wait">ফেসবুক যুক্ত হলে যাবে</span>'
        : `<span class="when">${slot ? slotLabel(slot) : 'সামনের কোনো সময়ে'}</span>`;
      if (d.error) extra = `<div class="err">আগের চেষ্টায় সমস্যা: ${esc(d.error)}</div>`;
      acts = (state.health.fb ? `<button class="btn primary small" data-act="post" data-id="${d.id}">এখনই পোস্ট</button>` : '')
        + `<button class="btn light small" data-act="unapprove" data-id="${d.id}">ফিরিয়ে আনুন</button>`;
    }
    return `<div class="r">${pic(card)}<div class="t">${when}<div class="h">${esc(d.headline)}</div>${extra}</div><div class="acts">${acts}</div></div>`;
  }

  function doneRow(d) {
    let posts = {};
    try { posts = JSON.parse(d.fb_posts || '{}'); } catch { /* পুরনো পোস্টে নেই */ }
    const list = Object.values(posts).length ? Object.values(posts) : d.fb_post_id ? [{ post: d.fb_post_id, name: 'ফেসবুকে দেখুন' }] : [];
    const links = list.map(p => `<a class="btn light small" href="https://www.facebook.com/${esc(p.post)}" target="_blank" rel="noopener">${esc(p.name)} ↗</a>`).join('');
    return `<div class="r">${pic(newsImg(d))}<div class="t"><span class="when">${ago(d.posted_at)}</span><div class="h">${esc(d.headline)}</div></div><div class="acts links">${links}</div></div>`;
  }

  /* তালিকার বোতাম */
  const ASK = { post: 'এই কার্ডটা এখনই ফেসবুক পেজে পোস্ট করবেন?', reject: 'এই নিউজটা বাদ দেবেন?', unapprove: 'অনুমোদন তুলে নিয়ে আবার ধাপ ২-এ ফিরিয়ে আনবেন? (লেখা বা ছবি ঠিক করার জন্য)' };
  const DONE_MSG = { post: 'পোস্ট হয়ে গেছে ✓', reject: 'বাদ দেওয়া হলো', unapprove: 'ধাপ ২-এ ফিরিয়ে আনা হলো', retry: 'আবার চেষ্টা হচ্ছে' };
  document.addEventListener('click', async e => {
    const b = e.target.closest('#home [data-act], #home [data-open]');
    if (!b) return;
    if (b.dataset.open) return openEditor(state.drafts.find(d => d.id === b.dataset.open));
    const { act, id } = b.dataset;
    if (ASK[act] && !confirm(ASK[act])) return;
    b.disabled = true;
    if (act === 'post') b.textContent = 'পোস্ট হচ্ছে…';
    try { await post(`/api/drafts/${id}/${act}`); toast(DONE_MSG[act]); await refresh(); }
    catch (err) { alert(err.message); b.disabled = false; await refresh().catch(() => {}); }
  });

  /* ── ধাপ ১: লিংক যোগ, তারপর একটা একটা করে লেখা ── */
  $('addLinks').onclick = async () => {
    const text = $('links').value.trim();
    if (!text) return say($('addMsg'), 'আগে নিউজের লিংক দিন', 'err');
    $('addLinks').disabled = true;
    try {
      const r = await post('/api/links', { text });
      $('links').value = '';
      const parts = [];
      if (r.added.length) parts.push(`${BN(r.added.length)}টা কার্ড তৈরি হচ্ছে — নিচে দেখুন`);
      if (r.skipped.length) parts.push(`${BN(r.skipped.length)}টা লিংক আগেই দেওয়া হয়েছিল`);
      say($('addMsg'), parts.join('। '), r.added.length ? 'ok' : 'err');
      await refresh();
    } catch (err) { say($('addMsg'), err.message, 'err'); }
    $('addLinks').disabled = false;
  };

  async function runQueue() {
    if (processing) return;
    processing = true;
    try {
      for (;;) {
        const { result } = await post('/api/process');
        state = await call('/api/state');
        if (!$('home').hidden) render();
        if (!result) break;
      }
    } catch (err) { console.warn(err); }
    processing = false;
  }

  /* ── সেটিংস ── */
  function renderSettings() {
    const slots = state.slots || [];
    $('slotList').innerHTML = slots.map(s => `<span class="slot">${timeLabel(s)}<button data-del="${s}" title="সরান">×</button></span>`).join('')
      || '<span class="hint">কোনো সময় নেই — নিচে যোগ করুন</span>';
    $('slotCount').textContent = `দিনে মোট ${BN(slots.length)}টা পোস্ট`;
    const h = state.health || {};
    $('sAi').textContent = h.ai ? '✅ চালু' : '⚠️ key নেই';
    $('sAi').className = h.ai ? 'ok' : 'no';
    $('sFb').textContent = h.fb ? `✅ ${BN(h.fbPages.length)}টা পেজে` : h.fbToken ? '⚠️ পেজ বাছা হয়নি' : '⚠️ যুক্ত নয়';
    $('sFb').className = h.fb ? 'ok' : 'no';
    $('fbHelp').textContent = h.fbToken ? (h.fb ? h.fbPages.map(p => p.name).join(', ') : 'উপরে পেজ বাছুন।')
      : 'Cloudflare-এ ফেসবুকের টোকেন বসানো নেই (Secret: FB_USER_TOKEN)।';
    loadFbPages();
  }

  /* ফেসবুক পেজ বাছা — মালিক যে পেজগুলো চালান, তার মধ্যে থেকে */
  async function loadFbPages() {
    const box = $('fbPageList');
    if (!state.health?.fbToken) { box.innerHTML = '<span class="hint">ফেসবুক যুক্ত হলে এখানে আপনার পেজের তালিকা আসবে।</span>'; $('saveFbPages').hidden = true; return; }
    box.innerHTML = '<span class="hint">পেজের তালিকা আনছি…</span>';
    try {
      const { pages } = await call('/api/fb/pages');
      box.innerHTML = pages.map(p => `<label class="page-opt${p.selected ? ' on' : ''}"><input type="checkbox" value="${esc(p.id)}"${p.selected ? ' checked' : ''}><span>${esc(p.name)}<small>${esc(p.category)}</small></span></label>`).join('')
        || '<span class="hint">এই টোকেন দিয়ে কোনো পেজ পাওয়া যায়নি।</span>';
      $('saveFbPages').hidden = !pages.length;
    } catch (err) { box.innerHTML = ''; say($('fbPagesMsg'), err.message, 'err'); }
  }
  $('fbPageList').onchange = e => { const l = e.target.closest('.page-opt'); if (l) l.classList.toggle('on', e.target.checked); };
  $('saveFbPages').onclick = async () => {
    const ids = [...$('fbPageList').querySelectorAll('input:checked')].map(i => i.value);
    if (!ids.length && !confirm('কোনো পেজ বাছা নেই — তাহলে কোথাও পোস্ট হবে না। ঠিক আছে?')) return;
    try {
      const r = await call('/api/fb/pages', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) });
      state.health.fbPages = r.pages;
      state.health.fb = r.pages.length > 0;
      say($('fbPagesMsg'), r.pages.length ? `সংরক্ষণ হয়েছে — এখন থেকে পোস্ট যাবে: ${r.pages.map(p => p.name).join(', ')}` : 'সংরক্ষণ হয়েছে — কোনো পেজে পোস্ট হবে না', 'ok');
      renderSettingsStatus();
    } catch (err) { say($('fbPagesMsg'), err.message, 'err'); }
  };
  function renderSettingsStatus() {
    const h = state.health || {};
    $('sFb').textContent = h.fb ? `✅ ${BN(h.fbPages.length)}টা পেজে` : h.fbToken ? '⚠️ পেজ বাছা হয়নি' : '⚠️ যুক্ত নয়';
    $('sFb').className = h.fb ? 'ok' : 'no';
    $('fbHelp').textContent = h.fb ? h.fbPages.map(p => p.name).join(', ') : '';
  }
  async function saveSlots(list, msg) {
    try {
      const r = await call('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slots: list.join(',') }) });
      state.slots = r.slots;
      renderSettings();
      toast(msg);
      refresh().catch(() => {});
    } catch (err) { say($('slotsMsg'), err.message, 'err'); }
  }
  $('slotList').onclick = e => {
    const s = e.target.closest('[data-del]')?.dataset.del;
    if (!s) return;
    if (state.slots.length <= 1) return say($('slotsMsg'), 'অন্তত একটা সময় রাখতে হবে', 'err');
    saveSlots(state.slots.filter(x => x !== s), `${timeLabel(s)} সরানো হলো`);
  };
  $('addSlot').onclick = () => {
    const v = $('newSlot').value;
    if (!v) return say($('slotsMsg'), 'আগে সময় বাছুন', 'err');
    say($('slotsMsg'), '');
    if (state.slots.includes(v)) return say($('slotsMsg'), 'এই সময়টা আগেই আছে', 'err');
    $('newSlot').value = '';
    saveSlots([...state.slots, v], `${timeLabel(v)} যোগ হলো`);
  };
  $('resetSlots').onclick = () => {
    if (!confirm('পোস্টের সময় আবার শুরুর মতো (সকাল ৮টা থেকে রাত ১০টা, প্রতি ঘণ্টায়) করে দেবেন?')) return;
    saveSlots(Array.from({ length: 15 }, (_, i) => `${String(8 + i).padStart(2, '0')}:00`), 'শুরুর সময়সূচি ফিরিয়ে আনা হলো');
  };

  /* ── কার্ড দেখা, ঠিক করা, অনুমোদন ── */
  const F = { headline: 'fHeadline', body: 'fBody', category: 'fCategory', date_label: 'fDate', source: 'fSource', caption: 'fCaption' };
  const fields = () => Object.fromEntries(Object.entries(F).map(([k, id]) => [k, $(id).value.trim()]));
  let drawTimer = null;
  const redraw = () => { clearTimeout(drawTimer); drawTimer = setTimeout(() => Card.drawCard($('canvas'), fields(), photo), 250); };

  async function openEditor(d) {
    if (!d) return;
    editing = d;
    for (const [k, id] of Object.entries(F)) $(id).value = d[k] || '';
    $('fCaption').value = cleanCap(d.caption);
    $('srcLink').href = d.url;
    say($('editMsg'), '');
    $('useNewsPhoto').hidden = !d.image_url;
    $('approveNow').hidden = !state.health.fb;
    $('editor').hidden = false;
    $('editor').scrollTop = 0;
    document.body.style.overflow = 'hidden';
    photo = d.image_url ? await Card.loadImg(newsImg(d)) : null;
    if (d.image_url && !photo) say($('editMsg'), 'নিউজের ছবিটা আনা যায়নি — "ছবি বদলান" চেপে নিজের ছবি দিন', 'err');
    await Card.drawCard($('canvas'), fields(), photo);
  }
  function closeEditor() { $('editor').hidden = true; document.body.style.overflow = ''; editing = null; }
  $('closeEditor').onclick = closeEditor;
  for (const id of Object.values(F)) if (id !== 'fCaption') $(id).addEventListener('input', redraw);

  $('useNewsPhoto').onclick = async () => {
    photo = await Card.loadImg(newsImg(editing));
    if (!photo) say($('editMsg'), 'নিউজের ছবিটা আনা যায়নি', 'err');
    redraw();
  };
  $('pickPhoto').onclick = () => $('photoFile').click();
  $('photoFile').onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = async ev => { photo = await Card.loadImg(ev.target.result); redraw(); };
    r.readAsDataURL(file);
    e.target.value = '';
  };
  $('download').onclick = async () => {
    await Card.drawCard($('canvas'), fields(), photo);
    const blob = await Card.cardJpeg($('canvas'));
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `amar-bangladesh-${Date.now()}.jpg` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };

  async function approve(now) {
    const f = fields();
    if (!f.headline || !f.body) return say($('editMsg'), 'হেডলাইন আর বিস্তারিত লাগবে', 'err');
    if (now && !confirm('অনুমোদন দিয়ে এখনই ফেসবুক পেজে পোস্ট করবেন?')) return;
    $('approve').disabled = $('approveNow').disabled = true;
    say($('editMsg'), now ? 'পোস্ট হচ্ছে…' : 'অনুমোদন হচ্ছে…');
    let approved = false;
    try {
      await call(`/api/drafts/${editing.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) });
      await Card.drawCard($('canvas'), f, photo);
      const form = new FormData();
      form.append('card', await Card.cardJpeg($('canvas')), 'card.jpg');
      form.append('caption', f.caption);
      await call(`/api/drafts/${editing.id}/approve`, { method: 'POST', body: form });
      approved = true;
      if (now) await post(`/api/drafts/${editing.id}/post`);
      closeEditor();
      toast(now ? 'পোস্ট হয়ে গেছে ✓' : 'অনুমোদন হয়েছে — ধাপ ৩-এ পোস্টের অপেক্ষায়');
      await refresh();
    } catch (err) {
      /* অনুমোদন হয়ে গেছে কিন্তু পোস্ট হয়নি — কার্ডটা ধাপ ৩-এ আছে, সেখান থেকে আবার "এখনই পোস্ট" দেওয়া যায় */
      if (approved) { closeEditor(); alert(`অনুমোদন হয়েছে, কিন্তু পোস্ট হয়নি: ${err.message}\nকার্ডটা ধাপ ৩-এ আছে।`); await refresh().catch(() => {}); }
      else say($('editMsg'), err.message, 'err');
    }
    $('approve').disabled = $('approveNow').disabled = false;
  }
  $('approve').onclick = () => approve(false);
  $('approveNow').onclick = () => approve(true);
  $('rewrite').onclick = async () => {
    if (!confirm('AI দিয়ে আবার লেখাবেন? এখনকার লেখা বদলে যাবে।')) return;
    try { await post(`/api/drafts/${editing.id}/retry`); closeEditor(); toast('আবার লেখা হচ্ছে'); await refresh(); }
    catch (err) { say($('editMsg'), err.message, 'err'); }
  };
  $('reject').onclick = async () => {
    if (!confirm('এই নিউজটা বাদ দেবেন?')) return;
    try { await post(`/api/drafts/${editing.id}/reject`); closeEditor(); toast('বাদ দেওয়া হলো'); await refresh(); }
    catch (err) { say($('editMsg'), err.message, 'err'); }
  };

  /* ── শুরু ── */
  setInterval(() => { if (!document.hidden && !$('home').hidden && $('editor').hidden) refresh().catch(() => {}); }, 20000);
  call('/api/state')
    .then(s => { state = s; show('home'); render(); if (s.drafts.some(d => d.status === 'new' || d.status === 'working')) runQueue(); })
    .catch(() => showLogin());
})();

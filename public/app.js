/* ─── ড্যাশবোর্ড — লিংক দেওয়া, কার্ড দেখা-ঠিক করা-অনুমোদন, লাইন আর সময়সূচি ─── */
(function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const BN = s => String(s).replace(/\d/g, d => '০১২৩৪৫৬৭৮৯'[d]);

  let state = { drafts: [], slots: [], upcoming: [], health: {} };
  let tab = 'ready';
  let editing = null;       // যে নিউজটা খোলা
  let photo = null;         // কার্ডের ছবি (Image)
  let processing = false;

  async function call(path, opts = {}) {
    const res = await fetch(path, { credentials: 'same-origin', ...opts });
    const ct = res.headers.get('Content-Type') || '';
    const data = ct.includes('json') ? await res.json() : null;
    if (res.status === 401 && path !== '/api/login') { showLogin(); throw new Error('লগইন করুন'); }
    if (!res.ok) throw new Error(data?.error || `সমস্যা (${res.status})`);
    return data;
  }
  const post = (path, body) => call(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  const say = (el, text, kind = '') => { el.textContent = text; el.className = 'msg ' + kind; };

  /* ── লগইন ── */
  function showLogin() { $('app').hidden = true; $('editor').hidden = true; $('login').hidden = false; $('password').focus(); }
  $('loginForm').onsubmit = async e => {
    e.preventDefault();
    say($('loginMsg'), 'ঢুকছি…');
    try {
      await post('/api/login', { password: $('password').value });
      $('password').value = '';
      $('login').hidden = true;
      await start();
    } catch (err) { say($('loginMsg'), err.message, 'err'); }
  };
  $('logout').onclick = async () => { await post('/api/logout').catch(() => {}); showLogin(); };

  /* ── অবস্থা আনা ও আঁকা ── */
  const GROUP = { ready: ['ready'], approved: ['approved'], working: ['new', 'working'], posted: ['posted'], failed: ['failed', 'post_failed'] };
  const imgSrc = d => d.status === 'approved' || d.status === 'post_failed' ? `/api/drafts/${d.id}/card.jpg`
    : d.image_url ? `/api/img?u=${encodeURIComponent(d.image_url)}` : '';
  const when = ms => ms ? new Date(ms).toLocaleString('bn-BD', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';
  const slotLabel = key => {
    const [date, t] = key.split(' ');
    const today = new Date(Date.now() + 6 * 3600e3).toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 30 * 3600e3).toISOString().slice(0, 10);
    const [h, m] = t.split(':').map(Number);
    const tt = `${h < 12 ? 'সকাল' : h < 15 ? 'দুপুর' : h < 18 ? 'বিকেল' : h < 20 ? 'সন্ধ্যা' : 'রাত'} ${BN(((h + 11) % 12) + 1)}:${BN(String(m).padStart(2, '0'))}`;
    return `${date === today ? 'আজ' : date === tomorrow ? 'কাল' : BN(date.slice(8)) + ' তারিখ'} ${tt}`;
  };

  async function refresh() {
    state = await call('/api/state');
    render();
    if (state.drafts.some(d => d.status === 'new' || d.status === 'working')) runQueue();
  }

  function render() {
    const h = state.health || {};
    $('health').innerHTML =
      `<span class="chip ${h.ai ? 'ok' : 'bad'}">AI ${h.ai ? 'চালু' : 'key নেই'}</span>` +
      `<span class="chip ${h.fb ? 'ok' : 'bad'}">ফেসবুক ${h.fb ? 'যুক্ত' : 'যুক্ত নয়'}</span>` +
      `<span class="chip">দিনে ${BN(state.slots.length)}টা পোস্ট</span>`;
    for (const b of $('tabs').querySelectorAll('button')) {
      const g = GROUP[b.dataset.tab];
      b.classList.toggle('on', b.dataset.tab === tab);
      if (g) b.querySelector('b').textContent = BN(state.drafts.filter(d => g.includes(d.status)).length);
    }
    $('schedule').hidden = tab !== 'schedule';
    $('list').hidden = tab === 'schedule';
    if (tab === 'schedule') { if (document.activeElement !== $('slots')) $('slots').value = state.slots.join(', '); return; }

    let items = state.drafts.filter(d => GROUP[tab].includes(d.status));
    if (tab === 'approved') items = items.sort((a, b) => a.approved_at - b.approved_at);
    if (tab === 'posted') items = items.sort((a, b) => b.posted_at - a.posted_at);
    if (!items.length) { $('list').innerHTML = `<div class="empty">${EMPTY[tab]}</div>`; return; }
    $('list').innerHTML = items.map((d, i) => row(d, i)).join('');
  }
  const EMPTY = {
    ready: 'অনুমোদনের জন্য কিছু নেই — উপরে লিংক দিন',
    approved: 'পোস্টের লাইনে কিছু নেই',
    working: 'এখন কিছু লেখা হচ্ছে না',
    posted: 'গত ৩ দিনে কিছু পোস্ট হয়নি',
    failed: 'কোনো সমস্যা নেই',
  };

  function row(d, i) {
    const src = imgSrc(d);
    const pic = src ? `<img src="${esc(src)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'noimg',textContent:'ছবি নেই'}))">` : '<div class="noimg">ছবি নেই</div>';
    const head = d.headline ? esc(d.headline) : `<span class="muted">${esc(d.url)}</span>`;
    let meta = '', extra = '', acts = '';
    if (d.status === 'ready') {
      meta = `${esc(d.source)} · ${esc(d.category)}`;
      acts = `<button class="btn primary small" data-open="${d.id}">দেখুন ও অনুমোদন দিন</button><button class="btn danger small" data-act="reject" data-id="${d.id}">বাদ</button>`;
    } else if (d.status === 'approved') {
      const slot = state.upcoming[i];
      meta = `${esc(d.source)} · অনুমোদন ${when(d.approved_at)}`;
      extra = state.health.fb ? `<div class="w">পোস্ট হবে: ${slot ? slotLabel(slot) : 'সামনের কোনো সময়ে'}</div>` : '<div class="w">ফেসবুক যুক্ত হলে পোস্ট হবে</div>';
      if (d.error) extra += `<div class="e">শেষ চেষ্টায় সমস্যা: ${esc(d.error)}</div>`;
      acts = `<button class="btn ghost small" data-act="unapprove" data-id="${d.id}">ফিরিয়ে আনুন (ঠিক করতে)</button><button class="btn danger small" data-act="reject" data-id="${d.id}">বাদ</button>`;
    } else if (d.status === 'new' || d.status === 'working') {
      meta = d.status === 'working' ? 'নিউজ পড়ে লিখছে…' : 'লাইনে আছে, একটু পরে লিখবে';
    } else if (d.status === 'posted') {
      meta = `পোস্ট হয়েছে ${when(d.posted_at)}`;
      if (d.fb_post_id) acts = `<a class="btn ghost small" href="https://www.facebook.com/${esc(d.fb_post_id)}" target="_blank" rel="noopener">ফেসবুকে দেখুন ↗</a>`;
    } else {
      meta = d.status === 'post_failed' ? 'পোস্ট হয়নি (৩ বার চেষ্টা)' : 'লেখা যায়নি';
      extra = `<div class="e">${esc(d.error || '')}</div>`;
      acts = `<button class="btn primary small" data-act="retry" data-id="${d.id}">আবার চেষ্টা</button><button class="btn danger small" data-act="reject" data-id="${d.id}">বাদ</button>`;
    }
    return `<div class="item">${pic}<div class="t"><div class="h">${head}</div><div class="m">${meta}</div>${extra}<div class="a">${acts}</div></div></div>`;
  }

  $('tabs').onclick = e => { const b = e.target.closest('button'); if (!b) return; tab = b.dataset.tab; render(); };
  $('list').onclick = async e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.open) return openEditor(state.drafts.find(d => d.id === b.dataset.open));
    const { act, id } = b.dataset;
    if (!act) return;
    if (act === 'reject' && !confirm('এটা বাদ দেবেন?')) return;
    b.disabled = true;
    try { await post(`/api/drafts/${id}/${act}`); await refresh(); }
    catch (err) { alert(err.message); b.disabled = false; }
  };

  /* ── লিংক যোগ, তারপর একটা একটা করে লেখা ── */
  $('addLinks').onclick = async () => {
    const text = $('links').value.trim();
    if (!text) return say($('addMsg'), 'লিংক দিন', 'err');
    $('addLinks').disabled = true;
    try {
      const r = await post('/api/links', { text });
      $('links').value = '';
      say($('addMsg'), `${BN(r.added.length)}টা যোগ হলো${r.skipped.length ? `, ${BN(r.skipped.length)}টা আগেই ছিল` : ''} — লিখছে…`, 'ok');
      tab = r.added.length ? 'working' : tab;
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
        if (!result) break;
        state = await call('/api/state');
        if (tab === 'working' && !state.drafts.some(d => d.status === 'new' || d.status === 'working')) tab = 'ready';
        render();
      }
    } catch (err) { console.warn(err); }
    processing = false;
  }

  /* ── সময়সূচি ── */
  $('saveSlots').onclick = async () => {
    try {
      const r = await call('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slots: $('slots').value }) });
      say($('slotsMsg'), `সংরক্ষণ হয়েছে — দিনে ${BN(r.slots.length)}টা`, 'ok');
      await refresh();
    } catch (err) { say($('slotsMsg'), err.message, 'err'); }
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
    $('srcLink').href = d.url;
    say($('editMsg'), '');
    $('editor').hidden = false;
    document.body.style.overflow = 'hidden';
    photo = d.image_url ? await Card.loadImg(`/api/img?u=${encodeURIComponent(d.image_url)}`) : null;
    if (d.image_url && !photo) say($('editMsg'), 'নিউজের ছবিটা আনা যায়নি — "নিজের ছবি দিন" চাপুন', 'err');
    await Card.drawCard($('canvas'), fields(), photo);
  }
  function closeEditor() { $('editor').hidden = true; document.body.style.overflow = ''; editing = null; }
  $('closeEditor').onclick = closeEditor;
  for (const id of Object.values(F)) if (id !== 'fCaption') $(id).addEventListener('input', redraw);

  $('useNewsPhoto').onclick = async () => {
    if (!editing?.image_url) return say($('editMsg'), 'এই নিউজে কোনো ছবি পাওয়া যায়নি', 'err');
    photo = await Card.loadImg(`/api/img?u=${encodeURIComponent(editing.image_url)}`);
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

  $('approve').onclick = async () => {
    const f = fields();
    if (!f.headline || !f.body) return say($('editMsg'), 'হেডলাইন আর বিস্তারিত লাগবে', 'err');
    $('approve').disabled = true;
    say($('editMsg'), 'কার্ড তৈরি হচ্ছে…');
    try {
      await call(`/api/drafts/${editing.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) });
      await Card.drawCard($('canvas'), f, photo);
      const form = new FormData();
      form.append('card', await Card.cardJpeg($('canvas')), 'card.jpg');
      form.append('caption', f.caption);
      await call(`/api/drafts/${editing.id}/approve`, { method: 'POST', body: form });
      closeEditor();
      await refresh();
    } catch (err) { say($('editMsg'), err.message, 'err'); }
    $('approve').disabled = false;
  };
  $('rewrite').onclick = async () => {
    if (!confirm('AI দিয়ে আবার লেখাবেন? এখনকার লেখা বদলে যাবে।')) return;
    try { await post(`/api/drafts/${editing.id}/retry`); closeEditor(); tab = 'working'; await refresh(); }
    catch (err) { say($('editMsg'), err.message, 'err'); }
  };
  $('reject').onclick = async () => {
    if (!confirm('এটা বাদ দেবেন?')) return;
    try { await post(`/api/drafts/${editing.id}/reject`); closeEditor(); await refresh(); }
    catch (err) { say($('editMsg'), err.message, 'err'); }
  };

  /* ── শুরু ── */
  async function start() {
    $('app').hidden = false;
    await refresh();
  }
  setInterval(() => { if (!document.hidden && !$('app').hidden && $('editor').hidden) refresh().catch(() => {}); }, 30000);
  call('/api/state').then(s => { state = s; $('app').hidden = false; render(); if (s.drafts.some(d => d.status === 'new' || d.status === 'working')) runQueue(); })
    .catch(() => showLogin());
})();

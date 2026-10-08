/* ─── ফটো কার্ড আঁকা (1279×1600) — "আমার বাংলাদেশ" নকশা ───
   ৮ অক্টোবর ২০২৬ মালিকের রেফারেন্স কার্ড ধরে নতুন করে মেলানো:
   • ফন্ট Hind Siliguri — হেডলাইন মোটা, বিস্তারিত চিকন (হালকা)
   • হেডলাইন সর্বোচ্চ ২ লাইন, ঠিক মাঝখানে, দুই লাইনে ভাগ — প্রথম লাইন একটু বড়, দ্বিতীয়টা একটু ছোট
     (দ্বিতীয় লাইনে একটা শব্দ পড়ে থাকা দেখতে খারাপ); না ধরলে অক্ষর ছোট হয়
   • বিস্তারিত বড় হলে অক্ষর নিজে থেকে ছোট হয়
   • তিন বিন্দু গোলাপি; মাঝের ব্যাজ আঁকা হয় (ম্যাপ + "আমার" হালকা / "বাংলাদেশ" মোটা); নিচের পট্টির উপরে ছোট সাদা পিল
   ব্রাউজারে আঁকা হয় বলে বাংলা যুক্তাক্ষর ঠিক আসে। আঁকার আগে ফন্ট লোড হওয়া পর্যন্ত অপেক্ষা করে। */
(function () {
  const W = 1279, H = 1600, PHOTO_H = 950, BAR_Y = 1508;
  const FONT = '"Hind Siliguri", sans-serif';
  const RED = '#A8003D', BAR = '#CA004A', BADGE = '#8A0032', PINK = '#FF6F9C';

  const loadImg = src => new Promise(resolve => {
    if (!src) return resolve(null);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
  /* logos.js-এর const — window-এ থাকে না, নাম ধরেই নিতে হয় */
  /* global MAP_LOGO_B64 */
  const mapLogo = loadImg(typeof MAP_LOGO_B64 !== 'undefined' ? MAP_LOGO_B64 : null);
  const fonts = Promise.all([300, 400, 600, 700].map(w => document.fonts.load(`${w} 40px ${FONT}`, 'বাংলা abc'))).catch(() => {});

  const font = (weight, size) => `${weight} ${size}px ${FONT}`;

  /* শব্দ ধরে লাইন ভাঙা (বিস্তারিতের জন্য) */
  function lines(ctx, text, maxW) {
    const out = [];
    for (const para of String(text || '').split('\n')) {
      let line = '';
      for (const w of para.split(' ').filter(Boolean)) {
        const t = line ? line + ' ' + w : w;
        if (ctx.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t;
      }
      if (line) out.push(line);
    }
    return out;
  }

  /* হেডলাইন — এক লাইনে ধরলে এক লাইন; না হলে দুই লাইনে এমনভাবে ভাগ যে প্রথম লাইন দ্বিতীয়টার সমান বা একটু বড়,
     আর দুটোর ফারাক সবচেয়ে কম। কোনো ভাগে না ধরলে null (তখন অক্ষর ছোট করে আবার) */
  function balance(ctx, text, maxW) {
    const t = String(text || '').replace(/\s+/g, ' ').trim();
    if (ctx.measureText(t).width <= maxW) return [t];
    const words = t.split(' ');
    let best = null;
    for (let i = 1; i < words.length; i++) {
      const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ');
      const wa = ctx.measureText(a).width, wb = ctx.measureText(b).width;
      if (wa > maxW || wb > maxW) continue;
      const score = Math.abs(wa - wb) + (wa < wb ? (wb - wa) * 2 : 0);   // প্রথম লাইন ছোট হলে জরিমানা
      if (!best || score < best.score) best = { score, lines: [a, b] };
    }
    return best?.lines || null;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  async function drawCard(canvas, d, photo) {
    await fonts;
    const map = await mapLogo;
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.textBaseline = 'alphabetic';

    /* ছবি — পুরো জায়গা ঢেকে (cover) */
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(0, 0, W, PHOTO_H);
    if (photo) {
      const s = Math.max(W / photo.width, PHOTO_H / photo.height);
      const sw = photo.width * s, sh = photo.height * s;
      ctx.drawImage(photo, (W - sw) / 2, (PHOTO_H - sh) / 2, sw, sh);
    } else {
      const g = ctx.createLinearGradient(0, 0, 0, PHOTO_H);
      g.addColorStop(0, '#3a3a3a'); g.addColorStop(1, '#1a1a1a');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, PHOTO_H);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.font = font(400, 36); ctx.textAlign = 'center';
      ctx.fillText('ছবি নেই', W / 2, PHOTO_H / 2);
    }

    /* উপরে বাঁয়ে ম্যাপ, ডানে ওয়াটারমার্ক — উজ্জ্বল ছবিতেও পড়া যায় এমন হালকা ছায়া */
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 10;
    if (map) ctx.drawImage(map, -4, 6, 180, 180);   // লোগোর ছবিতে চারপাশে ফাঁকা আছে — দেখা যায় ~১১০px
    ctx.textAlign = 'right'; ctx.fillStyle = '#fff';
    ctx.font = font(600, 34);
    ctx.fillText('amarbangladesh.site', W - 46, 92);
    ctx.font = font(400, 31);
    ctx.fillText("powered by, al ru'ya", W - 46, 130);
    ctx.restore();

    /* লাল অংশ */
    ctx.fillStyle = RED;
    ctx.fillRect(0, PHOTO_H, W, BAR_Y - PHOTO_H);

    /* মাঝের ব্যাজ — ম্যাপ + "আমার" (হালকা) / "বাংলাদেশ" (মোটা) */
    const bw = 372, bh = 126, bx = (W - bw) / 2, by = PHOTO_H - bh / 2;
    ctx.fillStyle = BADGE;
    roundRect(ctx, bx, by, bw, bh, 18);
    ctx.fill();
    if (map) ctx.drawImage(map, bx + 4, by + 2, 124, 124);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left';
    ctx.font = font(400, 40);
    ctx.fillText('আমার', bx + 146, by + 56);
    ctx.font = font(700, 46);
    ctx.fillText('বাংলাদেশ', bx + 146, by + 106);

    /* হেডলাইন — সর্বোচ্চ ২ লাইন, ভারসাম্য রেখে, মাঝখানে */
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    const hMax = W - 130;
    let hl = null, hSize = 70;
    for (const fs of [70, 66, 62, 58, 54, 50, 46]) {
      ctx.font = font(700, fs);
      hl = balance(ctx, d.headline, hMax);
      hSize = fs;
      if (hl) break;
    }
    if (!hl) { ctx.font = font(700, hSize); hl = lines(ctx, d.headline, hMax).slice(0, 2); }   // খুব লম্বা — শেষ চেষ্টা
    const hLine = Math.round(hSize * 1.18);
    ctx.font = font(700, hSize);
    let y = PHOTO_H + bh / 2 + 20 + hSize;
    for (const l of hl) { ctx.fillText(l, W / 2, y); y += hLine; }

    /* গোলাপি তিন বিন্দু */
    const dotsY = y - hLine + 52;
    ctx.fillStyle = PINK;
    for (const dx of [-22, 0, 22]) { ctx.beginPath(); ctx.arc(W / 2 + dx, dotsY - 8, 4.5, 0, Math.PI * 2); ctx.fill(); }

    /* বিস্তারিত — চিকন অক্ষর; লেখা বেশি হলে নিজে থেকে ছোট */
    const top = dotsY + 30, bottom = BAR_Y - 34, maxW = W - 130;
    let bl = [], bSize = 26, bLine = 37;
    for (const fs of [40, 38, 36, 34, 32, 30, 28, 26]) {
      const lh = Math.round(fs * 1.42);
      ctx.font = font(300, fs);
      bl = lines(ctx, d.body, maxW); bSize = fs; bLine = lh;
      if (bl.length * lh <= bottom - top) break;
    }
    ctx.font = font(300, bSize); ctx.fillStyle = '#fff';
    /* বিস্তারিত ছোট হলে নিচে ফাঁকা পড়ে না থেকে একটু মাঝের দিকে নামে */
    const spare = (bottom - top) - bl.length * bLine;
    y = top + bSize + (spare > 0 ? Math.min(spare / 2, 50) : 0);
    for (const l of bl) { if (y > bottom + 4) break; ctx.fillText(l, W / 2, y); y += bLine; }

    /* নিচের পট্টি আর তার উপরে ছোট সাদা পিল */
    ctx.fillStyle = BAR;
    ctx.fillRect(0, BAR_Y, W, H - BAR_Y);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    roundRect(ctx, (W - 128) / 2, BAR_Y - 14, 128, 14, 7);
    ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    ctx.font = font(600, 33);
    ctx.fillText(`${d.category || 'জাতীয়'} • ${d.date_label || ''} • সূত্র: ${d.source || ''}`, W / 2, BAR_Y + 58);
  }

  /* JPG বানানো — ফেসবুকে যা যাবে (২ MB-এর মধ্যে) */
  async function cardJpeg(canvas) {
    for (const q of [0.92, 0.85, 0.75]) {
      const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', q));
      if (blob && blob.size < 1_800_000) return blob;
    }
    throw new Error('কার্ডের ছবি বানানো যায়নি');
  }

  window.Card = { drawCard, cardJpeg, loadImg };
})();

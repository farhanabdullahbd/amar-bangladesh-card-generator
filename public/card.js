/* ─── ফটো কার্ড আঁকা (1279×1600) — আগের "আমার বাংলাদেশ" নকশা হুবহু ───
   উপরে ছবি (0–888), মাঝে লোগো ব্যাজ, লাল অংশে হেডলাইন আর বিস্তারিত, নিচে ক্যাটাগরি • তারিখ • সূত্র।
   ব্রাউজারে আঁকা হয় বলে বাংলা যুক্তাক্ষর ঠিক আসে। আঁকার আগে ফন্ট লোড হওয়া পর্যন্ত অপেক্ষা করে। */
(function () {
  const W = 1279, H = 1600, PHOTO_H = 888, RED_TOP = 890;
  const FONT = '"Tiro Bangla", serif';

  const loadImg = src => new Promise(resolve => {
    if (!src) return resolve(null);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
  /* logos.js-এর const — window-এ থাকে না, নাম ধরেই নিতে হয় */
  /* global MAP_LOGO_B64, BADGE_LOGO_B64 */
  const logos = Promise.all([
    loadImg(typeof MAP_LOGO_B64 !== 'undefined' ? MAP_LOGO_B64 : null),
    loadImg(typeof BADGE_LOGO_B64 !== 'undefined' ? BADGE_LOGO_B64 : null),
  ]);
  const fonts = Promise.all([
    document.fonts.load(`bold 64px ${FONT}`, 'বাংলা'),
    document.fonts.load(`38px ${FONT}`, 'বাংলা'),
  ]).catch(() => {});

  /* শব্দ ধরে লাইন ভাঙা */
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

  async function drawCard(canvas, d, photo) {
    await fonts;
    const [mapLogo, badgeLogo] = await logos;
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');

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
      ctx.font = `36px ${FONT}`; ctx.textAlign = 'center';
      ctx.fillText('ছবি নেই', W / 2, PHOTO_H / 2);
    }

    /* উপরে ডানে ওয়াটারমার্ক, বাঁয়ে ম্যাপ লোগো */
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.font = `36px ${FONT}`;
    ctx.fillText('amarbangladesh.site', W - 40, 95);
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.font = `28px ${FONT}`;
    ctx.fillText("powered by, al ru'ya", W - 40, 135);
    if (mapLogo) ctx.drawImage(mapLogo, 28, 18, 180, 180);

    /* লাল অংশ আর মাঝের ব্যাজ */
    ctx.fillStyle = '#A8003D';
    ctx.fillRect(0, RED_TOP, W, 619);
    const bw = 480, bh = 155;
    if (badgeLogo) ctx.drawImage(badgeLogo, (W - bw) / 2, RED_TOP - bh / 2, bw, bh);

    /* হেডলাইন — ৩ লাইনের বেশি হলে অক্ষর একটু ছোট */
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    let hl = [], hSize = 64, hLine = 82;
    for (const [fs, lh] of [[64, 82], [58, 74], [52, 68]]) {
      ctx.font = `bold ${fs}px ${FONT}`;
      hl = lines(ctx, d.headline, W - 120); hSize = fs; hLine = lh;
      if (hl.length <= 3) break;
    }
    ctx.font = `bold ${hSize}px ${FONT}`;
    let y = 1060;
    for (const l of hl) { ctx.fillText(l, W / 2, y); y += hLine; }

    /* তিন বিন্দু */
    const dotsY = y - 20;
    ctx.font = '32px serif'; ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText('• • •', W / 2, dotsY);

    /* বিস্তারিত — যতটা জায়গা আছে তাতে ধরে এমন সবচেয়ে বড় অক্ষর */
    const top = dotsY + 50, avail = 1490 - top, maxW = W - 140;
    let bl = [], bSize = 30, bLine = 44;
    for (const [fs, lh] of [[44, 64], [42, 62], [40, 58], [38, 56], [36, 52], [34, 50], [32, 46], [30, 44]]) {
      ctx.font = `${fs}px ${FONT}`;
      bl = lines(ctx, d.body, maxW); bSize = fs; bLine = lh;
      if (bl.length * lh <= avail) break;
    }
    ctx.font = `${bSize}px ${FONT}`; ctx.fillStyle = '#fff';
    y = top;
    for (const l of bl) { ctx.fillText(l, W / 2, y); y += bLine; }

    /* নিচের পট্টি */
    ctx.fillStyle = '#CA004A';
    ctx.fillRect(0, 1509, W, 91);
    ctx.fillStyle = '#fff'; ctx.font = `bold 28px ${FONT}`;
    ctx.fillText(`${d.category || 'জাতীয়'} • ${d.date_label || ''} • সূত্র: ${d.source || ''}`, W / 2, 1563);
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

// App logic
let currentPhotoDataUrl = null;
let lastNewsUrl = '';

// Preload logos
const mapLogoImg = new Image();
mapLogoImg.src = MAP_LOGO_B64;
const badgeLogoImg = new Image();
badgeLogoImg.src = BADGE_LOGO_B64;

function setStatus(msg, type='') {
  const el = document.getElementById('statusMsg');
  el.textContent = msg;
  el.className = 'status-msg ' + type;
}

async function generateContent() {
  const url = document.getElementById('newsUrl').value.trim();
  if (!url) { setStatus('লিংক দিন', 'error'); return; }

  lastNewsUrl = url;
  const btn = document.getElementById('btnGenerate');
  btn.disabled = true;
  setStatus('নিউজ পড়ছি...', 'loading');

  try {
    const today = new Date();
    const banglaMonths = ['জানুয়ারি','ফেব্রুয়ারি','মার্চ','এপ্রিল','মে','জুন','জুলাই','আগস্ট','সেপ্টেম্বর','অক্টোবর','নভেম্বর','ডিসেম্বর'];
    const dateStr = today.getDate() + ' ' + banglaMonths[today.getMonth()] + ' ' + String(today.getFullYear()).slice(-2);

    setStatus('ওয়েবসাইট থেকে নিউজ পড়ছি...', 'loading');
    
    // Fetch actual website content using Jina Reader API to avoid AI hallucination
    let articleText = '';
    try {
      const jinaResponse = await fetch("https://r.jina.ai/" + url);
      if (jinaResponse.ok) {
        articleText = await jinaResponse.text();
        // Limit characters to avoid token limit issues
        if (articleText.length > 6000) articleText = articleText.substring(0, 6000);
      }
    } catch (e) {
      console.log("Jina fetch error:", e);
    }

    setStatus('খবরটি বিশ্লেষণ করে সাজাচ্ছি...', 'loading');

    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": "Bearer sk-116ffd72375346258943cc70d808905d"
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `তুমি একজন বাংলা সংবাদ সম্পাদক। তোমাকে একটি নিউজের মূল লেখা (text) বা লিংক দেওয়া হবে।
            
সবচেয়ে গুরুত্বপূর্ণ নিয়ম: **তুমি অবশ্যই শুধু একটা JSON object দেবে, অন্য কোনো লেখা/ব্যাখ্যা/excuse নয়।** নিউজের লেখাটি পড়ে সেখান থেকে সঠিক তথ্য নিয়ে সংক্ষিপ্ত করে বানাবে, কোনো কিছু নিজে থেকে অনুমান করবে না।

JSON এর নিয়ম:
- headline: ৪৫-৬৫ অক্ষর, ছোট ও শক্তিশালী বাংলায়
- body: ১৫০-২০০ অক্ষর, ২-৩ বাক্যে নিউজের মূল তথ্য সংক্ষিপ্ত করে
- date: ${dateStr}
- category: রাজনীতি/জাতীয়/অর্থনীতি/খেলাধুলা/বিনোদন/প্রযুক্তি/আন্তর্জাতিক/শিক্ষা
- source: নিউজ সাইটের নাম

শুধু এই JSON দাও:
{"headline":"...","body":"...","date":"${dateStr}","category":"...","source":"..."}`
          },
          { role: "user", content: `এখানে নিউজের টেক্সট/লিংক দেওয়া হলো:\n\n${articleText || url}\n\nএই নিউজটি ভালোভাবে পড়ে নিয়ম অনুযায়ী JSON দাও।` }
        ]
      })
    });

    const data = await response.json();

    if (data.error) {
      throw new Error(`API Error: ${data.error.message}`);
    }

    // Extract text from response
    let text = '';
    if (data.choices && data.choices.length > 0) {
      text = data.choices[0].message.content;
    }

    // Parse JSON — try multiple strategies
    let parsed = null;
    let parseError = '';

    try {
      // Strategy 1: Find first complete JSON object
      const clean = text.replace(/```json|```/g, '').trim();

      // Try to find JSON with proper bracket matching
      let depth = 0, start = -1, end = -1;
      for (let i = 0; i < clean.length; i++) {
        if (clean[i] === '{') {
          if (depth === 0) start = i;
          depth++;
        } else if (clean[i] === '}') {
          depth--;
          if (depth === 0 && start !== -1) {
            end = i;
            break;
          }
        }
      }

      if (start !== -1 && end !== -1) {
        const jsonStr = clean.substring(start, end + 1);
        parsed = JSON.parse(jsonStr);
      } else {
        // Strategy 2: simple regex match
        const m = clean.match(/\{[\s\S]*\}/);
        if (m) parsed = JSON.parse(m[0]);
      }
    } catch(e) {
      parseError = e.message;
    }

    if (!parsed) {
      // Show debug info to user
      console.error('AI response:', text);
      const preview = text.substring(0, 500);
      throw new Error('AI response পার্স করা যায়নি।\n\nAI যা দিয়েছে:\n' + preview);
    }

    document.getElementById('editHeadline').value = parsed.headline || '';
    document.getElementById('editBody').value = parsed.body || '';
    document.getElementById('editDate').value = parsed.date || dateStr;
    document.getElementById('category').value = parsed.category || 'জাতীয়';
    document.getElementById('source').value = parsed.source || 'আমার বাংলাদেশ';

    document.getElementById('editPanel').classList.add('visible');
    setStatus('✅ নিউজ পড়া হয়েছে। ছবি আপলোড করে কার্ড রেন্ডার করুন।', 'success');

  } catch(e) {
    setStatus('সমস্যা হয়েছে: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

async function regenerateContent() {
  if (!lastNewsUrl) return;
  document.getElementById('editHeadline').value = '';
  document.getElementById('editBody').value = '';
  setStatus('নতুন করে লিখছি...', 'loading');
  await generateContent();
}

function handlePhotoUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    currentPhotoDataUrl = ev.target.result;
    const preview = document.getElementById('photoPreview');
    preview.src = currentPhotoDataUrl;
    preview.style.display = 'block';
    document.querySelector('.photo-upload-area p').textContent = 'ছবি লোড হয়েছে ✓';
  };
  reader.readAsDataURL(file);
}

async function loadImageFromUrl() {
  const url = document.getElementById('imageUrlInput').value.trim();
  const statusEl = document.getElementById('imgUrlStatus');
  if (!url) { statusEl.textContent = 'লিংক দিন'; statusEl.style.color = '#ff6060'; return; }
  if (!url.startsWith('http')) { statusEl.textContent = 'সঠিক লিংক দিন (http দিয়ে শুরু)'; statusEl.style.color = '#ff6060'; return; }

  statusEl.textContent = 'ছবি লোড হচ্ছে...';
  statusEl.style.color = '#f0a040';

  // Try Cloudflare Worker first via fetch (proper CORS)
  const workerUrl = 'https://amar-bangladesh-proxy.tuhinhasanfarhan.workers.dev/?url=' + encodeURIComponent(url);
  try {
    const resp = await fetch(workerUrl);
    if (resp.ok) {
      const blob = await resp.blob();
      if (blob.type.startsWith('image/')) {
        const dataUrl = await blobToDataUrl(blob);
        currentPhotoDataUrl = dataUrl;
        const preview = document.getElementById('photoPreview');
        preview.src = currentPhotoDataUrl;
        preview.style.display = 'block';
        document.querySelector('.photo-upload-area p').textContent = 'লিংক থেকে ছবি লোড হয়েছে ✓';
        statusEl.textContent = '✓ ছবি লোড হয়েছে';
        statusEl.style.color = '#60d080';
        return;
      }
    }
  } catch(e) {
    console.warn('Worker failed:', e.message);
  }

  // Fallback: try other proxies via img tag
  const cleanUrl = url.replace(/^https?:\/\//, '');
  const fallbacks = [
    'https://images.weserv.nl/?url=' + encodeURIComponent(cleanUrl) + '&output=jpg',
    'https://wsrv.nl/?url=' + encodeURIComponent(cleanUrl) + '&output=jpg',
    url
  ];

  for (const candidateUrl of fallbacks) {
    try {
      const dataUrl = await loadImageAsDataUrl(candidateUrl);
      if (dataUrl) {
        currentPhotoDataUrl = dataUrl;
        const preview = document.getElementById('photoPreview');
        preview.src = currentPhotoDataUrl;
        preview.style.display = 'block';
        document.querySelector('.photo-upload-area p').textContent = 'লিংক থেকে ছবি লোড হয়েছে ✓';
        statusEl.textContent = '✓ ছবি লোড হয়েছে';
        statusEl.style.color = '#60d080';
        return;
      }
    } catch(e) {
      console.warn('Failed:', candidateUrl, e.message);
    }
  }

  statusEl.textContent = '❌ এই লিংক থেকে ছবি লোড করা যায়নি, ম্যানুয়ালি আপলোড করুন';
  statusEl.style.color = '#ff6060';
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => resolve(ev.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Load image via <img> tag and convert to data URL via canvas
function loadImageAsDataUrl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timeout = setTimeout(() => reject(new Error('timeout')), 15000);
    img.onload = () => {
      clearTimeout(timeout);
      try {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const cx = c.getContext('2d');
        cx.drawImage(img, 0, 0);
        const dataUrl = c.toDataURL('image/jpeg', 0.92);
        resolve(dataUrl);
      } catch(e) {
        reject(e);
      }
    };
    img.onerror = () => {
      clearTimeout(timeout);
      reject(new Error('img load failed'));
    };
    img.src = url;
  });
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  // Split by existing newlines first
  const paragraphs = text.split('\n');
  let currentY = y;
  for (const para of paragraphs) {
    const words = para.split('');
    // For Bangla, wrap by character width
    let line = '';
    for (let i = 0; i < para.length; i++) {
      const testLine = line + para[i];
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && line.length > 0) {
        ctx.fillText(line, x, currentY);
        line = para[i];
        currentY += lineHeight;
      } else {
        line = testLine;
      }
    }
    if (line) {
      ctx.fillText(line, x, currentY);
      currentY += lineHeight;
    }
  }
  return currentY;
}

function wrapTextByWord(ctx, text, x, y, maxWidth, lineHeight, align='center') {
  // Split text into words (Bangla words separated by space)
  const words = text.split(' ');
  let line = '';
  let lines = [];

  for (const word of words) {
    const testLine = line ? line + ' ' + word : word;
    if (ctx.measureText(testLine).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = testLine;
    }
  }
  if (line) lines.push(line);

  let currentY = y;
  for (const l of lines) {
    if (align === 'center') {
      ctx.fillText(l, x, currentY);
    } else {
      ctx.fillText(l, x, currentY);
    }
    currentY += lineHeight;
  }
  return currentY;
}

async function renderCard() {
  const headline = document.getElementById('editHeadline').value.trim();
  const body = document.getElementById('editBody').value.trim();
  const date = document.getElementById('editDate').value.trim();
  const category = document.getElementById('category').value.trim() || 'জাতীয়';
  const source = document.getElementById('source').value.trim() || 'আমার বাংলাদেশ';

  if (!headline) { alert('হেডলাইন দিন'); return; }

  const canvas = document.getElementById('photoCard');
  const ctx = canvas.getContext('2d');
  const W = 1279, H = 1600;
  canvas.width = W;
  canvas.height = H;

  // === SECTION 1: PHOTO AREA (0 → 888px) ===
  ctx.fillStyle = '#2a2a2a';
  ctx.fillRect(0, 0, W, 888);

  if (currentPhotoDataUrl) {
    await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        // Cover-fit the image
        const iw = img.width, ih = img.height;
        const scale = Math.max(W / iw, 888 / ih);
        const sw = iw * scale, sh = ih * scale;
        const sx = (W - sw) / 2, sy = (888 - sh) / 2;
        ctx.drawImage(img, sx, sy, sw, sh);
        resolve();
      };
      img.src = currentPhotoDataUrl;
    });
  } else {
    // Placeholder gradient
    const grad = ctx.createLinearGradient(0, 0, 0, 888);
    grad.addColorStop(0, '#3a3a3a');
    grad.addColorStop(1, '#1a1a1a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, 888);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.font = '36px Tiro Bangla, serif';
    ctx.textAlign = 'center';
    ctx.fillText('ছবি আপলোড করুন', W/2, 444);
  }

  // === SECTION 2: TOP WATERMARK (top-right) — vertically aligned with map logo ===
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.font = '36px Tiro Bangla, serif';
  ctx.textAlign = 'right';
  ctx.fillText('amarbangladesh.site', W - 40, 95);
  ctx.font = '28px Tiro Bangla, serif';
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fillText("powered by, al ru'ya", W - 40, 135);

  // === SECTION 3: TOP-LEFT MAP LOGO ===
  if (mapLogoImg.complete) {
    ctx.drawImage(mapLogoImg, 28, 18, 180, 180);
  }

  // === SECTION 5: RED CONTENT AREA (890 → 1509) ===
  ctx.fillStyle = '#A8003D';
  ctx.fillRect(0, 890, W, 619);

  // === SECTION 4: CENTER LOGO BADGE — centered on 890 boundary ===
  // Cropped badge has 3.1:1 ratio. Use larger size for proper visibility.
  const badgeW = 480, badgeH = 155;
  const badgeX = (W - badgeW) / 2;
  const badgeY = 890 - badgeH / 2;
  ctx.drawImage(badgeLogoImg, badgeX, badgeY, badgeW, badgeH);

  // === SECTION 5A: HEADLINE — starts below badge ===
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 64px Tiro Bangla, serif';
  ctx.textAlign = 'center';
  const headlineEndY = wrapTextByWord(ctx, headline, W/2, 1060, W - 120, 82, 'center');

  // === SECTION 5B: DOTS SEPARATOR ===
  const dotsY = headlineEndY - 20;
  ctx.font = '32px serif';
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fillText('• • •', W/2, dotsY);

  // === SECTION 5C: BODY TEXT — auto-fit within available space ===
  // Available vertical space: from (dotsY + 50) to ~1490 (just above bottom bar)
  const bodyStartY = dotsY + 50;
  const bodyMaxY = 1490;
  const bodyAvailH = bodyMaxY - bodyStartY;
  const bodyMaxW = W - 140;

  // Try font sizes from 44 down to 30 — pick largest that fits
  let bodyFont = 38, bodyLineH = 56;
  const fontSteps = [
    [44, 64], [42, 62], [40, 58], [38, 56], [36, 52], [34, 50], [32, 46], [30, 44]
  ];
  for (const [fs, lh] of fontSteps) {
    ctx.font = fs + 'px Tiro Bangla, serif';
    // Count how many lines this would take
    const words = body.split(' ');
    let line = '', lines = 0;
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > bodyMaxW && line) {
        lines++;
        line = w;
      } else {
        line = test;
      }
    }
    if (line) lines++;
    if (lines * lh <= bodyAvailH) {
      bodyFont = fs;
      bodyLineH = lh;
      break;
    }
  }

  ctx.font = bodyFont + 'px Tiro Bangla, serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  wrapTextByWord(ctx, body, W/2, bodyStartY, bodyMaxW, bodyLineH, 'center');

  // === SECTION 6: BOTTOM BAR (1509 → 1600) ===
  ctx.fillStyle = '#CA004A';
  ctx.fillRect(0, 1509, W, 91);

  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 28px Tiro Bangla, serif';
  ctx.textAlign = 'center';
  ctx.fillText(category + ' • ' + date + ' • সূত্র: ' + source, W / 2, 1563);

  // Show card
  document.getElementById('cardWrap').classList.add('visible');
  document.getElementById('cardWrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function downloadCard() {
  const canvas = document.getElementById('photoCard');
  canvas.toBlob(function(blob) {
    if (!blob) {
      alert('ছবি তৈরি হয়নি, আবার চেষ্টা করুন');
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = 'amar-bangladesh-' + Date.now() + '.jpg';
    link.href = url;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }, 'image/jpeg', 0.95);
}

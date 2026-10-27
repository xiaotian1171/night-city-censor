// stego.js — deterministic code-scheme cards + shared utilities (no deps)
// Schemes encode a letter as a measurable visual property:
//   skyline: building height  (a=1 → 42px, step 12px)
//   fence:   5 pickets per letter, long=1 short=0, MSB first (value = alphabet index)

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function normalizeAnswer(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function answersMatch(given, truth) {
  const g = normalizeAnswer(given), t = normalizeAnswer(truth);
  if (!t) return false;
  if (g === t) return true;
  return g.length >= 4 && t.length >= 4 && (g.includes(t) || t.includes(g));
}

export const PHRASES = [
  'meet at noon', 'bring the key', 'the cat is a spy', 'blue door only',
  'trust no shadow', 'midnight ferry', 'rain hides tracks', 'lamps tell lies',
  'look behind stars', 'paper swans know', 'seven lamps burn', 'code the dawn',
  'wake the moon', 'foxes know the way', 'sold by the sea', 'rain on channel nine',
];

export function pickPhrases(n, rng) {
  const pool = PHRASES.slice(), out = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor((rng ? rng() : Math.random()) * pool.length), 1)[0]);
  return out;
}

export function letterIndex(ch) {
  const c = String(ch).toLowerCase();
  if (c >= 'a' && c <= 'z') return c.charCodeAt(0) - 96;
  return 0;
}

// ---------- SVG → PNG data URL (browser) ----------
export function svgToPngDataUrl(svg, width = 800, height = 600) {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      try {
        const cv = document.createElement('canvas');
        cv.width = width; cv.height = height;
        const ctx = cv.getContext('2d');
        ctx.fillStyle = '#0b1026'; ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);
        resolve(cv.toDataURL('image/png'));
      } catch (e) { URL.revokeObjectURL(url); reject(e); }
    };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(new Error('svg render failed')); };
    img.src = url;
  });
}

// ---------- Scheme 1: night skyline, height = letter index ----------
const SKY_PALETTE = ['#26325c', '#2c3a6b', '#34437c', '#2a3562', '#3b4a86', '#222d55'];
const SKY_WIN = '#ffd98a';

export function skylineGroups(msg) {
  const words = String(msg).toLowerCase().split(/\s+/).filter(Boolean);
  return words.map(w => [...w].filter(c => c >= 'a' && c <= 'z').map(ch => ({ ch, idx: letterIndex(ch), h: 42 + (letterIndex(ch) - 1) * 12 })));
}

export function skylineSVG(msg, seed = 7) {
  const rnd = mulberry32(seed);
  let groups = skylineGroups(msg);
  if (!groups.length) {
    // clean variant: buildings with random heights that encode nothing
    groups = [[], []];
    const n = 9 + Math.floor(rnd() * 4);
    const fake = [];
    for (let i = 0; i < n; i++) fake.push({ ch: '?', idx: 0, h: 40 + Math.floor(rnd() * 230) });
    groups = [fake.slice(0, Math.ceil(n / 2)), fake.slice(Math.ceil(n / 2))];
  }
  const VB_W = 800, VB_H = 500, GROUND = 438;
  let x = 46, bldgs = '', lampposts = '';
  const placed = [];
  groups.forEach((word, wi) => {
    word.forEach((L, li) => {
      const w = 26 + Math.floor(rnd() * 15);
      const color = SKY_PALETTE[Math.floor(rnd() * SKY_PALETTE.length)];
      const top = GROUND - L.h;
      let body = `<rect x="${x}" y="${top}" width="${w}" height="${L.h}" fill="${color}" rx="2"/>`;
      // decorative skyline details (decoys, fixed style)
      if (rnd() < 0.28) body += `<rect x="${x + w / 2 - 1.5}" y="${top - 12}" width="3" height="12" fill="${color}"/>`;
      if (rnd() < 0.18) body += `<rect x="${x + w / 2 - 7}" y="${top - 7}" width="14" height="7" fill="${color}"/>`;
      // windows — uniform pattern, no letter information
      for (let wy = top + 10; wy < GROUND - 12; wy += 14) {
        for (let wx = x + 6; wx < x + w - 7; wx += 11) {
          if (rnd() < 0.62) body += `<rect x="${wx}" y="${wy}" width="5" height="7" fill="${SKY_WIN}" opacity="${0.5 + rnd() * 0.5}"/>`;
        }
      }
      bldgs += body;
      placed.push({ x, w, ...L });
      x += w + 10;
      if (li === word.length - 1 && wi < groups.length - 1) {
        lampposts += `<rect x="${x + 8}" y="${GROUND - 58}" width="3" height="58" fill="#101733"/><circle cx="${x + 9.5}" cy="${GROUND - 62}" r="5" fill="#ffd98a" opacity="0.9"/>`;
        x += 38;
      }
    });
  });
  // stars + moon (canonical decoys)
  let decoys = '';
  for (let i = 0; i < 26; i++) {
    const sx = 20 + rnd() * 760, sy = 16 + rnd() * 240, r = [1, 1.4, 1.8, 2.2][Math.floor(rnd() * 4)];
    decoys += `<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="${r}" fill="#e8ecff" opacity="${(0.35 + rnd() * 0.6).toFixed(2)}"/>`;
  }
  decoys += `<circle cx="672" cy="86" r="34" fill="#f6f0d8"/><circle cx="656" cy="76" r="30" fill="#141d42"/>`;
  const total = Math.max(x + 46, VB_W);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VB_W} ${VB_H}" width="${VB_W}" height="${VB_H}">
<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0c1231"/><stop offset="0.62" stop-color="#1b2657"/><stop offset="1" stop-color="#39295e"/></linearGradient></defs>
<rect width="${VB_W}" height="${VB_H}" fill="url(#sky)"/>
${decoys}
${bldgs}
${lampposts}
<rect x="0" y="${GROUND}" width="${VB_W}" height="${VB_H - GROUND}" fill="#0a0f26"/>
<rect x="0" y="${GROUND}" width="${VB_W}" height="4" fill="#141b38"/>
<rect x="0" y="${GROUND + 22}" width="${VB_W}" height="2" fill="#232c52" stroke="none" stroke-dasharray="18 14"/>
</svg>`;
}

// ---------- Scheme 2: garden fence, 5 pickets per letter, long=1 short=0 ----------
export function fenceGroups(msg) {
  const words = String(msg).toLowerCase().split(/\s+/).filter(Boolean);
  return words.map(w => [...w].filter(c => c >= 'a' && c <= 'z').map(ch => {
    const idx = letterIndex(ch);
    return { ch, idx, bits: idx.toString(2).padStart(5, '0') };
  }));
}

export function fenceSVG(msg, seed = 11) {
  const rnd = mulberry32(seed);
  let groups = fenceGroups(msg);
  if (!groups.length) {
    const n = 8 + Math.floor(rnd() * 5);
    const fake = [];
    for (let i = 0; i < n; i++) fake.push({ ch: '?', idx: 0, bits: (Math.floor(rnd() * 31)).toString(2).padStart(5, '0') });
    groups = [fake.slice(0, Math.ceil(n / 2)), fake.slice(Math.ceil(n / 2))];
  }
  const GROUND = 430, BASE = 402;
  let x = 34, pickets = '', gaps = [];
  groups.forEach((word, wi) => {
    word.forEach((L, li) => {
      [...L.bits].forEach((b) => {
        const tall = b === '1';
        const h = tall ? 76 : 54, w = 9;
        const top = BASE - h;
        pickets += `<rect x="${x}" y="${top}" width="${w}" height="${h}" fill="#b9855c" stroke="#8a5f3e" stroke-width="1"/><polygon points="${x},${top} ${x + w / 2},${top - 8} ${x + w},${top}" fill="#b9855c" stroke="#8a5f3e" stroke-width="1"/>`;
        x += w + 4;
      });
      x += 12;
      if (li === word.length - 1 && wi < groups.length - 1) {
        gaps.push(x);
        x += 30;
      }
    });
  });
  const fenceRight = x - 12;
  // rails behind pickets
  const rails = `<rect x="20" y="${BASE - 60}" width="${Math.max(fenceRight - 20, 60)}" height="8" fill="#a9764f"/><rect x="20" y="${BASE - 26}" width="${Math.max(fenceRight - 20, 60)}" height="8" fill="#a9764f"/>`;
  // word dividers: flower pots (visual grouping aid)
  let div = '';
  gaps.forEach(gx => {
    div += `<rect x="${gx + 6}" y="${BASE - 16}" width="16" height="14" fill="#c96f4a"/><circle cx="${gx + 10}" cy="${BASE - 24}" r="5" fill="#e8628c"/><circle cx="${gx + 18}" cy="${BASE - 27}" r="5" fill="#f2a154"/><circle cx="${gx + 14}" cy="${BASE - 33}" r="5" fill="#e8628c"/>`;
  });
  // background scenery
  const flowers = [];
  for (let i = 0; i < 14; i++) {
    const fx = 24 + rnd() * 750, fy = GROUND - 6 - rnd() * 10;
    flowers.push(`<circle cx="${fx.toFixed(1)}" cy="${fy.toFixed(1)}" r="3" fill="${['#e8628c', '#f2a154', '#8fd1e0', '#e8628c'][Math.floor(rnd() * 4)]}"/><rect x="${(fx - 0.8).toFixed(1)}" y="${fy.toFixed(1)}" width="1.6" height="8" fill="#5c8a4e"/>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500" width="800" height="500">
<defs><linearGradient id="day" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fd4e8"/><stop offset="1" stop-color="#dff0d0"/></linearGradient></defs>
<rect width="800" height="500" fill="url(#day)"/>
<circle cx="640" cy="92" r="36" fill="#ffe9a8"/>
<ellipse cx="180" cy="120" rx="66" ry="24" fill="#ffffff" opacity="0.85"/>
<ellipse cx="250" cy="108" rx="46" ry="18" fill="#ffffff" opacity="0.75"/>
<path d="M0 ${GROUND - 60} Q 200 ${GROUND - 120} 420 ${GROUND - 66} T 800 ${GROUND - 84} V ${GROUND} H 0 Z" fill="#79b06b"/>
<rect x="520" y="${GROUND - 176}" width="180" height="120" fill="#f2e3c4" stroke="#b9855c" stroke-width="3"/>
<polygon points="508,${GROUND - 176} 610,${GROUND - 238} 712,${GROUND - 176}" fill="#c96f4a"/>
<rect x="560" y="${GROUND - 120}" width="34" height="64" fill="#8a5f3e"/>
<rect x="632" y="${GROUND - 140}" width="36" height="30" fill="#bfe3ef" stroke="#8a5f3e" stroke-width="3"/>
${flowers.join('')}
${rails}
${pickets}
${div}
<rect x="0" y="${GROUND}" width="800" height="${500 - GROUND}" fill="#6aa05c"/>
</svg>`;
}

// ---------- incremental SVG streaming (watch it being drawn) ----------
// Returns a list of complete top-level child element strings found so far.
export function svgOpenTag(text) {
  const i = text.indexOf('<svg');
  if (i < 0) return null;
  const j = text.indexOf('>', i);
  if (j < 0) return null;
  return text.slice(i, j + 1);
}

export function completeChildren(text) {
  const open = svgOpenTag(text);
  if (!open) return [];
  let body = text.slice(text.indexOf(open) + open.length);
  const out = [];
  const tagRe = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w:.-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/g;
  let depth = 0, start = -1, m;
  while ((m = tagRe.exec(body))) {
    const [full, close, , , self] = m;
    if (full.startsWith('<!--')) { if (depth === 0) out.push(full); continue; }
    if (close === '') {
      if (depth === 0) {
        if (self === '/') { out.push(full); continue; }
        start = m.index;
      }
      if (self !== '/') depth++;
    } else {
      depth--;
      if (depth === 0 && start >= 0) { out.push(body.slice(start, m.index + full.length)); start = -1; }
    }
    if (depth < 0) break;
  }
  return out;
}

export function renderStreamPreview(text) {
  const open = svgOpenTag(text);
  if (!open) return null;
  const kids = completeChildren(text).join('');
  return open + kids + '</svg>';
}

// app.js — Night City Censor
import { t, setLang, getLang, applyLang } from './i18n.js';
import * as S from './stego.js';
import * as AI from './ai.js';
import { ARCHIVE, archiveRound, specimenCards } from './archive.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

const CENSOR_MODEL = { luna: AI.MODELS.luna.id, sol: AI.MODELS.sol.id, astra: AI.MODELS.astra.id };
const HIDER_MODEL = { astra: AI.MODELS.astra.id, sol: AI.MODELS.sol.id };

const state = {
  source: 'archive',
  hider: 'astra',
  censor: 'luna',
  scheme: 'astra',
  round: null,          // {source, cards:[card]}
  busy: false,
};
window.__ncc = state;   // test hook (used by the walkthrough script)

// ============ card object ============
function newCard(svg, { hidden = false, message = '', messageDrawn = '', family = 'clean', familyKey = 'clean', model = 'code', seeks = {} } = {}) {
  return { svg, hidden, message, messageDrawn, family, familyKey, model, seeks, playerVerdict: null, playerMsg: '', notes: '', revealed: false, liveSeek: null };
}

function lev(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = [...Array(n + 1).keys()], cur = new Array(n + 1);
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}
function decodeGrade(given, truth) {
  const g = S.normalizeAnswer(given), tr = S.normalizeAnswer(truth);
  if (!tr) return 'none';
  if (!g) return 'miss';
  if (g === tr || (g.length >= 4 && tr.length >= 4 && (g.includes(tr) || tr.includes(g)))) return 'exact';
  if (lev(g, tr) <= 2) return 'close';
  return 'miss';
}

// ============ tiny demo SVGs for the gallery ============
function demoSVG(kind) {
  const W = 240, H = 90, base = 72;
  const head = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">`;
  if (kind === 'height') {
    let bars = ''; const hs = [22, 34, 46, 58, 46, 34];
    hs.forEach((h, i) => { bars += `<rect x="${18 + i * 36}" y="${base - h}" width="24" height="${h}" fill="#34437c" stroke="#6ee7f9" stroke-width="1"/>`; });
    return head + `<rect width="${W}" height="${H}" fill="#0c1330"/>${bars}<text x="120" y="86" fill="#9aa7d0" font-size="9" text-anchor="middle" font-family="monospace">a b c d c b</text></svg>`;
  }
  if (kind === 'morse') {
    return head + `<rect width="${W}" height="${H}" fill="#0c1330"/><g fill="#ffd166"><circle cx="24" cy="40" r="5"/><rect x="38" y="35" width="22" height="10" rx="5"/><circle cx="70" cy="40" r="5"/><circle cx="92" cy="40" r="5"/><circle cx="114" cy="40" r="5"/><rect x="128" y="35" width="22" height="10" rx="5"/><rect x="158" y="35" width="22" height="10" rx="5"/><circle cx="190" cy="40" r="5"/></g><text x="120" y="72" fill="#9aa7d0" font-size="10" text-anchor="middle" font-family="monospace">S · O · S</text></svg>`;
  }
  if (kind === 'binary') {
    let sq = ''; const bits = '01001011';
    [...bits].forEach((b, i) => { sq += `<rect x="${28 + i * 24}" y="30" width="17" height="17" rx="3" fill="${b === '1' ? '#ff6ec7' : '#2c3a6b'}"/>`; });
    return head + `<rect width="${W}" height="${H}" fill="#0c1330"/>${sq}<text x="120" y="72" fill="#9aa7d0" font-size="10" text-anchor="middle" font-family="monospace">01001011 = K (a=1)</text></svg>`;
  }
  if (kind === 'count') {
    let g = '';
    for (let grp = 1; grp <= 4; grp++) for (let i = 0; i < grp; i++) g += `<circle cx="${26 + (grp - 1) * 56 + i * 11}" cy="42" r="4.2" fill="#6ee7f9"/>`;
    return head + `<rect width="${W}" height="${H}" fill="#0c1330"/>${g}<text x="120" y="72" fill="#9aa7d0" font-size="10" text-anchor="middle" font-family="monospace">a b c d</text></svg>`;
  }
  if (kind === 'acrostic') {
    const fl = (x, c) => `<circle cx="${x}" cy="36" r="9" fill="${c}"/><rect x="${x - 1.4}" y="44" width="2.8" height="20" fill="#5c8a4e"/>`;
    return head + `<rect width="${W}" height="${H}" fill="#0c1330"/>${fl(50, '#e8628c')}${fl(100, '#f2a154')}${fl(150, '#8fd1e0')}${fl(200, '#e8628c')}<text x="120" y="80" fill="#9aa7d0" font-size="8.5" text-anchor="middle" font-family="monospace">rose · orchid · sunflower · rose</text></svg>`;
  }
  if (kind === 'decoys') {
    return head + `<rect width="${W}" height="${H}" fill="#0c1330"/><circle cx="190" cy="30" r="16" fill="#f6f0d8"/><circle cx="183" cy="25" r="13" fill="#0c1330"/><circle cx="40" cy="24" r="2" fill="#e8ecff"/><circle cx="80" cy="18" r="1.6" fill="#e8ecff"/><circle cx="120" cy="30" r="2.2" fill="#e8ecff"/><circle cx="60" cy="42" r="1.4" fill="#e8ecff"/><text x="120" y="74" fill="#9aa7d0" font-size="10" text-anchor="middle" font-family="monospace">moon &amp; stars = decoys</text></svg>`;
  }
  return head + `<rect width="${W}" height="${H}" fill="#0c1330"/><rect x="30" y="38" width="180" height="14" rx="7" fill="#2c3a6b"/><rect x="60" y="22" width="120" height="10" rx="5" fill="#222d55"/><text x="120" y="74" fill="#9aa7d0" font-size="10" text-anchor="middle" font-family="monospace">nothing hidden</text></svg>`;
}

const MORSE = { a: '.-', b: '-...', c: '-.-.', d: '-..', e: '.', f: '..-.', g: '--.', h: '....', i: '..', j: '.---', k: '-.-', l: '.-..', m: '--', n: '-.', o: '---', p: '.--.', q: '--.-', r: '.-.', s: '...', t: '-', u: '..-', v: '...-', w: '.--', x: '-..-', y: '-.--', z: '--..' };

// ============ tools: probe + grid + pins ============
let activeTools = null;
function makeTools({ poster, pinsEl }) {
  const tip = el('div', 'probe-tip');
  tip.style.display = 'none';
  document.body.appendChild(tip);
  const api = {
    probeOn: false, gridOn: false, pins: [],
    setSvg(svg) {
      poster.innerHTML = svg;
      const ov = el('div', 'grid-overlay'); ov.style.display = 'none';
      if (getComputedStyle(poster).position === 'static') poster.style.position = 'relative';
      poster.appendChild(ov);
      api._ov = ov;
    },
    toggleProbe(btn) {
      api.probeOn = !api.probeOn;
      btn.classList.toggle('active', api.probeOn);
      if (!api.probeOn) tip.style.display = 'none';
    },
    toggleGrid(btn) {
      api.gridOn = !api.gridOn;
      btn.classList.toggle('active', api.gridOn);
      if (api._ov) api._ov.style.display = api.gridOn ? 'block' : 'none';
    },
    renderPins() {
      pinsEl.innerHTML = '';
      api.pins.forEach((p, i) => {
        const b = el('button', 'pin', `${p.tag} h=${p.h} w=${p.w} x=${p.x}`);
        b.title = 'remove';
        b.onclick = () => { api.pins.splice(i, 1); api.renderPins(); };
        pinsEl.appendChild(b);
      });
    },
  };
  poster.addEventListener('mousemove', (e) => {
    if (!api.probeOn) { tip.style.display = 'none'; return; }
    const target = e.target;
    if (!(target instanceof SVGElement) || target.tagName.toLowerCase() === 'svg') { tip.style.display = 'none'; return; }
    let bb;
    try { bb = target.getBBox(); } catch { tip.style.display = 'none'; return; }
    tip.textContent = `${target.tagName.toLowerCase()}  h=${Math.round(bb.height)}  w=${Math.round(bb.width)}  x=${Math.round(bb.x)}  y=${Math.round(bb.y)}`;
    tip.style.display = 'block';
    tip.style.left = (e.clientX + 14) + 'px';
    tip.style.top = (e.clientY + 12) + 'px';
  });
  poster.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
  poster.addEventListener('click', (e) => {
    if (!api.probeOn) return;
    const target = e.target;
    if (!(target instanceof SVGElement) || target.tagName.toLowerCase() === 'svg') return;
    let bb;
    try { bb = target.getBBox(); } catch { return; }
    api.pins.push({ tag: target.tagName.toLowerCase(), h: Math.round(bb.height), w: Math.round(bb.width), x: Math.round(bb.x), y: Math.round(bb.y) });
    api.renderPins();
  });
  return api;
}

// ============ header / connection ============
function updatePill() {
  const on = !!AI.getKey();
  const pill = $('#connPill');
  pill.classList.toggle('pill-on', on);
  pill.classList.toggle('pill-off', !on);
  $('#connText').textContent = on ? t('conn.connected') : t('conn.disconnected');
}

function grabPolliToken() {
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && k.includes('polli') && k.endsWith('token')) {
        const v = sessionStorage.getItem(k);
        if (v && v.length > 10) return v;
      }
    }
  } catch {}
  return window.connect?.apiKey || '';
}
function pollPolli() {
  const k = grabPolliToken();
  if (k) { AI.setKey(k); $('#keyInput').value = k; updatePill(); }
}

// ============ desk: round setup ============
function updateCost() {
  const c = $('#costHint');
  if (state.source === 'live') c.textContent = state.hider === 'sol' ? t('desk.costSol') : t('desk.costAstra');
  else c.textContent = t('desk.costFree');
  $('#hiderGroup').style.opacity = state.source === 'live' ? '1' : '0.45';
}

function shuffle(arr, rng = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function buildArchiveRound() {
  return { source: 'archive', cards: archiveRound().map(c => newCard(c.svg, {
    hidden: c.hidden, message: c.message, messageDrawn: c.messageDrawn, family: c.family,
    familyKey: c.familyKey, model: c.model, seeks: c.seeks,
  })) };
}

function buildMechRound() {
  const rng = S.mulberry32(Date.now() & 0xffff);
  const phrases = S.pickPhrases(2, rng);
  const cards = [
    newCard(S.skylineSVG(phrases[0], Math.floor(rng() * 1e9)), { hidden: true, message: phrases[0], messageDrawn: phrases[0], family: 'height', familyKey: 'height', model: 'code-skyline' }),
    newCard(S.skylineSVG('', Math.floor(rng() * 1e9)), { hidden: false, family: 'clean', familyKey: 'clean', model: 'code-skyline' }),
    newCard(S.fenceSVG(phrases[1], Math.floor(rng() * 1e9)), { hidden: true, message: phrases[1], messageDrawn: phrases[1], family: 'morse', familyKey: 'morse', model: 'code-fence' }),
    newCard(S.fenceSVG('', Math.floor(rng() * 1e9)), { hidden: false, family: 'clean', familyKey: 'clean', model: 'code-fence' }),
  ];
  // clean variants: skylineSVG('') draws random-height buildings already (no letters) — mark as clean
  return { source: 'mech', cards: shuffle(cards, rng) };
}

function renderRound() {
  const grid = $('#roundGrid');
  grid.innerHTML = '';
  const round = state.round;
  if (!round) return;
  round.cards.forEach((card, i) => {
    const wrap = el('div', 'postcard');
    wrap.dataset.idx = i;
    const poster = el('div', 'poster');
    if (card.svg) poster.innerHTML = card.svg;
    wrap.appendChild(poster);
    const stamp = el('div', 'stamp pending', `${t('desk.card')} ${i + 1}`);
    wrap.appendChild(stamp);
    const meta = el('div', 'meta');
    meta.innerHTML = `<span>#${i + 1} · ${card.model === 'code-skyline' || card.model === 'code-fence' ? 'code' : card.model.split('/').pop()}</span><span class="verdict-mark">${card.playerVerdict ? (card.playerVerdict === 'hidden' ? '🕵️' : '😇') : '·'}</span>`;
    wrap.appendChild(meta);
    if (card.streaming) {
      stamp.className = 'stamp drawing';
      stamp.textContent = t('desk.genCard');
    }
    if (card.revealed) {
      wrap.classList.add('revealed');
      stamp.className = card.hidden ? 'stamp smuggled' : 'stamp clean';
      stamp.textContent = card.hidden ? t('desk.hidden') : t('desk.clean');
    }
    wrap.addEventListener('click', () => openFocus(i));
    grid.appendChild(wrap);
  });
}

function renderRoundBar(text, showLock) {
  const bar = $('#roundBar');
  bar.classList.remove('hidden');
  $('#roundStatus').innerHTML = text || '';
  $('#btnLock').classList.toggle('hidden', !showLock);
}

// ============ focus dialog ============
function openFocus(i) {
  const card = state.round.cards[i];
  const dlg = $('#dlgFocus');
  $('#focusTitle').textContent = `${t('desk.card')} ${i + 1}`;
  activeTools = makeTools({ poster: $('#focusPoster'), pinsEl: $('#focusPins') });
  activeTools.setSvg(card.svg || '<svg viewBox="0 0 800 600"></svg>');
  $('#focusNotes').value = card.notes || '';
  $('#focusDecode').value = card.playerMsg || '';
  $('#focusDecode').classList.toggle('hidden', card.playerVerdict !== 'hidden');
  $$('#verdictBox .verdict').forEach(b => {
    b.classList.toggle('picked-clean', card.playerVerdict === 'clean' && b.dataset.verdict === 'clean');
    b.classList.toggle('picked-hidden', card.playerVerdict === 'hidden' && b.dataset.verdict === 'hidden');
    b.disabled = card.revealed;
  });
  const rev = $('#focusReveal');
  if (card.revealed) {
    rev.classList.remove('hidden');
    rev.innerHTML = revealHtml(card);
  } else {
    rev.classList.add('hidden');
    rev.innerHTML = '';
  }
  $('#btnPrevCard').disabled = i === 0;
  $('#btnNextCard').disabled = i === state.round.cards.length - 1;
  dlg.dataset.idx = i;
  if (!dlg.open) dlg.showModal();
}

function revealHtml(card) {
  const famName = t('fam.' + (card.familyKey === 'morse' ? 'morse' : card.familyKey));
  let html = '';
  if (card.hidden) {
    html += `<div>${t('desk.truthHidden')}：</div><div class="truth">“${card.message}”</div>`;
    if (card.messageDrawn && S.normalizeAnswer(card.messageDrawn) !== S.normalizeAnswer(card.message)) {
      html += `<div class="small muted">${t('desk.drawnAs')}：“${card.messageDrawn}”</div>`;
    }
    html += `<div>${t('desk.family')}：<b>${famName}</b> — ${t('fam.' + card.familyKey + 'Desc')}</div>`;
  } else {
    html += `<div>${t('desk.truthClean')}</div><div>${t('fam.cleanDesc')}</div>`;
  }
  const seek = card.liveSeek || (card.seeks && card.seeks[state.censor]);
  if (seek) {
    const who = t('desk.censor' + state.censor[0].toUpperCase() + state.censor.slice(1));
    html += `<div class="ai-line">${t('desk.aiScore')} · ${who} · ${seek.hidden ? t('desk.aiSaidHidden') : t('desk.aiSaidClean')}` +
      (seek.message ? ` · ${t('desk.aiDecode')}: ${seek.message}` : '') +
      (seek.seconds ? ` · ${seek.seconds}s` : '') + '</div>';
    if (seek.clue) html += `<div class="ai-line">“${seek.clue}”</div>`;
  } else if (state.round.source === 'mech' && card.hidden) {
    html += `<div class="ai-line">${t('desk.mechFact')}</div>`;
  }
  return html;
}

// ============ verdict + scoring ============
function cardScore(v, truthHidden, grade) {
  let s = 0, vOK = (v === 'hidden') === truthHidden;
  if (vOK) s += 100;
  if (truthHidden) {
    if (grade === 'exact') s += 150;
    else if (grade === 'close') s += 75;
  }
  return { s, vOK };
}

function humanEmoji(card) {
  const vOK = (card.playerVerdict === 'hidden') === card.hidden;
  if (card.hidden && vOK) {
    const g = decodeGrade(card.playerMsg, card.message);
    return '🕵️' + (g === 'exact' ? '💌' : g === 'close' ? '🪢' : '');
  }
  if (!card.hidden && vOK) return '😇';
  if (card.hidden && !vOK) return '🙈';
  return '🚨';
}
function aiEmoji(card, seek) {
  if (!seek || seek.hidden == null) return '💤';
  const vOK = seek.hidden === card.hidden;
  if (card.hidden && vOK) {
    const g = decodeGrade(seek.message, card.message);
    return '🕵️' + (g === 'exact' ? '💌' : g === 'close' ? '🪢' : '');
  }
  if (!card.hidden && vOK) return '😇';
  if (card.hidden && !vOK) return '🙈';
  return '🚨';
}

function computeScores() {
  const cards = state.round.cards;
  let hS = 0, aS = 0, hV = 0, aV = 0, hD = 0, aD = 0;
  const rows = cards.map((card, i) => {
    const g = decodeGrade(card.playerMsg, card.message);
    const h = cardScore(card.playerVerdict, card.hidden, g);
    hS += h.s; if (h.vOK) hV++;
    if (card.hidden && (g === 'exact' || g === 'close')) hD++;
    const seek = card.liveSeek || (card.seeks && card.seeks[state.censor]);
    let a = { s: 0, vOK: false };
    if (seek && seek.hidden != null) {
      const ag = decodeGrade(seek.message, card.message);
      a = cardScore(seek.hidden ? 'hidden' : 'clean', card.hidden, ag);
      aS += a.s; if (a.vOK) aV++;
      if (card.hidden && (ag === 'exact' || ag === 'close')) aD++;
    }
    return { i, card, seek, hEmoji: humanEmoji(card), aEmoji: aiEmoji(card, seek), h, a };
  });
  return { rows, hS, aS, hV, aV, hD, aD, n: cards.length };
}

function cardLabel(i) { return (getLang() === 'zh' ? '卡' : 'C') + (i + 1); }

function showScore() {
  const sc = computeScores();
  const who = t('desk.censor' + state.censor[0].toUpperCase() + state.censor.slice(1));
  const verdictLine = sc.rows.map(r => `${cardLabel(r.i)} ${r.hEmoji} vs ${r.aEmoji}`).join('  ');
  const headline = sc.hS > sc.aS ? t('score.win') : sc.hS < sc.aS ? t('score.lose') : t('score.tie');
  const body = $('#scoreBody');
  body.innerHTML = `
    <div class="row-b">🏮 ${t('score.title')} · ${t('score.you')} vs ${who}</div>
    <div>${verdictLine}</div>
    <div>${t('score.you')} ${t('score.verdicts')} ${sc.hV}/${sc.n} · ${t('score.decodes')} ${sc.hD} — ${sc.hS} pts</div>
    <div>AI ${t('score.verdicts')} ${sc.aV}/${sc.n} · ${t('score.decodes')} ${sc.aD} — ${sc.aS} pts</div>
    <div class="win">${headline}</div>
    <div class="small muted">${t('score.note')}</div>`;
  $('#dlgScore').showModal();
}

function scoreText() {
  const sc = computeScores();
  const who = t('desk.censor' + state.censor[0].toUpperCase() + state.censor.slice(1));
  const verdictLine = sc.rows.map(r => `${cardLabel(r.i)} ${r.hEmoji} vs ${r.aEmoji}`).join(' ');
  const headline = sc.hS > sc.aS ? t('score.win') : sc.hS < sc.aS ? t('score.lose') : t('score.tie');
  return `🏮 ${t('app.title')} · ${t('score.title')}\n${verdictLine}\n${t('score.you')} ${sc.hS} ⚡ AI(${who}) ${sc.aS}\n${headline}`;
}

// ============ reveal flow ============
async function lockAndReveal() {
  if (state.busy) return;
  const cards = state.round.cards;
  for (const c of cards) { if (!c.playerVerdict) { alert(t('desk.verdict') + ' — ' + t('desk.card')); return; } }
  state.busy = true;
  $('#btnLock').disabled = true;
  const needLive = AI.getKey() && (state.round.source === 'live' || state.round.source === 'mech');
  if (needLive) {
    renderRoundBar(`<span class="live-dot"></span>${t('desk.awaitJudge')}…`, false);
    await Promise.all(cards.map(async (c) => {
      try {
        const png = await S.svgToPngDataUrl(c.svg, 800, 600);
        c.liveSeek = await AI.seekJudge(CENSOR_MODEL[state.censor], png);
      } catch (e) {
        c.liveSeek = { hidden: null, message: '', confidence: 0, clue: 'AI error: ' + (e.message || e) };
      }
    }));
  }
  cards.forEach(c => { c.revealed = true; });
  renderRound();
  renderRoundBar(t('desk.replayRecord'), false);
  $('#btnLock').classList.add('hidden');
  state.busy = false;
  showScore();
  // refresh open focus
  const dlg = $('#dlgFocus');
  if (dlg.open) openFocus(Number(dlg.dataset.idx));
}

// ============ live round generation ============
async function startLiveRound() {
  const model = HIDER_MODEL[state.hider];
  const rng = S.mulberry32((Date.now() & 0xffff) + 1);
  const phrases = S.pickPhrases(2, rng);
  const plan = [
    { hidden: true, message: phrases[0], scene: 'a moonlit night market street' },
    { hidden: false, scene: 'a quiet garden greenhouse at night' },
    { hidden: true, message: phrases[1], scene: 'a snowy harbor with paper cranes' },
    { hidden: false, scene: 'a rooftop teahouse above the clouds' },
  ];
  state.round = { source: 'live', cards: plan.map(p => newCard('', {
    hidden: p.hidden, message: p.message || '', messageDrawn: p.message || '',
    family: p.hidden ? 'morse' : 'clean', familyKey: p.hidden ? 'morse' : 'clean', model,
  })) };
  state.round.cards.forEach((c, i) => { c.streaming = true; c.streamText = ''; });
  renderRound();
  renderRoundBar(`<span class="live-dot"></span>${t('desk.generating')} · ${t('desk.waitStream')}`, false);

  await Promise.all(plan.map(async (p, i) => {
    const card = state.round.cards[i];
    const holder = () => {
      const wrapEl = $(`#roundGrid .postcard[data-idx="${i}"] .poster`);
      return wrapEl;
    };
    let tick = 0;
    try {
      const r = await AI.generateCard(model, {
        msg: p.message, scene: p.scene, clean: !p.hidden,
        onDelta: (_d, full) => {
          card.streamText = full;
          tick++;
          if (tick % 4 === 0) {
            const preview = S.renderStreamPreview(full);
            const h = holder();
            if (h && preview) {
              let term = h.querySelector('.stream-term');
              if (!term) { term = el('div', 'stream-term'); h.appendChild(term); }
              term.innerHTML = `<div>${t('term.stream')} …</div>` + escapeHtml(full.slice(-1200)) + '<span class="caret">▌</span>';
            }
          }
        },
      });
      card.svg = r.svg;
      card.messageDrawn = p.message || '';
    } catch (e) {
      card.svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><rect width="800" height="600" fill="#1a0b1e"/><text x="400" y="300" fill="#ff7a7a" font-size="26" text-anchor="middle" font-family="monospace">${escapeHtml(e.code || 'error')}: ${escapeHtml(String(e.message || e).slice(0, 60))}</text></svg>`;
      card.genError = e;
    }
    card.streaming = false;
    renderRound();
  }));
  renderRoundBar(t('desk.lockAll'), true);
  $('#btnLock').disabled = false;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ============ start round ============
async function startRound() {
  if (state.busy) return;
  if (state.source === 'live' && !AI.getKey()) {
    renderRoundBar(`⚠️ ${t('conn.needKeyHint')}`, false);
    $('#dlgSettings').showModal();
    return;
  }
  state.busy = true;
  $('#btnStart').disabled = true;
  try {
    if (state.source === 'archive') {
      state.round = buildArchiveRound();
      renderRound();
      renderRoundBar(t('desk.replayRecord'), true);
    } else if (state.source === 'mech') {
      state.round = buildMechRound();
      renderRound();
      renderRoundBar(t('desk.mechFact'), true);
    } else {
      await startLiveRound();
    }
    $('#btnLock').disabled = false;
  } catch (e) {
    renderRoundBar('⚠️ ' + escapeHtml(String(e.message || e)), false);
  } finally {
    state.busy = false;
    $('#btnStart').disabled = false;
  }
}

// ============ smuggle ============
function validateMsg(v) {
  const s = v.trim().toLowerCase();
  if (!s) return { ok: false, why: '—' };
  if (!/^[a-z ]+$/.test(s)) return { ok: false, why: 'a–z + space only' };
  if (s.length > 24) return { ok: false, why: 'max 24' };
  return { ok: true, msg: s };
}

async function generateSmuggle() {
  const v = validateMsg($('#smugMsg').value);
  if (!v.ok) { $('#smugMsgHint').textContent = v.why; return; }
  const scheme = state.scheme;
  const scene = $('#smugScene').value.trim();
  const btn = $('#btnSmugGen');
  btn.disabled = true;
  const poster = $('#smugPoster');
  const term = $('#smugTerminal');
  let svg = '', payload;
  try {
    if (scheme === 'sky' || scheme === 'fence') {
      svg = scheme === 'sky' ? S.skylineSVG(v.msg, Date.now() & 0xffff) : S.fenceSVG(v.msg, Date.now() & 0xffff);
      poster.className = 'poster';
      poster.innerHTML = svg;
    } else {
      if (!AI.getKey()) { renderSmugError(t('conn.needKeyHint')); $('#dlgSettings').showModal(); return; }
      term.classList.remove('hidden');
      term.innerHTML = `<div>${t('term.stream')} …</div>`;
      const model = scheme === 'sol' ? HIDER_MODEL.sol : HIDER_MODEL.astra;
      let tick = 0;
      const r = await AI.generateCard(model, {
        msg: v.msg, scene, clean: false,
        onDelta: (_d, full) => {
          tick++;
          if (tick % 3 === 0) {
            term.innerHTML = `<div>${t('term.stream')} …</div>` + escapeHtml(full.slice(-1500)) + '<span class="caret">▌</span>';
            term.scrollTop = term.scrollHeight;
            const preview = S.renderStreamPreview(full);
            if (preview) { poster.className = 'poster'; poster.innerHTML = preview; }
          }
        },
      });
      svg = r.svg;
      term.innerHTML += `<div>✓ ${t('term.done')} ${Math.round(r.seconds)}s</div>`;
      poster.className = 'poster';
      poster.innerHTML = svg;
    }
    payload = { v: 1, svg, msg: v.msg, scheme };
    const hash = await encodePayload(payload);
    const link = location.origin + location.pathname + '#s=' + hash;
    $('#smugLink').value = link;
    $('#smugShare').classList.remove('hidden');
    if (link.length > 60000) $('#smugMsgHint').textContent = '⚠️ link is very long — some apps will truncate it';
    else $('#smugMsgHint').textContent = '';
  } catch (e) {
    renderSmugError((e.code === 'paidwall' ? t('conn.paidwall') : '') + ' ' + (e.message || e));
  } finally {
    btn.disabled = false;
  }
}
function renderSmugError(msg) {
  $('#smugMsgHint').textContent = msg;
}

async function encodePayload(obj) {
  const json = JSON.stringify(obj);
  const bytes = new TextEncoder().encode(json);
  if (typeof CompressionStream !== 'undefined') {
    const ds = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    const buf = await new Response(ds).arrayBuffer();
    return 'p1' + b64url(new Uint8Array(buf));
  }
  return 'p0' + b64url(bytes);
}
async function decodePayload(s) {
  const mode = s.slice(0, 2), body = s.slice(2);
  const bytes = b64urlDecode(body);
  if (mode === 'p1') {
    const ds = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return JSON.parse(await new Response(ds).text());
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
function b64url(u8) {
  let s = ''; u8.forEach(b => s += String.fromCharCode(b));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(str) {
  const s = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
  const bin = atob(s);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}

// ============ receiver view ============
let receiverPayload = null;
function openReceiver(payload) {
  receiverPayload = payload;
  showView('receiver');
  activeTools = makeTools({ poster: $('#rcvPoster'), pinsEl: $('#rcvPins') });
  activeTools.setSvg(payload.svg);
  $('#rcvInput').value = '';
  $('#rcvFeedback').textContent = '';
  $('#rcvFeedback').className = 'feedback';
}
function checkReceiver() {
  const v = $('#rcvInput').value;
  const grade = decodeGrade(v, receiverPayload.msg);
  const fb = $('#rcvFeedback');
  if (grade === 'exact' || grade === 'close') {
    fb.textContent = t('smug.right') + (grade === 'close' ? (getLang() === 'zh' ? '（差一点）' : ' (close)') : '') + ` — “${receiverPayload.msg}”`;
    fb.className = 'feedback ok';
  } else {
    fb.textContent = t('smug.wrong');
    fb.className = 'feedback bad';
  }
}

// ============ gallery ============
function renderGallery() {
  const fams = [
    ['height', 'height'], ['morse', 'morse'], ['morseLantern', 'morse'], ['morsePebble', 'morse'],
    ['morseRoad', 'morse'], ['binary', 'binary'], ['count', 'count'], ['acrostic', 'acrostic'], ['decoys', 'decoys'], ['clean', 'clean'],
  ];
  const grid = $('#famGrid');
  grid.innerHTML = '';
  fams.forEach(([key, demo]) => {
    const c = el('div', 'fam-card');
    c.innerHTML = `<div class="demo">${demoSVG(demo)}</div><b>${t('fam.' + key)}</b><p>${t('fam.' + key + 'Desc')}</p>`;
    grid.appendChild(c);
  });
  const specs = $('#specGrid');
  specs.innerHTML = '';
  specimenCards().forEach(card => {
    const wrap = el('div', 'postcard spec-card');
    const inner = el('div', 'spec-inner');
    const front = el('div', 'spec-face');
    front.innerHTML = card.svg;
    const back = el('div', 'spec-face back');
    back.innerHTML = `<b>${card.hidden ? t('desk.hidden') : t('desk.clean')}</b>
      <div class="truth">“${card.message || '—'}”</div>
      <div>${t('desk.family')}：${t('fam.' + card.familyKey)}</div>
      <div class="muted small">${t('desk.hiderLabel')}：${card.model}</div>
      ${Object.entries(card.seeks).map(([k, v]) => `<div class="muted small">AI ${k}: ${v.hidden ? '🕵️ ' + (v.message || '?') : '😇 clean'}</div>`).join('')}`;
    inner.appendChild(front); inner.appendChild(back);
    wrap.appendChild(inner);
    wrap.addEventListener('click', () => wrap.classList.toggle('flipped'));
    specs.appendChild(wrap);
  });
  const mt = $('#morseTable');
  mt.innerHTML = '';
  Object.entries(MORSE).forEach(([k, v]) => {
    const m = el('div', 'm-item', `<b>${k.toUpperCase()}</b>${v.replace(/\./g, '·').replace(/-/g, '—')}`);
    mt.appendChild(m);
  });
}

// ============ view switching ============
function showView(name) {
  $$('.view').forEach(v => v.hidden = true);
  const map = { desk: '#view-desk', smuggle: '#view-smuggle', gallery: '#view-gallery', receiver: '#view-receiver' };
  $(map[name]).hidden = false;
  $$('.tab').forEach(tb => tb.classList.toggle('active', tb.dataset.view === name));
  if (name === 'gallery') renderGallery();
}

// ============ boot ============
function boot() {
  // default language: zh for Chinese browsers, en otherwise; persist choice
  try {
    const saved = localStorage.getItem('ncc:lang');
    if (saved === 'zh' || saved === 'en') setLang(saved);
    else setLang((navigator.language || 'en').toLowerCase().startsWith('zh') ? 'zh' : 'en');
  } catch {}
  $('#btnLang').textContent = getLang() === 'zh' ? 'EN' : '中';
  document.documentElement.lang = getLang() === 'zh' ? 'zh' : 'en';
  applyLang();
  updatePill();
  updateCost();

  // tabs
  $$('.tab').forEach(tb => tb.addEventListener('click', () => showView(tb.dataset.view)));

  // lang
  $('#btnLang').addEventListener('click', () => {
    setLang(getLang() === 'zh' ? 'en' : 'zh');
    try { localStorage.setItem('ncc:lang', getLang()); } catch {}
    $('#btnLang').textContent = getLang() === 'zh' ? 'EN' : '中';
    document.documentElement.lang = getLang() === 'zh' ? 'zh' : 'en';
    applyLang();
    updatePill(); updateCost();
    renderGallery();
    if (state.round) { renderRound(); if (state.round.cards.some(c => c.revealed)) renderRoundBar(t('desk.replayRecord'), false); }
  });

  // source radios
  $$('input[name="roundSource"]').forEach(r => r.addEventListener('change', () => { state.source = r.value; updateCost(); }));

  // chips
  $$('#hiderGroup .chip').forEach(b => b.addEventListener('click', () => {
    $$('#hiderGroup .chip').forEach(x => x.classList.remove('active'));
    b.classList.add('active'); state.hider = b.dataset.hider; updateCost();
  }));
  $$('#censorGroup .chip').forEach(b => b.addEventListener('click', () => {
    $$('#censorGroup .chip').forEach(x => x.classList.remove('active'));
    b.classList.add('active'); state.censor = b.dataset.censor;
  }));
  $$('#schemeRow .chip').forEach(b => b.addEventListener('click', () => {
    $$('#schemeRow .chip').forEach(x => x.classList.remove('active'));
    b.classList.add('active'); state.scheme = b.dataset.scheme;
  }));

  $('#btnStart').addEventListener('click', startRound);
  $('#btnLock').addEventListener('click', lockAndReveal);

  // focus dialog
  $('#btnCloseFocus').addEventListener('click', () => $('#dlgFocus').close());
  $('#btnPrevCard').addEventListener('click', () => openFocus(Number($('#dlgFocus').dataset.idx) - 1));
  $('#btnNextCard').addEventListener('click', () => openFocus(Number($('#dlgFocus').dataset.idx) + 1));
  $('#focusNotes').addEventListener('input', (e) => {
    const i = Number($('#dlgFocus').dataset.idx);
    if (state.round) state.round.cards[i].notes = e.target.value;
  });
  $('#focusDecode').addEventListener('input', (e) => {
    const i = Number($('#dlgFocus').dataset.idx);
    if (state.round) state.round.cards[i].playerMsg = e.target.value;
  });
  $$('#verdictBox .verdict').forEach(b => b.addEventListener('click', () => {
    const i = Number($('#dlgFocus').dataset.idx);
    const card = state.round.cards[i];
    if (card.revealed) return;
    card.playerVerdict = b.dataset.verdict;
    $('#focusDecode').classList.toggle('hidden', card.playerVerdict !== 'hidden');
    $$('#verdictBox .verdict').forEach(x => {
      x.classList.toggle('picked-clean', card.playerVerdict === 'clean' && x.dataset.verdict === 'clean');
      x.classList.toggle('picked-hidden', card.playerVerdict === 'hidden' && x.dataset.verdict === 'hidden');
    });
    renderRound();
  }));
  // focus toolbar tools
  $$('#dlgFocus [data-tool]').forEach(b => b.addEventListener('click', () => {
    if (!activeTools) return;
    if (b.dataset.tool === 'probe') activeTools.toggleProbe(b);
    else activeTools.toggleGrid(b);
  }));
  $$('[data-clearpins]').forEach(b => b.addEventListener('click', () => {
    const which = b.dataset.clearpins;
    const pins = which === 'focus' ? $('#focusPins') : $('#rcvPins');
    pins.innerHTML = '';
  }));

  // score dialog
  $('#btnCopyScore').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(scoreText()); } catch {}
    $('#btnCopyScore').querySelector('span').textContent = t('smug.copied');
    setTimeout(() => $('#btnCopyScore').querySelector('span').textContent = t('score.copy'), 1200);
  });
  $('#btnScoreAgain').addEventListener('click', () => {
    $('#dlgScore').close();
    if (state.source === 'live' && !AI.getKey()) return;
    startRound();
  });

  // generic close
  $$('[data-close-dlg]').forEach(b => b.addEventListener('click', () => $('#' + b.dataset.closeDlg).close()));

  // settings / key
  $('#btnSettings').addEventListener('click', () => $('#dlgSettings').showModal());
  $('#btnHelp').addEventListener('click', () => $('#dlgHelp').showModal());
  $('#btnSaveKey').addEventListener('click', () => {
    const k = $('#keyInput').value.trim();
    if (k) { AI.setKey(k); updatePill(); $('#keyTestResult').textContent = '✓'; }
  });
  $('#btnClearKey').addEventListener('click', () => {
    AI.clearKey(); $('#keyInput').value = ''; updatePill(); $('#keyTestResult').textContent = 'cleared';
  });
  $('#btnTestKey').addEventListener('click', async () => {
    const out = $('#keyTestResult');
    out.textContent = '…';
    try {
      const r = await AI.chat({ model: AI.MODELS.luna.id, messages: [{ role: 'user', content: 'Reply with exactly: OK' }], maxTokens: 5000 });
      out.textContent = '✓ ' + (r.content || '').slice(0, 24) + ` (${Math.round(r.seconds)}s)`;
      updatePill();
    } catch (e) {
      out.textContent = (e.code === 'paidwall' ? t('conn.paidwall') : t('conn.badKey')) + ' ' + (e.code || '');
    }
  });

  // polli-connect capture
  const pc = $('#polliConnect');
  if (pc && !(pc.getAttribute('app-key') || '').startsWith('pk_')) {
    $('#polliMount').innerHTML = '<p class="muted small">BYOP App Key 待接入 — 可先在下方粘贴 Key。<br>App-key connect coming soon — paste a key below for now.</p>';
  }
  pc?.addEventListener('change', () => { pollPolli(); });
  setInterval(pollPolli, 2500);
  setTimeout(pollPolli, 800);

  // smuggle
  $('#btnSmugGen').addEventListener('click', generateSmuggle);
  $('#btnCopyLink').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('#smugLink').value); } catch {}
    const s = $('#btnCopyLink').querySelector('span');
    s.textContent = t('smug.copied');
    setTimeout(() => s.textContent = t('smug.copyLink'), 1200);
  });
  $('#btnOpenReceiver').addEventListener('click', async () => {
    try { openReceiver(await decodePayload($('#smugLink').value.split('#s=')[1])); } catch (e) { renderSmugError(String(e)); }
  });
  $('#btnRcvCheck').addEventListener('click', checkReceiver);
  $('#btnRcvGiveUp').addEventListener('click', () => {
    const fb = $('#rcvFeedback');
    fb.textContent = '“' + (receiverPayload?.msg || '?') + '”';
    fb.className = 'feedback ok';
  });
  $$('#view-receiver [data-tool]').forEach(b => b.addEventListener('click', () => {
    if (!activeTools) return;
    if (b.dataset.tool === 'probe') activeTools.toggleProbe(b);
    else activeTools.toggleGrid(b);
  }));

  // deep link: receiver payload
  const m = location.hash.match(/#s=(.+)/);
  if (m) {
    decodePayload(m[1]).then(openReceiver).catch(() => showView('desk'));
  } else {
    showView('desk');
  }

  // first-run hint
  if (!state.round) renderRoundBar('', false), $('#roundBar').classList.add('hidden');
}

boot();

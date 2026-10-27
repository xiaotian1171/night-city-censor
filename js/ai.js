// ai.js — Pollinations LLM layer (OpenAI-compatible, BYOP)
const API = 'https://gen.pollinations.ai/v1/chat/completions';

export const MODELS = {
  astra: { id: 'openai/gpt-6-astra', role: 'hider', tier: 'legend' },
  sol:   { id: 'openai/gpt-6-sol',   role: 'hider', tier: 'master' },
  luna:  { id: 'openai/gpt-6-luna',  role: 'seeker', tier: 'rookie' },
};

export function getKey() {
  try { return sessionStorage.getItem('ncc:key') || window.__polliKey || ''; } catch { return window.__polliKey || ''; }
}
export function setKey(k) {
  try { sessionStorage.setItem('ncc:key', k); } catch {}
  window.__polliKey = k;
}
export function clearKey() {
  try { sessionStorage.removeItem('ncc:key'); } catch {}
  window.__polliKey = '';
}

export class AppError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

export function isPaidWall(text) {
  const t = String(text || '');
  return /paid\s*pollen/i.test(t) || /需要.{0,8}(付费|充值)/i.test(t) || /requires? paid/i.test(t);
}

async function request(body, { stream = false, timeout = 300000 } = {}) {
  const key = getKey();
  if (!key) throw new AppError('nokey', 'no api key');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      if (res.status === 401 || res.status === 403) throw new AppError('auth', txt.slice(0, 200));
      throw new AppError('http' + res.status, txt.slice(0, 300));
    }
    return res;
  } finally {
    if (!stream) clearTimeout(timer);
    else { /* cleared when stream ends */ }
  }
}

// Non-streaming chat. Resolves {content, usage, seconds}.
export async function chat({ model, messages, maxTokens = 6000, temperature }) {
  const t0 = performance.now();
  const res = await request({ model, messages, max_tokens: maxTokens, ...(temperature != null ? { temperature } : {}) });
  clearTimeout?.(undefined);
  const d = await res.json();
  const content = d?.choices?.[0]?.message?.content || '';
  if (isPaidWall(content)) throw new AppError('paidwall', content.slice(0, 200));
  return { content, usage: d.usage || {}, seconds: (performance.now() - t0) / 1000 };
}

// Streaming chat. onDelta(text) receives incremental content.
export async function streamChat({ model, messages, maxTokens = 16000, onDelta }) {
  const t0 = performance.now();
  const res = await request({ model, messages, max_tokens: maxTokens, stream: true }, { stream: true });
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '', full = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      const s = line.trim();
      if (!s.startsWith('data:')) continue;
      const payload = s.slice(5).trim();
      if (payload === '[DONE]') continue;
      try {
        const j = JSON.parse(payload);
        const delta = j?.choices?.[0]?.delta?.content || '';
        if (delta) { full += delta; onDelta?.(delta, full); }
      } catch {}
    }
  }
  if (isPaidWall(full)) throw new AppError('paidwall', full.slice(0, 200));
  return { content: full, seconds: (performance.now() - t0) / 1000 };
}

// ---------- prompts ----------
export function hidePrompt(msg, scene) {
  return `You are a steganography artist. Hide a secret message inside a beautiful flat-illustration SVG postcard.

SCENE IDEA: ${scene || 'a charming night city postcard'}
SECRET MESSAGE: "${msg}"
(The message uses letters a-z and spaces only.)

HARD RULES
1. The receiver will ONLY see a rendered screenshot of the image (its pixels). The message MUST be recoverable by a smart human looking at the visible pixels alone.
2. Never use element ids, <metadata>, comments, invisible or hidden text, transparent text, <title>/<desc>, or any non-visual property. If it cannot be seen in the screenshot, it does not count.
3. Output exactly one complete standalone SVG document. viewBox="0 0 800 600". No <script>, no external references, no CSS animation, no raster images. Close every tag.
4. Pick ONE visual encoding and apply it consistently, so a human with a ruler and patience can decode it:
   - HEIGHT: each unit (building, flower, tree, star...) encodes a letter by its height (a=1, b=2, ... z=26). Use a clean constant step so heights are measurable.
   - MORSE: short and long marks (dots/dashes) woven into the scene, units grouped per letter, wider gaps between words.
   - BINARY COLORS: two clearly distinguishable colors = 0/1, 8 units per letter.
   - COUNT: number of repeated objects per group = letter index (a=1).
5. Group the units by word: small gaps inside a word, a visibly wider gap or a divider between words.
6. The picture must read as a coherent, charming postcard. The coded units must look like natural parts of the scene. Decoy elements are welcome.
7. Do NOT write the message as plain text anywhere in the image.

Output the SVG only, starting with <svg. No commentary before or after.`;
}

export function cleanPrompt(scene) {
  return `You are an illustrator. Draw a beautiful flat-illustration SVG postcard.

SCENE IDEA: ${scene || 'a charming night city postcard'}

HARD RULES
1. Output exactly one complete standalone SVG document. viewBox="0 0 800 600". No <script>, no external references, no CSS animation, no raster images. Close every tag.
2. Do NOT hide any message, code, or deliberate data-carrying sequence in the image. No meaningful text of more than 3 letters. It must be purely decorative.
3. Style: flat vector illustration, rich but harmonious palette, clear silhouettes, storybook-postcard feel.

Output the SVG only, starting with <svg. No commentary before or after.`;
}

export const SEEK_PROMPT = `You are an image censor inspecting a postcard for hidden steganographic messages. You see ONLY the rendered pixels.
Decide whether visual elements systematically encode a hidden message (for example letter sequences via heights, counts, colors, or short/long marks). Decorative motifs, random stars, moons, ordinary texture patterns are NOT hidden messages. If a hidden message exists, decode it.

Answer ONLY with JSON, no prose:
{"hidden": true|false, "message": "decoded message or empty string", "confidence": 0.0-1.0, "clue": "the visual evidence you used"}`;

export function parseSeek(text) {
  const m = String(text || '').match(/\{[\s\S]*?\}/);
  if (!m) return { hidden: null, message: '', confidence: 0, clue: String(text || '').slice(0, 200) };
  try {
    const j = JSON.parse(m[0]);
    return {
      hidden: j.hidden === true || j.hidden === 'true',
      message: String(j.message || ''),
      confidence: Number(j.confidence ?? 0),
      clue: String(j.clue || ''),
    };
  } catch {
    return { hidden: null, message: '', confidence: 0, clue: m[0].slice(0, 200) };
  }
}

export async function seekJudge(model, pngDataUrl) {
  const r = await chat({
    model, maxTokens: 6000,
    messages: [{ role: 'user', content: [
      { type: 'text', text: SEEK_PROMPT },
      { type: 'image_url', image_url: { url: pngDataUrl } },
    ] }],
  });
  return { ...parseSeek(r.content), seconds: r.seconds, tokens: r.usage?.total_tokens };
}

// generate one card via a hider model; returns {svg, seconds}
export async function generateCard(model, { msg, scene, clean = false, onDelta }) {
  const prompt = clean ? cleanPrompt(scene) : hidePrompt(msg, scene);
  const r = await streamChat({
    model, maxTokens: 16000,
    messages: [{ role: 'user', content: prompt + `\n(style nonce ${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)})` }],
    onDelta,
  });
  const m = r.content.match(/<svg[\s\S]*<\/svg>/);
  if (!m) throw new AppError('nosvg', 'no svg in model output');
  return { svg: m[0], seconds: r.seconds };
}

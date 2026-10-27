// tests/test.mjs — static contract checks (no browser needed)
import { readFileSync } from 'node:fs';
import { ARCHIVE, archiveRound } from '../js/archive.js';

let pass = 0, fail = 0;
function ok(cond, label) {
  if (cond) { pass++; console.log('  ✓', label); }
  else { fail++; console.log('  ✗ FAIL:', label); }
}

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const i18nSrc = readFileSync(new URL('../js/i18n.js', import.meta.url), 'utf8');

console.log('— DOM ids referenced in app.js exist in index.html');
const ids = [...app.matchAll(/\$\('#([A-Za-z0-9_-]+)'/g)].map(m => m[1]);
const uniqueIds = [...new Set(ids)];
for (const id of uniqueIds) ok(html.includes(`id="${id}"`), `#${id}`);

console.log('— i18n keys used in HTML exist in DICT');
const dictKeys = new Set([...i18nSrc.matchAll(/'([a-z][A-Za-z0-9.]+)':\s*\[/g)].map(m => m[1]));
const usedKeys = [...new Set([...html.matchAll(/data-t(?:-ph)?="([^"]+)"/g)].map(m => m[1]))];
for (const k of usedKeys) ok(dictKeys.has(k), `t('${k}')`);
const appKeys = [...new Set([...app.matchAll(/\bt\('([a-zA-Z0-9.]+)'\)/g)].map(m => m[1]))];
for (const k of appKeys) ok(dictKeys.has(k), `t('${k}') in app.js`);

console.log('— archive integrity');
ok(ARCHIVE.length === 5, '5 specimens');
ok(archiveRound().length === 4, '4-card archive round');
ok(archiveRound().filter(c => c.hidden).length === 2, '2 hidden + 2 clean in round');
for (const c of ARCHIVE) {
  ok(c.svg.startsWith('<svg') && c.svg.trim().endsWith('</svg>'), `${c.id} svg complete`);
  ok(c.hidden ? !!c.message : !c.message, `${c.id} message/truth consistent`);
  ok(c.seeks && Object.keys(c.seeks).length >= 2, `${c.id} has recorded AI verdicts`);
}
ok(ARCHIVE.find(c => c.id === 'H1').seeks.astra.hidden === true, 'recorded astra verdict kept');

console.log('— schemes encode exactly');
const { skylineGroups, fenceGroups } = await import('../js/stego.js');
const sky = skylineGroups('abc').flat().map(x => x.ch).join('');
ok(sky === 'abc', 'skyline letters round-trip');
const fg = fenceGroups('a z').flat().map(x => x.bits).join(',');
ok(fg === '00001,11010', `fence bits a=00001 z=11010 (got ${fg})`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

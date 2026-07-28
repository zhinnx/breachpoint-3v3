/**
 * Computes WCAG 2.1 contrast for every text/background pair in the design
 * system. Eyeballing contrast is unreliable (HOW_BEST_DESIGN §13.1 documents
 * 14 misses in one file), so this runs as a gate.
 *
 *   node tests/contrast.mjs   ->  exit 0 clean, 1 on any failure
 */
const hex = (h) => { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join('');
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const L = (r) => 0.2126 * lin(r[0]) + 0.7152 * lin(r[1]) + 0.0722 * lin(r[2]);
const ratio = (a, b) => { const l1 = L(hex(a)), l2 = L(hex(b));
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1]; return (hi + 0.05) / (lo + 0.05); };

const T = {
  char: '#1a1a1a', charDeep: '#121212', charLift: '#232325', charVoid: '#0b0b0b',
  gun: '#3a3d42', gunLo: '#2a2c30', gunHi: '#4d5157',
  conc: '#8a8d91', stencil: '#e8e4d8', stencilDim: '#b3afa4',
  amber: '#ff6b1a', amberHi: '#ff7f38', amberInk: '#1a0e04',
  steel: '#3e7cb8', steelFill: '#34689b', steelText: '#6ea6dd',
  oxide: '#b8453e', oxideFill: '#ad413a', oxideText: '#e0736a',
  ok: '#6f9c5a', warn: '#d9a521',
};

const pairs = [
  ['body on ground',            T.stencil,    T.char,      4.5],
  ['body on panel',             T.stencil,    T.charLift,  4.5],
  ['body on deep panel',        T.stencil,    T.charDeep,  4.5],
  ['dim body on ground',        T.stencilDim, T.char,      4.5],
  ['dim body on panel',         T.stencilDim, T.charLift,  4.5],
  ['concrete label on ground',  T.conc,       T.char,      4.5],
  ['concrete label on panel',   T.conc,       T.charLift,  4.5],
  ['concrete label on deep',    T.conc,       T.charDeep,  4.5],
  ['amber value on ground',     T.amber,      T.char,      4.5],
  ['amber value on panel',      T.amber,      T.charLift,  4.5],
  ['amber value on deep',       T.amber,      T.charDeep,  4.5],
  ['amber-ink on amber (PLAY)', T.amberInk,   T.amber,     4.5],
  ['amber-ink on amber hover',  T.amberInk,   T.amberHi,   4.5],
  ['team blue TEXT on ground',  T.steelText,  T.char,      4.5],
  ['team blue TEXT on panel',   T.steelText,  T.charLift,  4.5],
  ['team red TEXT on ground',   T.oxideText,  T.char,      4.5],
  ['team red TEXT on panel',    T.oxideText,  T.charLift,  4.5],
  ['stencil on blue FILL',      T.stencil,    T.steelFill, 4.5],
  ['stencil on red FILL',       T.stencil,    T.oxideFill, 4.5],
  ['team blue pip on ground',   T.steel,      T.char,      3.0],
  ['team red pip on ground',    T.oxide,      T.char,      3.0],
  ['ok on ground',              T.ok,         T.char,      3.0],
  ['warn on ground',            T.warn,       T.char,      3.0],
  ['amber focus ring',          T.amber,      T.char,      3.0],
  ['amber focus on panel',      T.amber,      T.charLift,  3.0],
  ['scope surround vs ground',  T.stencil,    T.charVoid,  4.5],
];

let fail = 0;
console.log('\n  ratio  min   status  pair');
console.log('  ' + '-'.repeat(52));
for (const [label, fg, bg, min] of pairs) {
  const r = ratio(fg, bg);
  const ok = r >= min;
  if (!ok) fail++;
  console.log(`  ${r.toFixed(2).padStart(5)}  ${min.toFixed(1)}   ${ok ? 'PASS' : 'FAIL'}    ${label}`);
}
console.log(`\n${fail === 0 ? '  ALL ' + pairs.length + ' CONTRAST PAIRS PASS' : `  ${fail} CONTRAST FAILURE(S)`}\n`);
process.exit(fail ? 1 : 0);

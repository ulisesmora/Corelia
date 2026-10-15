// Comprueba que el port TypeScript (crm/src/design/derive.ts) da EXACTAMENTE los
// mismos colores que el generador de Python (design/tokens/derive.py):
//   1) re-deriva las 80 paletas de palettes.json desde su fuente;
//   2) corrige unos colores propios de ejemplo en los 8 estilos y lo compara con
//      fix_custom() de Python.
// Uso (desde la raíz del repo, con las dependencias del panel instaladas):
//   node design/tokens/check_ts.mjs
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const require = createRequire(join(ROOT, 'crm', 'package.json'));
const ts = require('typescript');

const src = readFileSync(join(ROOT, 'crm/src/design/derive.ts'), 'utf8');
const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const D = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const data = JSON.parse(readFileSync(join(HERE, 'palettes.json'), 'utf8'));

let errors = 0;
const fail = (msg) => { errors += 1; if (errors <= 20) console.error('✗', msg); };

// 1) paletas
let n = 0;
for (const [sid, st] of Object.entries(data.styles)) {
  for (const p of st.palettes) {
    const s = p.source;
    const t = D.derive(sid, s.p, s.s, s.ink, s.bg, s.surf);
    for (const [k, v] of Object.entries(t)) {
      if (JSON.stringify(v) !== JSON.stringify(p[k])) fail(`${sid}/${p.id}.${k}: TS ${JSON.stringify(v)} ≠ ${JSON.stringify(p[k])}`);
    }
    const f = D.fieldsFromTokens(sid, t);
    if (JSON.stringify(f) !== JSON.stringify(p.fields)) fail(`${sid}/${p.id}.fields`);
    n += 1;
  }
}

// 2) colores propios
const SAMPLES = [
  { primary: '#A0897C', secondary: '#85786B', dark: '#3D3228', background: '#F5F0EA' },
  { primary: '#FFD400', secondary: '#1F6BFF', dark: '#555555', background: '#FFFFFF' },
  { primary: '#00E5FF', secondary: '#FF2BD6', dark: '#0B0B1A', background: '#12122A' },
  { primary: '#C8E6C9', secondary: '#888888', dark: '#999999', background: '#333333' },
  { primary: '#123456', secondary: '#ABCDEF', dark: '#F0F0F0', background: '#202020' },
];
const py = execFileSync('python3', ['-c', `
import json, sys
sys.path.insert(0, ${JSON.stringify(HERE)})
from derive import STYLE_MODES, fix_custom
samples = json.loads(${JSON.stringify(JSON.stringify(SAMPLES))})
print(json.dumps({sid: [fix_custom(sid, s) for s in samples] for sid in STYLE_MODES}))
`], { encoding: 'utf8' });
const want = JSON.parse(py);
let m = 0;
for (const [sid, rows] of Object.entries(want)) {
  rows.forEach(([fields, tokens], i) => {
    const got = D.fixCustom(sid, SAMPLES[i]);
    if (JSON.stringify(got.fields) !== JSON.stringify(fields)) fail(`fixCustom ${sid} #${i}: TS ${JSON.stringify(got.fields)} ≠ ${JSON.stringify(fields)}`);
    for (const [k, v] of Object.entries(tokens)) {
      if (JSON.stringify(got.tokens[k]) !== JSON.stringify(v)) fail(`fixCustom ${sid} #${i}.${k}`);
    }
    m += 1;
  });
}

if (errors) {
  console.error(`${errors} diferencias entre derive.ts y derive.py`);
  process.exit(1);
}
console.log(`OK: derive.ts = derive.py (${n} paletas y ${m} colores propios)`);

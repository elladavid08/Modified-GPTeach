// A1i production check (R4 / R5): marks the samples the production server suppressed (meta.stage2Suppressed = 1, i.e.
// Stage 1 showed the turn and no displayable Stage-2 row was left) as `_stage2_suppressed`, the field score_fresh.mjs
// uses to count such samples as "no row". Everything else is copied unchanged. Research only; output may hold
// model-written text: write it to git-ignored local folders only.
//   node production_shape.mjs <regression-bench results.jsonl> <out.jsonl>
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const [inPath, outPath] = process.argv.slice(2);
if (existsSync(outPath)) throw new Error(`${outPath} exists`);
let suppressed = 0; let n = 0;
const out = readFileSync(inPath, 'utf8').trim().split('\n').map((l) => {
  const x = JSON.parse(l); n++;
  if (x.ok && x.analysis && x.meta && x.meta.stage2Suppressed === 1) { x.analysis._stage2_suppressed = true; suppressed++; }
  return JSON.stringify(x);
});
writeFileSync(outPath, out.join('\n') + '\n');
console.log(`${n} lines, ${suppressed} suppressed`);

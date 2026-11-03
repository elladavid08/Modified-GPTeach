// X12 FINAL candidate: applies the post-Stage-2 policy (final_pipeline.cjs: leveraging guard, then no feedback when no
// displayable row remains) to raw Stage-2 runner output, so every offline score uses exactly the production rule.
// Research only; output holds model-written text: write it to git-ignored local folders only.
//   node apply_final.mjs <stage-2 raw.jsonl> <out.jsonl> <stage-1 results.jsonl ...>
// The teacher message comes from the Stage-1 results (`_x12ctx.teacher`, as recorded by x12_arm.cjs).
// Output lines: the raw record plus rows (after the guard), guardDropped and suppressed (true = no feedback shown).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { finalizeTurn } = require('./final_pipeline.cjs');

const [rawPath, outPath, ...s1Paths] = process.argv.slice(2);
if (existsSync(outPath)) throw new Error(`${outPath} exists`);
const teacher = new Map();
for (const f of s1Paths) {
  const tag = path.basename(f).replace(/\.jsonl$/, '');
  for (const l of readFileSync(f, 'utf8').trim().split('\n')) {
    const x = JSON.parse(l);
    const ctx = x.analysis && x.analysis._x12ctx;
    if (ctx) teacher.set(`${tag}|${x.conversation_id ? `${x.conversation_id}#${x.turn}` : `${x.id}#${x.rep}`}`, ctx.teacher);
  }
}
const n = { stage2: 0, fallback: 0, guardDropped: 0, suppressed: 0 };
const out = readFileSync(rawPath, 'utf8').trim().split('\n').map(JSON.parse).map((r) => {
  if (r.status !== 'stage2') { n.fallback++; return JSON.stringify(r); }
  const t = teacher.get(`${r.src}|${r.base}`);
  if (t === undefined) throw new Error(`no teacher message for ${r.src}|${r.base}`);
  const f = finalizeTurn({ teacherMessage: t, stage1: null, stage2: { status: 'stage2', rows: r.rows } });
  n.stage2++; n.guardDropped += f.guardDropped; n.suppressed += f.suppressed;
  return JSON.stringify({ ...r, rows: f.rows, guardDropped: f.guardDropped, suppressed: f.suppressed, signal: f.signal });
});
writeFileSync(outPath, out.join('\n') + '\n');
console.log(`${path.basename(outPath)}: ${JSON.stringify(n)}`);

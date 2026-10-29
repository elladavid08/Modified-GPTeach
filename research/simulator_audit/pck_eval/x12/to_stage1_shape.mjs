// X12: write a Stage-1-shaped copy of replay results in which the displayed skill rows come from Stage 2, so the
// existing scorers (score.js for the synthetic benchmark, x11/score_regression.mjs for the regression cases) run on
// the two-stage output unchanged. Research only.
//   node to_stage1_shape.mjs <stage-1 results.jsonl> <stage-2 out.jsonl> <out.jsonl> [rep]
// For every Stage-1 line whose Stage-2 run succeeded: skills_assessment = the Stage-2 rows (is_relevant true, score,
// evidence = what exists, what_could_be_better = what to improve) plus the other skills as not relevant;
// demonstrated_skills and missed_opportunities are emptied, so every row's text is the row's own. Everything else,
// including should_provide_feedback (the Stage-1 decision), is copied. Stage-1 lines without a Stage-2 result
// (not shown, or Stage 2 failed twice and the display falls back to Stage 1) are copied unchanged.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const [s1Path, s2Path, outPath, repArg] = process.argv.slice(2);
if (existsSync(outPath)) throw new Error(`${outPath} exists`);
const rep = Number(repArg || 0);
const tag = path.basename(s1Path).replace(/\.jsonl$/, '');
const SKILL_IDS = ['error-identification', 'error-characterization', 'diagnostic-interpretation', 'adapted-pedagogical-response', 'error-leveraging'];
const s2 = new Map();
for (const l of readFileSync(s2Path, 'utf8').trim().split('\n')) {
  const r = JSON.parse(l);
  if (r.src === tag && r.rep === rep && r.status === 'stage2') s2.set(r.base, r.rows);
}
const out = [];
let replaced = 0;
for (const l of readFileSync(s1Path, 'utf8').trim().split('\n')) {
  const x = JSON.parse(l);
  const rows = x.ok && s2.get(x.conversation_id ? `${x.conversation_id}#${x.turn}` : `${x.id}#${x.rep}`);
  if (rows) {
    const byId = Object.fromEntries(rows.map((r) => [r.skillId, r]));
    const { _x12ctx, ...a } = x.analysis;
    x.analysis = {
      ...a,
      skills_assessment: SKILL_IDS.map((id) => (byId[id]
        ? { skill_id: id, is_relevant: true, score: byId[id].score, evidence: byId[id].positive || '', what_could_be_better: byId[id].improvement || '' }
        : { skill_id: id, is_relevant: false })),
      demonstrated_skills: [],
      missed_opportunities: [],
    };
    replaced++;
  } else if (x.analysis) {
    delete x.analysis._x12ctx;
  }
  out.push(JSON.stringify(x));
}
writeFileSync(outPath, out.join('\n') + '\n');
console.log(`${tag}: ${replaced} of ${out.length} lines carry Stage-2 rows`);

// X9: score-only comparison on the frozen synthetic benchmark (no participant data). A = Stage-1 scores,
// B = the same rows with Stage-2 run-1 scores (fallback to Stage 1 when invalid). Decision/relevance are shared.
import { readFileSync } from 'node:fs';
import { score } from '../score.js';
const file = process.argv[2];
const lines = readFileSync(file, 'utf8').trim().split('\n').map(JSON.parse).filter((l) => l.ok);
const swap = (l) => {
  const a = l.analysis; const s2 = a._stage2 || {};
  const run = s2.status === 'scored' ? s2.runs[0] : null;
  const sa = (a.skills_assessment || []).map((s) => (run && run.ok && s.is_relevant === true && s.skill_id in run.scores ? { ...s, score: run.scores[s.skill_id] } : s));
  return { ...l, analysis: { ...a, skills_assessment: sa } };
};
const A = score(lines); const B = score(lines.map(swap));
const rate = ([o, n]) => (n ? `${o}/${n}` : '—');
console.log('stage-2 status', JSON.stringify(lines.reduce((m, l) => ((m[(l.analysis._stage2 || {}).status] = (m[(l.analysis._stage2 || {}).status] || 0) + 1), m), {})));
for (const b of ['high', 'needs_expert_review']) {
  console.log(`\n== ${b}: decision A ${rate(A[b].decision)} B ${rate(B[b].decision)} | constraints held A ${rate(A[b].constraints)} B ${rate(B[b].constraints)}`);
  for (const sid of Object.keys(A[b].skills)) {
    const x = A[b].skills[sid], y = B[b].skills[sid];
    console.log(`  ${sid.padEnd(30)} relevance A ${rate(x.required)} B ${rate(y.required)} | score-in-allowed A ${rate(x.score)} B ${rate(y.score)} | exact A ${rate(x.exact)} B ${rate(y.exact)}`);
  }
}
const viol = (R) => { const m = {}; for (const v of R.high.violations) for (const p of v.problems) if (/score|constraint/.test(p)) { const k = `${v.id}: ${p.replace(/score \d/, 'score')}`; m[k] = (m[k] || 0) + 1; } return m; };
const va = viol(A), vb = viol(B);
console.log('\nscore/constraint violations only in B (new):'); for (const [k, n] of Object.entries(vb)) if (!va[k]) console.log('  ', k, '×', n);
console.log('score/constraint violations fixed by B:'); for (const [k, n] of Object.entries(va)) if (!vb[k]) console.log('  ', k, '×', n);

// X10: synthetic benchmark, scores only. A = Stage-1 scores; v1 / v2 = Stage-2 runner scores on the recorded contexts
// (fallback to Stage 1 when invalid). Decision / relevance are shared. No participant data.
import { readFileSync } from 'node:fs';
import { score } from '../score.js';
const [base, f1, f2] = process.argv.slice(2);
const lines = readFileSync(base, 'utf8').trim().split('\n').map(JSON.parse).filter((l) => l.ok);
const load = (f) => Object.fromEntries(readFileSync(f, 'utf8').trim().split('\n').map(JSON.parse).filter((x) => x.ok).map((x) => [x.key.split('|')[1], x.scores]));
const S = { v1: load(f1), v2: load(f2) };
const swap = (l, sc) => (sc ? { ...l, analysis: { ...l.analysis, skills_assessment: l.analysis.skills_assessment.map((s) => (s.is_relevant === true && s.skill_id in sc ? { ...s, score: sc[s.skill_id] } : s)) } } : l);
const R = { A: score(lines), v1: score(lines.map((l) => swap(l, S.v1[`${l.id}#${l.rep}`]))), v2: score(lines.map((l) => swap(l, S.v2[`${l.id}#${l.rep}`]))) };
const rate = ([o, n]) => (n ? `${o}/${n}` : '—');
for (const b of ['high', 'needs_expert_review']) {
  console.log(`\n== ${b}: decision A ${rate(R.A[b].decision)} v1 ${rate(R.v1[b].decision)} v2 ${rate(R.v2[b].decision)} | constraints held A ${rate(R.A[b].constraints)} v1 ${rate(R.v1[b].constraints)} v2 ${rate(R.v2[b].constraints)}`);
  for (const sid of Object.keys(R.A[b].skills)) {
    const f = (k) => `${rate(R[k][b].skills[sid].score)} (exact ${rate(R[k][b].skills[sid].exact)})`;
    console.log(`  ${sid.padEnd(30)} score-in-allowed A ${f('A')} | v1 ${f('v1')} | v2 ${f('v2')}`);
  }
}
const viol = (X) => { const m = {}; for (const v of X.high.violations) for (const p of v.problems) if (/score|constraint/.test(p)) { const k = `${v.id}: ${p.replace(/score \d/, 'score')}`; m[k] = (m[k] || 0) + 1; } return m; };
const a = viol(R.v1), c = viol(R.v2);
console.log('\nscore/constraint violations new in v2 (vs v1):'); for (const [k, n] of Object.entries(c)) if (!a[k]) console.log('  ', k, '×', n);
console.log('violations fixed in v2 (vs v1):'); for (const [k, n] of Object.entries(a)) if (!c[k]) console.log('  ', k, '×', n);

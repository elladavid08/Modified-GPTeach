// Scores the FRESH decision-check set (fresh_decision_cases.json) on displayed rows (research only; content-free output).
//   node score_fresh.mjs <cases.json> <results.jsonl> [more results...]
// Results: regression-bench lines ({id, rep, ok, analysis}) after to_stage1_shape.mjs (the Stage-2 rows) or Stage-1 lines.
// Expectations: 'relevant' | 'not_relevant' | {score:n} (relevant with exactly n) | {max:n} (absent or <= n) | {min:n}.
// Only samples where Stage 1 shows feedback count: shown samples, and samples the final policy suppressed because no
// displayable row was left (to_stage1_shape.mjs `_stage2_suppressed`; they count as "no row", so every skill is not
// relevant). Gate per case: >= 6 such samples and >= 7/8 of them pass every expectation (cases with
// pending_team_confirmation are reported, not gated).
import { readFileSync } from 'node:fs';

const [casesPath, ...resultPaths] = process.argv.slice(2);
const { cases, skills } = JSON.parse(readFileSync(casesPath, 'utf8'));

function passes(exp, has, sc) {
  if (exp === 'relevant') return has;
  if (exp === 'not_relevant') return !has;
  if (exp && typeof exp === 'object' && 'score' in exp) return has && sc === exp.score;
  if (exp && typeof exp === 'object' && 'max' in exp) return !has || sc <= exp.max;
  if (exp && typeof exp === 'object' && 'min' in exp) return has && sc >= exp.min;
  throw new Error(`unknown expectation ${JSON.stringify(exp)}`);
}

for (const resultsPath of resultPaths) {
  const recs = readFileSync(resultsPath, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
  console.log(`\n### ${resultsPath.split('/').pop()}`);
  const groups = {};
  for (const c of cases) {
    const shown = recs.filter((r) => r.id === c.id && r.ok && r.analysis && (r.analysis.should_provide_feedback || r.analysis._stage2_suppressed));
    const supp = shown.filter((r) => r.analysis._stage2_suppressed).length;
    const per = {}; let allOk = 0; const seen = {};
    for (const r of shown) {
      const rel = r.analysis._stage2_suppressed ? new Map() : new Map((r.analysis.skills_assessment || []).filter((s) => s.is_relevant === true).map((s) => [s.skill_id, s.score]));
      let ok = true;
      for (const [k, exp] of Object.entries(c.expect)) {
        const sid = skills[k]; const has = rel.has(sid); const sc = rel.get(sid);
        const p = passes(exp, has, sc); per[k] = (per[k] || 0) + p; ok = ok && p;
        (seen[k] = seen[k] || []).push(has ? sc : '-');
      }
      allOk += ok;
    }
    // A case Stage 1 never shows cannot be gated: the teacher sees no feedback at all on it (reported as n/a).
    const gated = !c.pending_team_confirmation && shown.length > 0;
    const pass = shown.length >= 6 && allOk >= Math.ceil((7 / 8) * shown.length);
    const g = (groups[c.group] = groups[c.group] || { gated: 0, passed: 0 });
    if (gated) { g.gated++; g.passed += pass; }
    const fmt = Object.entries(c.expect).map(([k, e]) => `${k}${typeof e === 'object' ? JSON.stringify(e) : '=' + e} ${per[k] || 0}/${shown.length} [${(seen[k] || []).join('')}]`).join(' | ');
    console.log(`${c.id.padEnd(30)} shown ${shown.length}${supp ? ` (suppressed ${supp})` : ''} | ${fmt} | ${gated ? (pass ? 'PASS' : 'FAIL') : shown.length ? 'pending' : 'n/a (never shown)'}`);
  }
  console.log('gates by group:', JSON.stringify(groups));
}

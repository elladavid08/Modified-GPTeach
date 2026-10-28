// Scores PCK regression-case replays (research only). Content-free output: pass rates per case and expectation.
//   node research/simulator_audit/pck_eval/x11/score_regression.mjs <cases.json> <results.jsonl> [more results...]
// Expectations per skill: 'relevant' | 'not_relevant' | {max:n} | {min:n}; 'contract': every shown row carries its
// score's required text under the 1.5.0 display rule (score 2 positive; 1 positive AND improvement; 0 improvement).
import { readFileSync } from 'node:fs';

const [casesPath, ...resultPaths] = process.argv.slice(2);
const { cases, skills } = JSON.parse(readFileSync(casesPath, 'utf8'));
const nonEmpty = (s) => typeof s === 'string' && s.trim() !== '';

function rowsOf(a) {
  if (!a.should_provide_feedback) return [];
  return (a.skills_assessment || []).filter((s) => s.is_relevant === true).map((s) => {
    const dem = (a.demonstrated_skills || []).filter((d) => d.skill_id === s.skill_id);
    const pos = nonEmpty(s.evidence) || (dem.length === 1 && nonEmpty(dem[0].evidence));
    const imp = nonEmpty(s.what_could_be_better);
    const ok = s.score === 2 ? pos : s.score === 1 ? pos && imp : imp;
    return { skill: s.skill_id, score: s.score, ok };
  });
}

for (const resultsPath of resultPaths) {
  const recs = readFileSync(resultsPath, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
  console.log(`\n### ${resultsPath.split('/').pop()}`);
  for (const c of cases) {
    const rs = recs.filter((r) => r.id === c.id);
    const ok = rs.filter((r) => r.ok);
    const tally = {}; const scores = {};
    const shown = ok.filter((r) => r.analysis.should_provide_feedback).length;
    for (const r of ok) {
      const rows = rowsOf(r.analysis); const rel = new Map(rows.map((x) => [x.skill, x.score]));
      for (const [k, exp] of Object.entries(c.expect)) {
        let pass;
        if (k === 'contract') pass = rows.every((x) => x.ok);
        else {
          const sid = skills[k]; const has = rel.has(sid); const sc = rel.get(sid);
          if (exp === 'relevant') pass = has;
          else if (exp === 'not_relevant') pass = !has;
          else if (typeof exp === 'object' && 'max' in exp) pass = !has || sc <= exp.max;
          else if (typeof exp === 'object' && 'min' in exp) pass = has && sc >= exp.min;
          (scores[k] = scores[k] || []).push(has ? sc : '-');
        }
        tally[k] = (tally[k] || 0) + (pass ? 1 : 0);
      }
    }
    const fmt = Object.entries(c.expect).map(([k, e]) => `${k}${typeof e === 'object' ? JSON.stringify(e) : e === true ? '' : '=' + e} ${tally[k] || 0}/${ok.length}${scores[k] ? ' [' + scores[k].join('') + ']' : ''}`).join(' | ');
    console.log(`${c.id.padEnd(22)} n ${ok.length}/${rs.length} shown ${shown} | ${fmt}`);
  }
}

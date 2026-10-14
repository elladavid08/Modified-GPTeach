// Scores PCK outputs against the frozen benchmark labels. Research only.
// Usage: node research/simulator_audit/pck_eval/score.js <results.jsonl> [--json out.json]
// A results line: { id, rep, ok, analysis } where analysis is the /api/pck-feedback analysis as returned to the client.
// Components are reported separately (B200 lesson: never collapse them), per confidence bucket.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const bench = JSON.parse(readFileSync(path.join(HERE, 'pck_eval_benchmark.json'), 'utf8'));
const CASES = Object.fromEntries(bench.cases.map((c) => [c.id, c]));
const SKILLS = bench.skills;
const SHORT = { 'error-identification': 'EI', 'error-characterization': 'EC', 'diagnostic-interpretation': 'DI', 'adapted-pedagogical-response': 'APR', 'error-leveraging': 'EL' };

/** One output vs its case: content-free verdicts. */
export function judge(c, analysis) {
  const e = c.expected;
  const shown = !!analysis.should_provide_feedback;
  const rel = new Map((analysis.skills_assessment || []).filter((s) => s && s.is_relevant === true).map((s) => [s.skill_id, s.score]));
  const v = { shown, nRelevant: rel.size, decision: null, skills: {}, constraints: [], consistency: shown === (rel.size > 0) };
  if (e.should_provide_feedback !== null) v.decision = shown === e.should_provide_feedback;
  for (const sid of SKILLS) {
    const x = e.skills[sid];
    const isRel = rel.has(sid);
    const score = rel.get(sid);
    const r = { relevance: null, score: null };
    if (x.relevance === 'required') r.relevance = isRel;
    if (x.relevance === 'not_relevant') r.relevance = !isRel;
    if (x.scores && isRel) r.score = x.scores.includes(score);
    v.skills[sid] = r;
  }
  const scores = [...rel.values()];
  // Displayed view: only rows of shown feedback count (what the teacher sees today; B27 hides rows of suppressed feedback).
  v.displayedOverSelected = SKILLS.filter((sid) => e.skills[sid].relevance === 'not_relevant' && shown && rel.has(sid)).length;
  v.displayedNotRelevantChecks = shown ? SKILLS.filter((sid) => e.skills[sid].relevance === 'not_relevant').length : 0;
  if (e.constraints.includes('no_score_2') && scores.includes(2)) v.constraints.push('no_score_2');
  for (const k of e.constraints) {
    const m = k.match(/^no_repeat_praise:(.+)$/);
    if (m && shown && rel.has(m[1]) && rel.get(m[1]) > 0) v.constraints.push(k); // judged on displayed rows only
  }
  if (e.constraints.includes('no_positive_score') && scores.some((s) => s > 0)) v.constraints.push('no_positive_score');
  return v;
}

const rate = (ok, n) => (n ? `${ok}/${n} (${((100 * ok) / n).toFixed(1)}%)` : '—');

export function score(lines) {
  const out = {};
  for (const bucket of ['high', 'needs_expert_review']) {
    const b = { outputs: 0, failed: 0, displayedNotRelevant: [0, 0], hiddenWithRelevant: 0, decision: [0, 0], fp: [0, 0], fn: [0, 0], consistency: [0, 0], constraints: [0, 0], skills: {}, byTag: {}, byRule: {}, violations: [] };
    for (const sid of SKILLS) b.skills[sid] = { required: [0, 0], notRelevant: [0, 0], score: [0, 0], exact: [0, 0] };
    for (const l of lines) {
      const c = CASES[l.id];
      if (!c || c.confidence !== bucket) continue;
      b.outputs++;
      if (!l.ok) { b.failed++; continue; }
      const v = judge(c, l.analysis);
      const bad = [];
      b.consistency[1]++; b.consistency[0] += v.consistency;
      b.displayedNotRelevant[1] += v.displayedNotRelevantChecks; b.displayedNotRelevant[0] += v.displayedNotRelevantChecks - v.displayedOverSelected;
      if (!v.shown && v.nRelevant > 0) b.hiddenWithRelevant++;
      if (v.decision !== null) {
        b.decision[1]++; b.decision[0] += v.decision;
        if (c.expected.should_provide_feedback === false) { b.fp[1]++; b.fp[0] += v.shown; }
        if (c.expected.should_provide_feedback === true) { b.fn[1]++; b.fn[0] += !v.shown; }
        if (!v.decision) bad.push(`decision ${v.shown ? 'shown' : 'hidden'}`);
        for (const t of [...c.tags, ...c.rules.map((r) => `rule:${r}`)]) {
          const m = t.startsWith('rule:') ? b.byRule : b.byTag; const k = t.replace('rule:', '');
          m[k] = m[k] || [0, 0]; m[k][1]++; m[k][0] += v.decision;
        }
      }
      if (c.expected.constraints.length) { b.constraints[1]++; b.constraints[0] += v.constraints.length === 0; v.constraints.forEach((k) => bad.push(`constraint ${k}`)); }
      for (const sid of SKILLS) {
        const x = c.expected.skills[sid]; const r = v.skills[sid]; const s = b.skills[sid];
        if (x.relevance === 'required') { s.required[1]++; s.required[0] += r.relevance; if (!r.relevance) bad.push(`${SHORT[sid]} missing`); }
        if (x.relevance === 'not_relevant') { s.notRelevant[1]++; s.notRelevant[0] += r.relevance; if (!r.relevance) bad.push(`${SHORT[sid]} over-selected`); }
        if (r.score !== null) {
          s.score[1]++; s.score[0] += r.score;
          if (x.scores.length === 1) { s.exact[1]++; s.exact[0] += r.score; }
          if (!r.score) bad.push(`${SHORT[sid]} score ${(l.analysis.skills_assessment || []).find((z) => z.skill_id === sid && z.is_relevant === true).score} not in [${x.scores}]`);
        }
      }
      if (bad.length) b.violations.push({ id: l.id, rep: l.rep, problems: bad });
    }
    out[bucket] = b;
  }
  return out;
}

function report(res) {
  for (const [bucket, b] of Object.entries(res)) {
    console.log(`\n=== ${bucket}: ${b.outputs} outputs (${b.failed} failed)`);
    console.log(`decision agreement        ${rate(...b.decision)}`);
    console.log(`  false positives (expected no feedback, shown)   ${rate(...b.fp)}`);
    console.log(`  false negatives (expected feedback, hidden)     ${rate(...b.fn)}`);
    console.log(`decision == any(relevant) ${rate(...b.consistency)}  (hidden outputs that still mark a skill relevant: ${b.hiddenWithRelevant})`);
    console.log(`not-relevant respected on displayed rows only (all skills) ${rate(...b.displayedNotRelevant)}`);
    console.log(`case constraints held     ${rate(...b.constraints)}`);
    console.log('skill  required-relevant     not-relevant-respected   score-in-allowed   score-exact   (raw skills_assessment, shown or hidden)');
    for (const [sid, s] of Object.entries(b.skills)) console.log(`${SHORT[sid].padEnd(5)}  ${rate(...s.required).padEnd(22)} ${rate(...s.notRelevant).padEnd(24)} ${rate(...s.score).padEnd(18)} ${rate(...s.exact)}`);
    console.log('decision agreement by tag:', Object.entries(b.byTag).sort().map(([k, [o, n]]) => `${k} ${o}/${n}`).join(' | '));
    console.log('decision agreement by rule:', Object.entries(b.byRule).sort().map(([k, [o, n]]) => `${k} ${o}/${n}`).join(' | '));
    const perCase = {};
    for (const x of b.violations) for (const p of x.problems) { const k = `${x.id}: ${p}`; perCase[k] = (perCase[k] || 0) + 1; }
    console.log('violations (case: problem ×outputs):');
    for (const [k, n] of Object.entries(perCase).sort((a, z) => z[1] - a[1])) console.log(`  ${k} ×${n}`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const file = process.argv[2];
  if (!file) { console.error('usage: node score.js <results.jsonl> [--json out.json]'); process.exit(2); }
  const lines = readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
  const unknown = lines.filter((l) => !CASES[l.id]).length;
  if (unknown) console.error(`warning: ${unknown} lines with unknown case ids`);
  const res = score(lines);
  report(res);
  const j = process.argv.indexOf('--json');
  if (j > 0) writeFileSync(process.argv[j + 1], JSON.stringify(res, null, 1));
}

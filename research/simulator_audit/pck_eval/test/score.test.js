// Scorer self-tests with hand-made outputs (no model calls).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { judge, score } from '../score.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const bench = JSON.parse(readFileSync(path.join(HERE, '..', 'pck_eval_benchmark.json'), 'utf8'));
const byId = Object.fromEntries(bench.cases.map((c) => [c.id, c]));
const row = (skill_id, score) => ({ skill_id, is_relevant: true, score });

/** An output that satisfies a case: required skills relevant with their first allowed score (0 if unconstrained). */
function ideal(c) {
  const rows = Object.entries(c.expected.skills).filter(([, s]) => s.relevance === 'required').map(([id, s]) => row(id, s.scores ? s.scores[0] : 0));
  const shown = c.expected.should_provide_feedback === null ? rows.length > 0 : c.expected.should_provide_feedback;
  return { should_provide_feedback: shown, skills_assessment: shown ? rows : [] };
}

test('an output built from the labels passes every high-confidence case', () => {
  const lines = bench.cases.filter((c) => c.confidence === 'high').map((c) => ({ id: c.id, rep: 0, ok: true, analysis: ideal(c) }));
  const r = score(lines).high;
  assert.equal(r.violations.length, 0, JSON.stringify(r.violations.slice(0, 3)));
  assert.equal(r.decision[0], r.decision[1]);
});

test('over-selection, a missing required skill, a wrong score and constraint breaches are reported', () => {
  const c = byId['EC-identifies-only-s6']; // EI required 2, EC not relevant
  const v = judge(c, { should_provide_feedback: true, skills_assessment: [row('error-identification', 1), row('error-characterization', 0)] });
  assert.equal(v.skills['error-identification'].relevance, true);
  assert.equal(v.skills['error-identification'].score, false);
  assert.equal(v.skills['error-characterization'].relevance, false);
  const d = byId['deferral-only-s5-T4']; // no_score_2, EL not relevant
  const w = judge(d, { should_provide_feedback: true, skills_assessment: [row('adapted-pedagogical-response', 2), row('error-leveraging', 1)] });
  assert.deepEqual(w.constraints, ['no_score_2']);
  assert.equal(w.skills['error-leveraging'].relevance, false);
  assert.equal(w.decision, null); // decision not asserted for this case
});

test('a hidden output on a no-feedback control agrees; a shown one is a false positive', () => {
  const c = byId['ctl-question-s1-r1d0-T9'];
  assert.equal(judge(c, { should_provide_feedback: false, skills_assessment: [] }).decision, true);
  const res = score([{ id: c.id, rep: 0, ok: true, analysis: { should_provide_feedback: true, skills_assessment: [row('adapted-pedagogical-response', 2)] } }]).high;
  assert.deepEqual(res.fp, [1, 1]);
});

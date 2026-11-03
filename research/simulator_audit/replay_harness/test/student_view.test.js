// A1i student data contract (pck_eval/x12/student_view.cjs): Stage-2 rows are the only source of current-turn quality
// statements the students receive; the previously evaluated adapter is audited as the contrast. Synthetic fixtures.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { studentPckView, auditStudentInput, capReaction } = require('../../pck_eval/x12/student_view.cjs');
const { adaptImpact, signalFromRows } = require('../../pck_eval/x12/stage2_dep.cjs');

const stage1 = {
  pedagogical_quality: 'positive', addressed_misconception: true, how_addressed: 'S1-HOW', misconception_risk: 'low',
  demonstrated_skills: [{ skill_id: 'diagnostic-interpretation', evidence: 'S1-EVIDENCE' }], missed_opportunities: [],
  predicted_student_state: { understanding_level: 'improved', response_tone: 'confident', who_should_respond: ['A'],
    likely_reactions: ['S1-LIKELY'], student_reaction_hints: [
      { student: 'A', reaction_type: 'understanding_progress', likelihood: 'high', reason: 'S1-REASON' },
      { student: 'B', reaction_type: 'reinforced_acceptance', likelihood: 'low', reason: 'S1-REASON2' }] },
  feedback_message_hebrew: 'S1-MESSAGE', skills_assessment: [{ skill_id: 'diagnostic-interpretation', is_relevant: true, score: 2 }],
};
const row = (skillId, score) => ({ skillId, score, positive: score >= 1 ? `POS-${skillId}` : null, improvement: score <= 1 ? `IMP-${skillId}` : null });
const partialRows = [row('error-identification', 1), row('diagnostic-interpretation', 0)];
const clean = (a) => Object.entries(a).filter(([, v]) => v).map(([k]) => k);

test('partial: lists projected from the rows; no Stage-1 assessment text; nothing above the signal', () => {
  const sig = signalFromRows(partialRows);
  assert.equal(sig, 'partial');
  const v = studentPckView(stage1, partialRows, sig);
  assert.deepEqual(v.demonstrated_skills, [{ skill_id: 'error-identification', evidence: 'POS-error-identification' }]);
  assert.deepEqual(v.missed_opportunities, [{ skill_id: 'diagnostic-interpretation', what_could_have_been_done: 'IMP-diagnostic-interpretation' }]);
  assert.equal(v.pedagogical_quality, 'neutral');
  assert.equal(v.addressed_misconception, false);
  assert.equal(v.how_addressed, '');
  assert.equal(v.predicted_student_state.understanding_level, 'same');
  assert.deepEqual(v.predicted_student_state.student_reaction_hints, [
    { student: 'A', reaction_type: 'partial_understanding', likelihood: 'high' },
    { student: 'B', reaction_type: 'reinforced_acceptance', likelihood: 'low' }]);
  assert.deepEqual(v.predicted_student_state.likely_reactions, []);
  assert.equal(v.predicted_student_state.response_tone, 'confident'); // context kept
  assert.equal(v.misconception_risk, 'low'); // context kept
  assert.deepEqual(clean(auditStudentInput(v, partialRows, sig)), []);
  assert.ok(!JSON.stringify([v.demonstrated_skills, v.missed_opportunities, v.how_addressed, v.predicted_student_state]).includes('S1-'));
});

test('the previously evaluated adapter carries the contradictions the contract removes', () => {
  const a = adaptImpact(stage1, 'partial');
  assert.deepEqual(clean(auditStudentInput(a, partialRows, 'partial')).sort(),
    ['demonstratedButScore0', 'listTextNotFromRows', 'notAddressedWithDescription', 'stage1HintReason', 'stage1LikelyReactions'].sort());
});

test('none: Stage 1 may only make the level more negative', () => {
  const rows = [row('error-identification', 0)];
  const v = studentPckView({ ...stage1, pedagogical_quality: 'problematic', predicted_student_state: { ...stage1.predicted_student_state, understanding_level: 'misconception_reinforced' } }, rows, 'none');
  assert.equal(v.pedagogical_quality, 'problematic');
  assert.equal(v.predicted_student_state.understanding_level, 'misconception_reinforced');
  const w = studentPckView(stage1, rows, 'none');
  assert.equal(w.pedagogical_quality, 'neutral');
  assert.equal(w.predicted_student_state.understanding_level, 'same');
  assert.deepEqual(w.predicted_student_state.student_reaction_hints.map((h) => h.reaction_type), ['persistent_confusion', 'reinforced_acceptance']);
  assert.deepEqual(clean(auditStudentInput(w, rows, 'none')), []);
});

test('strong: positive / improved; Stage-1 addressed kept only as true-or-false context; lower hint types kept', () => {
  const rows = [row('adapted-pedagogical-response', 2)];
  const v = studentPckView(stage1, rows, 'strong');
  assert.equal(v.pedagogical_quality, 'positive');
  assert.equal(v.predicted_student_state.understanding_level, 'improved');
  assert.equal(v.addressed_misconception, true);
  assert.equal(v.how_addressed, 'S1-HOW');
  assert.deepEqual(v.predicted_student_state.student_reaction_hints.map((h) => h.reaction_type), ['understanding_progress', 'reinforced_acceptance']);
  assert.equal(studentPckView({ ...stage1, addressed_misconception: false }, rows, 'strong').how_addressed, '');
  assert.equal(capReaction('some_new_type', 'partial'), 'partial_understanding');
});

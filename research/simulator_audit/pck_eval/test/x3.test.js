// Self-tests for the offline X3 candidate (research only; no model calls).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, deriveLists, contradictions } from '../x3/x3_consistency.js';

const deepFreeze = (o) => { Object.values(o).forEach((v) => v && typeof v === 'object' && deepFreeze(v)); return Object.freeze(o); };
const row = (skill_id, score, extra = {}) => ({ skill_id, is_relevant: true, score, ...extra });
const praise = deepFreeze({
  should_provide_feedback: true, pedagogical_quality: 'positive', feedback_trigger: 'excellent_pck_use',
  skills_assessment: [row('adapted-pedagogical-response', 2), { skill_id: 'error-leveraging', is_relevant: false }],
  demonstrated_skills: [{ skill_id: 'adapted-pedagogical-response', evidence: 'E' }], missed_opportunities: [],
});

test('never mutates the analysis and never touches skills_assessment (scores, relevance)', () => {
  for (const decision of ['model', 'and', 'derived']) {
    const n = normalize(praise, 'בואו נבדוק', { decision, lists: true, cap: 2 });
    assert.deepEqual(n.analysis.skills_assessment, praise.skills_assessment);
  }
});

test('the bare-acknowledgement guard stays the final display policy under every decision rule', () => {
  for (const decision of ['model', 'and', 'derived']) {
    for (const ack of ['אוקיי', ' יפה ', 'נכון']) assert.equal(normalize(praise, ack, { decision }).display.shown, false, `${decision} ${ack}`);
  }
  const missedEI = deepFreeze({ ...praise, pedagogical_quality: 'problematic', skills_assessment: [row('error-identification', 0)], demonstrated_skills: [] });
  assert.equal(normalize(missedEI, 'אוקיי', { decision: 'and' }).display.shown, true);
});

test('decision AND relevant never turns hidden feedback into shown; derived would', () => {
  const hiddenWithSkills = deepFreeze({ ...praise, should_provide_feedback: false });
  assert.equal(normalize(hiddenWithSkills, 'בואו נבדוק', { decision: 'and' }).display.shown, false);
  assert.equal(normalize(hiddenWithSkills, 'בואו נבדוק', { decision: 'derived' }).display.shown, true);
  const shownEmpty = deepFreeze({ ...praise, skills_assessment: [] });
  assert.equal(normalize(shownEmpty, 'בואו נבדוק', { decision: 'and' }).display.shown, false);
  assert.ok(contradictions(shownEmpty).includes('shown_without_relevant_skill'));
});

test('derived lists follow the prompt contract: demonstrated = relevant & score >= 1, missed = relevant & score 0; text only reused by exact id', () => {
  const a = deepFreeze({ skills_assessment: [row('error-identification', 0, { what_could_be_better: 'W' }), row('adapted-pedagogical-response', 1), row('error-leveraging', 2)],
    demonstrated_skills: [{ skill_id: 'error-leveraging', evidence: 'EL-TEXT' }, { skill_id: 'diagnostic-interpretation', evidence: 'NOT-RELEVANT' }], missed_opportunities: [] });
  assert.deepEqual(deriveLists(a), {
    demonstrated_skills: [{ skill_id: 'adapted-pedagogical-response', evidence: '' }, { skill_id: 'error-leveraging', evidence: 'EL-TEXT' }],
    missed_opportunities: [{ skill_id: 'error-identification', what_could_have_been_done: 'W' }],
  });
});

test('the cap keeps at most N rows in skill-chain order', () => {
  const three = deepFreeze({ ...praise, skills_assessment: [row('error-leveraging', 2, { evidence: 'a' }), row('error-identification', 2, { evidence: 'b' }), row('adapted-pedagogical-response', 1, { evidence: 'c' })] });
  assert.deepEqual(normalize(three, 'x', { cap: 2 }).display.rows.map((r) => r.skillId), ['error-identification', 'adapted-pedagogical-response']);
});

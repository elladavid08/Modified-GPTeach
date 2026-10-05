// C10: the real-time PCK output contract (schema for Gemini JSON mode + parser + validator).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PCK_RESPONSE_SCHEMA,
  parsePckModelText,
  validatePckAnalysis,
} from '../pck_feedback_contract.js';
import { VALID_ANALYSIS, NO_FEEDBACK_ANALYSIS, MALFORMED_OUTPUTS } from '../test-support/pckFixtures.mjs';

const contract = JSON.parse(
  readFileSync(new URL('../../src/testUtils/contracts/pckSkillsContract.json', import.meta.url), 'utf8'),
);

test('response schema covers the production contract with enumerated skill ids', () => {
  const s = PCK_RESPONSE_SCHEMA;
  assert.equal(s.type, 'object');
  for (const key of [
    'pedagogical_quality', 'predicted_student_state', 'addressed_misconception', 'how_addressed',
    'misconception_risk', 'demonstrated_skills', 'missed_opportunities', 'should_provide_feedback',
    'feedback_trigger', 'skills_assessment', 'feedback_message_hebrew',
  ]) {
    assert.ok(s.properties[key], `schema property ${key}`);
    assert.ok(s.required.includes(key), `schema requires ${key}`);
  }
  const skill = s.properties.skills_assessment.items;
  assert.deepEqual([...skill.properties.skill_id.enum].sort(), contract.skills.map((x) => x.skill_id).sort());
  assert.equal(skill.properties.score.type, 'integer');
  assert.deepEqual([...skill.required].sort(), ['is_relevant', 'skill_id']);
  assert.equal(s.properties.feedback_trigger.nullable, true);
  assert.equal(s.properties.should_provide_feedback.type, 'boolean');
});

test('valid analyses parse and validate with no problems', () => {
  for (const value of [VALID_ANALYSIS, NO_FEEDBACK_ANALYSIS]) {
    const parsed = parsePckModelText(JSON.stringify(value));
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.value, value);
    assert.deepEqual(validatePckAnalysis(parsed.value), []);
  }
});

test('a whole-output ```json fence around valid JSON is accepted (lossless)', () => {
  const parsed = parsePckModelText('```json\n' + JSON.stringify(VALID_ANALYSIS) + '\n```');
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.value, VALID_ANALYSIS);
});

test('optional per-skill text fields may be omitted or null', () => {
  const v = JSON.parse(JSON.stringify(VALID_ANALYSIS));
  v.skills_assessment[0].what_could_be_better = null;
  delete v.skills_assessment[3].reason_not_relevant;
  assert.deepEqual(validatePckAnalysis(v), []);
});

for (const [label, raw, kind] of MALFORMED_OUTPUTS) {
  test(`malformed output is rejected: ${label}`, () => {
    const parsed = parsePckModelText(raw);
    if (kind === 'parse') {
      assert.equal(parsed.ok, false, 'must not parse');
      return;
    }
    assert.equal(parsed.ok, true, 'expected to parse as JSON');
    const problems = validatePckAnalysis(parsed.value);
    assert.ok(problems.length > 0, 'expected validation problems');
    problems.forEach((p) => assert.equal(typeof p, 'string'));
  });
}

// X9 Stage-2 scoring prototype: prompt / schema / validation and fallback rules (no model calls). Research only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const S2 = require('../x9/stage2.cjs');

const ids = ['error-identification', 'adapted-pedagogical-response'];
const ok = (rows) => JSON.stringify({ skill_scores: rows });

test('accepts exactly one integer 0/1/2 score per supplied skill', () => {
  assert.deepEqual(S2.validate(ok([{ skill_id: ids[0], score: 0 }, { skill_id: ids[1], score: 1 }]), ids), { ok: true, scores: { [ids[0]]: 0, [ids[1]]: 1 } });
});

test('rejects (so Stage 1 scores are kept) every malformed or mismatched answer', () => {
  const cases = [
    ['not json', 'not_json'],
    ['praise first {"skill_scores": []}', 'not_json'],
    [ok([{ skill_id: ids[0], score: 0 }]), 'missing_skill'],
    [ok([{ skill_id: ids[0], score: 0 }, { skill_id: ids[1], score: 1 }, { skill_id: 'error-leveraging', score: 2 }]), 'unrequested_skill'],
    [ok([{ skill_id: ids[0], score: 0 }, { skill_id: ids[0], score: 1 }]), 'duplicate_skill'],
    [ok([{ skill_id: 'made-up', score: 1 }, { skill_id: ids[1], score: 1 }]), 'invalid_skill_id'],
    [ok([{ skill_id: ids[0], score: 3 }, { skill_id: ids[1], score: 1 }]), 'invalid_score'],
    [ok([{ skill_id: ids[0], score: 1.5 }, { skill_id: ids[1], score: 1 }]), 'invalid_score'],
    [ok([{ skill_id: ids[0], score: '1' }, { skill_id: ids[1], score: 1 }]), 'invalid_score'],
    [ok([{ skill_id: ids[0], score: 1, is_relevant: true }, { skill_id: ids[1], score: 1 }]), 'extra_row_fields'],
    [JSON.stringify({ skill_scores: [{ skill_id: ids[0], score: 1 }, { skill_id: ids[1], score: 1 }], should_provide_feedback: true }), 'extra_fields'],
  ];
  for (const [text, reason] of cases) assert.deepEqual(S2.validate(text, ids), { ok: false, reason }, text);
});

test('schema is score-only and score-first; prompt lists exactly the supplied skills and no decision fields', () => {
  const s = S2.buildSchema(ids);
  assert.deepEqual(Object.keys(s.properties), ['skill_scores']);
  assert.deepEqual(s.properties.skill_scores.items.propertyOrdering, ['skill_id', 'score']);
  assert.deepEqual(s.properties.skill_scores.items.properties.skill_id.enum, ids);
  const p = S2.buildPrompt({ lesson: 'L', history: 'H', teacher: 'T' }, ids);
  for (const id of ids) assert.ok(p.includes(`- ${id}\n`));
  assert.ok(!p.includes('- error-leveraging\n'));
  assert.ok(!/should_provide_feedback|is_relevant|pedagogical_quality|demonstrated_skills/.test(p));
});

test('context comes verbatim from the Stage-1 prompt sections', () => {
  const stage1 = 'intro\n\n## Lesson Context\nLESSON\n\n## Universal PCK Skills to Assess\nX\n\n## Conversation History (Hebrew)\nמורה: א\nנועה: ב\n\n## Teacher\'s Latest Message to Analyze\n"מה דעתך?"\n\n---\n\n## Your Task';
  assert.deepEqual(S2.extractContext(stage1), { lesson: 'LESSON', history: 'מורה: א\nנועה: ב', teacher: 'מה דעתך?' });
  assert.equal(S2.extractContext('no sections'), null);
});

// Invariants A5 (skill ids + 0/1/2 scale) and the shared history format used by the PCK prompt.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  getAllPCKSkills,
  getPCKSkillById,
  formatSkillsForPrompt,
  formatConversationHistory,
} from '../universal_pck_skills.js';

const contract = JSON.parse(
  readFileSync(new URL('../../src/testUtils/contracts/pckSkillsContract.json', import.meta.url), 'utf8'),
);
const CONTRACT_IDS = contract.skills.map((s) => s.skill_id);

// Exact set of ids; order is not protected (no code depends on the array order: the prompt's
// skill chain is written out explicitly, and research maps ids, not positions, to p1-p5).
test('taxonomy defines exactly the five contract skill ids (as a set)', () => {
  const ids = getAllPCKSkills().map((s) => s.skill_id);
  assert.equal(ids.length, new Set(ids).size, 'no duplicate ids');
  assert.deepEqual([...ids].sort(), [...CONTRACT_IDS].sort());
});

test('Hebrew skill names match the contract', () => {
  for (const { skill_id, he } of contract.skills) {
    assert.equal(getPCKSkillById(skill_id).skill_name.he, he, skill_id);
  }
});

test('every skill has a 0/1/2 rubric and no other score bands', () => {
  for (const skill of getAllPCKSkills()) {
    assert.deepEqual(Object.keys(skill.scoring_rubric).sort(), ['score_0', 'score_1', 'score_2'], skill.skill_id);
    for (const band of Object.values(skill.scoring_rubric)) {
      assert.ok(band.label && band.description, `${skill.skill_id} band missing label/description`);
      assert.ok(Array.isArray(band.hebrew_patterns) && band.hebrew_patterns.length > 0);
    }
  }
});

test('getPCKSkillById returns null for unknown ids', () => {
  assert.equal(getPCKSkillById('not-a-skill'), null);
});

test('formatSkillsForPrompt mentions every skill id and all three score bands', () => {
  const text = formatSkillsForPrompt();
  for (const id of CONTRACT_IDS) assert.ok(text.includes(id), id);
  for (const s of contract.scores) assert.ok(text.includes(`Score ${s}`), `Score ${s}`);
});

test('formatConversationHistory labels teacher as מורה and students by name', () => {
  const text = formatConversationHistory([
    { role: 'user', name: 'Teacher', text: 'מה ההגדרה של מלבן?' },
    { role: 'assistant', name: 'נועה', text: 'מרובע עם ארבע זוויות ישרות' },
  ]);
  assert.equal(text, 'מורה: מה ההגדרה של מלבן?\nנועה: מרובע עם ארבע זוויות ישרות');
});

test('formatConversationHistory has an explicit empty-history marker', () => {
  assert.ok(formatConversationHistory([]).length > 0);
  assert.equal(formatConversationHistory([]), formatConversationHistory(undefined));
});

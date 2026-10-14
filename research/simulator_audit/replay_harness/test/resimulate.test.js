// Re-simulating the deterministic Mode B teacher over a recorded conversation (no model calls).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCENARIOS } from '../config/scenarios.js';
import { teacherTurnB, createTeacherState } from '../lib/teacher.js';
import { resimulateTeacher } from '../lib/resimulate.js';

function record(scenarioId, cast, repliesPerTurn) {
  const plan = SCENARIOS.find((s) => s.id === scenarioId);
  const state = createTeacherState();
  let prev = [];
  return { conversationId: 'x', mode: 'B', scenarioId, cast, turns: plan.turns.map((step, i) => {
    const t = teacherTurnB(plan, i, cast, prev, state);
    prev = (repliesPerTurn[i + 1] || []).map(([student, message]) => ({ student, message }));
    return { turn: i + 1, teacher: t.text, replies: prev };
  }) };
}

test('a conversation recorded with the current teacher re-simulates without differences', () => {
  const conv = record(2, ['תמר', 'הילה', 'עדי'], { 2: [['תמר', 'כן, אם האלכסונים מאונכים זה תמיד מעוין.']], 5: [['הילה', 'אז מה כן מספיק?']] });
  assert.deepEqual(resimulateTeacher(conv), []);
});

test('a teacher turn that the current logic would phrase differently is reported', () => {
  const conv = record(2, ['תמר', 'הילה', 'עדי'], { 2: [['תמר', 'כן, אם האלכסונים מאונכים זה תמיד מעוין.']] });
  conv.turns[2].teacher = 'יפה'; // as if recorded by a version that did not neutralize the validation
  assert.deepEqual(resimulateTeacher(conv).map((d) => [d.turn, d.recorded, d.current]), [[3, 'יפה', 'אוקיי']]);
});

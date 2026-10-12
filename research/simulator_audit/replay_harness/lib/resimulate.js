// Re-simulate the deterministic Mode B teacher over a recorded conversation, given the recorded student
// replies, and report every teacher turn the current logic would phrase differently. An empty result
// means the conversation is valid under the current HARNESS_VERSION's teacher (labels can be recomputed);
// otherwise it must be rerun.
import { SCENARIOS } from '../config/scenarios.js';
import { teacherTurnB, createTeacherState } from './teacher.js';

export function resimulateTeacher(conv) {
  const plan = SCENARIOS.find((s) => s.id === conv.scenarioId);
  const state = createTeacherState();
  const diffs = [];
  let prev = [];
  conv.turns.forEach((t, i) => {
    const current = teacherTurnB(plan, i, conv.cast, prev, state).text;
    if (current !== t.teacher) diffs.push({ turn: t.turn, recorded: t.teacher, current });
    prev = t.replies;
  });
  return diffs;
}

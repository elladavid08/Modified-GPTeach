// Misconception state for the carrier prototype pc1 (research only, 2026-10-14).
//
// The student prompt must not decide by itself whether the teacher has "addressed" the carrier's misconception:
// PCK's addressed_misconception / positive / improved were true on 36 of 36 diagnostic questions (the original bug),
// and the student model treated a good question as teaching. pc1 therefore keeps an explicit session state
//   'open'      - the teacher has not yet addressed it (initial state)
//   'addressed' - the teacher has addressed it (sticky: it never goes back to 'open')
// The transition is decided by this one-word classifier over the teacher's latest message, run once per teacher turn
// while the state is 'open' (and not after). It only needs the teacher's message and the scenario misconception, so in
// production it could run in parallel with the PCK call. Here it uses the server's existing /api/completion endpoint
// (gemini-3.1-flash-lite, MINIMAL thinking); no production code is changed.
//
// Same principle as the carrier rule: a good diagnostic question is not teaching.

export function addressedJudgePrompt(misconception, teacherMessage) {
  return `You classify one move by a geometry teacher in a class discussion.
One student in the class holds this misconception: "${misconception}"

The teacher's latest message:
"${teacherMessage}"

Does this message itself address the misconception mathematically?
ADDRESSED - the teacher explains why the idea is wrong or what is actually true, presents or draws a counterexample (even phrased as a question, e.g. "and what about a kite?"), leads the class through checking the idea against the definition, or explicitly confirms a correct argument against the idea.
NOT_ADDRESSED - the teacher only asks for an answer or an opinion, asks students to explain their thinking, asks whether everyone agrees, acknowledges, praises, greets, closes, or moves on, without saying anything about the mathematics of this idea.

Answer with exactly one word: ADDRESSED or NOT_ADDRESSED.`;
}

/** true / false, or null if the reply is not one of the two labels. */
export function parseAddressedJudge(text) {
  const t = String(text || '').trim().toUpperCase();
  if (/^NOT[_ ]ADDRESSED\b/.test(t)) return false;
  if (/^ADDRESSED\b/.test(t)) return true;
  return null;
}

/**
 * Next state. `judge(prompt)` returns the model text. A judge failure or an unparseable reply keeps the state
 * 'open' (conservative: the peers keep their pre-teaching role one more turn; the carrier rule is unaffected).
 */
export async function nextMisconceptionState(state, misconception, teacherMessage, judge) {
  if (state === 'addressed') return { state, judged: false };
  if (!String(teacherMessage || '').trim()) return { state, judged: false };
  let raw = null;
  try {
    raw = await judge(addressedJudgePrompt(misconception, teacherMessage));
  } catch (e) {
    return { state, judged: true, error: String(e.message || e).slice(0, 120) };
  }
  const verdict = parseAddressedJudge(raw);
  return { state: verdict === true ? 'addressed' : state, judged: true, verdict, raw: String(raw || '').trim().slice(0, 40) };
}

// Turn-flow details mirrored from src/pages/Chat.jsx (teacher-initiated scenarios; all six are).
// test/isolation.test.js fails if Chat.jsx's text drifts from this copy.

/** Chat.jsx addendum for the first student response to the teacher's opening message. */
export function firstTurnAddendum(scenario) {
  return `\n\n🎯 FIRST RESPONSE TO TEACHER: This is the FIRST STUDENT RESPONSE to the teacher's opening message. The teacher just started the lesson. Students should respond naturally and appropriately to what the teacher said - asking clarifying questions, showing initial thoughts or confusion, or engaging with the topic the teacher introduced. ${scenario.initial_prompt ? 'Context: ' + scenario.initial_prompt : ''} Be responsive and curious. Show genuine student reactions. NOT ALL STUDENTS need to respond - typically 1-2 students respond to an opening, not all 3 at once.`;
}

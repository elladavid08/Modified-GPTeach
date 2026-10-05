// Summary endpoint: request/response interface and transcript content (A12: summary is a string).
//
// Deliberately NOT asserted (defect C1): that real-time PCK moments are missing from the prompt.
// When C1 is fixed, add a test that moments from logged pckFeedback reach the prompt.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, postJson, promptText } from '../test-support/startServer.mjs';
import { textResult } from '../test-support/fakes/vertexai.mjs';

let srv;
before(async () => { srv = await startServer(); });
after(async () => { await srv.close(); });
beforeEach(() => srv.fakeModel.reset());

const conversationLog = {
  sessionId: 'session_1700000000000_abcdefghi',
  scenario: { text: 'יחסי הכלה בין ריבוע למלבן', misconception_focus: 'ריבוע אינו מלבן' },
  turns: [
    {
      turnNumber: 1,
      teacher: { message: 'מה ההגדרה של מלבן?', image: null },
      students: [{ name: 'נועה', message: 'ארבע זוויות ישרות' }],
      pckFeedback: null,
    },
    {
      turnNumber: 2,
      teacher: { message: 'האם ריבוע מקיים את ההגדרה?', image: null },
      students: [{ name: 'תמר', message: 'כן! אז ריבוע הוא מלבן' }],
      pckFeedback: {
        feedback_message: 'x',
        feedback_type: 'positive',
        skills_assessment: [{ skill_id: 'adapted-pedagogical-response', is_relevant: true, score: 2, evidence: 'שאלה מכוונת' }],
        detected_skills: [],
        missed_opportunities: [],
      },
    },
  ],
  stats: { totalTeacherMessages: 2, totalStudentMessages: 2, totalPCKFeedbacks: 1 },
};

test('returns {success, summary, analyzed_turns, session_id} with a trimmed string summary', async () => {
  srv.fakeModel.respond = () => textResult('\n### סיכום כללי\nטקסט הסיכום  \n');
  const res = await postJson(srv.baseUrl, '/api/pck-summary', { conversationLog });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, {
    success: true,
    summary: '### סיכום כללי\nטקסט הסיכום',
    analyzed_turns: 2,
    session_id: conversationLog.sessionId,
  });
});

test('prompt contains every logged teacher message and named student reply', async () => {
  srv.fakeModel.respond = () => textResult('סיכום');
  await postJson(srv.baseUrl, '/api/pck-summary', { conversationLog });
  const text = promptText(srv.fakeModel.calls[0]);
  for (const turn of conversationLog.turns) {
    assert.ok(text.includes(turn.teacher.message));
    for (const s of turn.students) assert.ok(text.includes(`${s.name}: ${s.message}`));
  }
  assert.ok(text.includes('ריבוע אינו מלבן'), 'scenario context reaches the summary prompt');
});

test('400 when the log has no turns', async () => {
  const res = await postJson(srv.baseUrl, '/api/pck-summary', { conversationLog: { ...conversationLog, turns: [] } });
  assert.equal(res.status, 400);
  assert.equal(srv.fakeModel.calls.length, 0);
});

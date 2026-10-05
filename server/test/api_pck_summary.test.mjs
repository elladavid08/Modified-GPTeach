// Summary endpoint: request/response interface and transcript content (A12: summary is a string),
// and C1 (fixed): the real-time PCK moments that were displayed (A4: pckFeedback !== null) reach
// the summary prompt, so it can stay grounded in them (B14).
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

// ─── C1: real-time PCK moments reach the summary ─────────────────────────────

// A turn exactly as ConversationLog.addTurn stores it (shared fixture; no should_provide_feedback).
const LOGGED_TURN = JSON.parse(
  readFileSync(new URL('../../src/testUtils/contracts/loggedTurnWithFeedback.json', import.meta.url), 'utf8'),
);
const NO_MOMENTS_TEXT = 'No significant PCK moments were identified';

function turnAt(turnNumber, overrides = {}) {
  const t = JSON.parse(JSON.stringify(LOGGED_TURN));
  t.turnNumber = turnNumber;
  return Object.assign(t, overrides);
}

function plainTurn(turnNumber) {
  return {
    turnNumber,
    teacher: { message: `PLAIN-TEACHER-${turnNumber}`, image: null },
    students: [{ name: 'נועה', message: `PLAIN-STUDENT-${turnNumber}` }],
    pckFeedback: null,
  };
}

async function summaryPrompt(turns) {
  srv.fakeModel.respond = () => textResult('סיכום');
  const res = await postJson(srv.baseUrl, '/api/pck-summary', {
    conversationLog: { ...conversationLog, turns, stats: { totalTeacherMessages: turns.length, totalStudentMessages: turns.length } },
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return promptText(srv.fakeModel.calls[0]);
}

const momentsSection = (text) => {
  const start = text.indexOf('## PCK Moments Identified in Real-Time');
  return start === -1 ? '' : text.slice(start, text.indexOf('## Statistics', start));
};

test('C1: a logged (displayed) pckFeedback without should_provide_feedback is a real-time moment', async () => {
  assert.equal('should_provide_feedback' in LOGGED_TURN.pckFeedback, false);
  const text = await summaryPrompt([plainTurn(1), turnAt(2)]);
  assert.ok(!text.includes(NO_MOMENTS_TEXT));
  const section = momentsSection(text);
  assert.ok(section.includes('There were 1 moments'), section);
  assert.ok(section.includes('**Turn 2:**'));
  assert.ok(section.includes('TEACHER-MOMENT-TEXT'));
});

test('C1: the moment carries skill name/id, score, evidence, suggestion and feedback text', async () => {
  const section = momentsSection(await summaryPrompt([turnAt(1)]));
  // score 2
  assert.match(section, /זיהוי השגיאה \(error-identification\): ✅ Excellent \(score 2\)/);
  assert.ok(section.includes('EVIDENCE-SCORE-2'));
  // score 1: evidence and improvement suggestion
  assert.match(section, /תגובה פדגוגית מותאמת \(adapted-pedagogical-response\): ⚠️ Partial \(score 1\)/);
  assert.ok(section.includes('EVIDENCE-SCORE-1'));
  assert.ok(section.includes('SUGGESTION-SCORE-1'));
  // score 0: suggestion, and no "undefined" evidence line
  assert.match(section, /אפיון סוג השגיאה \(error-characterization\): ❌ Missed \(score 0\)/);
  assert.ok(section.includes('SUGGESTION-SCORE-0'));
  assert.ok(!section.includes('undefined'));
  // stored feedback text
  assert.ok(section.includes('STORED-FEEDBACK-MESSAGE'));
  // irrelevant skills are not presented as assessed
  assert.ok(!section.includes('error-leveraging'));
  assert.ok(!section.includes('IRRELEVANT-REASON'));
});

test('C1: a turn with pckFeedback null is not a moment', async () => {
  const section = momentsSection(await summaryPrompt([plainTurn(1), turnAt(2), plainTurn(3)]));
  assert.ok(section.includes('There were 1 moments'));
  assert.ok(!section.includes('**Turn 1:**'));
  assert.ok(!section.includes('**Turn 3:**'));
  assert.ok(!section.includes('PLAIN-TEACHER-'));
});

test('C1: multiple displayed moments reach the summary in turn order', async () => {
  const turns = [plainTurn(1), turnAt(2), plainTurn(3), turnAt(4, { teacher: { message: 'SECOND-MOMENT-TEACHER', image: null } }), turnAt(5)];
  const section = momentsSection(await summaryPrompt(turns));
  assert.ok(section.includes('There were 3 moments'));
  const positions = ['**Turn 2:**', '**Turn 4:**', '**Turn 5:**'].map((m) => section.indexOf(m));
  assert.ok(positions.every((p) => p >= 0), String(positions));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
  assert.ok(section.indexOf('SECOND-MOMENT-TEACHER') > positions[0] && section.indexOf('SECOND-MOMENT-TEACHER') < positions[2]);
});

test('C1: legacy feedback without skills_assessment does not crash and is not given invented scores', async () => {
  const legacy = {
    turnNumber: 1,
    teacher: { message: 'LEGACY-TEACHER' },
    students: [{ name: 'הילה', message: 'LEGACY-STUDENT' }],
    pckFeedback: {
      feedback_message: 'LEGACY-FEEDBACK-MESSAGE',
      feedback_type: 'neutral',
      detected_skills: [{ skill_id: 'error-identification', evidence: 'LEGACY-EVIDENCE' }],
      missed_opportunities: [{ skill_id: 'זיהוי תפיסה חזותית שגויה - מלבן', what_could_have_been_done: 'LEGACY-MISSED' }],
    },
  };
  const section = momentsSection(await summaryPrompt([legacy]));
  assert.ok(section.includes('There were 1 moments'));
  assert.ok(section.includes('LEGACY-FEEDBACK-MESSAGE'));
  assert.ok(section.includes('LEGACY-EVIDENCE'));
  assert.ok(section.includes('LEGACY-MISSED'));
  assert.ok(!/\(score [012]\)/.test(section), 'no structured score is invented for legacy feedback');
  assert.ok(!/Excellent|Partial|❌ Missed/.test(section));
});

test('C1: a conversation with no displayed feedback keeps the no-moments path', async () => {
  const text = await summaryPrompt([plainTurn(1), plainTurn(2)]);
  assert.ok(text.includes(NO_MOMENTS_TEXT));
  assert.equal(momentsSection(text), '');
});


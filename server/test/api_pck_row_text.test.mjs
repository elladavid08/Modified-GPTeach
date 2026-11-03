// 1.5.1 row-text fix (post_1.5_feedback_investigation.md): one shared row-text rule
// (server/pck_row_text.js = src/services/pckDisplayRows.js; parity: src/__tests__/pckRowTextParity.test.js).
//   score 2 = positive evidence; score 1 = positive + improvement; score 0 = improvement
//   (own field first, then the single matching demonstrated_skills / missed_opportunities item).
// /api/pck-feedback: when feedback that will be SHOWN (after the B27 guard) has a skill row with no text at all,
// attempt 2 of the existing 2-attempt policy re-asks once with the IDENTICAL request; attempt 1 is the fallback.
// Scores, relevance, the show/hide decision, the prompt and the model are unchanged.
// /api/pck-summary: the summary input carries the same row text the teacher saw. Real server.js, fake Vertex model.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, postJson, promptText } from '../test-support/startServer.mjs';
import { textResult } from '../test-support/fakes/vertexai.mjs';
import { VALID_ANALYSIS, NO_FEEDBACK_ANALYSIS } from '../test-support/pckFixtures.mjs';

let srv;
before(async () => { srv = await startServer(); });
after(async () => { await srv.close(); });
beforeEach(() => srv.fakeModel.reset());

const clone = (v) => JSON.parse(JSON.stringify(v));
const json = (value) => () => textResult(JSON.stringify(value));
/** Responds with each value in turn (one per model call). */
const sequence = (...responders) => {
  let i = 0;
  return (request) => responders[Math.min(i++, responders.length - 1)](request);
};

/** Shown feedback whose score-2 error-identification row has no text anywhere (own evidence and demonstrated_skills empty). */
const EMPTY_ROW = (() => {
  const a = clone(VALID_ANALYSIS);
  a.skills_assessment[0] = { skill_id: 'error-identification', is_relevant: true, score: 2, evidence: ' ' };
  a.demonstrated_skills = [];
  return a;
})();
const COMPLETE = clone(VALID_ANALYSIS);

function request(teacherMessage = 'בואו נבדוק - מה ההגדרה של מלבן?') {
  return postJson(srv.baseUrl, '/api/pck-feedback', {
    teacherMessage,
    conversationHistory: [{ role: 'user', name: 'Teacher', text: 'מה אתם יודעים על ריבוע?' }, { role: 'assistant', name: 'נועה', text: 'ריבוע זה לא מלבן' }],
    scenario: { text: 'יחסי הכלה בין ריבוע למלבן', misconception_focus: 'ריבוע אינו מלבן' },
    feedbackHistory: [],
  });
}

// ─── /api/pck-feedback: one identical re-ask ─────────────────────────────────

test('complete shown feedback: one call, no re-ask, pckRowTextRetries 0', async () => {
  srv.fakeModel.respond = json(COMPLETE);
  const res = await request();
  assert.equal(res.status, 200);
  assert.equal(srv.fakeModel.calls.length, 1);
  assert.deepEqual(res.body.analysis, COMPLETE);
  assert.equal(res.body.meta.attempts, 1);
  assert.equal(res.body.meta.pckRowTextRetries, 0);
});

test('a shown row without text is re-asked once with the identical request; the complete second answer is returned', async () => {
  srv.fakeModel.respond = sequence(json(EMPTY_ROW), json(COMPLETE));
  const res = await request();
  assert.equal(res.status, 200);
  assert.equal(srv.fakeModel.calls.length, 2);
  assert.deepEqual(srv.fakeModel.calls[1], srv.fakeModel.calls[0], 'the re-ask is the identical request (prompt, config)');
  assert.deepEqual(res.body.analysis, COMPLETE);
  assert.equal(res.body.meta.attempts, 2);
  assert.equal(res.body.meta.pckRowTextRetries, 1);
});

test('still a row without text after the re-ask: the second answer is accepted as is (no third call, nothing invented)', async () => {
  const second = clone(EMPTY_ROW);
  second.feedback_message_hebrew = 'SECOND-ANSWER';
  srv.fakeModel.respond = sequence(json(EMPTY_ROW), json(second));
  const res = await request();
  assert.equal(res.status, 200);
  assert.equal(srv.fakeModel.calls.length, 2);
  assert.deepEqual(res.body.analysis, second, 'scores, decision and text exactly as the model returned them');
  assert.equal(res.body.meta.pckRowTextRetries, 1);
});

test('the re-ask fails technically: the first answer is kept (fallback), never an error', async () => {
  srv.fakeModel.respond = sequence(json(EMPTY_ROW), () => { throw new Error('UNAVAILABLE'); });
  const res = await request();
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.deepEqual(res.body.analysis, EMPTY_ROW);
  assert.equal(res.body.meta.attempts, 2);
  assert.equal(res.body.meta.pckRowTextRetries, 1);
});

test('the re-ask returns malformed JSON: the first answer is kept (fallback)', async () => {
  srv.fakeModel.respond = sequence(json(EMPTY_ROW), () => textResult('{"pedagogical_quality": "pos'));
  const res = await request();
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.analysis, EMPTY_ROW);
});

test('a parse failure on attempt 1 then a row without text on attempt 2: accepted (the 2-attempt cap is unchanged)', async () => {
  srv.fakeModel.respond = sequence(() => textResult('not json'), json(EMPTY_ROW));
  const res = await request();
  assert.equal(res.status, 200);
  assert.equal(srv.fakeModel.calls.length, 2);
  assert.deepEqual(res.body.analysis, EMPTY_ROW);
  assert.equal(res.body.meta.pckRowTextRetries, 0);
});

test('empty rows in feedback that is NOT shown are not re-asked (the show/hide decision is untouched)', async () => {
  const hidden = { ...clone(NO_FEEDBACK_ANALYSIS), skills_assessment: clone(EMPTY_ROW.skills_assessment) };
  srv.fakeModel.respond = json(hidden);
  const res = await request();
  assert.equal(res.status, 200);
  assert.equal(srv.fakeModel.calls.length, 1);
  assert.equal(res.body.analysis.should_provide_feedback, false);
  assert.equal(res.body.meta.pckRowTextRetries, 0);
});

test('empty rows in feedback the B27 guard suppresses (bare acknowledgement) are not re-asked', async () => {
  srv.fakeModel.respond = json(EMPTY_ROW); // positive quality, not a missed error-identification
  const res = await request('נכון');
  assert.equal(res.status, 200);
  assert.equal(srv.fakeModel.calls.length, 1);
  assert.equal(res.body.analysis.should_provide_feedback, false);
  assert.equal(res.body.meta.pckRowTextRetries, 0);
});

test('fallback texts count as text: a score-2 row covered by demonstrated_skills and a score-0 row covered by missed_opportunities are not re-asked', async () => {
  const a = clone(VALID_ANALYSIS);
  a.skills_assessment[0] = { skill_id: 'error-identification', is_relevant: true, score: 2 }; // demonstrated_skills has EI
  a.skills_assessment[2] = { skill_id: 'error-characterization', is_relevant: true, score: 0 }; // missed_opportunities has EC
  srv.fakeModel.respond = json(a);
  const res = await request();
  assert.equal(srv.fakeModel.calls.length, 1);
  assert.equal(res.body.meta.pckRowTextRetries, 0);
});

test('a score-1 row with only the improvement is not re-asked (structural; counted by the client as pckRowsMissingPositive)', async () => {
  const a = clone(VALID_ANALYSIS);
  a.skills_assessment[1] = { skill_id: 'adapted-pedagogical-response', is_relevant: true, score: 1, what_could_be_better: 'בקש דוגמה נגדית' };
  srv.fakeModel.respond = json(a);
  const res = await request();
  assert.equal(srv.fakeModel.calls.length, 1);
  assert.equal(res.body.meta.pckRowTextRetries, 0);
});

test('the no-feedback fixture is unchanged: one call', async () => {
  srv.fakeModel.respond = json(NO_FEEDBACK_ANALYSIS);
  const res = await request();
  assert.equal(srv.fakeModel.calls.length, 1);
  assert.equal(res.body.meta.pckRowTextRetries, 0);
});

// ─── /api/pck-summary: the summary sees the text the teacher saw ─────────────

test('summary input: score-2 evidence from demonstrated_skills and the score-0 missed_opportunities text reach the prompt; non-relevant text does not', async () => {
  const conversationLog = {
    sessionId: 'session_1700000000000_rowtext01',
    scenario: { text: 'יחסי הכלה בין ריבוע למלבן', misconception_focus: 'ריבוע אינו מלבן' },
    turns: [{
      turnNumber: 1,
      teacher: { message: 'האם ריבוע מקיים את ההגדרה?', image: null },
      students: [{ name: 'תמר', message: 'כן! אז ריבוע הוא מלבן' }],
      pckFeedback: {
        feedback_message: 'x',
        feedback_type: 'positive',
        skills_assessment: [
          { skill_id: 'error-identification', is_relevant: true, score: 2 },
          { skill_id: 'diagnostic-interpretation', is_relevant: true, score: 1, evidence: 'DI-POSITIVE', what_could_be_better: 'DI-IMPROVE' },
          { skill_id: 'adapted-pedagogical-response', is_relevant: true, score: 0 },
          { skill_id: 'error-leveraging', is_relevant: false, what_could_be_better: 'EL-NOT-RELEVANT' },
        ],
        detected_skills: [{ skill_id: 'error-identification', evidence: 'EI-FROM-DEMONSTRATED' }],
        missed_opportunities: [{ skill_id: 'adapted-pedagogical-response', what_could_have_been_done: 'APR-FROM-MISSED' }],
      },
    }],
    stats: { totalTeacherMessages: 1, totalStudentMessages: 1, totalPCKFeedbacks: 1 },
  };
  srv.fakeModel.respond = () => textResult('סיכום');
  const res = await postJson(srv.baseUrl, '/api/pck-summary', { conversationLog });
  assert.equal(res.status, 200);
  const text = promptText(srv.fakeModel.calls[0]);
  assert.match(text, /\(error-identification\): ✅ Excellent \(score 2\)\n {4}Evidence: EI-FROM-DEMONSTRATED\n/);
  assert.match(text, /\(diagnostic-interpretation\): ⚠️ Partial \(score 1\)\n {4}Evidence: DI-POSITIVE\n {4}Could improve: DI-IMPROVE\n/);
  assert.match(text, /\(adapted-pedagogical-response\): ❌ Missed \(score 0\)\n {4}Could improve: APR-FROM-MISSED\n/);
  assert.ok(!text.includes('EL-NOT-RELEVANT'));
});

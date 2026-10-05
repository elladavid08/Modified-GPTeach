// Real-time PCK feedback endpoint. Protects: A5 (skill ids / 0-1-2 scores pass through intact),
// B7 (Gate 0 rules are part of the prompt; a no-feedback decision stays a no-feedback decision),
// and the request/response interface the client depends on.
//
// C10 (fixed): JSON mode + response schema at the model call; malformed or invalid model output is
// rejected with a clear failure (never default-filled, never the 'המורה התקדם בשיעור' placeholder).
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { startServer, postJson, promptText } from '../test-support/startServer.mjs';
import { textResult, delayed } from '../test-support/fakes/vertexai.mjs';
import { VALID_ANALYSIS, MALFORMED_OUTPUTS } from '../test-support/pckFixtures.mjs';

const contract = JSON.parse(
  readFileSync(new URL('../../src/testUtils/contracts/pckSkillsContract.json', import.meta.url), 'utf8'),
);

let srv;
before(async () => { srv = await startServer(); });
after(async () => { await srv.close(); });
beforeEach(() => srv.fakeModel.reset());

const scenario = {
  text: 'יחסי הכלה בין ריבוע למלבן',
  grade_level: 7,
  ai_context_summary: 'כיתה ז׳. מעבר מהגדרת מלבן להגדרת ריבוע.',
  misconception_focus: 'MISCONCEPTION-MARKER ריבוע אינו מלבן',
};

const history = [
  { role: 'user', name: 'Teacher', text: 'מה אתם יודעים על ריבוע?' },
  { role: 'assistant', name: 'נועה', text: 'ריבוע זה לא מלבן כי הוא נראה אחרת' },
  { role: 'user', name: 'Teacher', text: 'בואו נבדוק - מה ההגדרה של מלבן?' },
];

const positiveAnalysis = {
  pedagogical_quality: 'positive',
  predicted_student_state: {
    understanding_level: 'improved',
    response_tone: 'thoughtful',
    student_reaction_hints: [
      { student: 'נועה', likelihood: 'high', reaction_type: 'partial_understanding', reason: 'הופנתה להגדרה' },
    ],
  },
  addressed_misconception: true,
  how_addressed: 'החזיר להגדרה',
  misconception_risk: 'low',
  demonstrated_skills: [{ skill_id: 'error-identification', evidence: 'זיהית את הטעות' }],
  missed_opportunities: [],
  should_provide_feedback: true,
  feedback_trigger: 'excellent_pck_use',
  skills_assessment: [
    { skill_id: 'error-identification', is_relevant: true, score: 2, evidence: 'זיהית את הטעות' },
    { skill_id: 'adapted-pedagogical-response', is_relevant: true, score: 1, evidence: 'שאלת על ההגדרה', what_could_be_better: 'בקש דוגמה נגדית' },
    { skill_id: 'error-leveraging', is_relevant: false, reason_not_relevant: 'מוקדם' },
  ],
  feedback_message_hebrew: 'זיהוי השגיאה: זיהית את הטעות.',
};

function request(body = {}) {
  return postJson(srv.baseUrl, '/api/pck-feedback', {
    teacherMessage: history[2].text,
    conversationHistory: history,
    scenario,
    feedbackHistory: [],
    ...body,
  });
}

test('a valid analysis is returned with skills, scores and decision intact', async () => {
  srv.fakeModel.respond = () => textResult(JSON.stringify(positiveAnalysis));
  const res = await request();
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  const a = res.body.analysis;
  assert.equal(a.should_provide_feedback, true);
  assert.equal(a.pedagogical_quality, 'positive');
  assert.deepEqual(a.skills_assessment, positiveAnalysis.skills_assessment);
  assert.equal(a.feedback_message_hebrew, positiveAnalysis.feedback_message_hebrew);
  assert.deepEqual(a.predicted_student_state, positiveAnalysis.predicted_student_state);
  const validIds = new Set(contract.skills.map((s) => s.skill_id));
  for (const s of a.skills_assessment) {
    assert.ok(validIds.has(s.skill_id));
    if (s.is_relevant) assert.ok(contract.scores.includes(s.score));
  }
});

test('analysis wrapped in a ```json fence is parsed', async () => {
  srv.fakeModel.respond = () => textResult('```json\n' + JSON.stringify(positiveAnalysis) + '\n```');
  const res = await request();
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.analysis.skills_assessment, positiveAnalysis.skills_assessment);
});

test('a no-feedback decision (e.g. greeting) stays a no-feedback decision with no message', async () => {
  const greeting = {
    pedagogical_quality: 'neutral',
    predicted_student_state: { understanding_level: 'same', response_tone: 'confident', student_reaction_hints: [] },
    addressed_misconception: false,
    how_addressed: '',
    misconception_risk: 'low',
    demonstrated_skills: [],
    missed_opportunities: [],
    should_provide_feedback: false,
    feedback_trigger: null,
    skills_assessment: [],
    feedback_message_hebrew: '',
  };
  srv.fakeModel.respond = () => textResult(JSON.stringify(greeting));
  const res = await request({ teacherMessage: 'שלום לכולם!', conversationHistory: [] });
  assert.equal(res.status, 200);
  assert.equal(res.body.analysis.should_provide_feedback, false);
  assert.equal(res.body.analysis.feedback_message_hebrew, '');
  assert.deepEqual(res.body.analysis.skills_assessment, []);
});

test('prompt contains the teacher message, scenario context, named history and all skill ids', async () => {
  srv.fakeModel.respond = () => textResult(JSON.stringify(positiveAnalysis));
  await request();
  const text = promptText(srv.fakeModel.calls[0]);
  assert.ok(text.includes('בואו נבדוק - מה ההגדרה של מלבן?'));
  assert.ok(text.includes('MISCONCEPTION-MARKER'));
  assert.ok(text.includes('נועה: ריבוע זה לא מלבן כי הוא נראה אחרת'), 'PCK history keeps student names');
  for (const { skill_id } of contract.skills) assert.ok(text.includes(skill_id), skill_id);
});

// B7. Prompt-level check: update deliberately if the rubric is redesigned, keeping an
// equivalent "no feedback for greetings / closings / procedural turns" rule.
test('prompt includes Gate 0 exclusions for greetings, closings and procedural messages', async () => {
  srv.fakeModel.respond = () => textResult(JSON.stringify(positiveAnalysis));
  await request();
  const text = promptText(srv.fakeModel.calls[0]);
  assert.match(text, /GATE 0/);
  assert.match(text, /Procedural \/ social message/);
  assert.match(text, /Lesson closing/);
  assert.match(text, /should_provide_feedback: false/);
});

test('400 when teacherMessage is missing', async () => {
  const res = await postJson(srv.baseUrl, '/api/pck-feedback', { conversationHistory: [] });
  assert.equal(res.status, 400);
  assert.equal(res.body.success, false);
  assert.equal(srv.fakeModel.calls.length, 0);
});

// ─── C10: structured output and validation ───────────────────────────────────

test('C10: the model call uses JSON mode with the PCK response schema', async () => {
  srv.fakeModel.respond = () => textResult(JSON.stringify(VALID_ANALYSIS));
  await request();
  const { generationConfig } = srv.fakeModel.calls[0];
  assert.equal(generationConfig.responseMimeType, 'application/json');
  assert.equal(generationConfig.responseSchema.type, 'object');
  assert.ok(generationConfig.responseSchema.properties.skills_assessment);
  // Unchanged generation settings (model / temperature are out of scope)
  assert.equal(generationConfig.temperature, 0.7);
  assert.equal(generationConfig.maxOutputTokens, 2000);
});

test('C10: a valid current-format analysis passes through unchanged', async () => {
  srv.fakeModel.respond = () => textResult(JSON.stringify(VALID_ANALYSIS));
  const res = await request();
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.deepEqual(res.body.analysis, VALID_ANALYSIS);
  assert.deepEqual(Object.keys(res.body).sort(), ['analysis', 'meta', 'success']);
});

test('C10: should_provide_feedback true with an empty message is not given a placeholder', async () => {
  srv.fakeModel.respond = () => textResult(JSON.stringify({ ...VALID_ANALYSIS, feedback_message_hebrew: '' }));
  const res = await request();
  assert.equal(res.status, 200);
  assert.equal(res.body.analysis.feedback_message_hebrew, '');
  assert.ok(!JSON.stringify(res.body).includes('המורה התקדם בשיעור'));
});

test('C10 fixture sanity: every malformed fixture differs from the valid output', () => {
  const valid = JSON.stringify(VALID_ANALYSIS, null, 2);
  for (const [label, raw] of MALFORMED_OUTPUTS) assert.notEqual(raw, valid, label);
});

for (const [label, raw, kind] of MALFORMED_OUTPUTS) {
  test(`C10: malformed model output is a clear failure, not an analysis: ${label}`, async () => {
    srv.fakeModel.respond = () => textResult(raw);
    const res = await request();
    assert.equal(res.status, 500);
    assert.equal(res.body.success, false);
    assert.equal(res.body.analysis, undefined, 'no analysis returned');
    // Stable prefix the C7 client classifier maps to stage "parse"
    assert.match(res.body.error, /^Failed to parse AI response/);
    assert.equal(res.body.errorKind, kind);
    assert.ok(!JSON.stringify(res.body).includes('המורה התקדם בשיעור'));
  });
}

// ─── Telemetry ───────────────────────────────────────────────────────────────

test('telemetry: a successful PCK call reports agent, model, latency, finish reason and attempts', async () => {
  srv.fakeModel.respond = () => delayed(40, textResult(JSON.stringify(VALID_ANALYSIS), 'STOP'));
  const res = await request();
  const { meta } = res.body;
  assert.deepEqual(Object.keys(meta).sort(), ['agent', 'attempts', 'finishReason', 'latencyMs', 'model']);
  assert.equal(meta.agent, 'pck');
  assert.equal(meta.model, 'gemini-2.5-flash-lite');
  assert.equal(meta.finishReason, 'STOP');
  assert.equal(meta.attempts, 1);
  assert.ok(meta.latencyMs >= 35);
  // The analysis itself carries no telemetry
  assert.equal(res.body.analysis.meta, undefined);
});

test('telemetry: a parse failure reports the finish reason (e.g. truncation at max tokens)', async () => {
  srv.fakeModel.respond = () => textResult('{"pedagogical_quality": "pos', 'MAX_TOKENS');
  const res = await request();
  assert.equal(res.body.errorKind, 'parse');
  assert.equal(res.body.finishReason, 'MAX_TOKENS'); // B23 failure shape unchanged
  assert.equal(res.body.meta.finishReason, 'MAX_TOKENS');
  assert.equal(res.body.meta.agent, 'pck');
  assert.equal(res.body.meta.attempts, 1);
});

test('telemetry: a thrown PCK model error reports timing and attempts', async () => {
  srv.fakeModel.respond = () => { throw new Error('UNAVAILABLE'); };
  const res = await request();
  assert.equal(res.body.success, false);
  assert.equal(res.body.meta.agent, 'pck');
  assert.equal(res.body.meta.attempts, 1);
  assert.ok(Number.isInteger(res.body.meta.latencyMs));
});


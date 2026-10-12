// Gemini 3 model migration on main (1.3.0-gemini3): the student agent runs on gemini-3.5-flash-lite;
// PCK feedback, the summary, completion and test endpoints run on gemini-3.1-flash-lite. All calls go
// through the Vertex `global` endpoint with explicit MINIMAL thinking and no temperature / topP.
// Everything else is main's 1.3.0 behaviour: prompts, withRetry, parsing, schemas and token limits.
// Uses the real server.js with a fake Vertex SDK (no network, no Firestore).
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { startServer, postJson } from '../test-support/startServer.mjs';
import { textResult } from '../test-support/fakes/vertexai.mjs';

const STUDENT_MODEL = 'gemini-3.5-flash-lite';
const GENERAL_MODEL = 'gemini-3.1-flash-lite';
const MINIMAL = { thinkingLevel: 'MINIMAL' };

let srv;
before(async () => { srv = await startServer(); });
after(async () => { await srv.close(); });
beforeEach(() => srv.fakeModel.reset());

// main's student response schema (unchanged by the migration)
const STUDENT_SCHEMA = {
  type: 'object',
  properties: {
    responses: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          student: { type: 'string', description: 'The exact name of the student speaking' },
          message: { type: 'string', description: "The student's message" },
        },
        required: ['student', 'message'],
      },
    },
  },
  required: ['responses'],
};

const STUDENT_JSON = JSON.stringify({ responses: [{ student: 'נועה', message: 'רגע, אז ריבוע הוא מלבן?' }] });
const studentMessages = [
  { role: 'system', content: 'S' },
  { role: 'user', content: 'מה ההגדרה של מלבן?', name: 'Teacher' },
];
const PCK_JSON = JSON.stringify({
  pedagogical_quality: 'neutral',
  predicted_student_state: { understanding_level: 'same', response_tone: 'thoughtful', student_reaction_hints: [] },
  should_provide_feedback: false,
  skills_assessment: [],
});
const pckBody = { teacherMessage: 'מה ההגדרה של מלבן?', conversationHistory: [], scenario: {}, feedbackHistory: [] };
const conversationLog = {
  sessionId: 'session_1700000000000_abcdefghi',
  scenario: { text: 'יחסי הכלה בין ריבוע למלבן' },
  turns: [{ turnNumber: 1, teacher: { message: 'מה ההגדרה של מלבן?', image: null }, students: [{ name: 'נועה', message: 'ארבע זוויות ישרות' }], pckFeedback: null }],
  stats: { totalTeacherMessages: 1, totalStudentMessages: 1, totalPCKFeedbacks: 0 },
};

/** The 3.x generation settings: MINIMAL thinking, no sampling parameters, the unchanged token limit. */
function assertThreeXSettings(generationConfig, maxOutputTokens) {
  assert.deepEqual(generationConfig.thinkingConfig, MINIMAL);
  for (const key of ['temperature', 'topP', 'topK']) assert.ok(!(key in generationConfig), `${key} must be absent`);
  assert.equal(generationConfig.maxOutputTokens, maxOutputTokens);
}

// ─── Vertex client and model instances ───────────────────────────────────────

test('the Vertex client uses the global location and the global API endpoint, with the existing project and key file', () => {
  assert.equal(srv.fakeModel.clientOptions.length, 1);
  const [options] = srv.fakeModel.clientOptions;
  assert.equal(options.location, 'global');
  assert.equal(options.apiEndpoint, 'aiplatform.googleapis.com');
  assert.equal(options.project, process.env.GOOGLE_CLOUD_PROJECT || 'cloud-run-455609');
  assert.ok(options.googleAuthOptions.keyFilename.endsWith('service-account-key.json') || options.googleAuthOptions.keyFilename === process.env.GOOGLE_APPLICATION_CREDENTIALS);
});

test('model instances: exactly one student (3.5) and one general (3.1) instance, without model-level settings', () => {
  assert.deepEqual(srv.fakeModel.modelParams.map((p) => p.model).sort(), [GENERAL_MODEL, STUDENT_MODEL].sort());
  for (const p of srv.fakeModel.modelParams) assert.deepEqual(Object.keys(p), ['model']);
});

// ─── Routing and generation settings per endpoint ───────────────────────────

test('/api/generate (student) runs on gemini-3.5-flash-lite with MINIMAL thinking, no sampling params, 512 tokens and the unchanged schema', async () => {
  srv.fakeModel.respond = () => textResult(STUDENT_JSON);
  const res = await postJson(srv.baseUrl, '/api/generate', { messages: studentMessages });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { success: true, text: STUDENT_JSON }); // main's response shape
  assert.deepEqual(srv.fakeModel.callModels, [STUDENT_MODEL]);
  const { generationConfig } = srv.fakeModel.calls[0];
  assertThreeXSettings(generationConfig, 512);
  assert.equal(generationConfig.responseMimeType, 'application/json');
  assert.deepEqual(generationConfig.responseSchema, STUDENT_SCHEMA);
  assert.deepEqual(Object.keys(generationConfig).sort(), ['maxOutputTokens', 'responseMimeType', 'responseSchema', 'thinkingConfig']);
});

test('/api/generate: stop sequences from the client are still forwarded', async () => {
  srv.fakeModel.respond = () => textResult(STUDENT_JSON);
  await postJson(srv.baseUrl, '/api/generate', { messages: studentMessages, options: { stop: ['Teacher: '] } });
  assert.deepEqual(srv.fakeModel.calls[0].generationConfig.stopSequences, ['Teacher: ']);
  assertThreeXSettings(srv.fakeModel.calls[0].generationConfig, 512);
});

test('/api/pck-feedback runs on gemini-3.1-flash-lite with MINIMAL thinking, no sampling params, 2000 tokens and (as on main) no JSON mode', async () => {
  srv.fakeModel.respond = () => textResult(PCK_JSON);
  const res = await postJson(srv.baseUrl, '/api/pck-feedback', pckBody);
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.deepEqual(srv.fakeModel.callModels, [GENERAL_MODEL]);
  const { generationConfig } = srv.fakeModel.calls[0];
  assertThreeXSettings(generationConfig, 2000);
  assert.deepEqual(Object.keys(generationConfig).sort(), ['maxOutputTokens', 'thinkingConfig']);
});

test('/api/pck-feedback: main\'s free-text parsing is unchanged (code-fenced JSON is still accepted)', async () => {
  srv.fakeModel.respond = () => textResult('```json\n' + PCK_JSON + '\n```');
  const res = await postJson(srv.baseUrl, '/api/pck-feedback', pckBody);
  assert.equal(res.status, 200);
  assert.equal(res.body.analysis.pedagogical_quality, 'neutral');
});

test('/api/pck-summary runs on gemini-3.1-flash-lite with MINIMAL thinking, no sampling params and 2048 tokens (text output)', async () => {
  srv.fakeModel.respond = () => textResult('סיכום');
  const res = await postJson(srv.baseUrl, '/api/pck-summary', { conversationLog });
  assert.equal(res.status, 200);
  assert.deepEqual(srv.fakeModel.callModels, [GENERAL_MODEL]);
  const { generationConfig } = srv.fakeModel.calls[0];
  assertThreeXSettings(generationConfig, 2048);
  assert.deepEqual(Object.keys(generationConfig).sort(), ['maxOutputTokens', 'thinkingConfig']);
});

test('/api/completion runs on gemini-3.1-flash-lite; client temperature / top_p are not sent to the 3.x model; max_tokens and stop kept', async () => {
  srv.fakeModel.respond = () => textResult('טקסט');
  const res = await postJson(srv.baseUrl, '/api/completion', { prompt: 'P', options: { temperature: 0.7, top_p: 1, max_tokens: 300, stop: ['Teacher: '] } });
  assert.equal(res.status, 200);
  assert.deepEqual(srv.fakeModel.callModels, [GENERAL_MODEL]);
  const { generationConfig } = srv.fakeModel.calls[0];
  assertThreeXSettings(generationConfig, 300);
  assert.deepEqual(generationConfig.stopSequences, ['Teacher: ']);
});

test('/api/completion: default token limit unchanged (256)', async () => {
  srv.fakeModel.respond = () => textResult('טקסט');
  await postJson(srv.baseUrl, '/api/completion', { prompt: 'P' });
  assertThreeXSettings(srv.fakeModel.calls[0].generationConfig, 256);
});

test('/api/test runs on gemini-3.1-flash-lite with MINIMAL thinking, no temperature and 50 tokens', async () => {
  srv.fakeModel.respond = () => textResult('hello');
  const res = await fetch(`${srv.baseUrl}/api/test`);
  assert.equal(res.status, 200);
  assert.deepEqual(srv.fakeModel.callModels, [GENERAL_MODEL]);
  assertThreeXSettings(srv.fakeModel.calls[0].generationConfig, 50);
});

// ─── Health and startup reporting ───────────────────────────────────────────

test('/api/health reports the split models and the global location', async () => {
  const res = await fetch(`${srv.baseUrl}/api/health`);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.location, 'global');
  assert.deepEqual(body.models, { student: STUDENT_MODEL, pck: GENERAL_MODEL, summary: GENERAL_MODEL, completion: GENERAL_MODEL, test: GENERAL_MODEL });
  assert.equal(body.model, undefined);
  assert.ok(!JSON.stringify(body).includes('2.5'));
});

test('startup log reports the student and PCK/general models and the global location', () => {
  const log = srv.startupLog.join('\n');
  assert.match(log, /Student model: gemini-3\.5-flash-lite/);
  assert.match(log, /PCK \/ summary \/ completion \/ test model: gemini-3\.1-flash-lite/);
  assert.match(log, /Location: global/);
  assert.ok(!log.includes('gemini-2.5'));
});

// ─── No 2.5 model or sampling parameter left in active runtime configuration ─

test('server.js: no gemini-2.x model id, no temperature / topP in any generation config, no regional location', () => {
  const src = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  assert.ok(!src.includes('gemini-2'), 'a gemini-2.x model id remains in server.js');
  assert.ok(!/\btemperature\s*:/.test(src), 'a temperature setting remains in server.js');
  assert.ok(!/\btop[PK]\s*:/.test(src), 'a topP / topK setting remains in server.js');
  assert.ok(!src.includes("'us-central1'"), 'a regional default location remains in server.js');
});

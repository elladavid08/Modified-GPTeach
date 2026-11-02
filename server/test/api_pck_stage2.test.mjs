// A1i two-stage PCK, PCK_STAGE2 (research/simulator_audit/pck_a1i_implementation_plan.md). Real server.js, fake
// Vertex model (Stage-1 and Stage-2 requests are told apart by their prompt). Protects:
//   - flag semantics: unset / empty / on / 1 / true / unrecognised -> ON (the 1.6.0 default); off / 0 / false -> OFF;
//   - flag off: the 1.5.1 endpoint exactly (one model call, the 1.5.1 response shape and content);
//   - /api/health reports the resolved state (pckStage2Enabled, pckStage2Source);
//   - flag on: Stage 2 only on turns the 1.5.1 display rule shows, with the frozen request built from the Stage-1 prompt
//     (byte-identical to the research request); its rows drive display and students (the X12E data contract);
//   - no displayable row after the leveraging guard -> no feedback; Stage 2 failed / timed out / skipped -> 1.5.1 exactly;
//   - the Stage-1 fields the client keeps as feedback history are returned unmodified.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { startServer, postJson, promptText } from '../test-support/startServer.mjs';
import { textResult, delayed } from '../test-support/fakes/vertexai.mjs';
import { VALID_ANALYSIS, NO_FEEDBACK_ANALYSIS } from '../test-support/pckFixtures.mjs';

const X12 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../research/simulator_audit/pck_eval/x12');
const require = createRequire(path.join(X12, 'x.cjs'));
const F = require('./stage2_final.cjs');
const X9 = require('../x9/stage2.cjs');
const SV = require('./student_view.cjs');
const FR = F.loadRubric(path.join(X12, 'rubric_final.FROZEN.json'));

let srv;
before(async () => { srv = await startServer(); });
after(async () => { await srv.close(); });
const ENV = ['PCK_STAGE2', 'PCK_STAGE2_ATTEMPT_TIMEOUT_MS', 'PCK_STAGE2_TOTAL_BUDGET_MS', 'PCK_STAGE2_SKIP_AFTER_MS'];
// Every test starts from the real default (PCK_STAGE2 unset -> ON); the test server pins "off" only for other suites
beforeEach(() => { srv.fakeModel.reset(); for (const k of ENV) delete process.env[k]; });

const clone = (v) => JSON.parse(JSON.stringify(v));
const isStage2 = (req) => promptText(req).startsWith('You are the second step');
const stage1Calls = () => srv.fakeModel.calls.filter((r) => !isStage2(r));
const stage2Calls = () => srv.fakeModel.calls.filter(isStage2);
const sk = (id, rel, score, pos, imp) => ({ skill_id: id, is_relevant: rel, score: rel ? score : null, what_exists: pos || '', what_to_improve: imp || '' });
const stage2Output = (relevant) => JSON.stringify({ skills: F.SKILL_IDS.map((id) => (relevant[id] ? sk(id, true, ...relevant[id]) : sk(id, false))) });
const S2_PARTIAL = stage2Output({ 'error-identification': [1, 'S2-POS-EI', 'S2-IMP-EI'], 'diagnostic-interpretation': [0, '', 'S2-IMP-DI'] });
/** respond: Stage-1 responder and Stage-2 responder (each a function of the call index within its stage). */
function respond(stage1, stage2) {
  let i1 = 0; let i2 = 0;
  srv.fakeModel.respond = (req) => (isStage2(req) ? stage2(i2++, req) : stage1(i1++, req));
}
const json = (v) => () => textResult(typeof v === 'string' ? v : JSON.stringify(v));
const HISTORY_FIELDS = (a) => ({ pedagogical_quality: a.pedagogical_quality, feedback_message_hebrew: a.feedback_message_hebrew, predicted_student_state: a.predicted_student_state, skills_assessment: a.skills_assessment || [] });

function request(teacherMessage = 'יובל, למה אתה חושב שריבוע הוא לא מלבן?') {
  return postJson(srv.baseUrl, '/api/pck-feedback', {
    teacherMessage,
    conversationHistory: [{ role: 'user', name: 'Teacher', text: 'מה ההגדרה של מלבן?' }, { role: 'assistant', name: 'יובל', text: 'ריבוע זה לא מלבן' }],
    scenario: { text: 'יחסי הכלה בין ריבוע למלבן', misconception_focus: 'ריבוע אינו מלבן' },
    feedbackHistory: [],
  });
}

// ─── flag semantics ──────────────────────────────────────────────────────────

for (const value of [undefined, '', '  ', 'on', '1', 'true', 'TRUE', ' On ', 'yes', 'enabled', '2']) {
  test(`PCK_STAGE2=${value === undefined ? '(unset)' : JSON.stringify(value)}: Stage 2 runs (ON)`, async () => {
    if (value !== undefined) process.env.PCK_STAGE2 = value;
    respond(json(VALID_ANALYSIS), json(S2_PARTIAL));
    const res = await request();
    assert.equal(res.status, 200);
    assert.equal(stage2Calls().length, 1);
    assert.equal(res.body.meta.stage2Status, 'ok');
    assert.ok(res.body.stage1);
  });
}

for (const [value, enabled, source] of [[undefined, true, 'default'], ['', true, 'default'], ['on', true, 'environment'], ['true', true, 'environment'], ['bogus', true, 'default'], ['off', false, 'environment'], ['0', false, 'environment'], ['FALSE', false, 'environment']]) {
  test(`/api/health reports PCK_STAGE2=${value === undefined ? '(unset)' : JSON.stringify(value)} as ${enabled ? 'ON' : 'OFF'} (${source})`, async () => {
    if (value !== undefined) process.env.PCK_STAGE2 = value;
    const res = await fetch(`${srv.baseUrl}/api/health`);
    const body = await res.json();
    assert.equal(body.pckStage2Enabled, enabled);
    assert.equal(body.pckStage2Source, source);
  });
}

// ─── flag off (explicit override): 1.5.1 exactly ─────────────────────────────

for (const value of ['off', '0', 'false', 'OFF', ' Off ', 'False']) {
  test(`PCK_STAGE2=${JSON.stringify(value)}: one call and the 1.5.1 response, unchanged`, async () => {
    process.env.PCK_STAGE2 = value;
    respond(json(VALID_ANALYSIS), () => { throw new Error('Stage 2 must not be called'); });
    const res = await request();
    assert.equal(res.status, 200);
    assert.equal(srv.fakeModel.calls.length, 1);
    assert.deepEqual(Object.keys(res.body).sort(), ['analysis', 'meta', 'success']);
    assert.deepEqual(res.body.analysis, VALID_ANALYSIS);
    assert.ok(!Object.keys(res.body.meta).some((k) => k.startsWith('stage2')));
  });
}

// ─── flag on ─────────────────────────────────────────────────────────────────

test('on, Stage 1 hides the turn: no Stage-2 call, the Stage-1 analysis, stage2Status not_run', async () => {
  process.env.PCK_STAGE2 = 'on';
  respond(json(NO_FEEDBACK_ANALYSIS), () => { throw new Error('Stage 2 must not be called'); });
  const res = await request('שלום לכולם');
  assert.equal(srv.fakeModel.calls.length, 1);
  assert.deepEqual(res.body.analysis, NO_FEEDBACK_ANALYSIS);
  assert.deepEqual(res.body.stage1, HISTORY_FIELDS(NO_FEEDBACK_ANALYSIS));
  assert.equal(res.body.meta.stage2Status, 'not_run');
});

test('on, Stage 1 shows: the frozen Stage-2 request, built from the Stage-1 prompt exactly as in research', async () => {
  process.env.PCK_STAGE2 = 'on';
  respond(json(VALID_ANALYSIS), json(S2_PARTIAL));
  await request();
  assert.equal(stage1Calls().length, 1);
  assert.equal(stage2Calls().length, 1);
  const s1Prompt = promptText(stage1Calls()[0]);
  const s2 = stage2Calls()[0];
  assert.equal(promptText(s2), F.buildPrompt(X9.extractContext(s1Prompt), FR));
  assert.equal(s2.generationConfig.maxOutputTokens, 1200);
  assert.equal(s2.generationConfig.responseMimeType, 'application/json');
  assert.deepEqual(s2.generationConfig.responseSchema, F.buildSchema());
  assert.deepEqual(s2.generationConfig.thinkingConfig, { thinkingLevel: 'MINIMAL' });
  assert.equal(s2.generationConfig.temperature, undefined);
});

test('on, Stage 1 shows: display and students from the Stage-2 rows (X12E contract); Stage-1 history fields unmodified', async () => {
  process.env.PCK_STAGE2 = 'on';
  respond(json(VALID_ANALYSIS), json(S2_PARTIAL));
  const res = await request();
  assert.equal(res.status, 200);
  const a = res.body.analysis;
  const rows = [{ skillId: 'error-identification', score: 1, positive: 'S2-POS-EI', improvement: 'S2-IMP-EI' }, { skillId: 'diagnostic-interpretation', score: 0, positive: null, improvement: 'S2-IMP-DI' }];
  assert.equal(a.should_provide_feedback, true);
  assert.equal(a.feedback_message_hebrew, '');
  assert.deepEqual(a.skills_assessment.filter((s) => s.is_relevant), [
    { skill_id: 'error-identification', is_relevant: true, score: 1, evidence: 'S2-POS-EI', what_could_be_better: 'S2-IMP-EI' },
    { skill_id: 'diagnostic-interpretation', is_relevant: true, score: 0, evidence: '', what_could_be_better: 'S2-IMP-DI' }]);
  const view = SV.studentPckView(VALID_ANALYSIS, rows, 'partial');
  for (const k of ['pedagogical_quality', 'addressed_misconception', 'how_addressed', 'demonstrated_skills', 'missed_opportunities', 'predicted_student_state', 'misconception_risk']) {
    assert.deepEqual(a[k], view[k], k);
  }
  assert.deepEqual(Object.values(SV.auditStudentInput(a, rows, 'partial')).filter(Boolean), []);
  const studentText = JSON.stringify([a.demonstrated_skills, a.missed_opportunities, a.how_addressed, a.predicted_student_state]);
  for (const s1Text of ['זיהית את הטעות', 'יכולת לשאול', 'הופנתה להגדרה', 'החזיר להגדרה']) assert.ok(!studentText.includes(s1Text), s1Text);
  assert.deepEqual(res.body.stage1, HISTORY_FIELDS(VALID_ANALYSIS));
  assert.deepEqual(res.body.meta, { ...res.body.meta, stage2Status: 'ok', stage2Candidate: 'x12-final-v5c', stage2Attempts: 1, stage2GuardDropped: 0, stage2Suppressed: 0, stage2Signal: 'partial' });
  assert.equal(res.body.meta.attempts, 1, 'Stage-1 telemetry unchanged');
  assert.ok(Number.isInteger(res.body.meta.stage2LatencyMs));
});

test('on: an invalid Stage-2 output is retried once with the identical request', async () => {
  process.env.PCK_STAGE2 = 'on';
  const contractBreak = stage2Output({ 'error-leveraging': [1, 'P', ''] });
  respond(json(VALID_ANALYSIS), (i) => textResult(i === 0 ? contractBreak : S2_PARTIAL));
  const res = await request();
  assert.equal(stage2Calls().length, 2);
  assert.deepEqual(stage2Calls()[0], stage2Calls()[1]);
  assert.equal(res.body.meta.stage2Status, 'ok');
  assert.equal(res.body.meta.stage2Attempts, 2);
});

for (const [label, stage2] of [
  ['invalid twice', () => textResult('{"skills": []}')],
  ['no relevant skill twice', () => textResult(stage2Output({}))],
  ['model error twice', () => { throw new Error('got status: 503 Service Unavailable'); }],
]) {
  test(`on: Stage 2 ${label} -> fallback to the 1.5.1 analysis exactly`, async () => {
    process.env.PCK_STAGE2 = 'on';
    respond(json(VALID_ANALYSIS), stage2);
    const res = await request();
    assert.equal(res.status, 200);
    assert.equal(stage2Calls().length, 2);
    assert.deepEqual(res.body.analysis, VALID_ANALYSIS);
    assert.equal(res.body.meta.stage2Status, 'fallback');
    assert.deepEqual(res.body.stage1, HISTORY_FIELDS(VALID_ANALYSIS));
  });
}

test('on: Stage 2 timing out -> fallback within its own budget', async () => {
  process.env.PCK_STAGE2 = 'on';
  process.env.PCK_STAGE2_ATTEMPT_TIMEOUT_MS = '80';
  process.env.PCK_STAGE2_TOTAL_BUDGET_MS = '200';
  respond(json(VALID_ANALYSIS), () => new Promise(() => {}));
  const started = Date.now();
  const res = await request();
  assert.ok(Date.now() - started < 2000);
  assert.deepEqual(res.body.analysis, VALID_ANALYSIS);
  assert.equal(res.body.meta.stage2Status, 'fallback');
});

test('on: Stage 1 already took longer than PCK_STAGE2_SKIP_AFTER_MS -> Stage 2 skipped, the 1.5.1 analysis', async () => {
  process.env.PCK_STAGE2 = 'on';
  process.env.PCK_STAGE2_SKIP_AFTER_MS = '5';
  respond(() => delayed(30, textResult(JSON.stringify(VALID_ANALYSIS))), () => { throw new Error('Stage 2 must not be called'); });
  const res = await request();
  assert.equal(stage2Calls().length, 0);
  assert.deepEqual(res.body.analysis, VALID_ANALYSIS);
  assert.equal(res.body.meta.stage2Status, 'skipped');
});

test('on: an acknowledgement whose only Stage-2 row is leveraging -> no feedback; students as on a 1.5.1 turn without feedback', async () => {
  process.env.PCK_STAGE2 = 'on';
  respond(json(VALID_ANALYSIS), json(stage2Output({ 'error-leveraging': [0, '', 'S2-IMP-LEV'] })));
  const res = await request('כןןן');
  assert.equal(stage2Calls().length, 1);
  assert.deepEqual(res.body.analysis, { ...VALID_ANALYSIS, should_provide_feedback: false, feedback_message_hebrew: '' });
  assert.equal(res.body.meta.stage2Suppressed, 1);
  assert.equal(res.body.meta.stage2GuardDropped, 1);
  assert.equal(res.body.meta.stage2Signal, undefined);
  assert.deepEqual(res.body.stage1, HISTORY_FIELDS(VALID_ANALYSIS));
});

test('on: "נכון" on a missed error (B27 keeps it shown): the guard drops only the leveraging row', async () => {
  process.env.PCK_STAGE2 = 'on';
  const missed = clone(VALID_ANALYSIS);
  missed.pedagogical_quality = 'problematic';
  missed.skills_assessment = [{ skill_id: 'error-identification', is_relevant: true, score: 0, what_could_be_better: 'S1-EI' }];
  missed.demonstrated_skills = [];
  missed.missed_opportunities = [{ skill_id: 'error-identification', what_could_have_been_done: 'S1-EI' }];
  respond(json(missed), json(stage2Output({ 'error-identification': [0, '', 'S2-EI'], 'error-leveraging': [0, '', 'S2-LEV'] })));
  const res = await request('נכון');
  const a = res.body.analysis;
  assert.equal(a.should_provide_feedback, true);
  assert.deepEqual(a.skills_assessment.filter((s) => s.is_relevant).map((s) => s.skill_id), ['error-identification']);
  assert.equal(a.pedagogical_quality, 'problematic');
  assert.equal(res.body.meta.stage2Signal, 'none');
  assert.equal(res.body.meta.stage2GuardDropped, 1);
});

test('on: the 1.5.1 bare-acknowledgement guard still decides first (a hidden turn gets no Stage 2)', async () => {
  process.env.PCK_STAGE2 = 'on';
  respond(json(VALID_ANALYSIS), () => { throw new Error('Stage 2 must not be called'); });
  const res = await request('אוקיי');
  assert.equal(res.body.analysis.should_provide_feedback, false);
  assert.equal(res.body.meta.stage2Status, 'not_run');
  assert.equal(stage2Calls().length, 0);
});

test('on: a Stage-1 failure is still the 1.5.1 failure (500), with no Stage-2 call', async () => {
  process.env.PCK_STAGE2 = 'on';
  respond(() => textResult('not json'), () => { throw new Error('Stage 2 must not be called'); });
  const res = await request();
  assert.equal(res.status, 500);
  assert.equal(stage2Calls().length, 0);
});

test('on: the Stage-1 row-text re-ask is unchanged and Stage 2 runs once, after it', async () => {
  process.env.PCK_STAGE2 = 'on';
  const emptyRow = clone(VALID_ANALYSIS);
  emptyRow.skills_assessment[0] = { skill_id: 'error-identification', is_relevant: true, score: 2, evidence: ' ' };
  emptyRow.demonstrated_skills = [];
  respond((i) => textResult(JSON.stringify(i === 0 ? emptyRow : VALID_ANALYSIS)), json(S2_PARTIAL));
  const res = await request();
  assert.equal(stage1Calls().length, 2);
  assert.equal(stage2Calls().length, 1);
  assert.equal(res.body.meta.pckRowTextRetries, 1);
  assert.deepEqual(res.body.stage1, HISTORY_FIELDS(VALID_ANALYSIS));
});

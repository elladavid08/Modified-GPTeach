// 1.4.1: missed-misconception PCK fix (pck_missed_misconception_experiment.md).
// (1) The PCK prompt carries one clarification block (verbatim as tested, condition B): a hedged or
//     tag-question incorrect claim is a student error, and a bare acknowledgement of it is a missed
//     error-identification. The rest of the prompt is byte-identical to 1.4.0.
// (2) A deterministic bare-acknowledgement guard: when the teacher's trimmed message is exactly
//     "אוקיי", "יפה" or "נכון", feedback may be displayed only if the analysis is a missed
//     error-identification (EI relevant, score 0, pedagogical_quality "problematic"); otherwise the
//     display is suppressed. The guard never detects errors, never changes scores or other fields,
//     and leaves every other teacher message untouched. Real server.js, fake Vertex model.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { startServer, postJson, promptText } from '../test-support/startServer.mjs';
import { textResult } from '../test-support/fakes/vertexai.mjs';
import { NO_FEEDBACK_ANALYSIS, MALFORMED_OUTPUTS } from '../test-support/pckFixtures.mjs';
import { BARE_ACKNOWLEDGEMENTS, isBareAcknowledgement, isMissedErrorIdentification, applyBareAcknowledgementGuard } from '../pck_bare_ack_guard.js';

let srv;
before(async () => { srv = await startServer(); });
after(async () => { await srv.close(); });
beforeEach(() => srv.fakeModel.reset());

const clone = (v) => JSON.parse(JSON.stringify(v));

// ─── Analyses in the shapes observed live (pck_missed_misconception_experiment.md §4) ───

/** Missed misconception after a bare acknowledgement: the validated shape. */
const MISSED_EI = {
  pedagogical_quality: 'problematic',
  predicted_student_state: {
    understanding_level: 'misconception_reinforced',
    response_tone: 'confident',
    student_reaction_hints: [{ student: 'רועי', likelihood: 'high', reaction_type: 'reinforced_acceptance', reason: 'קיבל אישור' }],
  },
  addressed_misconception: false,
  how_addressed: '',
  misconception_risk: 'high',
  demonstrated_skills: [],
  missed_opportunities: [{ skill_id: 'error-identification', what_could_have_been_done: 'יכולת לשאול: האם ריבוע מקיים את ההגדרה?' }],
  should_provide_feedback: true,
  feedback_trigger: 'student_misconception_not_addressed',
  skills_assessment: [
    { skill_id: 'error-identification', is_relevant: true, score: 0, what_could_be_better: 'יכולת לשאול: האם ריבוע מקיים את ההגדרה?' },
    { skill_id: 'error-characterization', is_relevant: false, reason_not_relevant: 'prerequisite skill error-identification was not demonstrated this turn' },
  ],
  feedback_message_hebrew: "הוחמצה הזדמנות לזיהוי השגיאה: רועי טען שריבוע אינו מלבן, אך הגבת ב'אוקיי'. יכולת לשאול: 'האם ריבוע מקיים את ההגדרה של מלבן?'",
};

/** Praise for a bare acknowledgement after a correct answer (an observed false positive). */
const PRAISE_APR = {
  pedagogical_quality: 'positive',
  predicted_student_state: { understanding_level: 'improved', response_tone: 'confident', student_reaction_hints: [] },
  addressed_misconception: true,
  how_addressed: 'אישר את המסקנה',
  misconception_risk: 'low',
  demonstrated_skills: [{ skill_id: 'adapted-pedagogical-response', evidence: 'אישרת את המסקנה' }],
  missed_opportunities: [],
  should_provide_feedback: true,
  feedback_trigger: 'excellent_pck_use',
  skills_assessment: [{ skill_id: 'adapted-pedagogical-response', is_relevant: true, score: 2, evidence: 'אישרת את המסקנה' }],
  feedback_message_hebrew: 'תגובה פדגוגית מותאמת: אישרת וחיזקת את המסקנה — מצוין.',
};

/** Praise as error-leveraging after a self-correction (observed false positive). */
const PRAISE_EL = clone(PRAISE_APR);
PRAISE_EL.demonstrated_skills = [{ skill_id: 'error-leveraging', evidence: 'חיזקת את התלמידות' }];
PRAISE_EL.skills_assessment = [{ skill_id: 'error-leveraging', is_relevant: true, score: 2, evidence: 'חיזקת את התלמידות' }];
PRAISE_EL.feedback_message_hebrew = 'מינוף השגיאה ללמידה: חיזקת את התלמידות ברגע שהגיעו להבנה — מצוין.';

/** Criticism on APR after a genuine student question (observed false positive; neutral + shown). */
const CRITICISM_APR = {
  ...clone(NO_FEEDBACK_ANALYSIS),
  missed_opportunities: [{ skill_id: 'adapted-pedagogical-response', what_could_have_been_done: 'יכולת לשאול' }],
  should_provide_feedback: true,
  feedback_trigger: 'missed_opportunity',
  skills_assessment: [{ skill_id: 'adapted-pedagogical-response', is_relevant: true, score: 0, what_could_be_better: 'יכולת לשאול' }],
  feedback_message_hebrew: "הוחמצה הזדמנות לתגובה פדגוגית מותאמת: התגובה שלך 'אוקיי' לא קידמה את החקירה.",
};

const HISTORY = [
  { role: 'user', name: 'Teacher', text: 'רועי, האם ריבוע הוא מלבן?' },
  { role: 'assistant', name: 'רועי', text: 'נראה לי שלא, ריבוע זה צורה אחרת' },
];
const SCENARIO = { text: 'יחסי הכלה בין ריבוע למלבן', misconception_focus: 'ריבוע אינו מלבן' };

async function pck(teacherMessage, analysis) {
  srv.fakeModel.respond = () => textResult(JSON.stringify(analysis));
  return postJson(srv.baseUrl, '/api/pck-feedback', {
    teacherMessage,
    conversationHistory: [...HISTORY, { role: 'user', name: 'Teacher', text: teacherMessage }],
    scenario: SCENARIO,
    feedbackHistory: [],
  });
}

/** Everything except the display decision and the (emptied) message must be returned unchanged. */
function assertOnlyDisplaySuppressed(returned, original) {
  assert.equal(returned.should_provide_feedback, false);
  assert.equal(returned.feedback_message_hebrew, '');
  const strip = ({ should_provide_feedback, feedback_message_hebrew, ...rest }) => rest;
  assert.deepEqual(strip(returned), strip(original));
}

// ─── Unit: the guard module ──────────────────────────────────────────────────

test('the bare acknowledgements are exactly אוקיי, יפה, נכון (no "?")', () => {
  assert.deepEqual([...BARE_ACKNOWLEDGEMENTS], ['אוקיי', 'יפה', 'נכון']);
  for (const m of ['אוקיי', 'יפה', 'נכון', '  אוקיי  ', '\nיפה\n']) assert.equal(isBareAcknowledgement(m), true, m);
  for (const m of ['?', 'אוקיי.', 'יפה מאוד', 'נכון מאוד!', 'אוקיי, בואו נמשיך', 'יפה, תודה לכם.', 'בסדר', '', null, undefined, 42]) {
    assert.equal(isBareAcknowledgement(m), false, String(m));
  }
});

test('missed error-identification = EI relevant with score 0 and quality problematic', () => {
  assert.equal(isMissedErrorIdentification(MISSED_EI), true);
  const scored1 = clone(MISSED_EI); scored1.skills_assessment[0].score = 1;
  const notRelevant = clone(MISSED_EI); notRelevant.skills_assessment[0].is_relevant = false;
  const notProblematic = clone(MISSED_EI); notProblematic.pedagogical_quality = 'neutral';
  const noEi = clone(MISSED_EI); noEi.skills_assessment = noEi.skills_assessment.slice(1);
  for (const a of [scored1, notRelevant, notProblematic, noEi, PRAISE_APR, CRITICISM_APR, NO_FEEDBACK_ANALYSIS]) assert.equal(isMissedErrorIdentification(a), false);
});

test('guard: returns the same object when it does not apply, a copy with only the display suppressed when it does', () => {
  const kept = applyBareAcknowledgementGuard('אוקיי', MISSED_EI);
  assert.equal(kept.suppressed, false);
  assert.equal(kept.analysis, MISSED_EI);
  const notBare = applyBareAcknowledgementGuard('אוקיי, בואו נמשיך', PRAISE_APR);
  assert.equal(notBare.suppressed, false);
  assert.equal(notBare.analysis, PRAISE_APR);
  const original = clone(PRAISE_APR);
  const suppressed = applyBareAcknowledgementGuard('יפה', PRAISE_APR);
  assert.equal(suppressed.suppressed, true);
  assert.equal(suppressed.analysis.should_provide_feedback, false);
  assert.deepEqual(PRAISE_APR, original, 'the input analysis is not mutated');
  const notShown = applyBareAcknowledgementGuard('נכון', NO_FEEDBACK_ANALYSIS);
  assert.equal(notShown.suppressed, false);
  assert.equal(notShown.analysis, NO_FEEDBACK_ANALYSIS);
});

// ─── Endpoint: all three acknowledgements ────────────────────────────────────

for (const ack of ['אוקיי', 'יפה', 'נכון']) {
  test(`"${ack}" after a misconception: the missed error-identification feedback stays shown, unchanged`, async () => {
    const res = await pck(ack, MISSED_EI);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.analysis, MISSED_EI);
  });

  test(`"${ack}" after a correct answer: praise (APR) is not displayed; scores and other fields unchanged`, async () => {
    const res = await pck(ack, PRAISE_APR);
    assert.equal(res.status, 200);
    assertOnlyDisplaySuppressed(res.body.analysis, PRAISE_APR);
    assert.deepEqual(res.body.analysis.skills_assessment, PRAISE_APR.skills_assessment, 'APR score untouched');
  });

  test(`"${ack}" after a genuine student question: criticism (APR 0) is not displayed; scores unchanged`, async () => {
    const res = await pck(ack, CRITICISM_APR);
    assert.equal(res.status, 200);
    assertOnlyDisplaySuppressed(res.body.analysis, CRITICISM_APR);
  });

  test(`"${ack}" after a self-correction: error-leveraging praise is not displayed`, async () => {
    const res = await pck(ack, PRAISE_EL);
    assert.equal(res.status, 200);
    assertOnlyDisplaySuppressed(res.body.analysis, PRAISE_EL);
  });

  test(`"${ack}" with a no-feedback decision stays a no-feedback decision`, async () => {
    const res = await pck(ack, NO_FEEDBACK_ANALYSIS);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.analysis, NO_FEEDBACK_ANALYSIS);
  });
}

test('an acknowledgement with surrounding whitespace is still a bare acknowledgement', async () => {
  const res = await pck('  יפה \n', PRAISE_APR);
  assertOnlyDisplaySuppressed(res.body.analysis, PRAISE_APR);
});

test('EI score 0 without quality "problematic" is not a validated missed identification: display suppressed', async () => {
  const inconsistent = clone(MISSED_EI); inconsistent.pedagogical_quality = 'neutral';
  const res = await pck('אוקיי', inconsistent);
  assertOnlyDisplaySuppressed(res.body.analysis, inconsistent);
});

test('a problematic turn on another skill (EI not relevant) after a bare acknowledgement: display suppressed, scores unchanged', async () => {
  const otherSkill = { ...clone(CRITICISM_APR), pedagogical_quality: 'problematic' };
  const res = await pck('נכון', otherSkill);
  assertOnlyDisplaySuppressed(res.body.analysis, otherSkill);
});

// ─── Endpoint: everything else is untouched ──────────────────────────────────

for (const [label, message] of [
  ['acknowledgement with more text', 'אוקיי, בואו נמשיך לנושא הבא'],
  ['praise with more text', 'יפה מאוד, כל הכבוד.'],
  ['"נכון" with emphasis', 'נכון מאוד!'],
  ['acknowledgement with punctuation', 'אוקיי.'],
  ['bare question mark (not in the production rule)', '?'],
  ['explanation', 'בואו נבדוק לפי ההגדרה: מלבן הוא מרובע שכל זוויותיו ישרות. לריבוע יש ארבע זוויות ישרות, ולכן כל ריבוע הוא מלבן.'],
  ['opening', 'שלום כיתה! בשיעור הקודם למדנו על מלבן. מה ההגדרה של מלבן?'],
  ['closing', 'יפה, תודה לכם.'],
  ['redirecting question', 'בואו נבדוק - מה ההגדרה של מלבן?'],
]) {
  test(`non-bare teacher message is unaffected (${label}): shown praise stays shown`, async () => {
    const res = await pck(message, PRAISE_APR);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.analysis, PRAISE_APR);
  });
}

test('non-bare message: shown criticism and no-feedback decisions are also unchanged', async () => {
  assert.deepEqual((await pck('אוקיי, בואו נמשיך', CRITICISM_APR)).body.analysis, CRITICISM_APR);
  assert.deepEqual((await pck('שלום לכולם!', NO_FEEDBACK_ANALYSIS)).body.analysis, NO_FEEDBACK_ANALYSIS);
});

test('the guard does not change the response shape or telemetry keys', async () => {
  const res = await pck('יפה', PRAISE_APR);
  assert.deepEqual(Object.keys(res.body).sort(), ['analysis', 'meta', 'success']);
  assert.deepEqual(Object.keys(res.body.meta).sort(), ['agent', 'attempts', 'finishReason', 'latencyMs', 'model']);
});

for (const [label, raw, kind] of MALFORMED_OUTPUTS.slice(0, 6)) {
  test(`structured-output validation unchanged on a bare acknowledgement: ${label}`, async () => {
    srv.fakeModel.respond = () => textResult(raw);
    const res = await postJson(srv.baseUrl, '/api/pck-feedback', { teacherMessage: 'אוקיי', conversationHistory: HISTORY, scenario: SCENARIO, feedbackHistory: [] });
    assert.equal(res.status, 500);
    assert.equal(res.body.success, false);
    if (raw.trim() !== '') assert.equal(res.body.errorKind, kind);
  });
}

// ─── Prompt: the one tested clarification block ──────────────────────────────

const CLARIFICATION = `**⚠️ IMPORTANT — A bare acknowledgement of a student's incorrect claim is not a procedural message:**
A student's mathematically incorrect claim counts as a student error even when it is phrased tentatively or hedged (e.g. "נראה לי ש...", "אני חושב ש...", "אז אולי...") or as a tag question that asserts the wrong idea (e.g. "...אז זה ריבוע, לא?"). This is different from a genuine information-seeking question, which contains no claim. If the most recent student turn contains such an incorrect claim and the teacher's current message is only a bare acknowledgement or confirmation such as "אוקיי", "יפה" or "נכון", without identifying or addressing the error, do not stop at Gate 0: this is a missed error-identification opportunity. error-identification is relevant (it must be evaluated) and receives score 0, pedagogical_quality is "problematic", and should_provide_feedback is true (feedback_trigger: "student_misconception_not_addressed"). A bare acknowledgement after a correct answer or a genuine question remains a procedural message with no feedback.`;
const GATE0_STOP = 'If the current message is any of the above ❌ categories → should_provide_feedback: false. Stop here.';
// SHA-256 of the 1.4.0 PCK prompt for exactly this request (recorded before the change)
const PROMPT_1_4_0_SHA256 = 'fedadeafe4ef4e018b90ca1b19ba76010181e983fb0c26276d08d98b80ae57b3';

async function promptFor() {
  srv.fakeModel.respond = () => textResult(JSON.stringify(NO_FEEDBACK_ANALYSIS));
  await postJson(srv.baseUrl, '/api/pck-feedback', {
    teacherMessage: 'אוקיי',
    conversationHistory: [...HISTORY, { role: 'user', name: 'Teacher', text: 'אוקיי' }],
    scenario: SCENARIO,
    feedbackHistory: [],
  });
  return promptText(srv.fakeModel.calls[0]);
}

test('prompt: the clarification appears once, verbatim, inside Gate 0 right before its stop rule', async () => {
  const text = await promptFor();
  assert.equal(text.split(CLARIFICATION).length - 1, 1, 'block verbatim, exactly once');
  assert.ok(text.includes(`${CLARIFICATION}\n\n${GATE0_STOP}`), 'block immediately precedes the Gate 0 stop rule');
  const questionsNote = text.indexOf('**⚠️ IMPORTANT — Questions as pedagogical moves:**');
  const gate1 = text.indexOf('### GATE 1');
  const at = text.indexOf(CLARIFICATION);
  assert.ok(questionsNote >= 0 && questionsNote < at && at < gate1, 'after the questions note, before Gate 1');
});

test('prompt: everything except the block is byte-identical to 1.4.0', async () => {
  const text = await promptFor();
  const without = text.replace(`${CLARIFICATION}\n\n`, '');
  assert.equal(createHash('sha256').update(without).digest('hex'), PROMPT_1_4_0_SHA256);
});

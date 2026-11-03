// A1i (PCK_STAGE2) parity with the FROZEN research files (R1 of research/simulator_audit/pck_eval/x12/REGRESSION_PROTOCOL.md).
// The research reference is checked against its own recorded hashes first (FINAL.sha256, CONTRACT.sha256), then the
// production modules are compared with it: rubric, prompt, schema, validator, context extraction, guard, signal, the
// no-feedback rule and the student data contract. Synthetic inputs only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { STAGE2_RUBRIC, STAGE2_SKILL_IDS, extractStage2Context, buildStage2Prompt, buildStage2Schema, validateStage2Output } from '../pck_stage2.js';
import { ACK_WORDS, CAST_NAMES, isLocalAcknowledgement, applyLeveragingGuard } from '../pck_leveraging_guard.js';
import { signalFromRows, studentPckView, finalizeStage2Turn, toSkillsAssessment } from '../pck_stage2_policy.js';

const X12 = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../research/simulator_audit/pck_eval/x12');
const require = createRequire(path.join(X12, 'x.cjs'));
const F = require('./stage2_final.cjs');
const S2 = require('./stage2.cjs');
const X9 = require('../x9/stage2.cjs');
const G = require('./leveraging_guard.cjs');
const DEP = require('./stage2_dep.cjs');
const FINAL = require('./final_pipeline.cjs');
const SV = require('./student_view.cjs');
const FR = F.loadRubric(path.join(X12, 'rubric_final.FROZEN.json'));

const sha = (file) => createHash('sha256').update(readFileSync(path.join(X12, file))).digest('hex');
for (const list of ['FINAL.sha256', 'CONTRACT.sha256']) {
  test(`the research reference is the frozen one (${list})`, () => {
    const lines = readFileSync(path.join(X12, list), 'utf8').trim().split('\n');
    assert.ok(lines.length >= 2);
    for (const line of lines) {
      const [hash, file] = line.trim().split(/\s+/);
      assert.equal(sha(file), hash, `${file} changed since the freeze`);
    }
  });
}

const CTXS = [
  { lesson: 'נושא השיעור: יחסי הכלה בין ריבוע למלבן\nכיתה: ז', history: 'מורה: מה ההגדרה של מלבן?\nנועה: מרובע שכל הזוויות שלו ישרות.\nיובל: אבל ריבוע זה לא מלבן.', teacher: 'יובל, למה אתה חושב שריבוע הוא לא מלבן?' },
  { lesson: 'L', history: '', teacher: 'כן' },
  { lesson: 'נושא: אלכסונים במעוין', history: 'מורה: "שאלה עם מירכאות"', teacher: 'נכון מאוד, אלכסונים מאונכים לבד לא מספיקים. כל הכבוד.' },
];

test('rubric: the production file equals the frozen research rubric (rubric_final.FROZEN.json over stage2.cjs)', () => {
  assert.deepEqual(STAGE2_SKILL_IDS, F.SKILL_IDS);
  assert.deepEqual(Object.keys(STAGE2_RUBRIC), F.SKILL_IDS);
  for (const id of F.SKILL_IDS) assert.deepEqual(STAGE2_RUBRIC[id], FR.rubric[id], id);
  assert.deepEqual(FR.general, []);
});

test('prompt: byte-identical to the frozen research prompt', () => {
  for (const ctx of CTXS) assert.equal(buildStage2Prompt(ctx), F.buildPrompt(ctx, FR));
});

test('schema: identical to the research schema (score_first)', () => {
  assert.deepEqual(buildStage2Schema(), F.buildSchema());
});

const out = (skills) => JSON.stringify({ skills });
const sk = (id, rel, score, pos, imp) => ({ skill_id: id, is_relevant: rel, score: rel ? score : null, what_exists: pos || '', what_to_improve: imp || '' });
const ALL_OFF = F.SKILL_IDS.map((id) => sk(id, false));
const OUTPUTS = [
  out(F.SKILL_IDS.map((id, i) => (i === 0 ? sk(id, true, 2, 'P') : i === 3 ? sk(id, true, 1, 'P', 'I') : sk(id, false)))),
  out(F.SKILL_IDS.map((id, i) => (i === 4 ? sk(id, true, 0, '', 'I') : sk(id, false)))),
  out(F.SKILL_IDS.map((id, i) => (i === 4 ? sk(id, true, 1, 'P', '') : sk(id, false)))), // text contract
  out(ALL_OFF), // no relevant skill
  out([...ALL_OFF].reverse()), // order
  out(F.SKILL_IDS.map((id, i) => (i === 1 ? sk(id, true, 3, 'P') : sk(id, false)))), // invalid score
  out(ALL_OFF.slice(1)), 'not json', '', '[]', '{"skills": 5}',
  out(F.SKILL_IDS.map((id, i) => (i === 2 ? { ...sk(id, true, 2, '  P  '), what_to_improve: 'ignored for 2' } : sk(id, false)))),
];
test('validator: identical results to the research validator', () => {
  for (const o of OUTPUTS) assert.deepEqual(validateStage2Output(o), S2.validate(o), o.slice(0, 60));
});

test('context extraction: identical to the research extractor (the input of every research run)', () => {
  const stage1Like = `You are a PCK expert.\n\n## Lesson Context\nנושא: מלבן\n\n## Universal PCK Skills to Assess\n\nskills\n\n## Conversation History (Hebrew)\nמורה: שאלה\nנועה: תשובה\n\n## Teacher's Latest Message to Analyze\n"מה ההגדרה של מלבן?"\n\n## 📊 Previous Feedback History\nx`;
  for (const p of [stage1Like, stage1Like.replace('## 📊', '---'), 'no sections', stage1Like.replace('"מה ההגדרה של מלבן?"', 'בלי מירכאות')]) {
    assert.deepEqual(extractStage2Context(p), X9.extractContext(p));
  }
});

const MESSAGES = ['כן', 'כןןן', 'נכוון מאוד דנה', 'מצויניים', 'נהדרת!', 'נועה נהדרת גם כן', 'כל הכבוד תלמידים מצטיינים שלי!', 'בדיוק  עדי עבודה יפה',
  'כן?', 'נכון, כי בריבוע כל הזוויות ישרות', 'וואו, איזה יופי של חשיבה! אני ממש גאה בכם על ההתמדה.', 'את צודקת', 'ונכון', 'אוקיי 👍', '', '   ', 'יפה יפה יפה יפה יפה יפה'];
test('leveraging guard v2: same word list and same decisions as the research guard', () => {
  assert.deepEqual([...ACK_WORDS], G.ACK_WORDS);
  assert.equal(G.GUARD_VERSION, 2);
  for (const n of ['דנה', 'הילה', 'יובל', 'יונתן', 'מעיין', 'נועה', 'עדי', 'רועי', 'תמר']) assert.ok(CAST_NAMES.includes(n));
  for (const m of MESSAGES) assert.equal(isLocalAcknowledgement(m), G.isLocalAcknowledgement(m), m);
  const rows = [{ skillId: 'error-identification', score: 0, improvement: 'I' }, { skillId: 'error-leveraging', score: 0, improvement: 'I' }];
  for (const m of MESSAGES) assert.deepEqual(applyLeveragingGuard(m, rows), G.applyLeveragingGuard(m, rows), m);
});

const row = (skillId, score, pos = `POS-${skillId}`, imp = `IMP-${skillId}`) => ({ skillId, score, positive: score >= 1 ? pos : null, improvement: score <= 1 ? imp : null });
const ROWSETS = [
  [row('error-identification', 2)],
  [row('error-identification', 1), row('diagnostic-interpretation', 0)],
  [row('error-identification', 0), row('error-leveraging', 0)],
  [row('adapted-pedagogical-response', 1), row('error-leveraging', 2)],
  [row('error-leveraging', 0)],
  [row('error-characterization', 0, null, ' ')], // a row without text
];
const STAGE1S = [
  { pedagogical_quality: 'positive', addressed_misconception: true, how_addressed: 'S1-HOW', misconception_risk: 'low',
    demonstrated_skills: [{ skill_id: 'diagnostic-interpretation', evidence: 'S1-EV' }], missed_opportunities: [], should_provide_feedback: true,
    predicted_student_state: { understanding_level: 'improved', response_tone: 'confident', who_should_respond: ['נועה'], likely_reactions: ['S1-L'],
      student_reaction_hints: [{ student: 'נועה', reaction_type: 'understanding_progress', likelihood: 'high', reason: 'S1-R' }, { student: 'יובל', reaction_type: 'reinforced_acceptance', reason: 'S1-R2' }] },
    skills_assessment: [{ skill_id: 'diagnostic-interpretation', is_relevant: true, score: 2, evidence: 'S1-EV' }], feedback_message_hebrew: 'S1-MSG', feedback_trigger: 'excellent_pck_use' },
  { pedagogical_quality: 'problematic', addressed_misconception: false, how_addressed: '', misconception_risk: 'high', demonstrated_skills: [], missed_opportunities: [{ skill_id: 'error-identification', what_could_have_been_done: 'S1-M' }],
    should_provide_feedback: true, predicted_student_state: { understanding_level: 'misconception_reinforced', response_tone: 'confident', student_reaction_hints: [{ student: 'הילה', reaction_type: 'cautious_clarification', likelihood: 'medium', reason: 'S1-R3' }] },
    skills_assessment: [{ skill_id: 'error-identification', is_relevant: true, score: 0, what_could_be_better: 'S1-M' }], feedback_message_hebrew: 'S1-MSG2' },
];
const TEACHERS = ['יובל, למה אתה חושב כך?', 'כן', 'נכון'];

test('policy: the same display rows, suppression, guard, signal and student view as the research pipeline', () => {
  for (const s1 of STAGE1S) for (const rows of ROWSETS) for (const t of TEACHERS) {
    const prod = finalizeStage2Turn({ teacherMessage: t, stage1Analysis: s1, stage2: { ok: true, rows } });
    const ref = FINAL.finalizeTurn({ teacherMessage: t, stage1: s1, stage2: { status: 'stage2', rows } });
    assert.equal(prod.suppressed, ref.suppressed);
    assert.equal(prod.guardDropped, ref.guardDropped);
    assert.equal(prod.signal, ref.signal);
    assert.equal(prod.signal, ref.rows.length ? DEP.signalFromRows(ref.rows) : null);
    if (ref.suppressed) {
      assert.deepEqual(prod.analysis, { ...s1, should_provide_feedback: false, feedback_message_hebrew: '' });
      continue;
    }
    const view = SV.studentPckView(s1, ref.rows, ref.signal);
    assert.deepEqual(prod.analysis, { ...view, should_provide_feedback: true, skills_assessment: toSkillsAssessment(ref.rows), feedback_message_hebrew: '' });
    // the display shape of research to_stage1_shape.mjs
    for (const id of STAGE2_SKILL_IDS) {
      const r = ref.rows.find((x) => x.skillId === id);
      const sa = prod.analysis.skills_assessment.find((x) => x.skill_id === id);
      assert.deepEqual(sa, r ? { skill_id: id, is_relevant: true, score: r.score, evidence: r.positive || '', what_could_be_better: r.improvement || '' } : { skill_id: id, is_relevant: false });
    }
    assert.deepEqual(Object.values(SV.auditStudentInput(prod.analysis, ref.rows, ref.signal)).filter(Boolean), [], 'student input passes the X12E audit');
  }
});

test('policy: signal and student view equal the research functions directly', () => {
  for (const rows of ROWSETS.slice(0, 4)) {
    const sig = signalFromRows(rows);
    assert.equal(sig, DEP.signalFromRows(rows));
    for (const s1 of STAGE1S) assert.deepEqual(studentPckView(s1, rows, sig), SV.studentPckView(s1, rows, sig));
  }
});

test('policy: Stage 2 failed -> the Stage-1 analysis object itself, unchanged (exactly 1.5.1)', () => {
  const s1 = STAGE1S[0];
  const f = finalizeStage2Turn({ teacherMessage: 'x', stage1Analysis: s1, stage2: { ok: false } });
  assert.equal(f.analysis, s1);
  assert.equal(f.source, 'fallback_stage1');
});

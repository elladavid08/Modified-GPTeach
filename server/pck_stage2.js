/**
 * PCK Stage 2 (A1i, behind PCK_STAGE2): the frozen final Stage-2 candidate.
 * Research: research/simulator_audit/pck_stage2_final_round.md, pck_a1i_implementation_plan.md;
 * frozen files: research/simulator_audit/pck_eval/x12/FINAL_FREEZE.md / FINAL.sha256.
 *
 * Stage 2 runs only on turns Stage 1 (the unchanged 1.5.1 PCK call) shows. It receives the three sections of the
 * Stage-1 prompt (lesson context, conversation history, teacher message: extractStage2Context) and NOTHING from the
 * Stage-1 output, and returns for each of the five skills relevance, a 0/1/2 score and the teacher-facing text:
 *   score 2: what_exists; score 1: what_exists + what_to_improve; score 0: what_to_improve.
 *
 * This file is a verbatim port of the research builder (x12/stage2.cjs buildPrompt / buildSchema / validate,
 * score_first; x9/stage2.cjs extractContext); the rubric is pck_stage2_rubric.json (= x12/rubric_final.FROZEN.json
 * merged over the x12/stage2.cjs rubric). Parity test: server/test/pck_stage2_parity.test.mjs. Do not edit the prompt,
 * schema, validator or rubric here without a new research freeze.
 */
import { readFileSync } from 'fs';

export const STAGE2_SKILL_IDS = ['error-identification', 'error-characterization', 'diagnostic-interpretation', 'adapted-pedagogical-response', 'error-leveraging'];
export const STAGE2_RUBRIC = JSON.parse(readFileSync(new URL('./pck_stage2_rubric.json', import.meta.url), 'utf8'));
export const STAGE2_CANDIDATE = 'x12-final-v5c';
export const STAGE2_MAX_OUTPUT_TOKENS = 1200;

const FIELD_ORDER = ['skill_id', 'is_relevant', 'score', 'what_exists', 'what_to_improve'];

/** The three Stage-1 prompt sections Stage 2 receives (null if one is missing). */
export function extractStage2Context(stage1Prompt) {
  const between = (a, b) => {
    const i = stage1Prompt.indexOf(a);
    if (i < 0) return null;
    const j = stage1Prompt.indexOf(b, i + a.length);
    return j < 0 ? null : stage1Prompt.slice(i + a.length, j);
  };
  const lesson = between('## Lesson Context\n', '\n\n## Universal PCK Skills to Assess');
  const history = between('## Conversation History (Hebrew)\n', "\n\n## Teacher's Latest Message to Analyze");
  const head = "## Teacher's Latest Message to Analyze\n";
  const t0 = stage1Prompt.indexOf(head);
  let teacher = null;
  if (t0 >= 0) {
    const rest = stage1Prompt.slice(t0 + head.length);
    const end = rest.search(/\n\n(## |---)/);
    teacher = (end < 0 ? rest : rest.slice(0, end)).trim();
    if (teacher.startsWith('"') && teacher.endsWith('"')) teacher = teacher.slice(1, -1);
  }
  if (lesson == null || history == null || teacher == null) return null;
  return { lesson: lesson.trim(), history: history.trim(), teacher };
}

export function buildStage2Prompt(ctx) {
  const skills = STAGE2_SKILL_IDS.map((id) => {
    const r = STAGE2_RUBRIC[id];
    return `### ${id} (${r.name})\nWhen to evaluate: ${r.relevant}\nScores:\n${r.scores.map((s) => `- ${s}`).join('\n')}`;
  }).join('\n\n');
  const orderNote = 'For each relevant skill, first give the score, then write the text that the score requires.';
  return `You are the second step of a PCK feedback system for a Hebrew geometry teacher-training simulator. A first step has already decided that feedback IS shown to the teacher for the latest message; do not question that. Your task: decide which of the five PCK skills the teacher's latest message should be evaluated on, score each of them 0, 1 or 2, and write the short feedback text the teacher will read.

## Lesson Context
${ctx.lesson}

## Conversation History (Hebrew)
${ctx.history}

## Teacher's Latest Message (the move to evaluate)
"${ctx.teacher}"

## The five skills
${skills}

## Relevance
- A skill is relevant when the teacher's latest move should be judged on it, including when the teacher MISSED it (then the score is 0).
- Judge only the latest message, in the light of the conversation. Never credit something the teacher did in an earlier turn.
- Usually one or two skills are relevant, rarely three. At least one skill must be relevant.
- Keep the boundaries: a question about how or why the student reasoned is diagnostic interpretation, not an adapted pedagogical response; continuing or broadening after an error is leveraging only when the error episode is resolved.

## Text (Hebrew, addressed to the teacher in the second person, e.g. "שאלת", "הפנית", "כדאי לבקש")
- what_exists: what the teacher actually did in the latest message that serves this skill, concretely (one or two short sentences). Required for score 1 and 2. Empty "" for score 0 and for skills that are not relevant.
- what_to_improve: one concrete next step the teacher could take (one or two short sentences). Required for score 0 and 1. Empty "" for score 2 and for skills that are not relevant.
- The score must match the text: 2 = the move does what the skill describes and nothing essential is missing; 1 = something is there and something essential is missing; 0 = the skill was needed but the move does not do it.
- ${orderNote}

Return only JSON: {"skills": [...]} with exactly one entry per skill, in the order listed above. For a skill that is not relevant: is_relevant false, score null, both texts "".`;
}

export function buildStage2Schema() {
  return {
    type: 'object',
    properties: {
      skills: {
        type: 'array',
        minItems: STAGE2_SKILL_IDS.length,
        maxItems: STAGE2_SKILL_IDS.length,
        items: {
          type: 'object',
          properties: {
            skill_id: { type: 'string', enum: STAGE2_SKILL_IDS },
            is_relevant: { type: 'boolean' },
            score: { type: 'integer', nullable: true },
            what_exists: { type: 'string' },
            what_to_improve: { type: 'string' },
          },
          required: FIELD_ORDER,
          propertyOrdering: FIELD_ORDER,
        },
      },
    },
    required: ['skills'],
    propertyOrdering: ['skills'],
  };
}

const nonEmpty = (v) => typeof v === 'string' && v.trim() !== '';

/**
 * Strict validation of a Stage-2 output.
 * {ok:true, rows:[{skillId, score, positive, improvement}]} (relevant skills, canonical order; the display rows), or
 * {ok:false, reason, rows?}: `rows` is present for a text-contract violation.
 */
export function validateStage2Output(text) {
  let v;
  try { v = JSON.parse(String(text).trim()); } catch { return { ok: false, reason: 'not_json' }; }
  if (!v || typeof v !== 'object' || Array.isArray(v) || !Array.isArray(v.skills)) return { ok: false, reason: 'no_skills' };
  if (v.skills.length !== STAGE2_SKILL_IDS.length) return { ok: false, reason: 'skill_count' };
  const rows = [];
  const contract = [];
  for (let i = 0; i < STAGE2_SKILL_IDS.length; i++) {
    const s = v.skills[i];
    if (!s || typeof s !== 'object' || s.skill_id !== STAGE2_SKILL_IDS[i]) return { ok: false, reason: 'skill_order' };
    if (typeof s.is_relevant !== 'boolean') return { ok: false, reason: 'bad_relevance' };
    if (!s.is_relevant) continue;
    if (![0, 1, 2].includes(s.score)) return { ok: false, reason: 'invalid_score' };
    const pos = nonEmpty(s.what_exists) ? s.what_exists.trim() : null;
    const imp = nonEmpty(s.what_to_improve) ? s.what_to_improve.trim() : null;
    const row = { skillId: s.skill_id, score: s.score, positive: s.score === 0 ? null : pos, improvement: s.score === 2 ? null : imp };
    if ((s.score >= 1 && !pos) || (s.score <= 1 && !imp)) contract.push(s.skill_id);
    rows.push(row);
  }
  if (rows.length === 0) return { ok: false, reason: 'no_relevant_skill', rows };
  if (contract.length) return { ok: false, reason: 'text_contract', rows, contract };
  return { ok: true, rows };
}

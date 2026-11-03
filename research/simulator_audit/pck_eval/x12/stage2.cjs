// X12 two-stage PCK, Stage 2 (research only; not production code).
// Stage 1 is the unchanged 1.5.1 PCK call: it alone decides show/hide (after the bare-acknowledgement guard) and steers
// the students. Stage 2 runs only for feedback Stage 1 shows. It receives the lesson context, the conversation history and
// the teacher's latest message (verbatim from the Stage-1 prompt) and NOTHING from the Stage-1 output, and returns, for each
// of the five skills, relevance, a 0/1/2 score and the teacher-facing text:
//   score 2: what_exists (positive evidence); score 1: what_exists + what_to_improve; score 0: what_to_improve.
// Boundary rules follow the B200 expert semantics (pck_b200_expert_grounding.md §4) and the educational team's 1.5.0
// feedback (post_1.5_feedback_investigation.md). No participant text appears here; examples are generic.
'use strict';

const SKILL_IDS = ['error-identification', 'error-characterization', 'diagnostic-interpretation', 'adapted-pedagogical-response', 'error-leveraging'];
const { extractContext } = require('../x9/stage2.cjs');

// Per skill: when it should be evaluated (relevance) and what separates 0 / 1 / 2.
const RUBRIC = {
  'error-identification': {
    name: 'Error Identification',
    relevant: 'Evaluate when the most recent student turn(s) contain an incorrect or inaccurate mathematical claim or a misconception that the teacher has not yet clearly addressed. This includes a hedged claim, a claim phrased as a question ("..., לא?"), an error inside an otherwise good answer, and an error by one of several students. Not relevant when the recent student statements are correct, or when the error was already identified earlier and the class is now working on it.',
    scores: [
      '0 = the teacher does not notice or address the error: accepts or praises it, ignores it or moves on.',
      '1 = the teacher signals only indirectly that something should be checked (e.g. "think again", "let us check with the definition") without saying that the claim is wrong.',
      '2 = the teacher explicitly says that this student\'s claim is wrong or inaccurate (a short "that is not correct" counts), or directly corrects exactly that point.',
    ],
  },
  'error-characterization': {
    name: 'Error Characterization',
    relevant: 'Evaluate when the latest move deals with a student error (the teacher is responding to it) and the kind or source of the error matters for handling it, or when the teacher clarifies the conceptual distinction behind an error just discussed. Not relevant when no error is being handled.',
    scores: [
      '0 = the error is being handled but its type or source is not named, although naming it would help the student.',
      '1 = the teacher partly characterises the error (e.g. "one property alone is not enough") without naming its type or source precisely.',
      '2 = the teacher names the specific type or source of the error (e.g. judging by the typical appearance of a shape, confusing a property with the definition, necessary vs sufficient, over-generalising from one example).',
    ],
  },
  'diagnostic-interpretation': {
    name: 'Interpretation of Student Thinking (diagnostic interpretation)',
    relevant: 'Evaluate when a student\'s incorrect or uncertain idea is on the table in the recent turns and how the student reached it is not yet clear, so understanding the student\'s reasoning matters for the next step. In that situation it is relevant whether the teacher probes the reasoning (credit) or not (missed). Not relevant when the students\' recent statements are correct and confident, or when the reasoning behind the error has already been explored.',
    scores: [
      '0 = the teacher corrects, explains or moves on without trying to understand how the student reached the idea (a missed chance to ask the student how they reasoned).',
      '1 = the teacher names or guesses the student\'s reasoning (e.g. "it seems you decide by how the shape looks") without asking the student to explain it, or asks "why" in passing without letting the student explain.',
      '2 = the teacher asks the student to explain how they reasoned or why they think so (e.g. "why do you think...?", "how did you decide?") before correcting, or articulates the specific assumption behind the idea and checks it with the student.',
    ],
  },
  'adapted-pedagogical-response': {
    name: 'Adapted Pedagogical Response',
    relevant: 'Evaluate for almost every instructional move: an explanation, a question, a task, a definition check, a comparison, a counterexample or a summary, with or without a student error. Not relevant when the latest move only asks a student to explain their own reasoning (that is diagnostic interpretation, not a pedagogical response), or is purely social or procedural.',
    scores: [
      '0 = the move bypasses the student\'s thinking by simply giving the answer or the correction, or it contains mathematically incorrect guidance.',
      '1 = relevant and pedagogically useful, but primarily teacher-led or generic (e.g. the teacher explains, or returns to the definition by stating it). A direct clarification that genuinely responds to the student\'s confusion is 1, not 0. A correct explanation is not automatically 2.',
      '2 = clearly adapted to the student\'s thinking and actively advances their reasoning: it builds on their idea, asks them to justify, check, compare or reason, or uses a targeted counterexample, so that meaningful reasoning work goes back to the students.',
    ],
  },
  'error-leveraging': {
    name: 'Leveraging the Error for Learning',
    relevant: 'Evaluate only after the class has reached (or nearly reached) the correct idea about an error discussed earlier in this conversation, i.e. the error episode is resolved, and the teacher\'s latest move confirms, summarises, closes or continues from it. Not relevant while the error is still being identified, explored or corrected, when no error has occurred, and not for a bare acknowledgement ("yes", "right") of a conclusion the students reached themselves.',
    scores: [
      '0 = the teacher only confirms, corrects or summarises this case locally (a missed chance to generalise the conclusion or apply it to other cases).',
      '1 = the teacher starts to broaden beyond this case (e.g. invites checking another property or another shape) without stating or transferring a general principle. Opening a new direction without developing it is 1, not 2.',
      '2 = the teacher explicitly states the general principle or distinction behind the error and applies or transfers it beyond this case.',
    ],
  },
};

const FIELD_ORDER = {
  score_first: ['skill_id', 'is_relevant', 'score', 'what_exists', 'what_to_improve'],
  text_first: ['skill_id', 'is_relevant', 'what_exists', 'what_to_improve', 'score'],
};

function buildPrompt(ctx, { rubric = RUBRIC, order = 'score_first' } = {}) {
  const skills = SKILL_IDS.map((id) => {
    const r = rubric[id];
    return `### ${id} (${r.name})\nWhen to evaluate: ${r.relevant}\nScores:\n${r.scores.map((s) => `- ${s}`).join('\n')}`;
  }).join('\n\n');
  const orderNote = order === 'text_first'
    ? 'For each relevant skill, first write what_exists and what_to_improve, then give the score that matches them.'
    : 'For each relevant skill, first give the score, then write the text that the score requires.';
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

function buildSchema({ order = 'score_first' } = {}) {
  return {
    type: 'object',
    properties: {
      skills: {
        type: 'array',
        minItems: SKILL_IDS.length,
        maxItems: SKILL_IDS.length,
        items: {
          type: 'object',
          properties: {
            skill_id: { type: 'string', enum: SKILL_IDS },
            is_relevant: { type: 'boolean' },
            score: { type: 'integer', nullable: true },
            what_exists: { type: 'string' },
            what_to_improve: { type: 'string' },
          },
          required: FIELD_ORDER[order],
          propertyOrdering: FIELD_ORDER[order],
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
 * {ok:false, reason, rows?}: `rows` is present for a text-contract violation, so its relevance and scores can still be studied.
 */
function validate(text) {
  let v;
  try { v = JSON.parse(String(text).trim()); } catch { return { ok: false, reason: 'not_json' }; }
  if (!v || typeof v !== 'object' || Array.isArray(v) || !Array.isArray(v.skills)) return { ok: false, reason: 'no_skills' };
  if (v.skills.length !== SKILL_IDS.length) return { ok: false, reason: 'skill_count' };
  const rows = [];
  const contract = [];
  for (let i = 0; i < SKILL_IDS.length; i++) {
    const s = v.skills[i];
    if (!s || typeof s !== 'object' || s.skill_id !== SKILL_IDS[i]) return { ok: false, reason: 'skill_order' };
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

module.exports = { SKILL_IDS, RUBRIC, FIELD_ORDER, extractContext, buildPrompt, buildSchema, validate };

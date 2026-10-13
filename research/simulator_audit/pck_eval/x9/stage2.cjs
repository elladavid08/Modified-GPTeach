// X9 two-stage PCK scoring prototype: Stage 2 (scoring only). Research only; not production code.
// Stage 2 receives the lesson context, the full conversation history and the teacher's current message (taken verbatim
// from the Stage-1 prompt's own sections) plus the exact list of skill ids Stage 1 marked relevant. It returns one integer
// score per supplied skill and nothing else. It never sees Stage-1 scores, quality, praise text or feedback history.
'use strict';

const SKILL_IDS = ['error-identification', 'error-characterization', 'diagnostic-interpretation', 'adapted-pedagogical-response', 'error-leveraging'];

// Expert-grounded score semantics (pck_b200_expert_grounding.md §4; APR wording as specified for X9). No participant examples.
const RUBRIC = {
  'error-identification': [
    'Error Identification: does the teacher recognise that the student\'s statement contains an error?',
    '0 = the teacher does not notice or address the student\'s error (ignores it, accepts or praises it, or moves on).',
    '1 = the teacher addresses it only indirectly: signals that something should be checked without naming the error.',
    '2 = the teacher explicitly states that the student\'s statement is wrong or inaccurate.',
  ],
  'error-characterization': [
    'Error Characterization: does the teacher name what kind of error it is?',
    '0 = the error is being handled, but its type or source is not named.',
    '1 = the teacher partly characterises it (e.g. "one property alone is not enough") without naming the type precisely.',
    '2 = the teacher names the specific type or source of the error (e.g. relying on the typical appearance, confusing a property with the definition, necessary vs sufficient, over-generalising).',
  ],
  'diagnostic-interpretation': [
    'Diagnostic Interpretation: does the teacher try to understand how the student arrived at the idea?',
    '0 = no attempt to understand the student\'s reasoning.',
    '1 = the teacher asks why or makes a general observation, but does not let the student explain or does not go deeper.',
    '2 = the teacher has the student explain their reasoning before correcting, or articulates the specific assumption behind the error.',
  ],
  'adapted-pedagogical-response': [
    'Adapted Pedagogical Response: is the teacher\'s move adapted to this student\'s thinking?',
    '0 = the teacher gives the answer or the correction directly without engaging the student\'s thinking, or gives mathematically incorrect content.',
    '1 = useful and in the right direction, but teacher-led, generic, or insufficiently built on the student\'s own idea.',
    '2 = clearly adapted to the student\'s thinking: it builds on the student\'s own idea, or has the student actively check, justify, compare or reason toward the conclusion.',
  ],
  'error-leveraging': [
    'Leveraging the Error for Learning: does the teacher use the error to build broader understanding?',
    '0 = only a local confirmation, correction or summary of this case.',
    '1 = the teacher starts to broaden beyond this case but does not state or transfer a general principle.',
    '2 = the teacher explicitly states a general principle or distinction and applies or transfers it beyond this case.',
  ],
};

/** Pull the Stage-1 prompt's own lesson context, conversation history and current teacher message (verbatim). */
function extractContext(stage1Prompt) {
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

function buildPrompt(ctx, skillIds) {
  const rubric = skillIds.map((id) => `- ${id}\n  ${RUBRIC[id].join('\n  ')}`).join('\n');
  return `You score a Hebrew geometry teacher's latest move for specific PCK skills. Another step has already decided that feedback is given and which skills are relevant; do not question that. Your only task is to give each listed skill a score 0, 1 or 2 for the teacher's latest message.

## Lesson Context
${ctx.lesson}

## Conversation History (Hebrew)
${ctx.history}

## Teacher's Latest Message (the move to score)
"${ctx.teacher}"

## Skills to score (exactly these, in this order)
${rubric}

## How to score
- Score the quality of the teacher's latest move for each skill, judged in the light of the conversation; do not credit moves the teacher made in earlier turns.
- A listed skill can be relevant because the teacher missed it: if the latest message does not do what the skill describes, score 0.
- The score measures the teacher's move, not how serious the student's error is.

Return only JSON: {"skill_scores": [{"skill_id": ..., "score": ...}, ...]} with exactly one entry per listed skill.`;
}

function buildSchema(skillIds) {
  return {
    type: 'object',
    properties: {
      skill_scores: {
        type: 'array',
        minItems: skillIds.length,
        maxItems: skillIds.length,
        items: {
          type: 'object',
          properties: { skill_id: { type: 'string', enum: skillIds }, score: { type: 'integer' } },
          required: ['skill_id', 'score'],
          propertyOrdering: ['skill_id', 'score'],
        },
      },
    },
    required: ['skill_scores'],
    propertyOrdering: ['skill_scores'],
  };
}

/** Strict validation. Returns {ok:true, scores:{id:score}} or {ok:false, reason}. */
function validate(text, skillIds) {
  let v;
  try { v = JSON.parse(String(text).trim()); } catch { return { ok: false, reason: 'not_json' }; }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { ok: false, reason: 'not_object' };
  const extraTop = Object.keys(v).filter((k) => k !== 'skill_scores');
  if (extraTop.length) return { ok: false, reason: 'extra_fields' };
  if (!Array.isArray(v.skill_scores)) return { ok: false, reason: 'no_skill_scores' };
  const scores = {};
  for (const row of v.skill_scores) {
    if (!row || typeof row !== 'object') return { ok: false, reason: 'bad_row' };
    if (Object.keys(row).some((k) => k !== 'skill_id' && k !== 'score')) return { ok: false, reason: 'extra_row_fields' };
    if (!SKILL_IDS.includes(row.skill_id)) return { ok: false, reason: 'invalid_skill_id' };
    if (!skillIds.includes(row.skill_id)) return { ok: false, reason: 'unrequested_skill' };
    if (row.skill_id in scores) return { ok: false, reason: 'duplicate_skill' };
    if (!Number.isInteger(row.score) || ![0, 1, 2].includes(row.score)) return { ok: false, reason: 'invalid_score' };
    scores[row.skill_id] = row.score;
  }
  if (skillIds.some((id) => !(id in scores))) return { ok: false, reason: 'missing_skill' };
  return { ok: true, scores };
}

module.exports = { SKILL_IDS, RUBRIC, extractContext, buildPrompt, buildSchema, validate };

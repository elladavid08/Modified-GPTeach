/**
 * Real-time PCK feedback output contract (C10).
 *
 * - PCK_RESPONSE_SCHEMA is passed to Gemini (JSON mode) so the model output is structurally
 *   constrained at generation time.
 * - parsePckModelText / validatePckAnalysis are the server-side defence in depth: invalid output
 *   is rejected, never repaired or default-filled.
 *
 * The contract mirrors the "Expected JSON Response" section of the /api/pck-feedback prompt and
 * what the client consumes (Chat.jsx, PCKFeedbackSidebar, the student prompt, the logger).
 * It encodes structure, types and enumerated values only, not pedagogical rules.
 */
import { getAllPCKSkills } from './universal_pck_skills.js';

export const PCK_SKILL_IDS = getAllPCKSkills().map((skill) => skill.skill_id);

export const PCK_ENUMS = {
  pedagogical_quality: ['positive', 'neutral', 'problematic'],
  understanding_level: ['improved', 'same', 'confused', 'more_confused', 'misconception_reinforced'],
  response_tone: ['confident', 'hesitant', 'confused', 'frustrated', 'thoughtful'],
  likelihood: ['high', 'medium', 'low'],
  reaction_type: [
    'understanding_progress',
    'partial_understanding',
    'persistent_confusion',
    'reinforced_acceptance',
    'cautious_clarification',
    'misapplied_new_rule',
  ],
  misconception_risk: ['high', 'medium', 'low'],
  feedback_trigger: [
    'student_misconception_not_addressed',
    'incorrect_content',
    'epistemic_abdication',
    'excellent_pck_use',
    'missed_opportunity',
  ],
};

export const PCK_SCORES = [0, 1, 2];

/** Error texts. The shared prefix lets the C7 client classify both as stage "parse". */
export const PCK_PARSE_ERROR = 'Failed to parse AI response as JSON';
export const PCK_INVALID_ERROR = 'Failed to parse AI response: invalid PCK analysis';

const str = (description) => ({ type: 'string', ...(description ? { description } : {}) });
const enumStr = (values) => ({ type: 'string', enum: values });

export const PCK_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    pedagogical_quality: enumStr(PCK_ENUMS.pedagogical_quality),
    predicted_student_state: {
      type: 'object',
      properties: {
        understanding_level: enumStr(PCK_ENUMS.understanding_level),
        response_tone: enumStr(PCK_ENUMS.response_tone),
        student_reaction_hints: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              student: str(),
              likelihood: enumStr(PCK_ENUMS.likelihood),
              reaction_type: enumStr(PCK_ENUMS.reaction_type),
              reason: str(),
            },
            required: ['student', 'likelihood', 'reaction_type', 'reason'],
          },
        },
      },
      required: ['understanding_level', 'response_tone', 'student_reaction_hints'],
    },
    addressed_misconception: { type: 'boolean' },
    how_addressed: str(),
    misconception_risk: enumStr(PCK_ENUMS.misconception_risk),
    demonstrated_skills: {
      type: 'array',
      items: {
        type: 'object',
        properties: { skill_id: enumStr(PCK_SKILL_IDS), evidence: str() },
        required: ['skill_id', 'evidence'],
      },
    },
    missed_opportunities: {
      type: 'array',
      items: {
        type: 'object',
        properties: { skill_id: enumStr(PCK_SKILL_IDS), what_could_have_been_done: str() },
        required: ['skill_id', 'what_could_have_been_done'],
      },
    },
    should_provide_feedback: { type: 'boolean' },
    feedback_trigger: { type: 'string', enum: PCK_ENUMS.feedback_trigger, nullable: true },
    skills_assessment: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          skill_id: enumStr(PCK_SKILL_IDS),
          is_relevant: { type: 'boolean' },
          score: { type: 'integer', nullable: true },
          evidence: str(),
          what_could_be_better: str(),
          reason_not_relevant: str(),
        },
        required: ['skill_id', 'is_relevant'],
      },
    },
    feedback_message_hebrew: str(),
  },
  required: [
    'pedagogical_quality',
    'predicted_student_state',
    'addressed_misconception',
    'how_addressed',
    'misconception_risk',
    'demonstrated_skills',
    'missed_opportunities',
    'should_provide_feedback',
    'feedback_trigger',
    'skills_assessment',
    'feedback_message_hebrew',
  ],
};

/**
 * Parse raw model text. Accepts strict JSON, or strict JSON wrapped in a single whole-output
 * code fence (lossless). Anything else (prose, truncation, syntax errors) is a parse failure.
 * @returns {{ok: true, value: any} | {ok: false, error: string}}
 */
export function parsePckModelText(text) {
  if (typeof text !== 'string' || text.trim() === '') {
    return { ok: false, error: 'empty model output' };
  }
  let body = text.trim();
  const fenced = body.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
  if (fenced) {
    body = fenced[1];
  }
  try {
    return { ok: true, value: JSON.parse(body) };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStr = (v) => typeof v === 'string';
const isOptionalStr = (v) => v === undefined || v === null || isStr(v);

/**
 * Validate a parsed analysis against the contract. Returns a list of problems (empty = valid).
 * Structure, types and enumerations only; no pedagogical consistency rules.
 */
export function validatePckAnalysis(value) {
  const problems = [];
  const add = (p) => problems.push(p);
  if (!isObj(value)) {
    return ['analysis must be a JSON object'];
  }
  const checkEnum = (v, values, where) => {
    if (!values.includes(v)) add(`${where} must be one of ${values.join('|')}`);
  };
  const checkArray = (v, where, itemFn) => {
    if (!Array.isArray(v)) {
      add(`${where} must be an array`);
      return;
    }
    v.forEach((item, i) => {
      if (!isObj(item)) add(`${where}[${i}] must be an object`);
      else itemFn(item, `${where}[${i}]`);
    });
  };

  checkEnum(value.pedagogical_quality, PCK_ENUMS.pedagogical_quality, 'pedagogical_quality');

  const state = value.predicted_student_state;
  if (!isObj(state)) {
    add('predicted_student_state must be an object');
  } else {
    checkEnum(state.understanding_level, PCK_ENUMS.understanding_level, 'predicted_student_state.understanding_level');
    checkEnum(state.response_tone, PCK_ENUMS.response_tone, 'predicted_student_state.response_tone');
    checkArray(state.student_reaction_hints, 'predicted_student_state.student_reaction_hints', (h, where) => {
      if (!isStr(h.student) || h.student.trim() === '') add(`${where}.student must be a non-empty string`);
      checkEnum(h.likelihood, PCK_ENUMS.likelihood, `${where}.likelihood`);
      checkEnum(h.reaction_type, PCK_ENUMS.reaction_type, `${where}.reaction_type`);
      if (!isStr(h.reason)) add(`${where}.reason must be a string`);
    });
  }

  if (typeof value.addressed_misconception !== 'boolean') add('addressed_misconception must be a boolean');
  if (!isStr(value.how_addressed)) add('how_addressed must be a string');
  checkEnum(value.misconception_risk, PCK_ENUMS.misconception_risk, 'misconception_risk');

  checkArray(value.demonstrated_skills, 'demonstrated_skills', (d, where) => {
    checkEnum(d.skill_id, PCK_SKILL_IDS, `${where}.skill_id`);
    if (!isStr(d.evidence)) add(`${where}.evidence must be a string`);
  });
  checkArray(value.missed_opportunities, 'missed_opportunities', (m, where) => {
    checkEnum(m.skill_id, PCK_SKILL_IDS, `${where}.skill_id`);
    if (!isStr(m.what_could_have_been_done)) add(`${where}.what_could_have_been_done must be a string`);
  });

  if (typeof value.should_provide_feedback !== 'boolean') add('should_provide_feedback must be a boolean');
  if (!('feedback_trigger' in value)) add('feedback_trigger is required (null allowed)');
  else if (value.feedback_trigger !== null) checkEnum(value.feedback_trigger, PCK_ENUMS.feedback_trigger, 'feedback_trigger');

  checkArray(value.skills_assessment, 'skills_assessment', (s, where) => {
    checkEnum(s.skill_id, PCK_SKILL_IDS, `${where}.skill_id`);
    if (typeof s.is_relevant !== 'boolean') add(`${where}.is_relevant must be a boolean`);
    const hasScore = s.score !== undefined && s.score !== null;
    if (s.is_relevant === true && !hasScore) add(`${where}.score is required for a relevant skill`);
    if (hasScore && !PCK_SCORES.includes(s.score)) add(`${where}.score must be 0, 1 or 2`);
    for (const field of ['evidence', 'what_could_be_better', 'reason_not_relevant']) {
      if (!isOptionalStr(s[field])) add(`${where}.${field} must be a string`);
    }
  });

  if (!isStr(value.feedback_message_hebrew)) add('feedback_message_hebrew must be a string');

  return problems;
}

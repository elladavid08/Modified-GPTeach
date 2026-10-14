// Synthetic PCK analysis fixtures for the C10 tests (current production response contract).

export const VALID_ANALYSIS = {
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
  missed_opportunities: [{ skill_id: 'error-characterization', what_could_have_been_done: 'יכולת לשאול' }],
  should_provide_feedback: true,
  feedback_trigger: 'excellent_pck_use',
  skills_assessment: [
    { skill_id: 'error-identification', is_relevant: true, score: 2, evidence: 'זיהית את הטעות' },
    { skill_id: 'adapted-pedagogical-response', is_relevant: true, score: 1, evidence: 'שאלת על ההגדרה', what_could_be_better: 'בקש דוגמה נגדית' },
    { skill_id: 'error-characterization', is_relevant: true, score: 0, what_could_be_better: 'יכולת לשאול' },
    { skill_id: 'error-leveraging', is_relevant: false, reason_not_relevant: 'מוקדם' },
  ],
  feedback_message_hebrew: 'זיהוי השגיאה: זיהית את הטעות.',
};

export const NO_FEEDBACK_ANALYSIS = {
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

const clone = (v) => JSON.parse(JSON.stringify(v));
const validText = JSON.stringify(VALID_ANALYSIS, null, 2);

function mutated(fn) {
  const v = clone(VALID_ANALYSIS);
  fn(v);
  return JSON.stringify(v);
}

/** [label, raw model text, expected failure kind] — based on B200 failure_modes.md §1-§8. */
export const MALFORMED_OUTPUTS = [
  // §2 trailing comma
  ['trailing comma', validText.replace(/"feedback_message_hebrew": "([^"]*)"\n}/, '"feedback_message_hebrew": "$1",\n}'), 'parse'],
  // §1 unescaped ASCII quote inside Hebrew text
  ['unescaped quote in Hebrew text', validText.replace('זיהית את הטעות.', 'זיהית את הטעות של רועי ("זה לא מדויק").'), 'parse'],
  // §3/§4 truncated output
  ['truncated JSON', validText.slice(0, Math.floor(validText.length / 2)), 'parse'],
  ['8-token stub', '{\n  "should_provide_', 'parse'],
  // leading prose / fences
  ['leading prose before JSON', `Here is the analysis:\n${validText}`, 'parse'],
  ['leading prose before a fenced block', `Here is the analysis:\n\`\`\`json\n${validText}\n\`\`\``, 'parse'],
  ['empty output', '', 'parse'],
  ['JSON array instead of object', '[]', 'schema'],
  // §5 text field returned as an object
  ['feedback text as an object', mutated((v) => { v.feedback_message_hebrew = { 'מה קיים': 'x', 'המלצה': 'y' }; }), 'schema'],
  ['evidence as an object', mutated((v) => { v.skills_assessment[0].evidence = { 'מה קיים': 'x' }; }), 'schema'],
  // missing required structural fields
  ['missing should_provide_feedback', mutated((v) => { delete v.should_provide_feedback; }), 'schema'],
  ['missing skills_assessment', mutated((v) => { delete v.skills_assessment; }), 'schema'],
  ['missing predicted_student_state', mutated((v) => { delete v.predicted_student_state; }), 'schema'],
  ['missing pedagogical_quality', mutated((v) => { delete v.pedagogical_quality; }), 'schema'],
  ['missing feedback_message_hebrew', mutated((v) => { delete v.feedback_message_hebrew; }), 'schema'],
  // invalid skill id
  ['invalid skill id', mutated((v) => { v.skills_assessment[0].skill_id = 'p1'; }), 'schema'],
  ['invalid skill id in demonstrated_skills', mutated((v) => { v.demonstrated_skills[0].skill_id = 'זיהוי השגיאה'; }), 'schema'],
  // invalid score
  ['score 3', mutated((v) => { v.skills_assessment[0].score = 3; }), 'schema'],
  ['score -1', mutated((v) => { v.skills_assessment[0].score = -1; }), 'schema'],
  ['score 1.5', mutated((v) => { v.skills_assessment[0].score = 1.5; }), 'schema'],
  ['relevant skill without a score', mutated((v) => { delete v.skills_assessment[0].score; }), 'schema'],
  // wrong field types
  ['should_provide_feedback as a string', mutated((v) => { v.should_provide_feedback = 'true'; }), 'schema'],
  ['is_relevant as a string', mutated((v) => { v.skills_assessment[0].is_relevant = 'yes'; }), 'schema'],
  ['score as a string', mutated((v) => { v.skills_assessment[0].score = '2'; }), 'schema'],
  ['skills_assessment as an object', mutated((v) => { v.skills_assessment = { 'error-identification': 2 }; }), 'schema'],
  ['unknown pedagogical_quality', mutated((v) => { v.pedagogical_quality = 'excellent'; }), 'schema'],
  ['unknown understanding_level', mutated((v) => { v.predicted_student_state.understanding_level = 'better'; }), 'schema'],
  ['unknown reaction_type', mutated((v) => { v.predicted_student_state.student_reaction_hints[0].reaction_type = 'happy'; }), 'schema'],
  ['student_reaction_hints not an array', mutated((v) => { v.predicted_student_state.student_reaction_hints = 'נועה'; }), 'schema'],
  ['unknown feedback_trigger', mutated((v) => { v.feedback_trigger = 'great'; }), 'schema'],
];

/**
 * DST Manager — Dialogue State Tracking for GPTeach
 *
 * Provides helper functions for managing the pedagogical dialogue state
 * that persists across turns. The state replaces the raw feedbackHistory
 * in the PCK agent and enables richer, more contextually grounded feedback.
 *
 * Architecture:
 *   PCK agent  → reads dialogue_state (pending_challenge, skill_trajectory, feedback_given)
 *   DST agent  → writes dialogue_state (runs after students respond each turn)
 */

const SKILL_IDS = [
  'error-identification',
  'error-characterization',
  'diagnostic-interpretation',
  'adapted-pedagogical-response',
  'error-leveraging',
];

/**
 * Creates an empty dialogue state for a new session.
 * @param {Object} scenario - The current lesson scenario (used for context init)
 * @returns {Object} Initial empty dialogue state
 */
export function initDialogueState(scenario) {
  return {
    turn_number: 0,
    pending_challenge: null,
    active_misconceptions: [],
    skill_trajectory: Object.fromEntries(SKILL_IDS.map(id => [id, []])),
    feedback_given: [],
    student_understanding: {},
  };
}

/**
 * Formats the dialogue state as a structured prompt section for the PCK agent.
 * This replaces the raw feedbackHistory block entirely.
 *
 * @param {Object} dialogueState - Current dialogue state
 * @returns {string} Formatted prompt section
 */
export function buildPCKStateSection(dialogueState) {
  if (!dialogueState) return '';

  const lines = [];
  lines.push(`## 📋 Dialogue State (after turn ${dialogueState.turn_number})`);
  lines.push('');

  // Pending challenge — the most important part for the PCK agent
  if (dialogueState.pending_challenge) {
    const pc = dialogueState.pending_challenge;
    lines.push('### Pending Challenge (what the teacher should address this turn)');
    lines.push(`- **Student error (exact quote):** "${pc.student_error_quote}"`);
    lines.push(`- **Misconception type:** ${pc.misconception_type}`);
    lines.push(`- **Raised at turn:** ${pc.raised_at_turn}`);
    lines.push(`- **Urgency:** ${pc.urgency}`);
    lines.push(`- **Suggested pedagogical move:** ${pc.suggested_move}`);
    lines.push('');
  } else {
    lines.push('### Pending Challenge');
    lines.push('None — no unresolved student error from the previous turn.');
    lines.push('');
  }

  // Active misconceptions with lifecycle status
  if (dialogueState.active_misconceptions && dialogueState.active_misconceptions.length > 0) {
    lines.push('### Active Misconceptions');
    dialogueState.active_misconceptions.forEach(mc => {
      const addressedNote = mc.last_addressed_turn
        ? `, last addressed turn ${mc.last_addressed_turn}`
        : '';
      lines.push(`- **${mc.student}:** "${mc.statement}" — status: **${mc.status}** (raised turn ${mc.raised_at_turn}${addressedNote})`);
    });
    lines.push('');
  }

  // Skill trajectory — last 4 turns for continuity rules
  const trajectoryEntries = Object.entries(dialogueState.skill_trajectory || {});
  if (trajectoryEntries.length > 0) {
    lines.push('### Skill Trajectory (score per turn: 0=missed, 1=partial, 2=full, null=not evaluated)');
    trajectoryEntries.forEach(([skillId, traj]) => {
      const recent = traj.slice(-4);
      const suffix = traj.length > 4 ? ` (last 4 of ${traj.length} turns)` : '';
      lines.push(`- ${skillId}: [${recent.join(', ')}]${suffix}`);
    });
    lines.push('');
  }

  // Feedback given — last 4 entries for duplicate suppression
  if (dialogueState.feedback_given && dialogueState.feedback_given.length > 0) {
    const recent = dialogueState.feedback_given.slice(-4);
    lines.push('### Recent Feedback Given (last 4 turns)');
    recent.forEach(fb => {
      lines.push(`- Turn ${fb.turn}: ${fb.skill_id} — **${fb.type}**`);
    });
    lines.push('');
  }

  // Student understanding summary
  const studentEntries = Object.entries(dialogueState.student_understanding || {});
  if (studentEntries.length > 0) {
    lines.push('### Student Understanding');
    studentEntries.forEach(([name, state]) => {
      lines.push(`- ${name}: ${state.level} (trend: ${state.trend})`);
    });
    lines.push('');
  }

  // Continuity rules derived from the structured state (replaces the raw feedbackHistory rules)
  lines.push('⚠️ **Continuity Rules (use Dialogue State above — do NOT re-infer from conversation history):**');
  lines.push('');
  lines.push('**Rule 1 — Evaluate against the pending challenge:**');
  lines.push('If pending_challenge is not null, this turn\'s teacher message should be assessed as a direct response to that specific student error quote. Use the pending challenge to anchor your Gate 1 evaluation.');
  lines.push('');
  lines.push('**Rule 2 — No duplicate positive feedback for already-mastered skills:**');
  lines.push('If skill_trajectory shows a skill was scored ≥1 in a recent turn for the same active error, do NOT give positive feedback for that skill again unless it was previously scored 0 and the teacher has now improved.');
  lines.push('');
  lines.push('**Rule 3 — Recognize when teacher followed a suggestion:**');
  lines.push('If feedback_given shows a negative assessment for a skill in the previous turn, and the teacher\'s current message implements what that feedback recommended, score that skill 2 and explicitly acknowledge the improvement.');

  return lines.join('\n');
}

/**
 * Builds the DST agent prompt that will update the dialogue state after a turn.
 *
 * @param {string} teacherMessage - Teacher's message this turn
 * @param {Array}  studentResponses - [{student, message}] from this turn
 * @param {Object} pckAnalysis - Full PCK analysis output for this turn
 * @param {Object|null} currentState - Dialogue state before this turn (null = first turn)
 * @param {Object} scenario - Lesson scenario context
 * @returns {string} DST agent prompt
 */
export function buildDSTAgentPrompt(teacherMessage, studentResponses, pckAnalysis, currentState, scenario) {
  const prevTurn = currentState ? currentState.turn_number : 0;
  const currentTurn = prevTurn + 1;

  const studentsText = (studentResponses || [])
    .map(r => `${r.student || r.name}: "${r.message || r.text}"`)
    .join('\n') || '(no student responses this turn)';

  const relevantSkills = (pckAnalysis.skills_assessment || []).filter(s => s.is_relevant);
  const skillScoresText = relevantSkills.length > 0
    ? relevantSkills.map(s =>
        `  - ${s.skill_id}: score=${s.score}${s.evidence ? `, evidence: "${s.evidence}"` : ''}${s.what_could_be_better ? `, suggestion: "${s.what_could_be_better}"` : ''}`
      ).join('\n')
    : '  (no skills evaluated this turn — gates blocked feedback)';

  const reactionHints = (
    pckAnalysis.predicted_student_state &&
    pckAnalysis.predicted_student_state.student_reaction_hints
  ) || [];

  const pedagogicalFocus = scenario && Array.isArray(scenario.ai_pedagogical_focus)
    ? scenario.ai_pedagogical_focus.join('; ')
    : '';

  const initialState = initDialogueState(scenario);
  const currentStateForPrompt = currentState || initialState;

  return `You are a Dialogue State Tracker for a pedagogical tutoring simulator.
Your ONLY job is to update a structured JSON state object that tracks what is happening across turns in this lesson.
You do NOT evaluate pedagogical quality — the PCK Expert already did that and you receive its results.
You are a bookkeeper. Follow the update rules exactly and return only the updated JSON.

## Lesson Context
Scenario: ${scenario ? scenario.text : 'Geometry lesson'}
Grade: ${scenario ? scenario.grade_level : 'unknown'}
Target misconception: ${scenario ? scenario.misconception_focus : ''}
Pedagogical focus: ${pedagogicalFocus}

## This Turn (Turn ${currentTurn})

**Teacher's message:**
"${teacherMessage}"

**Students' responses:**
${studentsText}

**PCK Expert Analysis of teacher's move:**
- Pedagogical quality: ${pckAnalysis.pedagogical_quality || 'unknown'}
- Addressed pending misconception: ${pckAnalysis.addressed_misconception}
- How addressed: ${pckAnalysis.how_addressed || '(not addressed)'}
- Misconception risk going forward: ${pckAnalysis.misconception_risk || 'medium'}
- Feedback was given to teacher: ${pckAnalysis.should_provide_feedback}
- Skill scores this turn:
${skillScoresText}
- Student reaction hints: ${JSON.stringify(reactionHints)}

## Current Dialogue State (before this turn)
${JSON.stringify(currentStateForPrompt, null, 2)}

## Update Rules

**1. turn_number:** Set to ${currentTurn}.

**2. active_misconceptions:**
- For each existing active/partially_addressed misconception that matches the pending_challenge:
  - If pckAnalysis.addressed_misconception=true:
    - pedagogical_quality="positive" → set status="resolved" (if teacher formally corrected) or "partially_addressed"
    - pedagogical_quality="neutral" → set status="partially_addressed"
    - Set last_addressed_turn=${currentTurn}
  - If pckAnalysis.addressed_misconception=false → keep status unchanged, do NOT update last_addressed_turn
- For NEW mathematically incorrect student claims found in this turn's student responses:
  - Add a new entry with status="active", raised_at_turn=${currentTurn}
  - Include clearly wrong statements AND student questions that contain an implicit incorrect assumption (e.g. "כל הצלעות שלו שוות?" implicitly assumes a rectangle has all equal sides — this is wrong and worth tracking even though it's phrased as a question)
- Keep resolved misconceptions in the list but DO NOT remove them (needed for research logging)

**3. pending_challenge:**
- Scan the students' responses for mathematically incorrect claims AND questions that contain an implicit wrong assumption
- If found: set pending_challenge to the most directly lesson-relevant unresolved error:
  - student_error_quote: EXACT quote from the student response (copy-paste, do not paraphrase)
  - misconception_type: short free-text label describing the error pattern (e.g. "inclusion relation confusion", "necessary vs sufficient condition")
  - raised_at_turn: ${currentTurn}
  - urgency: "high" if it directly contradicts a formal definition or the core misconception_focus; "medium" otherwise
  - suggested_move: brief description in Hebrew of what the teacher should do next
- If NO new student errors AND previous pending_challenge was resolved this turn → set pending_challenge=null
- If NO new student errors AND previous pending_challenge was NOT resolved → keep previous pending_challenge unchanged

**4. skill_trajectory:**
- For each of the 5 skills, append exactly one new entry to its array:
  - Use the score from pckAnalysis.skills_assessment for skills where is_relevant=true
  - Use null for skills where is_relevant=false or the skill was absent from skills_assessment

**5. feedback_given:**
- If pckAnalysis.should_provide_feedback=true, append one entry:
  - turn: ${currentTurn}
  - skill_id: the primary skill from skills_assessment (first entry with is_relevant=true)
  - type: "positive" if that skill's score >= 1, "negative" if score = 0

**6. student_understanding:**
- For each student in the reaction_hints array, update their entry:
  - "understanding_progress" → level="improving"
  - "partial_understanding" → level="partial"
  - "persistent_confusion" or "reinforced_acceptance" or "misapplied_new_rule" → level="confused"
  - "cautious_clarification" → level="same"
  - trend: compare to previous level in student_understanding — "improving", "worsening", or "stable"
- Keep existing entries for students NOT mentioned in reaction_hints

Return ONLY a single valid JSON object matching the dialogue state schema. No explanation, no markdown fences, no extra text.`;
}

/**
 * Validates a dialogue state object returned by the DST agent.
 * Returns true if structurally sound, false if broken/incomplete.
 *
 * @param {Object} state - The state to validate
 * @returns {boolean}
 */
export function validateDialogueState(state) {
  if (!state || typeof state !== 'object') return false;
  if (typeof state.turn_number !== 'number') return false;
  if (!state.skill_trajectory || typeof state.skill_trajectory !== 'object') return false;
  if (!Array.isArray(state.active_misconceptions)) return false;
  if (!Array.isArray(state.feedback_given)) return false;
  if (!state.student_understanding || typeof state.student_understanding !== 'object') return false;

  // All skill_trajectory values must be arrays
  for (const arr of Object.values(state.skill_trajectory)) {
    if (!Array.isArray(arr)) return false;
  }

  // pending_challenge must be null or an object with required fields
  if (state.pending_challenge !== null && state.pending_challenge !== undefined) {
    const pc = state.pending_challenge;
    if (typeof pc !== 'object') return false;
    if (!pc.student_error_quote || !pc.raised_at_turn) return false;
  }

  return true;
}

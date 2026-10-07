/**
 * System Version Configuration
 * 
 * Update this version number when making significant changes to the system:
 * - Major changes to AI prompts (student behavior, PCK analysis)
 * - UI/UX changes that affect user interaction
 * - New features or functionality
 * - Bug fixes that change behavior
 * 
 * Version Format: X.Y.Z
 * - X: Major version (breaking changes, major new features)
 * - Y: Minor version (new features, significant improvements)
 * - Z: Patch version (bug fixes, minor improvements)
 */

export const SYSTEM_VERSION = "1.3.9";

/**
 * Version History:
 * 
 * 1.3.9 (2026-10-07):
 * - Student prompt / output contract made consistent (C9): the student-generation prompt no
 *   longer asks the model to include a "thinking" analysis in its output, which the response
 *   format never allowed. The decision checklist is kept, but the model is told to work
 *   through it silently and return only the student responses; the example outputs no longer
 *   show a "thinking" object. The obsolete browser warning about a missing "thinking" field
 *   is removed. Response format, model, temperature and token limit are unchanged; Gemini's
 *   native thinking remains off.
 * 
 * 1.3.8 (2026-10-07):
 * - Student speaker identity (C8): in the conversation history sent to the student-generation
 *   model, each earlier student reply is now labelled with the student who said it
 *   ("<name>: <text>"). Previously all earlier student replies reached the model without
 *   names. Teacher messages, drawings, the student prompt, personas and saved conversation
 *   data are unchanged.
 * 
 * 1.3.7 (2026-10-07):
 * - Multi-line teacher messages (C5): line breaks typed by the teacher are now kept. The
 *   message is shown in the chat with its original line breaks, and the same original text
 *   (previously with lines glued together without a space) is sent to the PCK and student
 *   agents and saved in the conversation log. Student messages are unchanged.
 * 
 * 1.3.6 (2026-10-05):
 * - Retry / timeout policy for the per-turn LLM calls (PCK feedback and student generation):
 *   the server makes at most 2 model attempts per request, each limited to 20 s, within a
 *   45 s total budget; the browser sends a single request per agent with a 50 s hard
 *   timeout. Values are provisional (latency baseline) and configurable.
 * - Retried once: timeouts, transient model/network errors (5xx), rate limits (429), empty
 *   responses, and malformed/invalid structured output (PCK and students). Not retried:
 *   request errors (4xx) and safety-blocked output. The previous multi-retry 429 handling
 *   and the browser-side retry are no longer used for these calls.
 * - Student output is now structurally validated on the server so malformed output can be
 *   retried; an empty student response is now a (retried) failure instead of silence.
 * - B2: if PCK still fails after its retry, the teacher sees the PCK notice, the failure is
 *   recorded, and students are generated without PCK guidance. A retry that succeeds is not
 *   recorded as a failure (telemetry shows 2 attempts).
 * 
 * 1.3.5 (2026-10-05):
 * - LLM-call telemetry for latency measurement (no behaviour change for teachers): the PCK
 *   and student-generation endpoints now measure model-call latency and report compact
 *   metadata (model, latency, finish reason, attempt count) alongside their responses.
 * - Each logged turn now stores an additive `telemetry` field with that metadata for the
 *   PCK and student calls, plus the browser round-trip time. Image-only turns record the
 *   PCK call as "skipped" (not as a failure).
 * - failedAttempts entries now also include the same timing metadata where available.
 * - Telemetry never contains prompts, model output, teacher/student text, drawings or
 *   history. No retries, timeouts, prompts or models were changed.
 * 
 * 1.3.4 (2026-10-05):
 * - Real-time PCK feedback output is now structurally reliable (C10): the PCK model call
 *   uses Gemini JSON mode with an explicit response schema, and the server validates every
 *   analysis (required fields, types, allowed values, skill ids, scores 0/1/2) before using
 *   it. Valid analyses are returned unchanged.
 * - Malformed or invalid PCK output is no longer silently default-filled into a "successful"
 *   analysis and the placeholder feedback message is removed; it is reported as a PCK
 *   failure instead (shown to the teacher and recorded in failedAttempts, as in 1.3.2).
 *   Prompt, model and temperature are unchanged.
 * 
 * 1.3.3 (2026-10-05):
 * - Image-only teacher turns (a drawing explicitly included, no text) no longer call the
 *   PCK feedback agent, which cannot see drawings yet. Previously the empty message was
 *   rejected by the PCK endpoint and showed a misleading "temporary problem" notice plus
 *   a failure diagnostic. Now these turns proceed without PCK feedback and without a
 *   failure notice; students still receive the drawing, and the turn is logged normally
 *   with the drawing. Text-only and text+drawing turns are unchanged.
 * 
 * 1.3.2 (2026-10-05):
 * - Visible failures (C7 phase 1): when the PCK feedback call fails, the feedback sidebar
 *   shows a short Hebrew notice; when student generation fails, a short Hebrew banner
 *   appears above the chat. No technical details are shown; notices clear when the next
 *   turn starts. Behaviour after a PCK failure is otherwise unchanged.
 * - Failure diagnostics: failed PCK / student-agent attempts are recorded in a new,
 *   additive `failedAttempts` list on the conversation document (agent, stage, endpoint,
 *   HTTP status, truncated error message, timestamp, position relative to logged turns).
 *   No teacher text, drawings, history, credentials or stack traces are stored; at most
 *   50 entries are kept.
 * - Failed attempts never become normal turns: they are not added to `turns[]`, never
 *   receive a `turnNumber`, and do not change turn numbering.
 * - Student parse failures: the fake fallback student reply ("אני צריך רגע לחשוב על זה...")
 *   is no longer produced or saved in the chat path; an unparseable student-agent output is
 *   reported as a failure instead.
 * 
 * 1.3.1 (2026-10-05):
 * - Turn lock (C2/C3): only one simulation turn (PCK analysis + student responses) can
 *   run at a time. From the teacher's submit until the turn finishes, the input, send
 *   button, drawing-board toggle and "סיים שיחה" are disabled and the typing indicator
 *   stays visible; extra submits are ignored. The lock is released after success and
 *   after every failure path. Turn log entries are written in send order, and finishing
 *   the conversation waits until queued turn logging has completed.
 * - Empty messages (C4): empty or whitespace-only teacher submissions with no drawing
 *   are ignored (no PCK call, no student call, no logged turn). Image-only turns (the
 *   teacher explicitly includes a non-empty drawing without text) remain supported.
 * - Summary feedback (C1): the final PCK summary now receives the real-time PCK
 *   feedback that was actually displayed during the conversation (skill, score,
 *   evidence, suggestion, recorded feedback message) and is grounded in it, instead of
 *   treating every conversation as if no PCK moments existed. Summaries of
 *   conversations with feedback are therefore typically longer than before.
 * 
 * 1.3.0 (2026-05-20):
 * - PCK feedback accuracy: restructured Phase 1 into three sequential gates so
 *   closing/procedural messages are rejected before history is checked
 * - PCK Gate 0: pedagogical questions (e.g. "האם זה בהכרח נכון?") now correctly
 *   pass through as PCK moves instead of being blocked as "pure questions"
 * - PCK Gate 1: mandatory quoting step — model must cite the exact incorrect
 *   student claim before feedback can be given; correct student answers never
 *   trigger error-identification even on misconception-adjacent topics
 * - PCK Gate 1: feedback restricted to the most recent student turn only;
 *   past unaddressed errors cannot trigger retroactive feedback on later turns
 * - PCK Gate 1: multi-student turns handled correctly — an error by one student
 *   triggers feedback even if another student in the same turn was correct
 * - PCK continuity: skills_assessment now stored in feedback history; no duplicate
 *   positive praise for a skill already demonstrated on the same error; teacher
 *   following a prior suggestion is recognized and scored positively
 * - PCK anti-hallucination: evidence must come from the teacher's last message only;
 *   student ideas may not be attributed to the teacher
 * - Student deduplication: students may not repeat the same response as the previous
 *   turn; at least one student must respond per teacher message
 * 
 * 1.2.0 (2026-04-27):
 * - Student greeting behavior: students now respond only with social greetings when
 *   teacher opens with small-talk, and do not mention lesson content until teacher introduces it
 * - Student closing behavior: students now react appropriately to lesson-ending messages
 *   (brief warm farewell) instead of continuing the academic discussion
 * - PCK feedback visualization: replaced continuous colored text box with per-skill
 *   colored bullet points (green=well used, yellow=partial, purple=missing), each
 *   carrying the skill name and its evidence/suggestion text inline
 * - PCK feedback language: all feedback text now addresses the teacher directly in
 *   second person (e.g. "זיהית", "יכולת לשאול") instead of third person ("המורה")
 * - PCK feedback focus: feedback now follows the sequential skill chain (identification →
 *   characterization → diagnostic interpretation → pedagogical response → leveraging);
 *   at most 1-2 skills assessed per turn based on lifecycle stage, with strict prerequisite
 *   gating (if teacher missed skill N, skills N+1..5 are not evaluated that turn)
 * 
 * 1.1.0 (2026-03-10):
 * - Universal PCK Skills Framework (5 skills from education team)
 * - Filtered real-time feedback (only when pedagogically relevant)
 * - Adaptive summary feedback (length proportional to content)
 * - Skill-based scoring (0-1-2 rubrics) with relevance detection
 * - Bilingual AI prompts (English reasoning + Hebrew patterns)
 * - RAG-ready structure for future improvements
 * 
 * 1.0.0 (2026-03-03):
 * - Initial production version with Firebase authentication
 * - User profile collection (Hebrew fields)
 * - Automatic conversation logging to Firestore
 * - Improved student agent behavior:
 *   - Better detection of incomplete teacher messages
 *   - Multi-part instruction compliance (persona-based initial, full on second request)
 *   - Consistent knowledge tracking throughout conversation
 *   - Better handling of teacher refocus
 * - Two-agent architecture (PCK feedback agent + student agent)
 * - Protected routes requiring authentication
 */

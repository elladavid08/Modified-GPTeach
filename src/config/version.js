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

export const SYSTEM_VERSION = "1.5.0";

/**
 * Version History:
 * 
 * 1.5.0 (2026-10-14):
 * - Misconception carrier (release blocker #12, "students drop the scenario misconception before
 *   the teacher addresses it"): each conversation designates ONE student of the fixed cast as the
 *   student who holds the scenario's misconception. Chosen once, when the scenario is selected, by
 *   rule "first-non-low-v1" (the first cast member whose participation baseline is not "low", else
 *   the first; src/services/misconceptionCarrier.js), and unchanged for the whole conversation.
 * - Student prompt (src/utils/ai.js), only when a carrier is set: the "ONE or TWO students"
 *   misconception lifecycle and the "Possible misconception to watch for" line are replaced by a
 *   MISCONCEPTION CARRIER block (the carrier expresses the idea in their own words and keeps it
 *   while the teacher only asks, probes, praises or acknowledges; revises it only after the
 *   teacher explains it, shows a counterexample, leads a definition check or confirms a correct
 *   argument; the other students do not hold it or introduce another misconception about the
 *   topic). The PCK block no longer claims priority over this rule, and an exception paragraph
 *   scopes "positive / improved / addressed" to tone, confidence and progress for the carrier.
 *   Texts are the research prototype v1 unchanged (frozen by
 *   src/__tests__/fixtures/studentPromptCarrierV1.json; validation in
 *   research/simulator_audit/student_misconception_carrier_experiment.md).
 * - The carrier is passed to the student agent only. PCK (model, prompt, request, output), the
 *   PCK feedback shown to the teacher, routing, the duplicate guard and the UI are unchanged; the
 *   carrier is never shown to the teacher. Without a carrier the student prompt is byte-identical
 *   to 1.4.4.
 * - Conversation log: additive top-level field misconceptionCarrier = {name, personaId, rule}
 *   (null when the scenario has no misconception focus), saved with the first logged turn and on
 *   every later save. The scenario snapshot is unchanged. Conversations before 1.5.0 have no such
 *   field; readers treat it as "no designated carrier".
 * - Return to scenario selection before finishing: "חזרה לבחירת תרחיש" is in the chat header for
 *   the whole session, on the right where "שיחה חדשה" was. "שיחה חדשה" (a page reload) is removed:
 *   this is the only way out of the session. A finished conversation (or one with no message yet) returns directly. An
 *   unfinished one opens a confirmation dialog (src/components/LeaveConversationDialog.jsx):
 *   "סיים שיחה וקבל משוב" (the existing finish flow; the teacher stays to get the summary),
 *   "חזרה לבחירת תרחיש" (leave without finishing) or "המשך בשיחה". It is disabled during a turn,
 *   a pending finish, the summary request and while leaving; leaving waits for queued log writes.
 *   Nothing is stored for leaving: no new field and no unfinished state; there is no resume; the
 *   next selection starts a new conversation.
 * - Drawing board (pilot request #7, partial): Undo ("בטל פעולה אחרונה"; one step per pen stroke,
 *   drawn shape, move / resize / rotate, deletion, eraser stroke or "נקה הכל"; up to 50 steps) and
 *   a 4-colour palette (black default, blue, red, green; new strokes and shapes only). The eraser
 *   semantics are unchanged (pen strokes only, never shapes). Partial erasing of shapes and line
 *   straightening are deferred.
 * 
 * 1.4.4 (2026-10-13):
 * - Teacher briefing stays accessible (pilot request #6, B20): before the first message the
 *   briefing is the same open card as before. Once the conversation starts, the card becomes a
 *   one-line "📋 הנחיות לשיעור" toggle at the top of the chat, collapsed, which opens the same
 *   briefing text (scrollable, at most 30% of the screen height) and can be opened and closed at
 *   any time, also during a pending turn and after the session has ended
 *   (src/components/TeacherBriefingPanel.jsx).
 * - Display only: the open / closed state is local UI state. Unchanged: scenario data, prompts,
 *   models, PCK, student generation, the turn lock, turn logging, finishing, the summary and the
 *   stored conversation format (the briefing is not stored).
 * - Attempted scenarios are marked on the selection screen (pilot request #8): a scenario for which
 *   the current teacher has at least one saved conversation with at least one logged turn (finished
 *   or not) gets a light green card with a green right-hand accent and the caption
 *   "✓ התנסית בתרחיש זה". It stays a normal, enabled card and starts a new conversation as before.
 *   The teacher's own conversations are read with the existing /logs query
 *   (getConversationsByUser) and matched on the stored scenario title, normalised (the
 *   pre-2026-03-17 prefix "השיעור של השבוע הוא על " is stripped; src/services/attemptedScenarios.js).
 *   If loading fails or is slow, the screen works as before without the marks. Nothing is stored,
 *   no scenario id is added, and the conversation contract is unchanged.
 * - Back to scenario selection: after "סיים שיחה" the chat header shows a "חזרה לבחירת תרחיש"
 *   button that returns to the scenario-selection screen without a page reload (the chat session
 *   is remounted, so all per-conversation state starts fresh and the attempted marks are reloaded).
 *   It is disabled while a turn or the PCK summary request is still running. The top "סימולטור"
 *   link is unchanged (it points to the page the teacher is already on, so it does nothing there).
 * - Fix: a new conversation now always starts with an empty chat history. The history provider sits
 *   above the router, so after leaving the chat page (e.g. "השיחות שלי") and coming back through
 *   "סימולטור", the previous conversation's messages were still shown and sent to the PCK and
 *   student agents as context of the new conversation. The history is now cleared when a scenario
 *   is chosen. Prompts, models and the stored format are unchanged.
 * 
 * 1.4.3 (2026-10-13):
 * - PCK sidebar display contract (pck_row_text_contract_experiment.md §7): each displayed skill
 *   row now shows text the PCK model already returned, through a pure view-model
 *   (src/services/pckDisplayRows.js). Since 1.3.4 (structured output) the model leaves a
 *   skill's own "evidence" empty and writes it in demonstrated_skills, so most positive rows
 *   showed only the skill name.
 *   - score 2: the skill's evidence, else the evidence of the single demonstrated_skills item
 *     with the same skill_id; never a recommendation.
 *   - score 1: the same positive text (when it exists) plus, on a second line ("לשיפור:"), the
 *     skill's what_could_be_better (B12 implemented).
 *   - score 0: unchanged (what_could_be_better).
 *   No text is generated, nothing is matched by meaning, and score-2 text found only in
 *   what_could_be_better is not shown. Legacy feedback renders as before.
 * - Unchanged: the PCK request (prompt, schema, model, config), the analysis object, scores,
 *   relevance, the show/hide decision, B27, student steering, the stored conversation fields.
 * - Telemetry (A17, additive, content-free): the PCK entry of a turn whose feedback was shown
 *   carries pckRowsWithoutText (displayed skill rows with no usable text).
 * 
 * 1.4.2 (2026-10-13):
 * - Detection-only telemetry for garbled student text (student_garbled_text_investigation.md):
 *   gemini-3.5-flash-lite sometimes puts a letter from another script into a Hebrew word ("לגmרי",
 *   "איזה יظה"), adds cantillation marks, doubles a function word ("זה את את זה") or emits LaTeX.
 * - Student-call telemetry (A17, additive) gains six content-free counters computed by the server
 *   on the returned output: garbleForeignScript, garbleMixedScriptToken, garbleCantillation,
 *   garbleRepeatedFunctionWord, garbleMarkup (replies with each pattern) and garbleReplies (replies
 *   with any). The browser adds unknownSpeaker (replies under a name outside the active cast).
 * - Nothing the teacher sees changes: no retry, rewrite, drop or reorder; prompts, models, routing,
 *   retry policy, duplicate guard, quote-cut telemetry and parsing are unchanged. No text or token
 *   is stored, only counts.
 * - Versioned (not a teacher-facing change) because it changes the stored conversation record and
 *   systemVersion is the provenance that tells whether a record could carry these counters (A6;
 *   precedent: the telemetry-only 1.3.5).
 * 
 * 1.4.1 (2026-10-12):
 * - Real-time PCK feedback after a bare acknowledgement of a misconception
 *   (pck_missed_misconception_experiment.md). In the 1.4.0 baseline, 8 of 18 moments where a
 *   student stated a wrong idea and the teacher replied only "אוקיי" / "יפה" got no feedback,
 *   when the wrong idea was hedged, implicit or phrased as "…, לא?".
 * - PCK prompt: one clarification block in Gate 0 (verbatim as tested): an incorrect claim counts
 *   even when hedged or phrased as a tag question, and a bare acknowledgement of it is a missed
 *   error-identification (relevant, score 0, problematic, feedback shown). The rest of the prompt
 *   is unchanged.
 * - Bare-acknowledgement guard (server): when the teacher's trimmed message is exactly "אוקיי",
 *   "יפה" or "נכון", feedback is displayed only if the analysis is a missed error-identification
 *   (error-identification relevant with score 0, quality "problematic"). Any other feedback on such
 *   a message (praise, or criticism of another skill) is not displayed. The guard only changes the
 *   display decision; scores, skills, quality and the student-steering fields are returned
 *   unchanged. It does not apply to any other message ("?" and longer messages are unaffected).
 * - Unchanged: student prompt, models and routing, schemas, validation, retry policy, telemetry,
 *   the stored conversation format.
 * 
 * 1.4.0 (2026-10-12):
 * - Model migration (gemini-2.5-flash-lite retires on Vertex AI on 2026-10-20), split by agent as
 *   validated in student_model_bakeoff.md §9: the student agent (/api/generate) runs on
 *   gemini-3.5-flash-lite; PCK feedback (/api/pck-feedback), the summary (/api/pck-summary) and
 *   the completion / test endpoints run on gemini-3.1-flash-lite (server/model_config.js).
 * - Vertex AI is called through the `global` location and endpoint (aiplatform.googleapis.com),
 *   where the 3.x models are served; GOOGLE_CLOUD_LOCATION no longer applies.
 * - Every model call sets thinking explicitly to MINIMAL and sends no temperature / topP (the
 *   3.x model defaults; previously temperature 0.7 with topP 1, or 0.95 for the summary).
 * - Unchanged: prompts, personas, response schemas, maxOutputTokens (student 512, PCK 2000,
 *   summary 2048), the retry / timeout policy (at most 2 attempts), the duplicate guard, the
 *   quote-cut telemetry, the SDK (@google-cloud/vertexai) and the stored conversation format.
 *   Telemetry `model` now reports each agent's own model; /api/health reports `models` per agent.
 * - Expected behaviour differences (bakeoff §9): PCK feedback is shown on fewer turns (about 60%
 *   vs 93%); student misconceptions persist before teaching about as often as on 2.5.
 * 
 * 1.3.13 (2026-10-12):
 * - Quote-safe abbreviations in student replies: one output rule in the student prompt (JSON
 *   format requirement 6) asks the model to write Hebrew abbreviations with the Hebrew gershayim
 *   ״ (ס״מ, מ״ר, קמ״ש) instead of the ASCII double quote. Under JSON-constrained output an
 *   unescaped " closed the reply string, so replies were silently cut (e.g. "…באורך 5 ס").
 *   Added verbatim as live-tested (student_quote_safety_experiment.md §9, condition C; 13 -> 0
 *   abbreviation cuts). No other prompt, PCK, persona, example, model or config change.
 * - Detection only: the server counts suspected quote cuts in content-free student telemetry
 *   (quoteCutSuspected: replies in the returned output that end in a 1-2-letter Hebrew fragment
 *   or in whitespace without final punctuation; quoteCutPaddedAttempts: attempts rejected as a
 *   whitespace-padded token-limit output). No retry, rewrite or dropped reply; the 2-attempt
 *   policy and the duplicate guard are unchanged.
 * 
 * 1.3.12 (2026-10-12):
 * - Student prompt examples: the three example outputs in the student prompt (understood /
 *   still confused / confident misconception) are replaced with content-neutral examples. They
 *   keep the same labels, JSON format, one-student-per-example form and sentence shapes, but
 *   no longer name a cast member (EXAMPLE 1-3 were bound to students[0..2]), contain no lesson
 *   geometry, and use no gendered first-person forms; the content is shown as bracketed slots.
 *   Added verbatim as live-tested (student_prompt_examples_experiment.md, condition B). The
 *   "WRONG" example, the rule phrases, PCK steering, personas, model and settings are unchanged.
 * 
 * 1.3.11 (2026-10-07):
 * - Student duplicate guard: if a generated student reply repeats, word for word or almost, an
 *   earlier reply by the same student in the conversation (replies of 30+ characters; equal after
 *   whitespace / trailing-punctuation normalization, or edit similarity >= 0.90), the server asks
 *   the model once more, with a short regeneration note, as the existing second attempt of the
 *   same request (still at most 2 model attempts). If a reply is still a duplicate, only that
 *   reply is dropped, unless no reply would remain (then the replies are kept). If the second
 *   attempt fails technically, the first, usable response is returned. Other students' earlier
 *   replies are not compared. Prompt, PCK guidance, personas, model and settings are unchanged.
 *   Student-call telemetry gains four content-free fields (duplicateRetries,
 *   duplicateRepliesDropped, duplicateRepliesKept, duplicateOutcome).
 * 
 * 1.3.10 (2026-10-07):
 * - Short teacher messages: the student prompt has one new instruction. When the teacher's
 *   latest message is mainly an acknowledgement, praise, thanks or a closing (not a new
 *   content question), students respond to that conversational move, do not restate an
 *   earlier answer word for word, and a still-confused student keeps that state without being
 *   pushed to repeat the same misconception or wording. Added verbatim as live-tested
 *   (short_message_repetition_experiment.md, condition C). The PCK guidance to the students,
 *   personas, model and settings are unchanged; there is no duplicate check and no special
 *   handling of particular messages in code.
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

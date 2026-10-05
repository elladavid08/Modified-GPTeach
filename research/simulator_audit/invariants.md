# Simulator invariants (finalized 2026-10-05 after reviewer decisions)

The reviewer's decisions on the open questions are recorded in §D and applied to entries A3, B5, B12, B17 and B18.
Other REVIEW entries are still open.

Status labels:
- **DECIDED**: a former REVIEW entry the reviewer has resolved. The decision text is the invariant.
- **PROTECT**: appears intentional, other code or research depends on it; changing it needs an explicit decision.
- **REVIEW**: current behaviour that something may depend on, but it may not be intended. Please confirm.
- **DO NOT PROTECT**: current behaviour that looks like a defect. It is listed so nobody "preserves" it by accident, and so that fixing it is recognised as a behaviour change.

## A. Data contracts (highest priority: downstream research and annotation depend on these)

| # | invariant | status | why |
|---|---|---|---|
| A1 | Conversation documents live at `conversations/{sessionId}`, where `sessionId = session_<ms>_<rand9>` | PROTECT | Annotation assignments, agreement reports, comparison sets and the research exporter key on it. Research example ids are `<sessionId>__<turnNumber>`. |
| A2 | `turns[]` items have `turnNumber` (1..n, sequential, assigned in log order), `teacher.message`, `teacher.image` (base64 PNG **without** a data-URL prefix, or null), `students[{name, message, timestamp}]`, and `pckFeedback` (object or null) | PROTECT | Read by `ConvAnnotationEditor`, `ConversationLogs`, `AdminConversationLogs`, `ResearchConversations`, `exportConversationExcel`, `firebaseAdmin` agreement/comparison code (`turnNumber`), and `research/pck_feedback/.../extract_images.py`. Any extension should be **additive**. |
| A3 | `turnNumber` counts **logged** turns (teacher message + ≥1 student reply), not teacher messages | **DECIDED: PROTECT** | Keep `turnNumber` as the index of logged turns only. If failed or no-reply attempts are stored later, they go in a separate structure (e.g. a separate array or subcollection) that never takes a `turnNumber` slot or renumbers `turns[]`. Existing annotations, agreement reports and research example ids (`<sessionId>__<turnNumber>`) depend on this. |
| A4 | `pckFeedback` is non-null **only when feedback was displayed** to the teacher, with fields `feedback_message, feedback_type, skills_assessment[], detected_skills[], missed_opportunities[], timestamp` | REVIEW | Research and annotation may read "null = no feedback shown". If non-displayed decisions are stored, put them in a *new* field so this meaning survives. |
| A5 | `skills_assessment[]` entries use `skill_id ∈ {error-identification, error-characterization, diagnostic-interpretation, adapted-pedagogical-response, error-leveraging}`, `is_relevant`, `score ∈ {0,1,2}`, `evidence`, `what_could_be_better` | PROTECT | B200 maps these ids to p1-p5. The annotation UI and sidebar use the same ids and Hebrew names. |
| A6 | `systemVersion` is stamped on every conversation and bumped on behaviour changes | PROTECT | It is the only way to separate data from different prompt/agent versions. Today it is the *only* provenance (no prompt hash, no model id). |
| A7 | `studentRefs` = `v<version>_<id>`, with persona documents in `studentPersonas` | PROTECT | Persona versioning for research. Persona text changes should bump the persona `version`. |
| A8 | `scenario` snapshot stored per conversation, including `text`, `misconception_focus`, `target_pck_skills` | PROTECT | Research selects scenario guides from `target_pck_skills`. `scenario.text` is the de-facto scenario identifier. |
| A9 | Scenario `text` values are stable identifiers | REVIEW | There is no scenario id. Renaming a title breaks matching to past conversations (relevant for completed-scenario indication and research). Adding an id is fine; editing titles is not, without a migration map. |
| A10 | Stored drawings are downscaled to ≤600 px width PNG | REVIEW | The research extractor and viewers expect PNG base64. The 600 px limit protects the 1 MB document limit. Older records are uncompressed. |
| A11 | Conversations are saved incrementally after each logged turn; empty conversations are never saved (lazy init) | PROTECT | Partial sessions are research data (41/133 exported have no `endTime`). Avoids empty docs. |
| A12 | `summaryFeedback` is a single Markdown-ish Hebrew string | PROTECT | `exportConversationExcel.parseSummaryFeedback` parses it into sections. Viewers render it. |
| A13 | Older-format conversation docs (embedded `students` / `userProfile`, `pckFeedback` without `skills_assessment`) remain readable | PROTECT | 303 logged feedbacks lack `skills_assessment`. Viewers already have fallbacks. |

## B. Turn orchestration and agent contracts

| # | invariant | status | why |
|---|---|---|---|
| B1 | **PCK analysis runs before student generation for the same teacher message, and its output steers the students** | PROTECT | The core "PCK-first" design (`PCK_FIRST_ARCHITECTURE.md`). Student reactions are meant to reflect move quality. |
| B2 | If the PCK call fails, students are still generated (unsteered) | REVIEW | A graceful-degradation choice. Keep it, but make the failure visible and logged. |
| B3 | Student agent output contract: `{responses:[{student, message}]}`, Hebrew, one entry per speaking student, names from the session cast | PROTECT (interface) | The parser and UI depend on it. Internals (CoT, extra fields) may change. |
| B4 | Students address the teacher in 2nd person, speak simple Israeli middle-school Hebrew, stay on the lesson topic | PROTECT | Explicit, repeated product requirement in prompts. |
| B5 | 3 students per session, sampled at random from the 9 personas | **DECIDED: PROTECT (with requirement)** | Keep random casting **across** sessions. The cast must stay **fixed within a session** and **be recorded in the saved conversation data**. Today: the cast is shuffled once per page load (`AppContext.js:44-58`) and stays fixed while the tab lives, and a reload starts a new session. It is recorded as `studentRefs` (`v<version>_<id>`), but only on the first logged turn (lazy init). Any change must keep both properties and make the record reliable. Note that prompt examples hard-require ≥3 students (`ai.js:483-506`). |
| B6 | Zero student responses ("silence") is allowed by the parser, while the prompt demands ≥1 | REVIEW | Contradictory. Silence also causes the turn not to be logged (A3). |
| B7 | Greetings, closings and pure procedural teacher messages get **no** feedback (Gate 0) | PROTECT | Consistent with B200 (a greeting has no dimensions) and with expert intent. |
| B8 | At most 1-2 skills are shown per turn | REVIEW (intended, **not currently true**: 41% of v1.3.0 displayed feedbacks have 3-5) | Intended by the prompt and supported by B200 over-selection findings. If protected, it must be enforced in code. |
| B9 | Feedback from the previous turn is cleared when the teacher sends a new message; no stale feedback is shown | PROTECT | Correct intent (`Chat.jsx:61`). It is currently violable through the concurrent-send race (C3). |
| B10 | Sidebar placeholder "בהמתנה לתגובת המורה..." when there is no feedback | REVIEW | Does not distinguish "no feedback warranted" from "feedback failed". |
| B11 | Score colours and legend: 2 green "קיים היטב", 1 yellow "קיים באופן חלקי", 0 lilac "חסר" | PROTECT (UI vocabulary) | Teachers in the pilot learned this vocabulary. |
| B12 | Score-1 rows show `evidence` only (the suggestion is hidden) | **DECIDED: DO NOT PROTECT** | Score-1 feedback should eventually show both what was present (`evidence`) and what still needs improvement (`what_could_be_better`). Today 96/103 score-1 rows had a hidden suggestion. Changing the display is a planned behaviour change; bump `systemVersion`. |
| B13 | Summary is generated on demand after "סיים שיחה", once per tab (cached) | REVIEW | Product choice. Regeneration elsewhere is inconsistent (localStorage-only or unsaved). |
| B14 | Summary must not contradict real-time assessments (prompt intent) | PROTECT **intent**; the current implementation does not achieve it (C1) | |
| B15 | Drawing attachment is opt-in per message ("כלול בהודעה" resets after each send); the board persists across messages; the board closes after any send | REVIEW | Plausibly intentional UX. Cumulative snapshots and auto-close may not be. |
| B16 | The student agent sees attached drawings (as images) on all later turns | REVIEW | Gives the students visual continuity, at the cost of re-sending all images every turn. |
| B17 | The PCK and summary agents do **not** see drawings | **DECIDED: current behaviour, to change later (by design)** | Long-term, the PCK agent should see drawings that are part of the teacher turn. This is a **later design change, not a quick fix**: it alters feedback decisions and comparability with annotated data, so it needs a design (pixels and/or structured description, cost, evaluation) and a `systemVersion` bump. Until then, nobody should "fix" it ad hoc. |
| B18 | All LLM calls use `gemini-2.5-flash-lite`, temperature 0.7 | **DECIDED: frozen in the pilot baseline only** | The pilot version is preserved as a frozen baseline (branch `archive/pilot-v1.3.0`, tag `pilot-v1.3.0`). The development branch is **not** frozen: model, prompt and generation-config changes are allowed there, but each must be versioned through `systemVersion`, so that data from different versions stays separable. |
| B19 | `feedbackHistory`: the last 3 analyses (displayed or not) are passed to the PCK prompt with continuity rules | REVIEW | Intentional (v1.3.0), but continuity Rule 1 conflicts with B200 "relevance ≠ success". |
| B20 | Teacher-initiated scenarios show `teacher_briefing` until the first message; all six active scenarios are `initiated_by:"teacher"` | PROTECT | Pilot protocol. |
| B21 | All UI is Hebrew and RTL | PROTECT | |

## C. Current behaviours that should NOT be protected (defects)

| # | behaviour | where |
|---|---|---|
| C1 | Summary never receives real-time PCK moments (`should_provide_feedback` never logged) | `server.js:934-941`, `conversationLogger.js:166-173` |
| C2 | Input and send re-enabled, and the typing indicator hidden, as soon as a turn starts | `Chat.jsx:176` |
| C3 | Concurrent turns can race (sidebar shows an older analysis; turns are logged in completion order) | consequence of C2 |
| C4 | Empty messages (no text, no image) trigger the full PCK + student pipeline | `InputField.js:14-19` |
| C5 | All newlines stripped from messages (joined without a space) | `ChatMessage.js:9` |
| C6 | Fixed fallback student message `"אני צריך רגע לחשוב על זה..."`, persisted as a real student turn | `ai.js:325-336` |
| C7 | Student-call and PCK-call failures are silent and not logged; failed turns vanish from the record | `ai.js:232-237`, `Chat.jsx:244-264` |
| C8 | Speaker names dropped from the student agent's history | `server.js:180-251` |
| C9 | The prompt demands a `thinking` field that the response schema forbids | `ai.js:357,435-448` vs `server.js:282-304` |
| C10 | PCK feedback has no JSON mode, throws on parse error, defaults silently, and uses the placeholder message `'המורה התקדם בשיעור'` | `server.js:783-896` |
| C11 | Contradictory example in the PCK prompt (mixed turn: "false" … "should produce true") | `server.js:537-542` |
| C12 | Hard-coded persona participation tiers in the prompt (יונתן mismatch) | `ai.js:672-676` |
| C13 | Summary modal heading regex bug and raw HTML injection | `PCKSummaryModal.jsx:96-111` |
| C14 | Summary regenerated from logs pages is not saved to Firestore (localStorage only, or not saved at all) | `ConversationLogs.jsx:172-174`, `AdminConversationLogs.jsx:117-133` |
| C15 | Legacy pages call `callAI` with the old signature | `StudyScenario.jsx:59`, `ChatWithCode.jsx:82` |
| C16 | `IS_PRODUCTION:false` in production (prompts in the browser console) | `constants.js` |
| C17 | `GET /api/debug-user` "temporary" endpoint still exposed | `server.js:1309-1325` |

## D. Reviewer questions and decisions

1. **Is random casting (B5) intended, or should the cast be fixed or recorded per scenario?**
   - **Decision:** Keep random casting across sessions. The cast is fixed within each session and recorded in the saved conversation data.
   - **Rationale:** Variety across sessions is wanted. Within-session stability and a reliable record are needed for coherent conversations and research analysis.
2. **Should `turnNumber` stay "logged-turn index" (A3), with failed turns stored separately?**
   - **Decision:** Yes. `turnNumber` remains the index of logged turns only. Any later storage of failed or no-reply attempts is separate and does not change numbering semantics.
   - **Rationale:** Existing annotations, agreement reports and research example ids reference `turnNumber`.
3. **Is hiding the score-1 suggestion intentional (B12)?**
   - **Decision:** No. Do not preserve it. Score-1 feedback should eventually show both what was present and what still needs improvement.
   - **Rationale:** A partial score implies a gap. Hiding the recommendation removes the actionable part of the feedback, and it matches the B200 score-1 template (`מה קיים` + `המלצה`).
4. **Should the pilot freeze the model and prompts (B18)?**
   - **Decision:** Freeze the pilot version as a baseline (`archive/pilot-v1.3.0` / tag `pilot-v1.3.0`). Do not freeze the development branch. Version every model or prompt change through `systemVersion`.
   - **Rationale:** This keeps a reproducible reference for pilot data while allowing improvement. Versioning keeps data from different versions separable.
5. **Should the PCK agent see drawings (B17)?**
   - **Decision:** Yes in the long term, for drawings that are part of the teacher turn. Treat it as a later design change, not a quick fix.
   - **Rationale:** Drawings can be the pedagogical move itself, and annotators saw them. But visibility changes feedback decisions and comparability, so it needs design and evaluation first.

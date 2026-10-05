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
| A4 | `pckFeedback` is non-null **only when feedback was displayed** to the teacher, with fields `feedback_message, feedback_type, skills_assessment[], detected_skills[], missed_opportunities[], timestamp` | **DECIDED: PROTECT** | `pckFeedback: null` means no feedback was displayed to the teacher. If non-displayed PCK analyses are stored in the future, store them in a **separate, additive field**. Never put them in `pckFeedback`, so this meaning stays backward-compatible for research and annotation readers. |
| A5 | `skills_assessment[]` entries use `skill_id ∈ {error-identification, error-characterization, diagnostic-interpretation, adapted-pedagogical-response, error-leveraging}`, `is_relevant`, `score ∈ {0,1,2}`, `evidence`, `what_could_be_better` | PROTECT | B200 maps these ids to p1-p5. The annotation UI and sidebar use the same ids and Hebrew names. |
| A6 | `systemVersion` is stamped on every conversation and bumped on behaviour changes. **Process rule (DECIDED): every new `systemVersion` must have a corresponding changelog entry in `src/config/version.js`.** | PROTECT | It is the only way to separate data from different prompt/agent versions. Today it is the *only* provenance (no prompt hash, no model id). The changelog makes each version's behaviour reconstructable. Enforced by `configContracts.test.js`. |
| A7 | `studentRefs` = `v<version>_<id>`, with persona documents in `studentPersonas` | PROTECT | Persona versioning for research. Persona text changes should bump the persona `version`. |
| A8 | `scenario` snapshot stored per conversation, including `text`, `misconception_focus`, `target_pck_skills` | PROTECT | Research selects scenario guides from `target_pck_skills`. `scenario.text` is the de-facto scenario identifier. |
| A9 | Scenario `text` values are stable identifiers | REVIEW | There is no scenario id. Renaming a title breaks matching to past conversations (relevant for completed-scenario indication and research). Adding an id is fine; editing titles is not, without a migration map. |
| A10 | Stored drawings are downscaled to ≤600 px width PNG (base64, no data-URL prefix) | **DECIDED: PROTECT for the current architecture** | The research extractor and viewers expect PNG base64, and the 600 px limit protects the 1 MB document limit. Older records are uncompressed, so readers must not assume ≤600 px. **May be revisited during the future drawing / shared-workspace redesign** (e.g. vector state or external storage). Any change then must be versioned (`systemVersion`) and keep old records readable. |
| A11 | Conversations are saved incrementally after each logged turn; empty conversations are never saved (lazy init) | PROTECT | Partial sessions are research data (41/133 exported have no `endTime`). Avoids empty docs. |
| A12 | `summaryFeedback` is a single Markdown-ish Hebrew string | PROTECT | `exportConversationExcel.parseSummaryFeedback` parses it into sections. Viewers render it. |
| A13 | Older-format conversation docs (embedded `students` / `userProfile`, `pckFeedback` without `skills_assessment`) remain readable | PROTECT | 303 logged feedbacks lack `skills_assessment`. Viewers already have fallbacks. |
| A14 | The stored `userSnapshot` stays **minimal**: currently `{fullName, role}` only. It must not silently expand to other profile fields (e.g. email). | **DECIDED: PROTECT (data/privacy)** | Conversation records are research data shared with annotators. Any new identifying field needs an explicit decision. Enforced by `conversationLogger.test.js`. |
| A15 | Persona schema: `participation.baseline ∈ {low, medium, high}` | **DECIDED: PROTECT for the current persona schema** | The prompt and persona fields rely on these three tiers. A schema change must update the validation deliberately (and bump the persona `version`). Enforced by `configContracts.test.js`. |

## B. Turn orchestration and agent contracts

| # | invariant | status | why |
|---|---|---|---|
| B1 | **PCK analysis runs before student generation for the same teacher message, and its output steers the students** | PROTECT | The core "PCK-first" design (`PCK_FIRST_ARCHITECTURE.md`). Student reactions are meant to reflect move quality. |
| B2 | If the PCK call fails, students are still generated (unsteered) | REVIEW (**open: product decision needed**) | A graceful-degradation choice, possibly to keep, but the failure should be made visible and logged. **Not covered by the baseline tests.** Decide the intended behaviour when failure handling is addressed (C7): continue unsteered, retry, or block the turn with a visible error. Then add the matching orchestration test. |
| B3 | Student agent output contract: `{responses:[{student, message}]}`, Hebrew, one entry per speaking student, names from the session cast | PROTECT (interface) | The parser and UI depend on it. Internals (CoT, extra fields) may change. |
| B4 | Students address the teacher in 2nd person, speak simple Israeli middle-school Hebrew, stay on the lesson topic | PROTECT | Explicit, repeated product requirement in prompts. |
| B5 | 3 students per session, sampled at random from the 9 personas | **DECIDED: PROTECT (with requirement)** | Keep random casting **across** sessions. The cast must stay **fixed within a session** and **be recorded in the saved conversation data**. Today: the cast is shuffled once per page load (`AppContext.js:44-58`) and stays fixed while the tab lives, and a reload starts a new session. It is recorded as `studentRefs` (`v<version>_<id>`), but only on the first logged turn (lazy init). Any change must keep both properties and make the record reliable. Note that prompt examples hard-require ≥3 students (`ai.js:483-506`). |
| B6 | Zero student responses ("silence") is allowed by the parser, while the prompt demands ≥1 | REVIEW | Contradictory. Silence also causes the turn not to be logged (A3). |
| B7 | Greetings, closings and pure procedural teacher messages get **no** feedback (Gate 0) | PROTECT | Consistent with B200 (a greeting has no dimensions) and with expert intent. |
| B8 | At most 1-2 skills are shown per turn | REVIEW (intended, **not currently true**: 41% of v1.3.0 displayed feedbacks have 3-5) | Intended by the prompt and supported by B200 over-selection findings. If protected, it must be enforced in code. |
| B9 | Feedback from the previous turn is cleared when the teacher sends a new message; no stale feedback is shown | PROTECT | Correct intent (`Chat.jsx` `addUserResponse`). It was violable through the concurrent-send race (C3) until the turn lock was added (C2/C3 fixed 2026-10-05). |
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
| B22 | Image-only teacher turns (drawing included via "כלול בהודעה", no text) are accepted and start a turn | **DECIDED: PROTECT** | Image-only teacher turns are valid when the teacher **explicitly opts to include a real drawing** (opt-in ticked *and* a non-empty board). They must remain supported, and the C4 empty-message guard must not block them. They were used intentionally in the pilot (11 exported turns). Their handling downstream is incomplete: blank text in exports and agent transcripts, and PCK/summary agents don't see the drawing. See §E, issue **E1**. |

## C. Current behaviours that should NOT be protected (defects)

Rows marked ~~struck~~ / **FIXED** are kept for history. Their fixed behaviour is now covered by regression tests; see `regression_test_plan.md`.

| # | behaviour | where |
|---|---|---|
| C1 | Summary never receives real-time PCK moments (`should_provide_feedback` never logged) | `server.js:934-941`, `conversationLogger.js:166-173` |
| ~~C2~~ | **FIXED 2026-10-05.** *Historical:* input and send were re-enabled, and the typing indicator hidden, as soon as a turn started (`setIsQuerying(false)` before the LLM calls). *Now:* a turn lock keeps input, send, the board toggle and **finish (סיים שיחה)** unavailable, and the indicator visible, until the turn finishes (success or any failure path). See `regression_test_plan.md` §0.8. | `Chat.jsx` (turn lock), `ai.js` (`callAI` returns its promise) |
| ~~C3~~ | **FIXED 2026-10-05.** *Historical:* concurrent turns could race (sidebar showed an older analysis; turns were logged in completion order; finish could run mid-turn). *Now:* extra submits during a turn are ignored; turn log entries are written through a serial queue in send order; finish runs only after queued log entries are written. | consequence of C2 |
| ~~C4~~ | **FIXED 2026-10-05.** *Historical:* empty messages (no text, no image) triggered the full PCK + student pipeline (13 such turns in the pilot export). *Now:* a submit whose text is empty or whitespace-only **and** that has no drawing to include is ignored: no history entry, no PCK or student call, no logged turn, no turn lock. Image-only messages are unchanged (see B22). | `Chat.jsx` `addUserResponse` |
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

## E. Known future issues (not current invariants, not yet scheduled)

### E1. Image-only teacher turns are under-represented outside the live chat

Recorded 2026-10-05, after the C4 fix. Part of the future drawing / multimodal backlog (`regression_test_plan.md` §0.10, `drawing_pipeline.md` §8). **No change made yet.**

An image-only turn is saved with `teacher.message = ""` and the drawing in `teacher.image` (when the turn is logged).

1. **Blank teacher messages in history and export views.**
   - Views that show the drawing, but with an empty text line above it:
     - the live chat (`ChatBubble`);
     - `ConversationLogs` / `AdminConversationLogs` detail (`ConversationDetail`);
     - `ConvAnnotationEditor`;
     - `ComparisonSetsPage`.
   - Places where the turn is **blank**, with no image and no "[drawing]" marker:
     - the research Excel export (`exportConversationExcel`, used by `ResearchConversations`);
     - the admin CSV export (`AdminConversationLogs`, `teacher_message`);
     - the text history inside agent prompts.
   - Research text pipelines see an empty teacher turn unless they join the images extracted separately (`research/pck_feedback/.../extract_images.py`).
2. **Inconsistent evidence between agents.**
   - The **student agent sees the drawing.** It is sent as `inline_data`, and re-sent on every later turn (B16).
   - The **PCK agent does not.** It receives an empty `teacherMessage`, which `/api/pck-feedback` rejects with 400, so the turn gets no feedback and the students run unsteered (B2). Even on later turns, the PCK history shows `מורה: ` with nothing after it.
   - The **summary agent does not see it either.** The transcript line is `Teacher: ` with nothing after it.
   - Related: B17 (PCK and summary agents do not see drawings at all).
3. **Consequence.** Saved pilot conversations containing image-only turns are hard to interpret. The teacher's move is invisible in exports, and student replies appear to respond to nothing. The agents also judged the same turn on different evidence. Analyses of pilot data should treat these turns specially (11 turns in the 2026-07-27 export).

**Direction (to be designed with the B17 drawing-visibility work, not a quick fix):**
- an explicit drawing marker or caption in transcripts and exports;
- the PCK and summary agents receive the drawing (or a description) for the turn;
- `/api/pck-feedback` accepts image-only turns.

All of this needs a `systemVersion` bump and must keep old records readable.

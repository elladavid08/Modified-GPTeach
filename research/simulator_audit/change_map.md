# Change map for pilot change requests

Ratings:
- **Complexity:** L / M / H.
- **Nature:** UI · Agent (prompt or agent logic) · Arch (state, persistence or contracts) · Research (needs evaluation, data or expert decision).
- **Claude-Code-ready:**
  - **Direct**: safe to hand over with a precise spec plus the tests in `regression_test_plan.md`.
  - **Spec first**: small design or product decision needed.
  - **Design first**: needs an architecture or research design.

A cross-cutting rule for every item that changes agent behaviour, persisted fields or what teachers see: bump `SYSTEM_VERSION` (`src/config/version.js`). That is the only provenance research data has.

---

## 0. Prerequisite reliability fixes surfaced by the audit (not on the pilot list)

These underlie several pilot items. They are listed first because they are cheap and remove noise from later evaluation.

| # | change | files | cx | nature | ready? | risk |
|---|---|---|---|---|---|---|
| 0.1 | Summary must receive real-time moments: fix the `should_provide_feedback` filter, or log the field | `server.js:934-941` and/or `conversationLogger.js:166-173` | L | Agent/Arch | **Direct** | Changes summary content and length for all new sessions (the summary will start citing real-time scores). Old records still lack the field, so filter on `pckFeedback != null` or store an explicit flag. Bump the version. |
| 0.2 | Keep the UI "busy" until the turn completes (do not clear `isQuerying` before the calls) and block concurrent sends | `Chat.jsx:124-293`, `Messages.jsx`, `InputField.js` | L-M | UI/Arch | **Direct** (with a test) | Must still unblock on every error path. A hung request would then lock the UI, so add a timeout. |
| 0.3 | Block empty sends (no text and no image) | `InputField.js:14-19` | L | UI | **Direct** | Decide whether image-only messages are allowed (11 exist in the data). |
| 0.4 | Persist failure and diagnostic info per turn: raw outputs, parse status, `finishReason`, latency, `impact_analysis`, non-displayed PCK decisions, failed turns | `server.js` LLM endpoints, `Chat.jsx`, `conversationLogger.js` | M | Arch | **Spec first** | Schema additions must be **additive** (new fields or a subcollection) so annotation and research readers keep working. Mind the 1 MB doc limit; raw outputs probably belong in a subcollection. Do not change `turnNumber` semantics for existing data. |
| 0.5 | JSON mode + response schema + non-throwing validated parser for `/pck-feedback` (B200 A1-A3) | `server.js:783-896` | M | Agent | **Spec first** | The schema must cover the nested objects. Changes decision behaviour slightly, so compare outputs on a fixed set before rollout. |
| 0.6 | Visible error state when a student or PCK call fails, instead of silence | `Chat.jsx`, `ai.js:232-237`, `PCKFeedbackSidebar` | L | UI | **Direct** | Copy/wording decision (Hebrew). |

---

## 1. UI/UX improvements (general)

| concrete issue found | files | cx | ready? |
|---|---|---|---|
| Typing indicator disappears immediately (see 0.2) | `Chat.jsx:176`, `Messages.jsx:51-64` | L | Direct |
| Sidebar "עודכן:" time is the render time, not the feedback time | `PCKFeedbackSidebar.jsx:~176` | L | Direct |
| Summary modal Markdown rendering bug (`# ` regex matches `##`/`###`) and raw HTML injection | `PCKSummaryModal.jsx:96-111` | L | Direct (use a proper renderer, or fix the regex order plus escaping) |
| `alert()` for session end and errors; "שיחה חדשה" reloads the page without confirmation | `Chat.jsx:296-315, 425-427` | L | Spec first (desired flow) |
| Fixed 22% / 56% / 22% columns; not responsive | `Chat.jsx:376-540`, sidebars | M | Spec first |
| `IS_PRODUCTION:false` hard-coded (full prompts logged in the participant's browser console) | `constants.js` | L | Spec first. Flipping it also turns on random message delays (`ChatHistory.addMessages`) and the button guard, which are behaviour changes. |

- **Nature:** UI.
- **Dependencies:** none for most items.
- **Risk:** low, but anything that changes *what* is displayed (not only how) interacts with the research protocol.

## 2. Long or unclear pedagogical feedback

| sub-change | files | cx | nature | ready? |
|---|---|---|---|---|
| Enforce a cap on displayed skills (e.g. ≤2, or the single most useful one) in code | `server.js` post-processing or `PCKFeedbackSidebar` | L | UI/Agent | **Spec first**: which row(s) to keep? B200 notes an expert preference for the single most useful point, which is a research decision. |
| Show the improvement suggestion for score-1 rows (currently hidden) | `PCKFeedbackSidebar.jsx:131-139` | L | UI | **Spec first**: format, e.g. `מה קיים` / `המלצה`, with expert confirmation |
| Display (or stop generating) the composed `feedback_message_hebrew` | sidebar; `server.js:721-759` | L | UI/Agent | Spec first |
| Shorter, template-conditioned text (B200 A5) | PCK prompt | M | Research | **Design first**: researcher-derived template; confirm with experts; validate in code |
| Rubric semantics: relevance ≠ success, p4 before an error, remove the strict chain | PCK prompt | M-H | Research | **Design first**: changes decisions; needs offline evaluation on B200 gold (p1/p4 only) |

- **Dependencies:** 0.4 (to measure before/after) and 0.5.
- **Risks:** the feedback decision is coupled to student steering (`impact_analysis`), so prompt changes alter student behaviour too. Teachers in an ongoing pilot would see a different system mid-study.

## 3. Repeated student responses

| sub-change | files | cx | nature | ready? |
|---|---|---|---|---|
| Block empty sends (0.3) | `InputField.js` | L | UI | Direct |
| Lock input during generation (0.2) | `Chat.jsx` | L-M | UI/Arch | Direct |
| Deterministic post-generation duplicate check: drop or re-ask when a message equals that student's previous one (or any earlier message), at most one re-ask | `ai.js:convertResponseToMessages` / `callChatModel`, or server | M | Agent | **Spec first** (policy: drop, re-ask, or keep silent; what to log) |
| Include speaker names in history (e.g. `"נועה: …"` or JSON-formatted prior turns) | `ChatMessage.toAIformat` or `server.js:convertMessagesToGenAI` | L code / M effect | Agent | **Spec first + evaluation**: changes every student output; compare on replayed conversations |
| Resolve the CoT / schema conflict: add `thinking` to `responseSchema` (raise `maxOutputTokens`) or remove the CoT text from the prompt | `server.js:277-305`, `ai.js:340-518` | L code / M effect | Agent | Spec first + evaluation |
| Replace the fixed fallback string with re-ask then a visible error | `ai.js:325-336` | L | Agent/UI | Direct |
| Log raw output and a duplicate flag (0.4) | — | M | Arch | Spec first |

- **Dependencies:** 0.4 to verify the effect. Golden replay tests (`regression_test_plan.md` §5).
- **Risks:** a stricter duplicate filter may silence all students; the prompt demands ≥1 response. Name-tagged history may make the model prefix messages with names, so the parser must strip them.

## 4. Inconsistent student behaviour (regression to a misconception, premature correctness, multi-student)

| sub-change | files | cx | nature | ready? |
|---|---|---|---|---|
| Speaker names in history (see 3) | as above | L-M | Agent | Spec first |
| Explicit per-student knowledge / misconception state (e.g. `{student, misconception, status: held/shaken/resolved, since_turn}`), updated per turn and fed back into the prompt | new module; `Chat.jsx`, `ai.js`, persistence | **H** | Arch/Research | **Design first** |
| Decouple "PCK quality" from "students MUST understand" (graded uptake) | `ai.js:563-661`, PCK PART A | M | Agent/Research | Design first |
| Fix hard-coded persona tiers in the prompt (`ai.js:672-676`, the יונתן mismatch) | `ai.js` | L | Agent | Direct (derive from persona fields) |
| Per-student agents (separate calls) | `ai.js`, `server.js` | H | Arch | Design first (cost and latency ×3, turn-taking logic) |

- **Dependencies:** 0.4, plus a way to label consistency in replayed conversations.
- **Risks:** high behavioural drift. The research data from different versions stops being comparable.

## 5. Completed-scenario indication

| | |
|---|---|
| Files | `ScenarioSelector.jsx`, `Chat.jsx:363-373`; data via `firestoreService.getConversationsByUser` (already used by `ConversationLogs.jsx`) |
| Complexity | **M** (L for the UI; the identity and "completed" definition is the hard part) |
| Nature | UI + Arch |
| Dependencies | **Scenarios have no stable id.** Logs store `scenario.text` only, and scenario texts have changed before (commit `1eb3da6`). A product definition of "completed" is needed: `endTime` set? summary generated? ≥N turns? Partial conversations are also saved (41 of the 133 exported conversations have no `endTime`). Firestore rules must allow a user to read their own conversations (the logs page implies they already do). |
| Risks | Matching on Hebrew title text breaks silently if a title is edited. Adding a scenario `id` and logging it is additive; old records need a text→id map. |
| Ready? | **Spec first** (definition plus id strategy), then Direct. |

## 6. Multiline teacher messages

| | |
|---|---|
| Root cause | `ChatMessage` constructor removes `\n` (`ChatMessage.js:9`) for *all* messages. `ChatBubble` has no `white-space: pre-wrap`. Shift+Enter already inserts newlines in the textarea (`InputField.js:29-37`). |
| Files | `ChatMessage.js`, `ChatBubble.jsx` / `Messages.css`; check renderers in `ConversationLogs.jsx`, `AdminConversationLogs.jsx`, `ConvAnnotationEditor.jsx`, `ResearchConversations.jsx`, `exportConversationExcel.js`; prompt formatters `universal_pck_skills.js:434-450`, `server.js:926-931` |
| Complexity | **L** |
| Nature | UI (+ small agent-context effect) |
| Dependencies | Decide whether students may emit newlines too (today they are stripped as well). |
| Risks | Persisted text gains `\n`. Downstream viewers collapse it unless updated. Research line-based history formats (`מורה:` lines) get multi-line entries. Older records have no newlines, which is a minor research comparability note. |
| Ready? | **Direct**, with a spec: keep newlines for teacher messages, render with `pre-wrap` everywhere a message is shown. |

## 7. Drawing-tool improvements

| sub-change | files | cx | ready? |
|---|---|---|---|
| Undo/redo, colours, line width, text/label tool, vertex labels | `DrawingBoard.jsx` | L-M each | **Direct** per item (UI only; the attached PNG changes appearance only) |
| Clear vs keep the board after send; show which snapshot was sent | `DrawingBoard.jsx`, `Chat.jsx:63-86` | L | Spec first (UX decision) |
| Store vector state (`canvas.toJSON()`) alongside the PNG | `DrawingBoard`, `conversationLogger`, storage location | M | **Spec first**: doc-size limit; store outside the conversation doc |
| Image-only turns (B22 DECIDED: supported): drawing marker/caption in exports and transcripts; PCK accepts and analyses image-only turns (today a 400) | `exportConversationExcel.js`, `AdminConversationLogs.jsx`, `universal_pck_skills.js`, `server.js` | M | **Design first**, with the PCK visibility row below (`invariants.md` §E1) |
| Give the PCK agent visibility of drawings (image or description) | `server.js:/pck-feedback`, `genai.getPCKFeedback` | M | **Design first** (changes feedback decisions; research comparability) |
| Stop re-sending every past image to the student agent / add captions | `ChatMessage.toAIformat`, `convertMessagesToGenAI` | M | Design first (changes student behaviour) |

- **Risks:** the eraser rasterises pen strokes, which interacts with any vector-state feature. The research image extractor depends on `turn.teacher.image` being a base64 PNG.

## 8. Voice input

| | |
|---|---|
| Current state | `components/RecordingButton.jsx` exists, is unused, and posts audio from the **browser directly to OpenAI Whisper** with a client-side key. That would leak the key; the OpenAI provider is disabled anyway. |
| Options | Browser Web Speech API (Hebrew `he-IL` support varies by browser) vs server-side STT using the existing GCP credentials (new endpoint). |
| Files | `InputField.js`, new STT endpoint in `server.js` or client-only; `ChatMessage` (flag `input_mode:'voice'`), logger |
| Complexity | **M** (client-only) to **M-H** (server STT + consent) |
| Nature | UI + Arch + research ethics |
| Dependencies | Consent and privacy for participants' voice; whether audio is stored; whether transcripts are editable before send; flagging voice-originated turns for research. |
| Ready? | **Design first** |

## 9. Student drawing

| | |
|---|---|
| Needs | Student-agent output schema extension (drawing spec or primitives), a renderer, persistence of student drawings, PCK-agent visibility, and a turn model that accounts for drawings. Overlaps with the future shared mathematical workspace. |
| Files | `server.js` schema, `ai.js` parser and prompt, `ChatMessage`, `ChatBubble`, `DrawingBoard` or a new canvas, logger, all downstream readers |
| Complexity | **H** |
| Nature | Arch + Agent + Research (can Flash-Lite produce correct geometric drawings? untested) |
| Ready? | **Design first.** Prototype the model capability offline before touching production. |

---

## Quick-wins vs design-first (summary)

- **True quick wins** (Direct, low risk, high value):
  - 0.1 summary moment bug
  - 0.2 input lock / typing indicator
  - 0.3 empty-send guard
  - 0.6 visible error state
  - multiline messages (6)
  - summary modal rendering fix
  - sidebar timestamp
  - fallback-string replacement
  - persona-tier derivation
  - individual drawing-tool features
- **Spec first** (a small decision, then Direct):
  - feedback row cap
  - score-1 suggestion display
  - duplicate-response policy
  - speaker names in history
  - CoT/schema conflict
  - diagnostics persistence (0.4)
  - PCK JSON mode (0.5)
  - completed-scenario indication
- **Design first:**
  - explicit student state
  - feedback rubric/prompt redesign
  - PCK visibility of drawings
  - image re-send policy
  - voice input
  - student drawing
  - model choice

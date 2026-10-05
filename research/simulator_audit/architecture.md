# Simulator architecture (as-built, audited 2026-10-05)

Read-only audit of `main` @ `dd5b7a6` (system version `1.3.0`, `src/config/version.js`).
Every claim below comes from reading the code path. Where it rests on the exported production data
(`research/pck_feedback/data/raw/conversations/*.json`, 133 conversations, exported 2026-07-27), that is stated.

## 1. Components at a glance

```
Browser (React 18 SPA, CRA)                                   Node/Express backend (server/server.js)
┌───────────────────────────────────────────────┐            ┌──────────────────────────────────────┐
│ AppProvider (objects/AppContext.js)           │            │ /api/generate     → student agent     │
│   loads personas, scenarios; shuffles students│            │ /api/pck-feedback → real-time PCK     │
│ HistoryProvider (objects/ChatHistory.js)      │  fetch     │ /api/pck-summary  → summary feedback  │
│   messages[] = ChatMessage (React state only) │──────────▶ │ /api/completion   → legacy (unused)   │
│ pages/Chat.jsx  ← the production simulator    │  JSON      │ /api/test, /api/health                │
│   turn orchestration, PCK→students sequencing │            │ Vertex AI SDK, gemini-2.5-flash-lite  │
│ utils/ai.js  ← student prompt + parsing       │            │ firebase-admin (annotation/research)  │
│ services/genai.js ← HTTP client + retry       │            └──────────────────────────────────────┘
│ services/conversationLogger.js ← turn log     │
│ services/firestoreService.js  ← client SDK    │──────────▶ Firestore `conversations/{sessionId}` (client SDK write)
│ components: Messages, InputField, ChatBubble, │            Firestore `studentPersonas/{v<ver>_<id>}`
│   DrawingBoard (fabric.js), PCKFeedbackSidebar│            localStorage `conversation_log_<sessionId>`
│   PCKSummaryModal, ScenarioSelector, Lesson…  │
└───────────────────────────────────────────────┘
```

- **Frontend:** CRA/React 18 (`src/index.js` uses `createRoot` + `StrictMode`). Routing is in `src/Router.js`. `/` and `/chat` render `pages/Chat.jsx`, the only production simulator page.
- **Backend:** one Express file, `server/server.js` (2,220 lines). It holds the LLM endpoints (lines 254–1207) and about 40 annotation/research endpoints that use `server/services/firebaseAdmin.js`.
- **Model:** a single module-level `vertexAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' })` (`server.js:56-58`) serves every LLM call. There is no per-endpoint model choice and no system instruction; system text is concatenated into the first user message.
- **Persistence:** the browser writes conversation records directly to Firestore through the client SDK (`firestoreService.saveConversation`, `setDoc(..., {merge:true})` keyed by `sessionId`). The backend's `/api/conversations*` endpoints exist but the simulator never calls them.
- **Tests:** there are no frontend or backend tests. Only `research/pck_feedback/tests` (Python, research-only) exists. See `regression_test_plan.md`.

## 2. Configuration and static content

| item | file | notes |
|---|---|---|
| Student personas (9) | `src/config/students/personas.js` | Free-text Hebrew `description`, plus structured `participation`, `reasoning_style`, `misconception_tendencies`, `update_response`, `escalation_if_confused`. `AppContext` **shuffles them on every page load** (`AppContext.js:44-58`). `Chat.jsx:56` takes the first `NUM_STUDENTS=3`. |
| Scenarios (6 active) | `src/config/scenarios/geometry_scenarios.js` | Fields: `text` (title), `teacher_briefing`, `lesson_goals`, `target_pck_skills`, `ai_*`, `misconception_focus`, `initiated_by` (all `"teacher"`). **No stable scenario `id`.** Logs store only `scenario.text` and other fields. |
| Constants | `src/config/constants.js` | `SYSTEM_PROMPT`, `RESPONSE_INSTRUCTIONS` (student agent), `PROVIDER:"google"`, `MODEL_VERSION:4`. `IS_PRODUCTION:false` is hard-coded, so prompts are logged to the browser console, message delays are off, and the "new conversation" button is never disabled. |
| PCK taxonomy | `server/universal_pck_skills.js` | 5 skills with 0/1/2 rubrics and Hebrew patterns. `formatSkillsForPrompt` (≈ line 393) and `formatConversationHistory` (line 434). |
| Version | `src/config/version.js` | `SYSTEM_VERSION` is stamped into each conversation record. It is the only prompt/version provenance. |

## 3. The turn loop (production page `Chat.jsx`)

1. **Scenario selection:** `ScenarioSelector` lists all scenarios. Nothing shows which ones the teacher has completed. Choosing one calls `setScenario` (`Chat.jsx:363-373`).
2. **Logger:** a `ConversationLog` is created once the scenario, students and user are ready (`Chat.jsx:42-54`). Firestore is initialised lazily on the first logged turn.
3. **The teacher sends a message.** `InputField.handleSubmit` (`InputField.js:14`) builds `new ChatMessage(TAname, text, "user")`. The constructor **strips all newlines** (`ChatMessage.js:9`). Empty text is not blocked.
   - `Chat.addUserResponse` (`Chat.jsx:59-90`) clears the sidebar feedback. If the board is open and "כלול בהודעה" is ticked, it attaches the canvas PNG, then `history.addMessage(...)` and `setIsQuerying(true)`.
4. **Orchestration effect** (`Chat.jsx:124-293`, deps `[isQuerying, scenario]`):
   - It immediately calls `setIsQuerying(false)` (line 176). That **re-enables the input and hides the typing indicator before any LLM call starts** (see `student_agent_findings.md` §4).
   - **Step 1, PCK analysis:** `getPCKFeedback(lastTeacherMessage.text, history.getMessages(), scenario, feedbackHistory.slice(-3))` → `/api/pck-feedback`. If `should_provide_feedback` is set, the result goes to the sidebar. Every result is appended to `feedbackHistory` (max 5).
   - **Step 2, students:** `callAI(history, students, scenario, addendum, impact_analysis, cb)` (`utils/ai.js`) → `/api/generate`. Messages are parsed and appended to history. Then `conversationLogger.addTurn(teacherText, students, feedbackForLog, image)` runs (`Chat.jsx:271-286`).
   - If zero student messages come back (model silence *or* any error), the callback returns early (`Chat.jsx:261-264`). **No turn is logged**, so that teacher message and its PCK feedback never reach Firestore.
5. **Finish:** "סיים שיחה" calls `endSession()` (sets `endTime` and saves) and `saveToLocalStorage()` (another Firestore save) (`Chat.jsx:296-315`).
6. **Summary:** "קבל ניתוח PCK" calls `getPCKSummary(logger.toJSON())` → `/api/pck-summary`. The result is shown in `PCKSummaryModal` and saved via `addSummaryFeedback` (`Chat.jsx:317-351`). It is cached in component state, so it is generated once per session.

"שיחה חדשה" calls `window.location.reload()`. All in-memory state is lost and there is no resume.

## 4. Data model

**In memory (per tab only):** `HistoryContext.messages: ChatMessage[]` with fields `{agent, name, role:'user'|'assistant', text (newlines stripped), image (base64 PNG|null), timestamp}`. This array is the **only conversation state** the student agent sees. There is no student-knowledge or misconception state object.

**Firestore `conversations/{sessionId}`** (written whole on every turn by `ConversationLog.saveToFirestore`):

```
sessionId, userId, userSnapshot{fullName, role}, systemVersion, startTime, endTime|null,
scenario{text, grade_level, ai_context_summary, ai_prior_knowledge, ai_pedagogical_focus,
         misconception_focus, target_pck_skills, initiated_by},
studentRefs["v1.0_noa", ...], stats{totalTeacherMessages, totalStudentMessages, totalPCKFeedbacks, durationMinutes?},
summaryFeedback: string|null, lastUpdated,
turns[ { turnNumber, timestamp,
         teacher{message, image (≤600px-wide PNG base64)|null, timestamp},
         students[{name, message, timestamp}],
         pckFeedback: null | {feedback_message, feedback_type, skills_assessment[], detected_skills[],
                              missed_opportunities[], timestamp} } ]
```

**Not persisted anywhere:**
- raw LLM outputs;
- prompts;
- the PCK analysis for turns where no feedback was shown (`should_provide_feedback:false`): its `pedagogical_quality`, `predicted_student_state` and `student_reaction_hints`;
- the `impact_analysis` that steered the students;
- parse/fallback status;
- model id and generation config;
- the canvas's vector state;
- failed or empty turns.

Older exported records (versions 1.0–1.1) have `students`/`userProfile` embedded instead of `studentRefs`/`userSnapshot`. Downstream code must tolerate both.

**Downstream consumers of this schema** (anything that changes the schema must keep them working):
- `ConversationLogs.jsx`, `AdminConversationLogs.jsx`, `ResearchConversations.jsx`
- `ConvAnnotationEditor.jsx` (reads `turn.teacher.message/image`, `turn.students`)
- `exportConversationExcel.js`
- `firebaseAdmin.js` agreement/comparison code (keys on `turnNumber`)
- the research exporter `research/pck_feedback/src/pck_feedback/export/*` (reads `turn.teacher.image` and `turnNumber`; example ids are `<sessionId>__<turnNumber>`)

## 5. Major data flows

| flow | path |
|---|---|
| Student generation | `Chat.jsx` effect → `utils/ai.js:callChatModel` → `makeProsePrompt` (system text) + `history.toAIformat()` → `genai.generateWithGenAI` → `POST /api/generate` → `convertMessagesToGenAI` → Gemini (JSON schema) → text → `convertResponseToMessages` → `ChatMessage[]` → `history.addMessages` → `ChatBubble` |
| Real-time PCK | `Chat.jsx` → `genai.getPCKFeedback` → `POST /api/pck-feedback` → big prompt (`server.js:386-776`) → Gemini (free text) → fence strip → `JSON.parse` → default-filling → `analysis` → sidebar (`PCKFeedbackSidebar`) + `feedbackHistory` + student prompt (`impact_analysis`) + logged turn (only if shown) |
| Summary | `Chat.jsx` / `ConversationLogs.jsx` / `AdminConversationLogs.jsx` → `genai.getPCKSummary(log)` → `POST /api/pck-summary` → Gemini (free text) → `PCKSummaryModal` (regex→HTML, `dangerouslySetInnerHTML`) → `summaryFeedback` |
| Drawing | `DrawingBoard` (fabric.js) → `exportAsImage()` PNG base64 → `ChatMessage.image` → re-sent as `inline_data` on **every** later student call; compressed copy saved to `turn.teacher.image`. See `drawing_pipeline.md`. |
| Persistence | `ConversationLog.addTurn` → `firestoreService.saveConversation` (client SDK `setDoc merge`) on every turn; errors are only `console.error`ed |

## 6. Other pages that call the LLM

- `pages/ChatWithCode.jsx` (`/code`) and `pages/StudyScenario.jsx` (`/sequence/:num`) are legacy. They call `callAI` with the old 5-argument signature.
  - In `StudyScenario.jsx:59` the callback lands in the `impact_analysis` slot and `onResponse` is `undefined`, so this page is broken.
  - `ChatWithCode.jsx:82` has the same mismatch.
  - Neither page logs to Firestore or calls PCK feedback.
- `/api/completion` is reachable only through `MODEL_VERSION === 3`, which is not the configured value.

## 7. Cross-cutting observations (non-LLM)

- **Security surface (outside audit focus; noting only):**
  - The backend LLM and Firestore endpoints have no auth.
  - `GET /api/debug-user` is a "TEMPORARY DEBUG ENDPOINT" (`server.js:1309-1325`) that returns admin/annotator status for any uid.
  - The browser can write any `conversations/{id}` doc, subject to Firestore rules that are not in the repo.
  - `PCKSummaryModal` injects LLM output as HTML.
- **No request-level identity.** LLM calls carry no `sessionId`/`turnNumber`, so server console logs cannot be joined to a conversation record.
- **Server logs:** `/api/generate` logs the full raw Vertex result (`server.js:319`). PCK feedback logs a 200-char preview, plus the full text on parse failure. Summary logs only its length. Logs go to stdout/PM2 (`server/ecosystem.config.cjs`) and are not retained in any research store.

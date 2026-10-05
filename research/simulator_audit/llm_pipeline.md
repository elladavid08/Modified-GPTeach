# LLM pipelines: trigger → prompt → model → output → parsing → retry/fallback → state/DB → UI

All calls use the one shared `gemini-2.5-flash-lite` model object (`server/server.js:56-58`, Vertex AI, `us-central1`, service-account auth).
No call sets a system instruction, safety settings, a thinking budget, or a request/session id.

## 0. Shared retry layers (apply to every call)

| layer | where | retries on | does NOT retry |
|---|---|---|---|
| Server `withRetry` | `server.js:71-92` | errors whose message contains `429`, `RESOURCE_EXHAUSTED`, `Too Many Requests`, `quota`, or `status===429`; 3 retries, 2/4/8 s | 5xx, network errors, timeouts, empty or blocked candidates, **parse/validation failures** |
| Client `fetchWithRetry` | `src/services/genai.js:20-34` | HTTP 429/503 from the backend; 2 retries, 3/6 s | 500 (which is what every server-side failure returns), network errors |

Consequences:
- A server-side parse failure returns **500**, which is never retried. The client sees an error.
- Worst-case stacked latency on quota errors is about 14 s server-side × 3 client attempts.
- No call has a timeout, so a hung Vertex request blocks the turn indefinitely. Because of `Chat.jsx:176` the UI does not look blocked.

Neither layer re-asks the model after a malformed output. There is no `finishReason` check anywhere: `MAX_TOKENS`, `SAFETY` and `RECITATION` are not distinguished.

---

## 1. Student agent: `POST /api/generate`

| stage | detail |
|---|---|
| **Trigger** | `Chat.jsx` effect on `isQuerying` (`Chat.jsx:124-293`), after the PCK call resolves or fails. Also fires at session start for `initiated_by:"students"` (no current scenario uses this). |
| **Prompt source** | `utils/ai.js:makeProsePrompt` (lines 340-737) builds one big "system" string from: the JSON-format block; compact scenario context; natural-flow rules; the NO-DUPLICATE rule (404-407); lesson-phase detection; the CoT "DECISION PROCESS" (asks for a `thinking` field); response rules and 3 examples with `thinking`; `Constants.SYSTEM_PROMPT`; scenario `text`; the misconception lifecycle (547-561); **the PCK `impact_analysis` block, marked "THIS OVERRIDES ALL OTHER INSTRUCTIONS"** (563-661); conversation guidelines with hard-coded persona names (672-676); persona descriptions and structured fields (694-719); `Constants.RESPONSE_INSTRUCTIONS`; plus `addendum` (first-turn instructions from `Chat.jsx:143-173`). |
| **Context** | `history.toAIformat()` (`ChatHistory.js:69-75` → `ChatMessage.toAIformat`): **every** prior message, never truncated. Teacher messages are `role:user`. Each student message is a separate `role:assistant` whose content is **only the text**. The speaker's name sits in `name`, which `convertMessagesToGenAI` ignores (`server.js:180-251`). Images are sent as `inline_data` for every past image message. The system string is prepended to the first user message only. |
| **Model call** | `generationConfig = {maxOutputTokens:512, temperature:0.7, topP:1, responseMimeType:"application/json", responseSchema:{responses:[{student,message}]}}` (`server.js:277-305`), plus `stopSequences:["Teacher:"]` from the client (`ai.js:167`). |
| **Structured output** | Enforced by Vertex `responseSchema`. The schema has **no `thinking` property**, so the chain-of-thought the prompt demands (`ai.js:357, 435-448, 480-506`) cannot be emitted. `ai.js:268-287` then logs "No 'thinking' field…" on every turn. |
| **Raw output** | `candidate.content.parts[0].text` (only the first part) → `{success:true, text}`. The server logs the full raw Vertex result to stdout (`server.js:319`). The client logs it to the browser console (`ai.js:174-176`). **It is not stored.** |
| **Parsing / validation** | `convertResponseToMessages` (`ai.js:242-337`): `JSON.parse`; require a `responses` array; skip entries missing `student`/`message`; `toTitleCase(student)`; `message.trim()`; `new ChatMessage(...)` (strips `\n`). It does **not** check that the name is one of the session's students, does not de-duplicate against prior messages or within the turn, does not enforce the student count, and does not check for empty strings beyond falsiness. |
| **Failure behaviour** | (a) Backend non-2xx (Vertex error, blocked/empty candidate, payload > 10 MB `express.json` limit, network): `generateWithGenAI` throws, `callChatModel` catches, `onResponse([], null)` (`ai.js:232-237`), and `Chat.jsx:261-264` returns. **No student message, no turn logged, no UI error.** (b) A 200 whose text is not valid JSON or lacks `responses` (e.g. truncation at 512 tokens, or the `"Teacher:"` stop sequence firing mid-JSON): **fixed fallback** `"אני צריך רגע לחשוב על זה..."` from a *random* student (`ai.js:325-336`), logged and persisted as a real student turn with no flag. (c) `responses: []`: silence, handled like (a). |
| **Stale / previous content?** | No code path re-uses the previous valid response. The only "same content" mechanism in code is the constant fallback string in (b). It never appears in the 133 exported conversations, so (b) appears rare in practice. See `student_agent_findings.md` for the observed verbatim repeats. |
| **State / DB** | `history.addMessages` (React state). `conversationLogger.addTurn` writes `turn.students[] = {name, message}`. |
| **UI** | `Messages` → `ChatBubble` (`message.agent` label, `message.text`). |

---

## 2. Real-time PCK feedback: `POST /api/pck-feedback`

| stage | detail |
|---|---|
| **Trigger** | Every student-generation cycle with at least one teacher message. It runs **before** the student call, sequentially (`Chat.jsx:185-248`). |
| **Inputs** | `teacherMessage` (newline-stripped text), `conversationHistory` = `history.getMessages()` (the full `ChatMessage` objects **including base64 images**, so the request body grows with drawings; the server uses only `role/name/text`), `scenario` (the whole object), and `feedbackHistory.slice(-3)` (the last 3 analyses, whether or not they were displayed). |
| **Prompt source** | Inline template literal `server.js:386-776`. It contains the role; `formatScenarioContextForPrompt`; `formatSkillsForPrompt()` (all 5 skills, 3 patterns per band); the history as `מורה:` / `<name>:` lines (`universal_pck_skills.js:434-450`; **the history already ends with the current teacher message**, which is then repeated as "Teacher's Latest Message"); previous-feedback block, persistence and continuity rules (only when history is non-empty); PART A student-impact assessment; PART B Gate 0 / Gate 1 / Gate 2 with examples; Phase 2 "strict prerequisite chain" skill selection (max 2 relevant); anti-hallucination rule; JSON schema in a fenced code block; feedback message rules; calibration. |
| **Model call** | `{maxOutputTokens:2000, temperature:0.7, topP:1}` (`server.js:783-787`). **No `responseMimeType`, no `responseSchema`** — the configuration under which B200 observed trailing commas and unescaped `"` in Hebrew (`failure_modes.md` §1-2). |
| **Raw output** | `parts[0].text.trim()`. Logs a 200-char preview, plus the full text on parse failure. **Not stored.** |
| **Parsing** | Strips a ```` ```json ```` or ```` ``` ```` fence via regex (`server.js:814-824`), then `JSON.parse`. There is no `{…}` substring fallback and no quote/comma repair. |
| **Validation / coercion** (`server.js:837-896`) | Silent defaults: `pedagogical_quality→'neutral'`; `predicted_student_state→{same, thoughtful, []}`; `response_tone→'thoughtful'`; `should_provide_feedback→false` if missing; `skills_assessment→[]`; `addressed_misconception→false`; `misconception_risk→'medium'`; `demonstrated_skills` and `missed_opportunities` derived from `skills_assessment` if absent. If `should_provide_feedback` is true and the message is empty, it becomes the placeholder **`'המורה התקדם בשיעור'`**; otherwise the message is forced to `''`. Not checked: score range, `skill_id` validity, the decision ↔ relevance invariant, max-2 relevant, `is_relevant` with null score, string types (an object-valued `evidence` would render as `[object Object]`). **No coercion is logged.** |
| **Failure behaviour** | Parse failure → `throw` → 500 → client `getPCKFeedback` throws → `Chat.jsx:244-248` sets `impact_analysis=null`. **No feedback is shown, the students run without PCK steering, nothing is logged, and `feedbackHistory` is not updated.** The teacher cannot tell "no feedback warranted" from "feedback failed". |
| **Stale content?** | Normally no: the sidebar is cleared at send (`Chat.jsx:61`) and replaced or cleared per result (`221-228`). **But** the input re-enables immediately (`Chat.jsx:176`). If the teacher sends a second message before the first cycle resolves, the two cycles race and the sidebar shows whichever resolves last, which can be the analysis of the *earlier* message. |
| **State / DB** | `pckFeedback` state (sidebar). `feedbackHistory` (in-memory, last 5). `impact_analysis` goes into the student prompt and is not stored. Logged `turn.pckFeedback` is a *reformatted subset*: `feedback_message`, `feedback_type` (positive/negative/neutral mapped from `pedagogical_quality`), `skills_assessment`, `detected_skills`, `missed_opportunities`, `timestamp`. It is logged **only when displayed** (`Chat.jsx:221-228`, `conversationLogger.js:166-173`). **`should_provide_feedback`, `pedagogical_quality`, `predicted_student_state` and non-displayed analyses are never persisted.** |
| **UI** | `PCKFeedbackSidebar`: one row per `skills_assessment` entry with `is_relevant`. The text is `evidence` if `score>0`, else `what_could_be_better`. So a **score-1 row shows only the positive evidence and drops the improvement suggestion**. A missing or invalid score renders as score 0. **`feedback_message_hebrew` (the model's composed message) is not displayed at all.** It is only stored and fed back as context. If `skills_assessment` is empty, the sidebar falls back to `detected_skills` (rendered as score 2) and `missed_opportunities` (score 0). |

---

## 3. Summary feedback: `POST /api/pck-summary`

| stage | detail |
|---|---|
| **Trigger** | After "סיים שיחה", the button "קבל ניתוח PCK" (`Chat.jsx:317-351`; cached per tab). It can also be (re)generated from `ConversationLogs.jsx:166-185` (which saves to **localStorage only**) and `AdminConversationLogs.jsx:117-133` (which **does not save**). |
| **Input** | `conversationLog = ConversationLog.toJSON()`, i.e. the logged turns only. Turns that failed or got no student reply are absent. Images are included in the payload but unused. |
| **Prompt source** | `server.js:973-1087`. It contains the scenario context; the transcript as `Teacher:` / `<name>:` per logged turn; a "PCK Moments Identified in Real-Time" block; stats; a skills reference; length rules keyed to the number of moments (0-2 → 2-3 sentences; 3-5 → a paragraph; 6+ → 2 paragraphs); and rules ("use the real-time moments as primary evidence", "do not contradict the scores already given"). |
| **Critical defect** | The moments are selected with `turn.pckFeedback && turn.pckFeedback.should_provide_feedback` (`server.js:934-941`). **The logger never writes `should_provide_feedback`** (`conversationLogger.js:166-173`). Confirmed: no commit ever wrote it (`git log -S`), and all 852 logged `pckFeedback` objects in the export lack it. So `pckMoments` is **always empty**. Every summary prompt says *"No significant PCK moments were identified (likely a very short conversation or test)."* and falls in the "0-2 moments → 2-3 sentences" length band, while also being told not to contradict real-time scores **it never sees**. |
| **Model call** | `{maxOutputTokens:2048, temperature:0.7, topP:0.95}`. Free text. |
| **Parsing** | None. `parts[0].text.trim()`. No `finishReason` check, so a summary truncated at 2,048 tokens is returned as if complete. |
| **Failure behaviour** | 500 → `alert("שגיאה בקבלת הניתוח: …")`, modal closed. The user can retry because nothing was cached. |
| **State / DB** | `summaryFeedback` string → `addSummaryFeedback` → localStorage + Firestore (`summaryFeedback`). The raw string is stored, which here is the only "raw" LLM output that gets persisted. |
| **UI** | `PCKSummaryModal.jsx:96-111` does regex Markdown→HTML via `dangerouslySetInnerHTML`. The `# ` rule runs first and also matches inside `## ` and `### `, so sub-headings render as a stray `#` plus an `<h1>`. This is an XSS surface if output ever contains HTML. `exportConversationExcel.js` separately parses the Markdown into sections. |

---

## 4. Legacy completion: `POST /api/completion`

- **Trigger:** only `Constants.MODEL_VERSION === 3` (`ai.js:31-32`). Currently unreachable.
- **Pipeline:** prose prompt + `history.toString()` → free text, `max_tokens 256`, stop `"Teacher: "`.
- **Parsing:** it passes the text to `convertResponseToMessages`, which expects JSON. So any use would land in the fixed fallback.
- **Failure:** `"... I don't understand?"` with an empty agent.
- **Recommendation:** treat it as dead code. It is not an invariant.

## 5. `GET /api/test`

A health smoke call ("Say hello…", 50 tokens). Not used by the UI.

---

## 6. Cross-pipeline summary table

| | student (`/generate`) | PCK (`/pck-feedback`) | summary (`/pck-summary`) |
|---|---|---|---|
| JSON mode / schema | yes / yes (`responses` only) | **no / no** | n/a (free text) |
| temperature | 0.7 | 0.7 (research used 0.1) | 0.7 |
| max output tokens | 512 | 2000 | 2048 |
| history truncation | none | none | none (logged turns only) |
| retries on bad output | none | none | none |
| `finishReason` checked | no | no | no |
| parse failure → | fixed fallback text (persisted as real) | 500 → no feedback, silent | n/a |
| transport failure → | silent no-reply, turn not logged | silent no feedback | alert |
| raw output stored | no (console only) | no | yes (it *is* the output) |
| coercions logged | no | no | n/a |
| prompt/version stored | `systemVersion` only | `systemVersion` only | `systemVersion` only |

## 7. Context management

- **Nothing is truncated or summarised.** The student call re-sends the full student system prompt (on the order of 20-30k characters. This is a rough estimate from source size: the builder spans about 27 KB of source and constants about 5.7 KB, and Hebrew is 2 bytes per character) together with all history and all images on every turn. The PCK call re-sends the full rubric plus the full history every turn.
- Gemini Flash-Lite's context window is not at risk at the observed lengths (max 44 turns). The Express body limit is 10 MB (`server.js:26`). Uncompressed canvas PNGs from many drawings accumulate in both `/generate` and `/pck-feedback` request bodies. Exceeding the limit would surface as a silent no-reply (§1a). That is plausible only in drawing-heavy conversations and is not observed.
- B200 found context length did *not* drive feedback errors once turn position was controlled. Nothing in this repo measures context effects on the *student* agent.

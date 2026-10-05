# Regression safety net

Status as of 2026-10-05 on `feature/post-pilot-improvements`: a **baseline suite is implemented**
(§0, §0.5). §1-§8 below are the original proposal; what in them is still open is listed in §0.6.

## 0. Implemented baseline (2026-10-05)

### 0.1 How to run

| command | what |
|---|---|
| `npm test` | frontend suite (Jest 23 bundled with react-scripts, jsdom, `jest.config.js`) |
| `npm run test:server` | backend suite (`node:test`, Node 18, `server/package.json` → `test`) |
| `npm run test:all` | both. **Run after every change.** |

Both suites are fully offline:
- No Gemini, OpenAI, Firestore or auth calls.
- No `.env` loading.
- No participant data. All fixtures are synthetic. The legacy fixture mirrors only the *shape* of v1.0 records.

`TEST_VERBOSE=1` restores the application's console output.

### 0.2 Infrastructure (test-only files)

| file | purpose |
|---|---|
| `jest.config.js`, `test-config/babelTransform.js` | Mirrors react-scripts' Jest config. Adds `@babel/plugin-transform-block-scoping` (lowers `let`/`const` to `var`, **as the production bundle does**). Needed because of the latent TDZ defect in §0.5. `react-scripts test` is therefore **not** the test command: it fails on `Chat.jsx` for that reason. |
| `src/setupTests.js` | `IS_REACT_ACT_ENVIRONMENT`; silences `console.log/info/warn/debug` but keeps `console.error`; `Element.scrollTo` shim for jsdom 11 |
| `src/testUtils/dom.js` | React 18 `createRoot` + `act` helpers (no testing-library dependency) |
| `src/testUtils/contracts/pckSkillsContract.json` | **Canonical** skill ids ↔ p1-p5 ↔ Hebrew names, scores 0/1/2, score labels. Shared by both suites. |
| `src/testUtils/conversationContract.js` | `validateConversationDoc()`: required-structure validator for `conversations/{sessionId}` (A1-A13). Extra fields are allowed (additive changes only). |
| `src/testUtils/conversationFixtures.js` | Synthetic current-format and legacy-format conversation docs |
| `server/test-support/register.mjs`, `loader.mjs` | ESM loader hooks (`node --import`) that replace `@google-cloud/vertexai`, `google-auth-library` and `./services/firebaseAdmin.js` with fakes. The firebaseAdmin fake derives its exports from `server.js`'s import list. |
| `server/test-support/fakes/*.mjs` | Fake Vertex model (`fakeModel.respond`, `fakeModel.calls`) and fake GoogleAuth |
| `server/test-support/startServer.mjs` | Boots the **real, unmodified `server.js`** on an ephemeral port (captures the `http.Server` by wrapping `listen`) |

`package.json` gained only scripts (`test`, `test:server`, `test:all`). No dependencies were added.

### 0.3 Tests implemented (84 total: 61 frontend, 23 backend)

| file | tests | protects |
|---|---:|---|
| `src/__tests__/conversationContract.test.js` | 14 | A1, A2, A5, A12, A13. The validator accepts current and legacy docs and additive fields, and rejects 9 kinds of contract breaks. The Excel export reads both formats (turns, Hebrew skill names, score labels, summary sections, legacy free-text skill ids). Which skills the export includes is not asserted. |
| `src/__tests__/conversationLogger.test.js` | 11 | A1-A3, A4 (DECIDED), A6, A7, A10 (DECIDED), A11, A12, A14 (DECIDED), B5 (DECIDED: cast recorded). sessionId format; lazy init; `studentRefs` = `v<ver>_<id>` for the cast; systemVersion stamp; minimal user snapshot `{fullName, role}`; scenario snapshot fields; contract-valid doc after each turn; `turnNumber` 1..n; one-time init; turn field mapping; null feedback input stored as null; image stored without prefix; >600 px downscaled to 600; endTime and summary persisted. |
| `src/__tests__/chatTurnOrchestration.test.js` | 10 | B1 (PCK before students; students wait for the PCK result; analysis passed as `impact_analysis`); B7 (no-feedback decision → no feedback content shown); A4 DECIDED (not displayed → logged as `pckFeedback: null`); A2 (displayed feedback logged with its fields); B9 (sidebar cleared on new send); B5 DECIDED (cast of 3 distinct personas, identical in the logger and in every student call, one logger per session); A6 (`SYSTEM_VERSION` to the logger); B20 (briefing before first message); students see prior replies; drawing attached and logged only when opted in. Renders the real `Chat.jsx` with mocked services, auth, logger and DrawingBoard. |
| `src/__tests__/studentAgent.test.js` | 8 | B3 / B4 inputs. One system prompt + history in order; personas, topic and Hebrew requirement in the prompt; PCK impact block present iff provided (B1); `{student, message}` → assistant `ChatMessage`s in order, trimmed; no fabricated messages on backend failure; `ChatMessage.toAIformat` text and image forms. |
| `src/__tests__/pckSkillsDisplay.test.js` | 11 | A5, B11. The duplicated skill-name maps (sidebar, Excel export, ConversationLogs, AdminConversationLogs, server prompt) equal the contract; score labels; the sidebar shows nothing without feedback (exact placeholder text not asserted, B10), legend, per-score text, irrelevant skills hidden, and legacy fallback. |
| `src/__tests__/configContracts.test.js` | 7 | A6 (semver + the DECIDED process rule: a changelog entry in `version.js` for the current version), A7 (persona id/version/uniqueness), A15 DECIDED (`participation.baseline ∈ {low, medium, high}`), B5 (≥3 personas, NUM_STUDENTS ≥ 3), A8 (unique non-empty scenario titles; title stability A9 not asserted; snapshotted fields present), B20 (all teacher-initiated). |
| `server/test/pck_skills.test.mjs` | 7 | A5. Exactly the 5 contract ids as a set (order not protected); Hebrew names; 0/1/2 bands only; unknown id → null; prompt formatter covers all ids and bands; history format `מורה:` / `<name>:`; empty-history marker. |
| `server/test/api_generate.test.mjs` | 7 | B3. Model text returned verbatim as `{success, text}`; JSON mode + `responses[{student, message}]` schema requested; system and teacher text reach the model; user/model roles; a teacher drawing is forwarded as inline PNG; 400 on bad input; model failure is never a successful reply. |
| `server/test/api_pck_feedback.test.mjs` | 6 | A5, B7. A valid analysis passes through intact (skills, scores, decision, student-impact hints); a ```json fence is parsed; a no-feedback decision stays no-feedback with an empty message; the prompt contains the teacher message, scenario context, **named** history and all skill ids; the prompt contains Gate 0 exclusions; 400 on bad input. |
| `server/test/api_pck_summary.test.mjs` | 3 | A12. `{success, summary (trimmed string), analyzed_turns, session_id}`; the prompt contains every logged teacher message and named student reply plus scenario context; 400 without turns. |

### 0.4 Deliberately not protected

Each test file's header lists what it intentionally does **not** assert. In short:
- No test preserves any §C behaviour of `invariants.md`: C1 summary moments, C2/C3 input lock and races, C4 empty sends, C5 newline stripping, C6 fallback text, C7 silent failures, C8 dropped names, C9 `thinking` vs schema, C10 PCK parse/default behaviour, C12 hard-coded tiers.
- Nothing preserves B12 (hidden score-1 suggestion).
- Nothing asserts the B8 row cap.
- **Invariants alignment pass (2026-10-05):** the baseline protects only PROTECT / DECIDED items. The following REVIEW items are deliberately untested:
  - B2: students after a PCK failure. Needs a product decision when failure handling (C7) is addressed.
  - B5 selection mechanism: only "3 distinct personas, fixed and recorded" is asserted.
  - B6: silence.
  - B10: exact placeholder text.
  - B13: summary caching.
  - B15: opt-in reset, board persistence, auto-close.
  - B16: re-sending past images.
  - B19: feedback history.
  - A9: title stability.
- **Second alignment pass (2026-10-05):**
  - A4, the A6 changelog rule, A14 (minimal `userSnapshot`) and A15 (persona baseline tiers) are now DECIDED and their tests are kept.
  - Removed:
    - the student-parser "malformed entries are silently skipped" assertion (may become validation/retry);
    - the Excel "irrelevant skills omitted" assertion;
    - the skill-id *ordering* requirement.
  - Add a test for malformed-entry handling together with the C6 / validation fix.

Gate 0 (B7) can only be tested deterministically at two levels:
- the rules are present in the prompt;
- a no-feedback decision is honoured end to end.

Whether the live model *follows* Gate 0 belongs in the behavioural suite (§5). The prompt-text assertions in `api_pck_feedback.test.mjs` are marked for deliberate update if the rubric is redesigned.

### 0.5 Known latent defects found while building the suite (not fixed)

- **TDZ in `Chat.jsx`:** the logger `useEffect` (line ~54) lists `students` in its dependency array before `const students` is declared (line 56). It works in production only because the production bundle compiles `const` to `var` (verified in `build/static/js/main.*.chunk.js`: `[S,le,o,c]);var le=…`). Any build that keeps native `const` (Node-targeted tests, the development browserslist `last 1 chrome version`, a future toolchain upgrade) throws `ReferenceError: Cannot access 'students' before initialization` on first render.
  - **Fix:** move the `students` declaration above the effect.
  - **Then:** remove the block-scoping plugin from `test-config/babelTransform.js` (the orchestration tests act as its regression test).
- jsdom 11 lacks `scrollTo`. This is shimmed in tests and is not a product issue.

### 0.6 What remains from the original plan

- §2 Step 0 (golden prompt snapshots plus behaviour-preserving extraction of `server.js` / `ai.js` helpers). Today the server is tested through its HTTP surface, and `makeProsePrompt` / `convertResponseToMessages` only through `callAI`.
- §3.2 malformed-output fixtures for the PCK parser (written together with fix 0.5; see the table below).
- §3.3 summary moment extraction (with the C1 fix).
- §3.4 concurrent `addTurn` (with the C2/C3 fix).
- §4 payload-limit and retry tests; client `fetchWithRetry` tests.
- §5 behavioural / golden agent tests (real model, on demand).
- §6 automated e2e (Firestore emulator + Playwright).
- §7 CI wiring: there is no CI yet; `npm run test:all` is the local gate. Also the `SYSTEM_VERSION`-bump check on prompt diffs.

### 0.7 Tests to add together with each upcoming fix

| fix (audit id) | add / change these tests |
|---|---|
| **C1 summary never sees real-time moments** | `api_pck_summary`: a log containing a logged `pckFeedback` (as produced by `ConversationLog.addTurn`, i.e. without `should_provide_feedback`) → the prompt contains the moment's skill name, score label and evidence; a log with only `null` feedback → no moments. Logger: if a display flag is added, assert it in `conversationLogger.test.js` and in the contract (additive). |
| **C2/C3 input re-enabled during generation; races** | `chatTurnOrchestration`: textarea and send button disabled and the typing indicator visible from send until students are appended; re-enabled after success **and** after each failure path (PCK reject, student reject, empty reply); a second submit during a pending turn does not call `getPCKFeedback` again; feedback from turn N never appears after turn N+1 was sent; `addTurn` order equals send order. Add a timeout test if a timeout is introduced. |
| **C4 empty sends** | `chatTurnOrchestration`: submitting `""` / whitespace → no `getPCKFeedback`, no `callAI`, no history entry. Image-only (per the product decision): allowed or blocked explicitly. |
| **C5 multiline teacher messages** | `studentAgent` / `ChatMessage`: teacher text keeps `\n` (and student text per decision); `ChatBubble` renders with `white-space: pre-wrap`; `formatConversationHistory` and the summary transcript keep line breaks; logger stores `\n`; Excel export and annotation viewers render it. |
| **C6 fixed fallback text** | `studentAgent`: invalid JSON / truncated JSON / missing `responses` → no message with fallback text; at most one re-ask (if implemented); a visible error flag; nothing persisted as a student turn. |
| **B2 PCK failure behaviour (open product decision)** | `chatTurnOrchestration`: PCK reject → the decided behaviour (students unsteered / retry / blocked turn), plus a visible failure state and a failure log entry. |
| **B10 empty / waiting / failure sidebar states** | `pckSkillsDisplay` / `chatTurnOrchestration`: each state has its own distinct, decided text. |
| **C7 silent failures; failed turns unlogged** | `chatTurnOrchestration`: student or PCK failure → visible error state; failed attempt stored **separately** (A3 decision: `turnNumber` unchanged); `conversationContract`: failed-attempt structure is additive and the `turns[]` numbering is unaffected. |
| **C8 speaker names dropped from student history** | `api_generate`: prior student turns reach the model with speaker attribution (per the chosen format); the parser strips any name prefix the model echoes back. Behavioural replay (§5.1) for repetition. |
| **C9 `thinking` required by prompt but excluded by schema** | `api_generate`: schema and prompt agree (either `thinking` is in the schema with a raised `maxOutputTokens`, or the prompt no longer asks for it). |
| **C10 PCK JSON mode / parser / validation (fix 0.5)** | `api_pck_feedback`: `generationConfig.responseMimeType === 'application/json'` (+ schema); malformed fixtures from B200 (unescaped `"` in Hebrew, trailing comma, `feedback_text` as an object, truncated, leading prose) → the defined safe result (never a 500 that silently drops feedback); coercions recorded; decision == any(relevant); scores ∈ {0,1,2}; known skill ids. |
| **B8 cap on displayed skills** | sidebar / server: at most N rows for an input with 5 relevant skills; selection rule per spec. |
| **B12 score-1 shows evidence and suggestion** | `pckSkillsDisplay`: score-1 row shows both `evidence` and `what_could_be_better` (the format per spec); the Excel export likewise if changed. |
| **C11/C12 prompt contradictions, hard-coded tiers** | Prompt snapshot (after §2); persona tiers in the prompt derived from `participation.baseline` (`studentAgent`: every cast member's baseline appears; no persona outside the cast is named). |
| **C13 summary modal rendering** | Render `PCKSummaryModal` with `#`/`##`/`###`/bold → correct elements, no stray `#`; `<script>` in the summary is not executed or injected. |
| **C14 summary regenerated from logs pages not saved** | Logs pages: regenerate → Firestore save mocked and called with `summaryFeedback`. |
| **Diagnostics persistence (0.4)** | `conversationContract`: new diagnostic fields or subcollection are additive; raw output, parse status, `finishReason` stored per call; doc-size guard (images and raw outputs not inline beyond the limit). |
| **B5 cast recorded reliably** | `conversationLogger`: the cast is recorded at session start (not only on the first logged turn) if that is changed; the cast is identical across all turns of a session. |
| **Completed-scenario indication** | `ScenarioSelector`: completed badge per the definition; matching by scenario id (and the text→id map for old records). |
| **TDZ in Chat.jsx (§0.5)** | Remove the block-scoping plugin; the existing orchestration tests must still pass under native `const`. |
| **Any prompt / model / config change** | Bump `SYSTEM_VERSION` + changelog entry (enforced by `configContracts`); behavioural replay (§5). |

## Original proposal (kept for reference; see §0.6 for what is still open)

## 1. Starting state (before the baseline)

- **No application tests existed.** There were no `*.test.*` or `*.spec.*` files outside `node_modules` and `research/`. `package.json` had no `test` script, and the server had no test runner.
- **Tooling available:**
  - Node **18.20.8** (built-in `node:test` + `assert`, enough for server-side pure-function tests with no new dependencies);
  - `react-scripts` **2.1.8** with its bundled Jest 23 (old; works with React 18.3 in practice, see §0);
  - no Playwright or Cypress.
- **Only test-like assets:** `TESTING_GUIDE.md` (manual scenarios) and `research/pck_feedback/tests` (Python, research parser only; not run against production).
- **Testability blockers (still present):**
  - `server/server.js` creates the Vertex client and calls `app.listen` at import time, and does not export `app` or its helpers. The baseline works around this with loader hooks.
  - The prompt builders and parsers in `src/utils/ai.js` (`makeProsePrompt`, `convertResponseToMessages`) are not exported.
  - Removing these blockers needs a **behaviour-preserving extraction** step (§2).

## 2. Step 0: make the code testable without changing behaviour

1. **Capture golden snapshots before touching anything.** Write a throwaway harness that imports *copies* of the current functions, or run them via a temporary export. Render, for 5-10 fixed inputs (scenario × history × impact_analysis × feedbackHistory):
   - the student system prompt (`makeProsePrompt`);
   - the student `contents` (`convertMessagesToGenAI`);
   - the PCK prompt;
   - the summary prompt.

   Store them as text fixtures.
2. **Extract** the pure functions into modules such as `server/lib/prompts.js`, `server/lib/parse.js`, `server/lib/genai_convert.js`, and export `app` from a module separate from `listen`. Then assert byte-identical output against step 1.
3. Inject the model (`generateContent`) so tests can stub it.

This step is safe to give to Claude Code **only together with the snapshot tests**. Acceptance is "all golden prompt snapshots identical".

## 3. High-value unit tests (fast, deterministic)

### 3.1 Student pipeline
| test | asserts |
|---|---|
| `convertMessagesToGenAI` | system text prepended to the first user message only; assistant → `model`; image messages yield `[text, inline_data]`; empty teacher text with an image drops the text part (current behaviour, characterised); initial trigger message when history is empty |
| `convertResponseToMessages` valid | N responses → N `ChatMessage`s with `role:'assistant'`, trimmed text, names title-cased |
| `convertResponseToMessages` malformed | invalid JSON, truncated JSON (`{"responses":[{"student":"נועה","message":"אני`), missing `responses`, `responses:{}`, entries missing fields, `responses:[]`, unknown student name, duplicate names, code fences, `"Teacher:"`-truncated JSON. **Characterise today's behaviour** (fallback string, skip, empty). The fix PRs then change the expectations explicitly. |
| `makeProsePrompt` | includes every present student's description; includes the impact_analysis block iff provided; with < 3 students it throws today (characterise); snapshot |
| `ChatMessage` | newline handling (today: stripped; after the multiline fix: preserved); `toAIformat` with and without an image |
| Duplicate detector (when built) | same-student exact repeat, cross-student repeat, intra-turn duplicate, whitespace/punctuation-normalised repeat |

### 3.2 PCK feedback pipeline
| test | asserts |
|---|---|
| Fence stripping + parse | ```` ```json ```` fenced, ```` ``` ```` fenced, unfenced, leading prose + JSON, trailing comma, unescaped `"` inside Hebrew (B200 §1, §2), `feedback_text`/`evidence` as an object (B200 §5), truncated output |
| Default filling | each missing top-level field gets its documented default; placeholder message when `should_provide_feedback && !feedback_message_hebrew`; message forced to `''` when false |
| Validation (once added) | decision == any(relevant); score ∈ {0,1,2}; known skill ids; ≤ cap relevant; coercions recorded |
| Prompt builder | feedback-history block present iff history is non-empty; scenario context; snapshot |
| `formatConversationHistory` | `מורה:` / `<name>:` lines; empty-history text |

### 3.3 Summary pipeline
| test | asserts |
|---|---|
| Moment extraction | **Regression test for bug C1:** a log built by the real `ConversationLog.addTurn` with displayed feedback must yield ≥1 moment. This fails today, and should be written first and marked expected-fail until fixed. |
| Length band | 0-2 / 3-5 / 6+ moments select the right instructions |
| `PCKSummaryModal` rendering | `##` / `###` headings, bold, no script injection |

### 3.4 Logger / persistence (mock `firestoreService`)
| test | asserts |
|---|---|
| `ConversationLog.addTurn` | first call initialises once; `turnNumber` sequential; `pckFeedback` shape (A4 fields); image compressed (mock canvas) and stored without prefix; stats incremented |
| Concurrent `addTurn` | two overlapping calls → no duplicate init, deterministic numbering (characterise the current race, then fix) |
| `endSession` / `addSummaryFeedback` | save only if initialised; `summaryFeedback` persisted |
| Schema contract | a **JSON-schema fixture of the conversation document** (A1-A13) validated against a produced log. This is the gate for every persistence change. |
| Backward compatibility | the viewers' and exporter's input functions accept old-format docs (fixtures from the exported data with names stripped) |

## 4. Integration tests (stubbed model, real Express app)

Use `node:test` + `fetch` against `app` on an ephemeral port with an injected fake `generateContent`.

| test | asserts |
|---|---|
| `/api/generate` happy path | config contains `responseMimeType` + `responseSchema`; the response is `{success, text}` |
| `/api/generate` model errors | no candidates; empty parts; `finishReason: SAFETY`/`MAX_TOKENS`; 429 then success (retry); 500 (no retry) → status codes and bodies |
| `/api/pck-feedback` | valid, fenced, malformed, partial JSON → status and filled analysis |
| `/api/pck-summary` | 400 without turns; the prompt passed to the model contains the real-time moments (after the C1 fix) |
| Payload limits | body near and over 10 MB → 413 handling (characterise) |
| Client `genai.js` | `fetchWithRetry` retries 429/503 only; error propagation shape |

**Frontend turn-loop integration** (React Testing Library, stub `genai`):
- one send → PCK called before students; the sidebar shows feedback iff `should_provide_feedback`; student bubbles appended; `addTurn` called once with the right args;
- **input disabled until the turn completes** (fails today, C2);
- empty send blocked (fails today, C4);
- PCK failure → students still generated, an error state visible (after the fix);
- student failure → visible error, turn recorded per the new policy;
- drawing included → the `ChatMessage` has an image, the board closes, the checkbox resets, the logger receives the image.

Given CRA 2 + React 18, it may be cheaper to run these with a separately installed Jest/Vitest config than with `react-scripts test`. Decide in Step 0.

## 5. Behavioural / golden tests for the agents (real model, not per-commit)

These cost money and are non-deterministic. Run them on demand and before releases, and compare distributions, not strings.

1. **Replay set.** Take ~20 exported conversations, stratified by scenario and length, including the 59 repeat-turn contexts. Re-generate the student turn for selected prefixes with the production prompt.
   - Metrics: exact or near-duplicate rate vs the previous same-student message; empty-response rate; parse-failure and fallback rate; unknown-name rate; message length.
   - **This is the acceptance test for the repetition fixes.** Baseline from the data: ~5.4% exact repeats overall; 39% after empty teacher messages.
2. **Consistency probes.** Scripted teacher sequences per scenario (resolve the misconception → small talk → re-probe). Label whether a "resolved" student regresses; label premature correct answers on turn 1-2. A small human or LLM-judge rubric, run several samples each.
3. **PCK feedback offline eval.** Use the B200 gold (`research/pck_feedback/data/training/sft/.../fold*/eval_turns.jsonl`, **p1/p4 only**; the 71-turn 5-dim set for p2/p3/p5 with low confidence) and B200 semantics (`scripts/evaluate_p1_p4_reduced_v1.py`) on the **production prompt**.
   - Metrics: decision F1, per-skill relevance P/R, score agreement, number of skills per turn, parse/validation failure rate, text length.
   - Required before any PCK prompt, model or temperature change.
4. **Summary vs real-time consistency.** For replayed conversations, check that the summary does not contradict the real-time skill scores (LLM-judge or manual), before and after the C1 fix.
5. **Drawing smoke.** A fixed set of board images (counterexample kite, rhombus diagonals) → students reference the drawing; after any change to PCK visibility, the feedback mentions it appropriately.

Store prompts, raw outputs and metrics for every behavioural run. That is the same logging production lacks (0.4).

## 6. End-to-end (manual now, automated later)

`TESTING_GUIDE.md` scenarios, plus:
- full session → finish → summary → Firestore doc validates against the schema fixture;
- open the conversation in `ConvAnnotationEditor`, `ResearchConversations` and the Excel export;
- run the research `extract_images.py` on it.

Automate with Playwright against a Firestore emulator and a stubbed backend once the unit/integration layers exist.

## 7. What runs after every Claude Code change

**Always (target < 1 min, no network, no model):**
1. Golden prompt snapshots for the student, PCK and summary prompts, plus `convertMessagesToGenAI` (any diff must be intentional and reviewed).
2. Parser suites for student, PCK and summary, including all malformed-output fixtures.
3. Logger and conversation-document schema contract, plus backward-compatibility fixtures.
4. Backend integration tests with the stubbed model.
5. Frontend turn-loop integration tests.
6. `npm run build` (catches import and JSX breakage).

**Additionally, when prompts, agent logic or model config change:**
- the replay set (§5.1) and, for feedback changes, the offline PCK eval (§5.3);
- a `SYSTEM_VERSION` bump check (a CI assertion that any diff under prompt files also touches `version.js`).

**Additionally, when the persistence schema or the drawing flow changes:**
- the end-to-end flow (§6) through the annotation views and the research image extractor.

## 8. Suggested order of work

1. Step 0: golden snapshots, then behaviour-preserving extraction (Claude Code: OK with snapshots as acceptance).
2. Characterisation tests for parsers, logger and schema (record today's behaviour, including defects, as explicit expectations).
3. Expected-fail tests for C1, C2 and C4, then fix them one by one.
4. Diagnostics persistence (0.4), which enables the behavioural metrics.
5. Behavioural replay baseline on the current version, **before** any agent change.

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
| `jest.config.js` | Mirrors react-scripts' Jest config and uses react-scripts' own Babel transform (`react-scripts/config/jest/babelTransform.js`, native `let`/`const` in tests). A separate config rather than `react-scripts test`, so `.env` is not loaded. `react-scripts test` also passes since the TDZ fix (§0.5). |
| `src/setupTests.js` | `IS_REACT_ACT_ENVIRONMENT`; silences `console.log/info/warn/debug` but keeps `console.error`; `Element.scrollTo` shim for jsdom 11 |
| `src/testUtils/dom.js` | React 18 `createRoot` + `act` helpers (no testing-library dependency) |
| `src/testUtils/contracts/pckSkillsContract.json` | **Canonical** skill ids ↔ p1-p5 ↔ Hebrew names, scores 0/1/2, score labels. Shared by both suites. |
| `src/testUtils/conversationContract.js` | `validateConversationDoc()`: required-structure validator for `conversations/{sessionId}` (A1-A13). Extra fields are allowed (additive changes only). |
| `src/testUtils/conversationFixtures.js` | Synthetic current-format and legacy-format conversation docs |
| `server/test-support/register.mjs`, `loader.mjs` | ESM loader hooks (`node --import`) that replace `@google-cloud/vertexai`, `google-auth-library` and `./services/firebaseAdmin.js` with fakes. The firebaseAdmin fake derives its exports from `server.js`'s import list. |
| `server/test-support/fakes/*.mjs` | Fake Vertex model (`fakeModel.respond`, `fakeModel.calls`) and fake GoogleAuth |
| `server/test-support/startServer.mjs` | Boots the **real, unmodified `server.js`** on an ephemeral port (captures the `http.Server` by wrapping `listen`) |

`package.json` gained only scripts (`test`, `test:server`, `test:all`). No dependencies were added.

### 0.3 Tests implemented (326 total: 177 frontend, 149 backend)

| file | tests | protects |
|---|---:|---|
| `src/__tests__/conversationContract.test.js` | 24 | A1, A2, A5, A12, A13. The validator accepts current and legacy docs and additive fields, and rejects 9 kinds of contract breaks. The Excel export reads both formats (turns, Hebrew skill names, score labels, summary sections, legacy free-text skill ids). Which skills the export includes is not asserted.; optional additive `failedAttempts` validated (A16): accepted when well-formed, rejected with a turnNumber / unknown agent / unknown stage / non-array.; turn `telemetry` (A17) accepted when well-formed or absent, rejected with an unknown status / non-whitelisted key / unknown agent key / negative latency. |
| `src/__tests__/conversationLogger.test.js` | 20 | A1-A3, A4 (DECIDED), A6, A7, A10 (DECIDED), A11, A12, A14 (DECIDED), B5 (DECIDED: cast recorded). sessionId format; lazy init; `studentRefs` = `v<ver>_<id>` for the cast; systemVersion stamp; minimal user snapshot `{fullName, role}`; scenario snapshot fields; contract-valid doc after each turn; `turnNumber` 1..n; one-time init; turn field mapping; null feedback input stored as null; image stored without prefix; >600 px downscaled to 600; endTime and summary persisted.; displayed feedback is stored in the shape the summary consumes (shared fixture `loggedTurnWithFeedback.json`), without `should_provide_feedback` (A4, C1).; **C7 failed attempts (5 tests)**: kept out of `turns[]`, turn numbering unaffected, `precedingTurnNumber` / `attemptNumber` / `sessionId` set, saved immediately once the doc exists, held until the first logged turn (A11), bounded to 50, empty list on new docs.; **telemetry (3 tests)**: stored with the right turn; sanitised to the whitelist; `telemetry: null` without it. |
| `src/__tests__/chatTurnOrchestration.test.js` | 53 | B1 (PCK before students; students wait for the PCK result; analysis passed as `impact_analysis`); B7 (no-feedback decision → no feedback content shown); A4 DECIDED (not displayed → logged as `pckFeedback: null`); A2 (displayed feedback logged with its fields); B9 (sidebar cleared on new send); B5 DECIDED (cast of 3 distinct personas, identical in the logger and in every student call, one logger per session); A6 (`SYSTEM_VERSION` to the logger); B20 (briefing before first message); students see prior replies; drawing attached and logged only when opted in. Renders the real `Chat.jsx` with mocked services, auth, logger and DrawingBoard.; **C2/C3 turn lock (10 tests)**: input, send and typing indicator locked from submit until the turn finishes; "סיים שיחה" disabled and ignored during a turn, available again afterwards, and executed only after queued turn log entries are written (repeat clicks ignored); **C4 empty messages (7 tests)**: empty, spaces-only, tabs+spaces and line-breaks-only submits with no drawing (and with the opt-in ticked but an empty board) start nothing (no history entry, PCK call, student call, log entry or lock); a normal message after an ignored empty one works; non-empty text is passed through unchanged; **B22 (DECIDED)**: an image-only submit (opt-in plus a real drawing, empty text) starts a turn, reaches the student agent with the drawing attached, and is logged with the drawing; extra submits ignored (no extra PCK or student call, nothing logged); unlock after success, PCK failure, empty-reply student failure, and thrown/rejected student generation; feedback and log entries stay with their own turn and are written in send order even when logging is slow.; **C7 phase 1 (6 tests)**: PCK failure → sidebar notice, failure recorded (`stage: parse` for the server's JSON-parse error), lock released, any logged turn carries null feedback, and the session keeps working (what follows a PCK failure is **not** asserted: B2 REVIEW); student request failure → banner, no turn logged, recorded with `pckFeedbackDisplayed`; student parse failure → no fallback/fake reply persisted, raw excerpt recorded; the PCK and student notices each contain no technical details; a later successful turn clears both notices, works normally, and the log queue order is turn 1 → failures → turn 2.; **B22 / E1 PCK handling by turn type (6 tests)**: image-only turns (empty or whitespace text plus a drawing) skip the PCK call with no notice and no `failedAttempts` entry, students get the drawing unsteered, the turn is logged with the drawing and `pckFeedback: null`, and the lock behaves normally; text-only turns call PCK exactly as before; text + drawing turns call PCK with the text and send the drawing to the students; C4 still blocks empty submissions without a drawing.; **telemetry (6 tests)**: PCK + student telemetry logged with the turn; telemetry stays with the correct turn; image-only → PCK `skipped` / `image_only`, no failure; PCK failure → enriched failure record, and any logged turn marks PCK `failed` (B2-neutral); student failure → enriched failure record, no turn; no teacher/student text or drawing in telemetry.; **retry policy / B2 (5 tests)**: B2 DECIDED (students generated unsteered after a final PCK failure, turn logged with null feedback and `telemetry.pck.status = failed`, attempts 2); a call that succeeded on retry creates no `failedAttempts` and logs `attempts: 2`; a final student failure logs no turn and records attempts / latency; client hard timeouts on PCK or students release the lock and are recorded as `ClientTimeoutError`.; **C5 (2 tests)**: a multi-line teacher message reaches PCK (text and history), the student agent (text and AI format) and the log unchanged; the bubble shows it with `pre-wrap` inside the RTL column, and the student reply still renders. |
| `src/__tests__/studentAgent.test.js` | 21 | B3 / B4 inputs. One system prompt + history in order; personas, topic and Hebrew requirement in the prompt; PCK impact block present iff provided (B1); `{student, message}` → assistant `ChatMessage`s in order, trimmed; no fabricated messages on backend failure; `ChatMessage.toAIformat` text and image forms.; `callAI` returns a promise that settles after `onResponse` and rejects when the request cannot be built (the completion signal for the turn lock).; **C7**: request failure rejects with the tagged error and calls no `onResponse`; invalid JSON / missing `responses` reject as `stage: parse` with the raw output and **no fallback message**; `responses: []` is still a normal empty reply.; student telemetry passed to `onResponse` (4th argument); parse failures carry the call's telemetry.; a student `ChatMessage` keeps the client format `{role, content, name}` and its stored text has no prefix (C8 is server-side only).; **C9 (5 tests)**: no `INCLUDE the "thinking" field` / `MUST INCLUDE IN OUTPUT`; the decision checklist is kept (lesson phase, teacher's latest message, context, student knowledge, answered questions, who responds); the silent-checklist + "only the responses array" rule is present; the examples have no `thinking` object (labels and responses kept); the browser emits no `thinking` warning. |
| `src/__tests__/pckSkillsDisplay.test.js` | 12 | A5, B11. The duplicated skill-name maps (sidebar, Excel export, ConversationLogs, AdminConversationLogs, server prompt) equal the contract; score labels; the sidebar shows nothing without feedback (exact placeholder text not asserted, B10), legend, per-score text, irrelevant skills hidden, and legacy fallback.; failure notice (`errorMessage`, role=alert) replaces skills. |
| `src/__tests__/configContracts.test.js` | 7 | A6 (semver + the DECIDED process rule: a changelog entry in `version.js` for the current version), A7 (persona id/version/uniqueness), A15 DECIDED (`participation.baseline ∈ {low, medium, high}`), B5 (≥3 personas, NUM_STUDENTS ≥ 3), A8 (unique non-empty scenario titles; title stability A9 not asserted; snapshotted fields present), B20 (all teacher-initiated). |
| `src/__tests__/turnDiagnostics.test.js` | 12 | A16 / C7. `buildFailedAttempt`: PCK http (endpoint, status, timestamp); the server's PCK JSON-parse error → `parse`; network; student parse with bounded raw excerpt; untagged → `client`; no teacher text, image, stack or `undefined` values, and no `turnNumber`; missing inputs handled.; the C10 validation error is classified as `parse`.; failure records are enriched with model / latency / client latency / finish reason / attempts when available (no content), and are null otherwise.; the server's student output failure is classified `parse` with the server-reported raw length; a client timeout is a `network`-stage failure. |
| `src/__tests__/genaiErrors.test.js` | 16 | C7. `getPCKFeedback` / `generateWithGenAI` errors carry `stage` (`http` / `network`), `status`, `endpoint`, `serverError` (fetch mocked).; `onMeta` delivers server meta + client latency and is not sent to the server; errors carry `meta` + `clientLatencyMs`; still works without server meta.; **1.3.6 (7 tests)**: exactly one request on 429 / 503 / 500 (no client retry layer); a hung request rejects after the client timeout as `ClientTimeoutError`; an abort signal is passed; the server's student raw excerpt is carried; default client timeout 50 s. |
| `server/test/pck_skills.test.mjs` | 7 | A5. Exactly the 5 contract ids as a set (order not protected); Hebrew names; 0/1/2 bands only; unknown id → null; prompt formatter covers all ids and bands; history format `מורה:` / `<name>:`; empty-history marker. |
| `src/__tests__/callTelemetry.test.js` | 5 | A17. The whitelist builder: exact fields for ok / skipped; drops prompts, raw text, teacher text and images; bounds strings; rejects invalid numbers; `reason` only for skipped. |
| `server/test/llm_call_policy.test.mjs` | 17 | B24 (unit). Defaults 20 s / 2 / 45 s; client timeout > budget ≥ 2 × attempt + back-off; success first attempt; timeout → retry → success; 429 → retry; 5xx → retry; empty → retry; two failures → final failure with attempts / latency; 4xx and safety (finish reason or block reason) → one attempt; interpreter (parse / schema) rejection retried; never more than `maxAttempts` calls; the total budget cuts the second attempt; no second attempt under `minAttemptMs`; slow-but-successful not retried; the `classifyModelError` matrix; the student-output validator. |
| `server/test/api_retry_policy.test.mjs` | 18 | B24 / B2 (endpoints, short env policy). SDK per-attempt timeout on the per-turn model; PCK timeout / parse / schema / 429 → success on attempt 2; PCK two timeouts → `timeout` within budget; invalid twice → B23 shape; safety / 4xx → one attempt; 400 input → no model call; student malformed / schema / 5xx / empty → success on attempt 2; student malformed twice → `parse` with a bounded raw excerpt; silence valid on attempt 1; student safety → one attempt; no request exceeds 2 attempts for any failure mix. |
| `src/__tests__/messageLineBreaks.test.js` | 7 | C5. Teacher `ChatMessage` keeps line breaks and internal whitespace exactly (also in the multimodal format); the teacher bubble shows them with `white-space: pre-wrap`, as plain text (no `<br>`, markup-like text not interpreted); `ChatBubble` uses no `dangerouslySetInnerHTML`; student bubbles keep their label and text; a drawing still renders. |
| `server/test/pck_feedback_contract.test.mjs` | 34 | B23 / C10. The schema covers the production contract (required fields, skill-id enum = contract, integer score, nullable trigger); valid analyses parse and validate unchanged; a whole-output fence is accepted; optional per-skill text may be omitted or null; each of 30 B200-based malformed fixtures fails parsing or validation (`server/test-support/pckFixtures.mjs`). |
| `server/test/api_generate.test.mjs` | 21 | B3. Model text returned verbatim as `{success, text}`; JSON mode + `responses[{student, message}]` schema requested; system and teacher text reach the model; user/model roles; a teacher drawing is forwarded as inline PNG; 400 on bad input; model failure is never a successful reply.; **telemetry (5 tests)**: success meta (agent / model / latency / finish reason / attempts); attempts count the existing quota retries; blocked candidate → `SAFETY` in the failure meta; thrown error → timing + attempts; meta has no prompt or content. The verbatim-text test now allows the additive `meta`.; **C8 (7 tests)**: a past student reply reaches the model as `name: text`; several students across turns keep pairing and order (incl. the same student twice); teacher messages unchanged (no prefix; system prompt only on the first; multi-line kept); Hebrew and punctuation exact; image history unchanged; nameless / empty-name (legacy) messages unchanged; no metadata beyond the student name (contents keep only `role` / `parts`).; **C9 (2 tests)**: the schema is exactly `{responses: [{student, message}]}` with no reasoning field; temperature 0.7, `maxOutputTokens` 512, `topP` 1, model `gemini-2.5-flash-lite`, and no `thinkingConfig` anywhere. |
| `server/test/api_pck_feedback.test.mjs` | 43 | A5, B7. A valid analysis passes through intact (skills, scores, decision, student-impact hints); a ```json fence is parsed; a no-feedback decision stays no-feedback with an empty message; the prompt contains the teacher message, scenario context, **named** history and all skill ids; the prompt contains Gate 0 exclusions; 400 on bad input.; **C10 (34 tests)**: JSON mode + response schema requested (temperature / max tokens unchanged); a valid analysis passes through unchanged; `should_provide_feedback: true` with an empty message gets no placeholder; fixture sanity; each of 30 malformed outputs → `500`, `success: false`, no `analysis`, error prefixed `Failed to parse AI response`, the right `errorKind`, no placeholder.; **telemetry (3 tests)**: success meta; parse failure meta with `MAX_TOKENS`; thrown error meta. The pass-through test now allows the additive `meta`.; since 1.3.6 the malformed fixtures assert `attempts: 2`, and empty output is `errorKind: empty`. |
| `server/test/api_pck_summary.test.mjs` | 9 | A12. `{success, summary (trimmed string), analyzed_turns, session_id}`; the prompt contains every logged teacher message and named student reply plus scenario context; 400 without turns.; **C1 (6 tests)**: a logged `pckFeedback` without `should_provide_feedback` is a moment; the moment carries skill name/id, score label + number, evidence, suggestion and stored feedback text (no `undefined`, irrelevant skills omitted); `pckFeedback: null` turns are not moments; multiple moments in turn order; legacy feedback without `skills_assessment` is passed without invented scores; no displayed feedback keeps the no-moments path. |

### 0.4 Deliberately not protected

Each test file's header lists what it intentionally does **not** assert. In short:
- No test preserves any §C behaviour of `invariants.md`: C12 hard-coded tiers.
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

### 0.5 Latent defects found while building the suite

- **TDZ in `Chat.jsx`: FIXED (2026-10-05, `feature/post-pilot-improvements`).**
  - **Problem:** the logger `useEffect` listed `students` in its dependency array before `const students` was declared. The production bundle compiles `const` to `var` (verified in `build/static/js/main.*.chunk.js`: `[S,le,o,c]);var le=…`), and so does the development transform (checked with `babel-preset-react-app`, `BABEL_ENV=development`), so neither build ever failed. Any build that keeps native `const` (Node-targeted tests, a future toolchain or browserslist upgrade) threw `ReferenceError: Cannot access 'students' before initialization` on first render.
  - **Fix:** the `students` declaration was moved above the effect. No other code changed.
  - **Test workaround removed:** the `@babel/plugin-transform-block-scoping` workaround and `test-config/babelTransform.js` are deleted. `jest.config.js` now uses react-scripts' own transform, which keeps native `const`.
  - **Regression test:** `chatTurnOrchestration.test.js` renders `Chat.jsx` under native `const` and fails with the ReferenceError if the order regresses. Verified: all 61 frontend tests also pass under `react-scripts test`.
- jsdom 11 lacks `scrollTo`. This is shimmed in tests and is not a product issue.

### 0.6 What remains from the original plan

- §2 Step 0 (golden prompt snapshots plus behaviour-preserving extraction of `server.js` / `ai.js` helpers). Today the server is tested through its HTTP surface, and `makeProsePrompt` / `convertResponseToMessages` only through `callAI`.
- §3.2 malformed-output fixtures for the PCK parser (written together with fix 0.5; see the table below).
- ~~§3.3 summary moment extraction~~: done (§0.11). Summary vs real-time *consistency* of the model output is still behavioural (§5.4).
- §3.4 concurrent `addTurn` directly on `ConversationLog`. Concurrency is now prevented at the call site (§0.8), so this is lower priority.
- §4 payload-limit and retry tests; client `fetchWithRetry` tests.
- §5 behavioural / golden agent tests (real model, on demand).
- §6 automated e2e (Firestore emulator + Playwright).
- §7 CI wiring: there is no CI yet; `npm run test:all` is the local gate. Also the `SYSTEM_VERSION`-bump check on prompt diffs.

### 0.7 Tests to add together with each upcoming fix

| fix (audit id) | add / change these tests |
|---|---|
| ~~C1 summary never sees real-time moments~~ | **Done (§0.11).** |
| ~~C2/C3 input re-enabled during generation; races~~ | **Done (§0.8).** Tests implemented in `chatTurnOrchestration` (turn lock) and `studentAgent` (`callAI` completion signal). A request **timeout** is still not implemented; add a test if one is introduced. |
| ~~C4 empty sends~~ | **Done (§0.9).** Image-only messages are DECIDED as supported (B22), and their regression test is added. |
| ~~C5 multiline teacher messages~~ | **Done for teacher messages (§0.18).** Open: line-break display in history / annotation / export viewers, and student-message newlines (unchanged). |
| ~~C6 fixed fallback text~~ | **Done for the current chat / student-generation path only (§0.12).** The legacy completion path (`MODEL_VERSION 3`) keeps its own fallback; the legacy pages are unchanged (C15). Parse failures reject; nothing is persisted. Re-ask is not implemented (no retries in phase 1). |
| **B2 PCK failure behaviour (open product decision)** | `chatTurnOrchestration`: PCK reject → the decided behaviour (students unsteered / retry / blocked turn), plus a visible failure state and a failure log entry. |
| **B10 empty / waiting / failure sidebar states** | `pckSkillsDisplay` / `chatTurnOrchestration`: each state has its own distinct, decided text. |
| ~~C7 silent failures; failed turns unlogged~~ | **Phase 1 done (§0.12).** Still to add with phase 2: retry / timeout tests, the B2-decided behaviour, and server-side diagnostics (model, `finishReason`, PCK raw output). |
| ~~C8 speaker names dropped from student history~~ | **Done (§0.19).** Still open: check in the live replay whether the model echoes the `name: ` prefix inside its messages (parser stripping would then be a separate change); re-measure repetition after C9. |
| ~~C9 `thinking` required by prompt but excluded by schema~~ | **Done (1.3.9, §0.20).** The sequential replay was run on 2026-10-07 (`student_stability_replay.md`). B6 is separate. |
| ~~Repetition after short teacher messages (acknowledgement / praise / thanks / closing)~~ | **Done (1.3.10, §0.21, B25).** Still open: re-run the sequential replay on 1.3.10. Bare `?` is not handled; it is absent from the pilot data (`student_agent_findings.md` §2.5). Duplicate detection / re-ask and explicit student state are not designed yet. When built, use the duplicate-detector cases in §3. |
| ~~Verbatim same-student repetition (duplicate guard)~~ | **Done (1.3.11, §0.22, B26).** Still open: semantic repetition and regressions (explicit student state, not designed); cross-student copies (not detected by design); B6. |
| ~~C10 PCK JSON mode / parser / validation (fix 0.5)~~ | **Done (§0.15).** Still open: re-ask on parse failure (§0.13), and B200's consistency checks (decision == any(relevant), etc.), which need a semantic decision first. |
| **B8 cap on displayed skills** | sidebar / server: at most N rows for an input with 5 relevant skills; selection rule per spec. |
| **B12 score-1 shows evidence and suggestion** | `pckSkillsDisplay`: score-1 row shows both `evidence` and `what_could_be_better` (the format per spec); the Excel export likewise if changed. |
| **C11/C12 prompt contradictions, hard-coded tiers** | Prompt snapshot (after §2); persona tiers in the prompt derived from `participation.baseline` (`studentAgent`: every cast member's baseline appears; no persona outside the cast is named). |
| **C13 summary modal rendering** | Render `PCKSummaryModal` with `#`/`##`/`###`/bold → correct elements, no stray `#`; `<script>` in the summary is not executed or injected. |
| **C14 summary regenerated from logs pages not saved** | Logs pages: regenerate → Firestore save mocked and called with `summaryFeedback`. |
| **Diagnostics persistence (0.4)** | `conversationContract`: new diagnostic fields or subcollection are additive; raw output, parse status, `finishReason` stored per call; doc-size guard (images and raw outputs not inline beyond the limit). |
| **B5 cast recorded reliably** | `conversationLogger`: the cast is recorded at session start (not only on the first logged turn) if that is changed; the cast is identical across all turns of a session. |
| **Completed-scenario indication** | `ScenarioSelector`: completed badge per the definition; matching by scenario id (and the text→id map for old records). |
| ~~TDZ in Chat.jsx (§0.5)~~ | **Done.** Plugin removed; the orchestration tests pass under native `const`. |
| **Any prompt / model / config change** | Bump `SYSTEM_VERSION` + changelog entry (enforced by `configContracts`); behavioural replay (§5). |

### 0.8 Fixed: C2/C3 concurrent simulation turns (2026-10-05)

**Behaviour now:** one simulation turn at a time. A turn is PCK analysis followed by student generation, appending the replies, and queueing the log entry.
- From the moment the teacher submits until the turn finishes:
  - the textarea, the send button, the board toggle and **"סיים שיחה" (finish)** are disabled;
  - the typing indicator stays visible.
- Any further submit is ignored: no history entry, no PCK call, no student call, no log entry.
- The lock is released when:
  - **students replied:** after the replies are appended and the log entry is queued;
  - **PCK call failed:** the existing behaviour is unchanged (B2, still undecided). The students are generated unsteered, and the lock is released when that finishes;
  - **student generation returned no messages** (backend error, or `responses: []`): released in the reply callback's `finally`;
  - **student generation threw or rejected** (e.g. building the prompt fails): released in a `catch` around `await callAI(...)`. Previously that rejection was unhandled and `onResponse` was never called.
- **Logging:** `ConversationLog.addTurn` calls are chained on a queue. Each entry is written only after the previous one finished, so log order equals send order. A failed log write is `console.error`ed and does not block later entries. The UI does **not** wait for Firestore.
- No late result from an earlier turn can overwrite a newer one: with the lock, PCK and student results of different turns never overlap, and log writes are serialized.
- **Finish (סיים שיחה):**
  - The button is disabled while a turn is in progress, and the handler also ignores calls then (`turnInProgressRef`).
  - After a turn, finish is **queued on the same log chain**: `endSession()` / `saveToLocalStorage()` / the confirmation run only after every queued `addTurn` has been written, so the final save cannot skip or reorder a turn.
  - Repeated finish requests are ignored (`finishRequestedRef`).
  - Visible behaviour is unchanged except that the confirmation can appear slightly later if Firestore is slow.

**Implementation (production files):**
- `src/pages/Chat.jsx`:
  - `turnInProgressRef` (synchronous guard) + `isTurnInProgress` state (UI) + `beginTurn()` / `endTurn()`;
  - `beginTurn()` at the top of `addUserResponse` (returns early if a turn is running) and before a student-initiated opening;
  - `endTurn()` in a `finally` of the student reply callback and in a `catch` around `await callAI(...)`;
  - `turnLogQueueRef` promise chain for `addTurn`;
  - finish handler guarded by `turnInProgressRef` / `finishRequestedRef` and chained on `turnLogQueueRef`, with the finish button disabled while `isTurnInProgress`;
  - `Messages` gets `isWaitingOnStudent={isQuerying || isTurnInProgress}`.
- `src/utils/ai.js`: `callAI` now `return`s the generation promise. Previously it was dropped, which gave the caller no completion or failure signal. Legacy pages ignore the return value, so they are unaffected.

**Known limits (out of scope here):**
- There is no request timeout, so a hung backend call keeps the lock until the request ends.
- Failures are still not shown to the teacher (C7).
- Empty sends are still accepted (C4).

### 0.9 Fixed: C4 empty teacher messages (2026-10-05)

**Behaviour now** (`Chat.addUserResponse`, checked before the turn lock is taken):

| submission | result |
|---|---|
| empty text, no drawing to include | ignored: no history entry, no PCK call, no student call, no logged turn, turn lock not taken; the textarea is cleared by `InputField` as before |
| whitespace-only (spaces, tabs, line breaks), no drawing | same as empty |
| empty / whitespace text, "כלול בהודעה" ticked but the board is empty | same as empty |
| **image-only** (opt-in ticked + a drawing, no text) | **unchanged**: accepted, starts a turn. B22 is **DECIDED**: image-only turns are valid and must remain supported. Downstream handling is incomplete (E1, §0.10). |
| non-empty text (with or without a drawing) | unchanged; text passed through as typed |

**Production change:** in `src/pages/Chat.jsx`, the start of `addUserResponse` computes:
- `hasText = TAmessage.text.trim().length > 0`;
- `willIncludeDrawing = board.shouldInclude() && board.hasDrawing()`.

It returns early if neither holds. Nothing else changed.

**Known edge (not addressed):** if the board reports a drawing but `exportAsImage()` then returns `null` (only on an export exception), an empty-text message without an image is still sent.

### 0.10 Future drawing / multimodal backlog (documented, not scheduled)

These are not fixed and not designed yet. They are listed so the drawing / shared-workspace work picks them up. They change agent evidence, so each needs a `systemVersion` bump and the replay/evaluation runs in §5.

| id | issue | where it shows | tests to add when addressed |
|---|---|---|---|
| **E1** (`invariants.md` §E) | **Image-only teacher turns are under-represented outside the live chat.** (a) Exports and agent transcripts show a blank teacher message. In-app viewers show the drawing under an empty text line. (b) The student agent sees the drawing, while **PCK is intentionally skipped for image-only turns since 1.3.3** (no feedback; students unsteered; previously a false 400 failure) and the summary agent sees `Teacher: ` with nothing after it. (c) Pilot conversations with image-only turns are hard to interpret, and the agents had inconsistent evidence (11 turns in the 2026-07-27 export). | `exportConversationExcel.js`, `AdminConversationLogs.jsx` CSV, `universal_pck_skills.formatConversationHistory`, `server.js` `/api/pck-feedback` (empty-message 400) and `/api/pck-summary` transcript | exports and transcripts contain an explicit drawing marker/caption for image-only turns; the PCK request for an image-only turn is accepted and carries the drawing (or its description), **replacing the 1.3.3 skip** (update the "PCK handling by turn type" tests); the summary transcript marks the drawing; old records still render. |
| B17 | PCK and summary agents never see drawings (DECIDED: change later by design) | `server.js` PCK and summary prompts | PCK and summary requests include the turn's drawing per the chosen design; evaluation on drawing turns |
| B16 | Every past drawing is re-sent to the student agent on every turn, with no caption | `ChatMessage.toAIformat`, `convertMessagesToGenAI` | the decided re-send policy (e.g. latest only, or captioned) |
| B15 | Board opt-in reset, board persistence, auto-close after send | `DrawingBoard.jsx`, `Chat.jsx` | per the UX decision |
| A10 | ≤600 px PNG inline storage; no vector state | `conversationLogger.js` | additive vector/external storage; old records readable |

B22 regression test: **added** (`chatTurnOrchestration`, "accepts an image-only submit … (B22)"). It protects image-only turns against the C4 empty-message guard. It deliberately does not assert PCK or summary handling of image-only turns (E1).

### 0.11 Fixed: C1 summary did not receive real-time PCK moments (2026-10-05)

**Root cause:** `/api/pck-summary` selected moments with `turn.pckFeedback && turn.pckFeedback.should_provide_feedback`. `ConversationLog.addTurn` stores `pckFeedback` only for displayed feedback (A4), and never stores `should_provide_feedback` inside it. So no turn ever qualified, and every summary prompt said "No significant PCK moments were identified…". In the same block, the collected `feedback_message` was never printed, and a skill with no `evidence` printed `Evidence: undefined`.

**Behaviour now** (`server/server.js`, moment block of `/api/pck-summary` only):

| input | summary prompt |
|---|---|
| current format: `pckFeedback` with `skills_assessment` | One moment per such turn, in log (turn) order. Per relevant skill: `<Hebrew name> (<id>): <label> (score N)`, `Evidence:` (if present), `Could improve:` (if present). Then `Feedback message recorded for this turn:` (if present). Irrelevant skills are omitted. |
| legacy: `pckFeedback` without `skills_assessment` | Still a moment. `detected_skills` / `missed_opportunities` are listed with their text, marked "no score recorded". No score or label is invented. Unknown free-text skill ids are shown as-is. |
| `pckFeedback: null` | Not a moment (feedback was not displayed). The turn still appears in the transcript. |
| no displayed feedback at all | Unchanged no-moments path ("No significant PCK moments were identified…") and the "0-2 moments" length band |

Unchanged: the PCK rubric, the feedback model, scoring, the summary instructions (including "do not contradict the scores already given"), A4 and the stored schema.

**Notes:**
- The moments list everything stored for a displayed turn, including the score-1 suggestion that the v1.3.0 sidebar hides (B12, decided to be shown later).
- `feedback_message` is labelled "recorded", because the v1.3.0 sidebar does not display it (the sidebar shows the per-skill rows).
- Effect on output: summaries now take the 3-5 or 6+ moment length bands for conversations with feedback, so they will typically be **longer** than before. Bump `SYSTEM_VERSION` with this change.

### 0.12 Fixed: C7 phase 1 — visible and diagnosable LLM/service failures (2026-10-05)

**Failure cases covered:**

| case | teacher sees | turn | diagnostics (`failedAttempts`) |
|---|---|---|---|
| PCK backend error (HTTP 5xx, e.g. model error) | sidebar notice (`FAILURE_MESSAGES_HE.pck`) | B2 behaviour unchanged (today students are generated unsteered and the turn is logged with `pckFeedback: null`). **Not protected by tests**: B2 is REVIEW | `agent: pck`, `stage: http`, status, endpoint |
| PCK output unparseable (server's "Failed to parse AI response as JSON") | same | same | `stage: parse` |
| PCK network failure | same | same | `stage: network` |
| Student backend error / network failure | banner above the chat (`FAILURE_MESSAGES_HE.student`) | **not logged** (A3); the teacher can resend | `agent: student`, `stage: http` / `network`, `pckFeedbackDisplayed` |
| Student output unparseable / missing `responses` | banner | **not logged**; in the current chat path the fixed fallback reply is no longer produced (C6; legacy completion path unchanged) | `stage: parse`, `rawOutputExcerpt` (≤1000 chars), `rawOutputChars` |
| Exception building the student request | banner | not logged | `stage: client` |
| Student silence (`responses: []`) | nothing (not a failure) | not logged (B6, unchanged) | none |

The turn lock is released in every case. Both notices are cleared when the next turn starts. Notices never contain technical details.

**Diagnostic structure** (invariant **A16**, DECIDED / PROTECT): a top-level `failedAttempts` array on `conversations/{sessionId}`, written through `ConversationLog.addFailedAttempt` → `saveToFirestore`:
- Writes go on the same serial log queue as turns, so entries sit in order between turns. `precedingTurnNumber` = the number of turns logged before the attempt.
- It is never part of `turns[]`, so `turnNumber` is unaffected.
- At most the latest 50 entries are kept.
- Before the first logged turn, entries are held in memory and saved with that turn (A11: no failure-only documents).
- Entry fields are built by `src/services/turnDiagnostics.js::buildFailedAttempt`. They contain no teacher text (only its length and whether a drawing was attached), no images, no histories, no stacks and no credentials, and no `undefined` values (Firestore).

**Production files changed:**
- `src/pages/Chat.jsx`: notice state; `recordFailedAttempt`; the PCK and student `catch` paths; banner; sidebar prop.
- `src/utils/ai.js`: failures reject instead of `onResponse([])`; parse failure throws a `stage: parse` error instead of the fallback reply.
- `src/services/genai.js`: errors from `/api/generate` and `/api/pck-feedback` are tagged with `stage` / `status` / `endpoint` / `serverError`.
- `src/services/conversationLogger.js`: `failedAttempts`, `addFailedAttempt`, included in `toJSON`.
- `src/services/turnDiagnostics.js` (new): classification and the Hebrew notices.
- `src/components/PCKFeedbackSidebar.jsx`: optional `errorMessage` prop.

No server, prompt, model, parsing or retry changes.

**Still impossible to capture at this layer:**
- the **model id**, because the client never receives it. The server uses `gemini-2.5-flash-lite` for every call, but doesn't report it;
- **`finishReason`** / token counts / safety blocks, because the server neither checks nor returns them;
- the **raw PCK model output** on a PCK parse failure, because the server logs it to its console only;
- **server-side retry history** (429 back-off);
- failures in sessions that **never log a turn**: held in memory and lost when the tab closes;
- **HTTP status for network failures** (none exists);
- whether a student-call 500 was a model error vs a safety block vs an empty candidate, because the server collapses these into one error message (only the text is kept, truncated);
- **Empty model text** (`""`) is still treated as silence, not a failure, because that path is unchanged (parsing not modified).

### 0.13 Proposed policy: B2, retries and timeouts (investigation, 2026-10-05; implemented in 1.3.6, see §0.17)

Status: recommendation only. No production code was changed. Decisions still needed are listed in §0.13.7.

#### 0.13.1 What exists today (verified in code)

| layer | where | retries | timeout |
|---|---|---|---|
| Model call (server → Vertex) | `server.js` `withRetry` (lines ~71-92), used by `/api/generate`, `/api/pck-feedback`, `/api/pck-summary` | **Only quota / rate-limit errors**: message contains `429`, `RESOURCE_EXHAUSTED`, `Too Many Requests` or `quota`, or `status === 429`. 3 retries with 2 / 4 / 8 s back-off, so up to ~14 s of waiting plus 4 calls. **No retry** on Vertex 5xx, network errors, empty or blocked candidates, `MAX_TOKENS` truncation, or PCK JSON-parse failure. | **None set.** The Vertex SDK (v1.10.0) only aborts when `requestOptions.timeout` is passed (`post_request.js:getFetchOptions`), and the server passes none. The underlying `undici` 5.29 fetch has default `headersTimeout` / `bodyTimeout` of **300 s**, so a stuck model call ends after about 5 minutes at the earliest. |
| Server endpoint | `server.js` | none beyond `withRetry` | none. Every failure, including exhausted 429 retries, is returned as **HTTP 500**; empty PCK text is HTTP 400. |
| Reverse proxy (production) | IIS + ARR (`public/web.config`, `IIS_CONFIGURATION.md`) | none | ARR proxy time-out, **default 120 s** (not set in the repo; assumed default, so verify on the server). On expiry IIS returns 502 while Node keeps working. |
| Client → backend | `genai.js` `fetchWithRetry` | **HTTP 429 and 503 only**: 2 retries, 3 / 6 s. The server never returns 429 or 503 from the LLM endpoints (it returns 500), so in practice this only fires if IIS/the app pool returns 503. **No retry** on 500, 502, 504 or network errors (a fetch `TypeError` is thrown before the status check). | **None** (no `AbortController`). The browser waits until the proxy or server gives up. |
| Turn orchestration | `Chat.jsx` | none | none. The turn lock is held until the student call settles, which today can take ~120 s (IIS) to ~300 s+ (direct). |

Per agent:
- **PCK:** the 429 back-off on the server only. Failure → notice + `failedAttempts`, then students are generated unsteered (B2, current).
- **Student generation:** the 429 back-off on the server only. Failure → banner + `failedAttempts`, no turn logged. Parse failures are detected client-side (`convertResponseToMessages`) and never retried.
- **429:** retried on the server (3×); the client's 429 branch is effectively dead.
- **5xx / network:** never retried anywhere.

**Interaction found while investigating (resolved in 1.3.3, see §0.14):** for **image-only turns** (B22), `Chat.jsx` called `getPCKFeedback("")`, and `/api/pck-feedback` answers 400 ("Teacher message is required"). Since C7 phase 1, every image-only turn therefore shows the "temporary problem" PCK notice and records a `failedAttempts` entry (`stage: http`, 400). The failure is deterministic, not temporary. The policy below treats it separately (§0.13.5).

#### 0.13.2 Where timeouts should live

At several layers, with **nested budgets**, so the innermost layer gives up first and reports a classified error:

```
model call timeout (server, per attempt)
  < server endpoint budget (all attempts + back-off)
    < client fetch timeout (AbortController)
      < IIS/ARR proxy timeout (120 s default)
```

- **Model call (server):** pass `requestOptions: { timeout }` to `getGenerativeModel` or per call. This is the only layer that can tell "model too slow" apart from other errors and retry it.
- **Server endpoint budget:** stop retrying when the remaining budget is shorter than one attempt. Return a classified error, e.g. `{ success:false, error, errorKind: 'timeout'|'rate_limit'|'model_error'|'parse'|'bad_request', attempts, latencyMs, model }`.
- **Client:** a hard `AbortController` timeout slightly above the server budget. This guarantees the turn lock is released even if the server or proxy hangs, which today is unbounded from the client's point of view.
- **No timeout in the turn lock itself.** The lock is released by the client calls settling, and those become bounded.

#### 0.13.3 Options for a PCK failure (B2)

| | A. continue unsteered (current) | B. retry PCK once, then continue unsteered | C. retry PCK once, then block the turn |
|---|---|---|---|
| **Pedagogical consistency** | Weakest for that turn: students react without the move-quality signal (B1 intent lost), and the teacher gets no feedback on what may be a key PCK move. | Same as A when the retry also fails, but that should be rare for transient errors. | Strongest: every logged turn had PCK steering and a feedback opportunity. |
| **User experience** | Fastest; the conversation never stalls; a notice explains the missing feedback. | Adds one attempt's latency only when something already failed; otherwise as A. | Worst: the teacher must resend. A deterministic PCK failure (e.g. a prompt that reliably produces unparseable output, or the image-only 400) can **stall the session** on the same message. The failed message and drawing have to be handled (re-tick opt-in, B15) and kept out of the student context. |
| **Data / research integrity** | The turn is logged with `pckFeedback: null`, which looks like "no feedback warranted" in `turns[]` (A4 still true: nothing was displayed). Only `failedAttempts` tells them apart, and joining by `precedingTurnNumber` is ambiguous when several attempts happen between two logged turns (§0.13.6). The student reaction in that turn comes from a different condition (unsteered), a confound for student-behaviour analyses. | As A, but far fewer affected turns. | Cleanest `turns[]`: all turns produced under the same condition; failures live only in `failedAttempts`. |
| **Implementation complexity** | None (today). | Low-medium: a server-side retry with a timeout and classification; no UI-flow change. | Medium-high: roll back or mark the teacher message, exclude it from AI context, re-attach the drawing, add a resend UX, plus tests. Also needs a way out for deterministic failures. |

**Recommendation: B for now.** Revisit C only after (a) PCK JSON mode with a validated parser (fix 0.5) has reduced deterministic parse failures, and (b) latency/failure data from the new diagnostics shows how often the retry still fails. C becomes attractive only if residual PCK failures are rare *and* transient.

#### 0.13.4 Proposed retry / timeout policy

The numbers are **provisional**: no latency data exists yet (§0.13.7, decision 1). Step 1 of implementation is to measure: per-attempt latency and attempt count in server logs, and `latencyMs` / `attempts` in responses.

**Common rules:**
- **One retry layer: the server**, closest to the model and the only one that sees Vertex status, `finishReason`, quota errors and the raw text. The client retries only transport-level failures that the server cannot see.
- **Retriable:** model-call timeout; Vertex 5xx / `UNAVAILABLE` / `INTERNAL`; network errors to Vertex; empty candidate / no parts; 429 / `RESOURCE_EXHAUSTED` (with back-off, capped by the budget); **parse/validation failure** (one re-ask, per B200 A3).
- **Not retriable:** 4xx bad input (empty text 400, payload 413); safety block (`finishReason: SAFETY`, deterministic for the input); client-side prompt-construction errors.
- **Client:** keep `fetchWithRetry` but change its trigger to **network error / 502 / 503 / 504 only, at most 1 retry**, and only while the client budget allows. Drop the 429 branch (the server handles quota). Never retry 500 (the server has already retried) or 400 / 413.
- Both endpoints are stateless, so retries are idempotent. A client retry after a lost response just repeats a model call.

| | PCK (`/api/pck-feedback`) | Student generation (`/api/generate`) |
|---|---|---|
| Model-call timeout per attempt | 25 s (output ≤ 2000 tokens) | 20 s (output ≤ 512 tokens) |
| Server attempts | 2 (1 retry) on retriable errors; parse failure → 1 re-ask | 2 (1 retry); **move the JSON / `responses` validation to the server** so a parse/schema failure can be retried there. The client keeps its parser as a second line of defence. |
| 429 back-off | existing 2 / 4 / 8 s, but capped so the total stays within the budget | same |
| Server budget | ~55 s | ~45 s |
| Client `AbortController` timeout | ~60 s | ~50 s |
| Client transport retry | 1, network / 502 / 503 / 504 only, if budget remains | same |
| After final failure | notice (as today) + `failedAttempts`, then **continue unsteered (B2 option B)** | banner (as today) + `failedAttempts`; no turn logged (A3); the teacher can resend |

Worst-case lock time is about 60 s (PCK) + 50 s (students) ≈ 110 s. Each request stays under the 120 s IIS limit, but the total is long, so consider a "still working" hint after ~15 s (UX decision 5).

#### 0.13.5 Interaction with existing behaviour

- **Turn lock (C2/C3):**
  - All retries happen inside the turn; the lock is held throughout and released when the final client call settles.
  - The new client timeout **bounds** the lock. This is the main reliability gain over today, where the lock can be held for minutes.
  - "סיים שיחה" stays disabled during retries, and finish still queues behind logging.
- **`failedAttempts` (A16):**
  - Record **one entry per final failure**, as today.
  - Add, as optional additive fields, what the server reports: `attempts`, `errorKind` (timeout / rate_limit / model_error / parse / bad_request), `latencyMs`, `model`, `finishReason`. This removes most of the "impossible to capture" items from §0.12.
  - Recovered failures (a retry succeeded) should **not** create `failedAttempts` entries. Their retry count belongs in turn-level or server diagnostics (decision 4), so `failedAttempts` keeps meaning "the user experienced a failure".
  - Any A16 field addition must stay additive, bounded and privacy-minimal, and should update the A16 field list and the contract test.
- **Visible messages:**
  - Show only after the final failure, never during retries.
  - A timeout uses the same notice texts.
  - Notices still clear when the next turn starts.
  - The image-only case below must not use the "temporary problem" text.
- **A3 turn numbering:** unchanged. Retries never create turns, a logged turn is created only once, after student success, and failed attempts never get a `turnNumber`. With option B, a turn whose PCK call failed is still a normal logged turn (`pckFeedback: null`).
- **Image-only turns (B22):**
  - **Decided and implemented in 1.3.3 (§0.14):** the PCK call is skipped silently for image-only turns, so there is no PCK request, nothing to retry and no failure notice.
  - Making the server accept image-only turns is the B17 design itself and not a quick fix.
  - Student retries resend the image (bounded by the 10 MB body limit; 413 is not retried).

#### 0.13.6 Data-model gap: joining failures to turns

`precedingTurnNumber` positions a failure *between* logged turns, but it cannot say which logged turn (if any) came from the same teacher submission. Examples:
- a PCK failure followed by an unsteered logged turn;
- a student failure, then a resend that succeeds.

Recommended (additive, decision 2): the client generates a `submissionId` per teacher submit, stored on the `failedAttempts` entry and as an additive field on the logged turn (e.g. `turn.submissionId`). This gives exact joins without changing `turnNumber` (A3) or `pckFeedback` (A4).

#### 0.13.7 Decisions still needed (product / research input)

1. **Latency budget:** how long a teacher may wait per turn before an error is acceptable, and whether to measure first (recommended) before fixing the numbers in §0.13.4.
2. **B2:** confirm option B, or choose A or C. If C: what should happen to the failed teacher message (kept visible and marked, removed, or auto-resent), and how deterministic failures are escaped.
3. ~~**Image-only turns and PCK**~~: **decided**. PCK is skipped silently and no diagnostic is recorded (implemented in 1.3.3, §0.14).
4. **Recovered retries:** whether to record them at all, and where (turn-level additive field vs server logs only).
5. **"Still working" UX:** whether to show a hint during long turns or retries.
6. **Schema additions:** `submissionId` on turns and failed attempts, and the extra `failedAttempts` fields (`attempts`, `errorKind`, `latencyMs`, `model`, `finishReason`). Each extends A16 / A2 additively and needs explicit approval.
7. **Ordering with fix 0.5 (PCK JSON mode):** JSON mode + validation is **done in 1.3.4 (§0.15)**, so the re-ask can now be built on it. Originally recommended to implement JSON mode + validation **before** or together with the PCK parse re-ask, so the retry does not mask a fixable formatting problem.

#### 0.13.8 Tests to add when implementing

- **Server** (`node:test`, fake model):
  - timeout per attempt → one retry → success;
  - timeout twice → classified `timeout` error with `attempts: 2`;
  - Vertex 5xx → retry;
  - 400 / 413 / `SAFETY` → no retry;
  - 429 back-off capped by the budget;
  - PCK parse failure → one re-ask;
  - student invalid JSON → server-side retry, then classified `parse`.
- **Client** (`genaiErrors`): `AbortController` timeout → `stage: 'network'` / `errorKind: 'timeout'`; one retry on network / 502 / 503 / 504; no retry on 500 / 400.
- **Orchestration:**
  - lock released after a client timeout;
  - no notice while a retry succeeds;
  - one `failedAttempts` entry per final failure;
  - option B: after a final PCK failure the turn proceeds (only once B2 is DECIDED);
  - image-only: covered since 1.3.3 (no PCK call, no failure notice).
- **Contract:** new optional `failedAttempts` fields and `submissionId` are additive; old docs still validate.

### 0.14 Implemented: image-only turns skip PCK (2026-10-05, version 1.3.3)

**Decision:** image-only teacher turns are valid (B22). Until the PCK agent is multimodal, an image-only turn skips the PCK call silently, rather than sending an empty message to `/api/pck-feedback` and producing a false 400 failure (a "temporary problem" notice plus a `failedAttempts` entry in 1.3.2).

**Production change:** `src/pages/Chat.jsx`, PCK step of the turn. The condition `if (lastTeacherMessage)` became `if (lastTeacherMessage && lastTeacherMessage.text.trim())`. Nothing else changed.

| turn type | PCK call | sidebar | `failedAttempts` | students | logged turn |
|---|---|---|---|---|---|
| image-only (opt-in + drawing, text empty or whitespace) | **skipped** | placeholder (no notice) | none | receive the drawing; `impact_analysis` null (unsteered) | normal turn, drawing in `teacher.image`, `pckFeedback: null` |
| text-only | unchanged (text, history, scenario, last 3 analyses) | feedback / notice as before | on failure, as before | steered by the analysis | as before |
| text + drawing | unchanged, using the text (PCK still does not see the drawing, B17) | as before | as before | receive the drawing, steered | as before, with the drawing |
| empty / whitespace, no drawing | (C4) nothing starts | — | — | — | — |

Notes:
- Image-only turns also do not add an entry to the in-memory `feedbackHistory`, since there was no analysis.
- The B2 policy (what follows a real PCK failure) is unaffected.
- **Still future work:** multimodal PCK (B17), and drawing markers in exports and transcripts (E1).

### 0.15 Fixed: C10 real-time PCK output structurally reliable (2026-10-05, version 1.3.4)

**Before:**
- No JSON mode.
- Loose fence stripping, so prose before a fence was accepted.
- 500 only on JSON syntax errors.
- Everything else was default-filled into a "successful" analysis, with the placeholder `'המורה התקדם בשיעור'`.

Replaying the 30 fixtures through the old logic, **24 masqueraded as successful analyses**. Only the six syntax-level ones were rejected: trailing comma, unescaped quote, truncated, 8-token stub, prose before raw JSON, empty.

**Now** (`server/pck_feedback_contract.js`, used by `/api/pck-feedback`):

1. **At the model call:** `responseMimeType: "application/json"` + `responseSchema: PCK_RESPONSE_SCHEMA`. This is the same pattern as the student agent's `/api/generate`. Temperature (0.7), `maxOutputTokens` (2000), the model and the prompt are unchanged.
2. **Parse:** strict `JSON.parse`. The only accepted wrapper is a single code fence enclosing the whole output (lossless). Prose, truncation, syntax errors and empty output → `errorKind: 'parse'`.
3. **Validate (structure only):**
   - **object** at the top level;
   - `pedagogical_quality` ∈ {positive, neutral, problematic};
   - `predicted_student_state` object with:
     - `understanding_level` ∈ {improved, same, confused, more_confused, misconception_reinforced};
     - `response_tone` ∈ {confident, hesitant, confused, frustrated, thoughtful};
     - `student_reaction_hints` array of `{student: non-empty string, likelihood ∈ {high, medium, low}, reaction_type ∈ {6 values}, reason: string}`;
   - `addressed_misconception` boolean; `how_addressed` string; `misconception_risk` ∈ {high, medium, low};
   - `demonstrated_skills` array of `{skill_id ∈ 5 ids, evidence: string}`;
   - `missed_opportunities` array of `{skill_id ∈ 5 ids, what_could_have_been_done: string}`;
   - `should_provide_feedback` boolean;
   - `feedback_trigger` present, and null or ∈ {5 values};
   - `skills_assessment` array of `{skill_id ∈ 5 ids, is_relevant: boolean, score: integer ∈ {0,1,2}` (**required if relevant**; if present it must be in {0,1,2}), `evidence` / `what_could_be_better` / `reason_not_relevant`: string, null or absent`}`;
   - `feedback_message_hebrew` string (may be empty).

   Extra fields are allowed and passed through. Problems → `errorKind: 'schema'`, with up to 10 `problems` in the response.
4. **Failure response:** `500 {success: false, error, errorKind, problems?, finishReason}`. The `error` text starts with `Failed to parse AI response`, so the existing C7 client classifies it as `stage: parse`, shows the PCK notice and records `failedAttempts`. No client change was needed.
5. **Removed:** all default-filling (`pedagogical_quality → neutral`, `predicted_student_state` defaults, `should_provide_feedback → false`, `skills_assessment → []`, derived `demonstrated_skills` / `missed_opportunities`, `misconception_risk → medium`, …) and the placeholder message.
6. **Retained normalisation:** `should_provide_feedback: false` → `feedback_message_hebrew = ''`. This follows the prompt's contract and keeps `feedbackHistory` from claiming feedback was given.

**Malformed fixture outcomes** (all → 500, no analysis):

| `errorKind` | fixtures |
|---|---|
| `parse` | trailing comma; unescaped `"` in Hebrew; truncated JSON; 8-token stub; prose before raw JSON; prose before a fenced block; empty output |
| `schema` | JSON array; feedback text as object; evidence as object; missing `should_provide_feedback` / `skills_assessment` / `predicted_student_state` / `pedagogical_quality` / `feedback_message_hebrew`; invalid skill id (in `skills_assessment` and in `demonstrated_skills`); score 3 / −1 / 1.5; relevant skill without a score; `should_provide_feedback` / `is_relevant` / `score` as strings; `skills_assessment` as object; unknown `pedagogical_quality` / `understanding_level` / `reaction_type` / `feedback_trigger`; `student_reaction_hints` not an array |

**Deliberately not validated** (ambiguous, so not invented; listed in `invariants.md` C10):
- `should_provide_feedback` ↔ relevance;
- the max-2-relevant rule (B8);
- an empty message when feedback is given;
- score/text on irrelevant skills;
- duplicate skill ids;
- consistency of the derived arrays with `skills_assessment`;
- `pedagogical_quality` ↔ `feedback_trigger`;
- reaction-hint names vs the cast.

**Behavioural effect to watch:**
- Outputs that used to be default-filled now become visible PCK failures: the notice is shown, students run unsteered (B2), and the attempt is recorded. JSON mode should make these rare, but the rate is unmeasured; `failedAttempts` (`stage: parse`) now records it.
- `finishReason` is returned in the failure body but not yet captured by the client (§0.12).

### 0.16 Implemented: LLM-call telemetry for latency measurement (2026-10-05, version 1.3.5)

Purpose: measure real production latency before choosing the retry/timeout numbers in §0.13. **No retries or timeouts were added, and B2 is unchanged.**

**Where latency is measured:**
- **Server (`latencyMs`):** in `server.js` `generateWithTelemetry(agent, request)`, wall-clock time around `withRetry(() => model.generateContent(...))` for `/api/pck-feedback` (`agent: pck`) and `/api/generate` (`agent: student`). It **includes** the existing quota back-off. `attempts` counts real calls inside `withRetry` (1 unless a 429 retry happened). `finishReason` is read from the first candidate.
- **Client (`clientLatencyMs`):** in `genai.js`, the browser round trip for the same request (fetch + any client 429/503 retry + proxy + server). This is the number the future client timeout must bound.

**Server response shapes (additive):**
- **Success:**
  - `/api/generate` → `{success, text, meta}`;
  - `/api/pck-feedback` → `{success, analysis, meta}` (the analysis itself is untouched, B23).
- **Failure:** the same `meta` is added to the 500 body (C10 parse/schema failures, thrown model errors, blocked candidates).
- **`meta`** = `{agent, model, latencyMs, finishReason, attempts}`. It never contains prompt, response or message content.

**Client delivery:**
- `getPCKFeedback(..., { onMeta })` and `generateWithGenAI(messages, { ..., onMeta })` call `onMeta({...meta, clientLatencyMs})` on success. Return values are unchanged, and `onMeta` is stripped from the request body.
- Errors carry `error.meta` and `error.clientLatencyMs`.
- `callAI` passes the student meta to `onResponse` as the 4th argument, and attaches it to parse errors.

**Persisted (all additive):**

| case | `turn.telemetry.pck` | `turn.telemetry.student` | `failedAttempts` |
|---|---|---|---|
| successful turn | `{status: ok, model, latencyMs, clientLatencyMs, finishReason, attempts, reason: null}` | same shape, `status: ok` | — |
| image-only turn | `{status: skipped, reason: image_only, …all metrics null}` | `ok` | **none** (skipping is not a failure) |
| student-initiated opening (no teacher message) | `skipped` / `no_teacher_message` | `ok` | — |
| PCK failed, turn still logged (current B2) | `{status: failed, …timing where available}` | `ok` | one `pck` entry, enriched with timing |
| student call failed | (no turn) | (no turn) | one `student` entry, enriched with timing |
| student silence (`responses: []`) | (no turn; nothing recorded, unchanged) | | |

- Turn telemetry is A17 (REVIEW). The enriched `failedAttempts` fields are a direct extension of A16 (DECIDED).
- Telemetry is whitelisted and bounded (≤64-char strings, non-negative integers, nulls), about 0.3 KB per turn.

**Production files changed:**
- `server/server.js`: `MODEL_ID`, `generateWithTelemetry`, `errorTelemetry`, and `meta` in both endpoints.
- `src/services/genai.js`: `onMeta`, client latency, error `meta`.
- `src/utils/ai.js`: meta capture and pass-through.
- `src/services/callTelemetry.js` (new): whitelist builder and sanitiser.
- `src/services/turnDiagnostics.js`: timing fields.
- `src/services/conversationLogger.js`: `addTurn(..., telemetry)` → `turn.telemetry`.
- `src/pages/Chat.jsx`: builds ok / failed / skipped telemetry and passes it.

No prompt, model, parsing, retry, timeout or UI changes.

**How to use the data:** per agent, take the distributions of `latencyMs` / `clientLatencyMs` (median, p90, p99), plus `attempts > 1` and `finishReason` counts (`MAX_TOKENS`, `SAFETY`) across `turns[].telemetry` and `failedAttempts`. Then set the §0.13.4 timeouts above the observed p99, inside the 120 s proxy limit.

**Not captured:**
- per-attempt latency inside `withRetry` (only the total);
- latency of successful turns whose student reply was silence (nothing is logged for them);
- PCK raw output;
- token counts (the server does not read `usageMetadata`).

### 0.17 Implemented: retry / timeout policy and B2 (2026-10-05, version 1.3.6)

Based on `latency_baseline.md` and §0.13. Invariants: **B2 DECIDED**, **B24** (new, DECIDED, provisional values). A3, A16 and A17 are preserved.

**Retry matrix** (per request to `/api/pck-feedback` or `/api/generate`; at most 2 model attempts):

| failure | `errorKind` | retried? | note |
|---|---|---|---|
| per-attempt timeout (own timer / SDK abort) | `timeout` | **yes, once** | |
| 429 / `RESOURCE_EXHAUSTED` / quota | `rate_limit` | **yes, once** | after a 1 s back-off within the budget |
| Vertex 5xx, network error (`fetch failed`, `ECONNRESET`, …), other model-call errors | `model_error` | **yes, once** | |
| empty response (no candidate / no parts / blank text) | `empty` | **yes, once** | |
| PCK parse / schema failure (C10) | `parse` / `schema` | **yes, once** | B23 error body on final failure |
| student parse / schema failure (new server check) | `parse` / `schema` | **yes, once** | final failure body includes `rawOutputExcerpt` (≤1000) + `rawOutputChars` |
| explicit 4xx from the model API | `bad_request` | no | |
| safety-blocked output (finish reason or prompt block reason) | `safety` | no | |
| invalid client input (missing `messages` / `teacherMessage`) | — (HTTP 400) | no model call | |
| client request-construction error (e.g. prompt build) | client `stage: client` | no | rejected before any request |
| image-only PCK skip | — | no call | B22, telemetry `skipped` |

**Timeouts by layer:**

| layer | value | implementation |
|---|---|---|
| model attempt | 20 s, cut to the remaining budget | `withTimeout` race in `callModelWithPolicy`, plus `requestOptions.timeout` on the dedicated `turnModel`, so the SDK also aborts the HTTP request |
| server request | 45 s total (all attempts + back-off) | the budget check before each attempt; no attempt starts with < `minAttemptMs` (1 s) left |
| client | 50 s hard | `fetchOnceWithTimeout` in `genai.js`: one `fetch` raced against a timer, with `AbortController` when available. It rejects with a tagged `ClientTimeoutError` (`stage: network`) **before** aborting, so the tagged error always wins the race |
| IIS / ARR proxy | 120 s default (unchanged) | above every inner layer |

**Nested retries prevented:**
- The per-turn endpoints no longer use the legacy `withRetry` (3 × 429).
- The client no longer uses `fetchWithRetry` for them (it used to retry 429 / 503 twice).
- So one teacher submit makes at most **1 HTTP request and 2 model attempts per agent**. The worst case used to be 3 requests × 4 attempts = 12.
- `LLM_MAX_ATTEMPTS` is capped at 2 in code.
- Summary / completion / test keep their previous retry behaviour (out of scope).

**Student server-side validation** (`server/student_output_contract.js`, minimal):
- a JSON object, strict or in one whole-output fence;
- `responses` is an array;
- each entry is an object;
- `student` / `message` are strings when present.

Entries missing those fields are still skipped by the client, as before, and `responses: []` (silence) stays valid. The successful client contract `{success, text, meta}` and the text itself are unchanged. The browser keeps its parser as a second line of defence.

**After a final failure:**
- **PCK (B2):**
  - the sidebar notice is shown and a `failedAttempts` entry is recorded, with `attempts: 2` and latency;
  - students are generated **without PCK guidance**;
  - the turn is logged with `pckFeedback: null` and `telemetry.pck = {status: failed, attempts, latencyMs, …}`.
- **Student:**
  - the banner is shown and a `failedAttempts` entry is recorded, with attempts / latency / raw excerpt for parse failures;
  - **no normal turn is logged** (A3);
  - the lock is released and the teacher can resend.

**Telemetry / diagnostics:**
- `meta.attempts` is the real number of model attempts (1–2), and `latencyMs` covers all attempts plus back-off.
- A retry that eventually succeeds creates **no** `failedAttempts` entry and shows `attempts: 2` in turn telemetry.
- Final failures carry attempts / latency / finish reason (A16 timing fields).
- A client timeout carries `errorName: ClientTimeoutError` and `clientLatencyMs`.

**Production files changed:**
- `server/llm_call_policy.js` (new);
- `server/student_output_contract.js` (new);
- `server/server.js`: `turnModel`, `failureBody`, both endpoints on `callModelWithPolicy`, `generateWithTelemetry` removed;
- `src/config/llmCallPolicy.js` (new);
- `src/services/genai.js`: `fetchOnceWithTimeout`, the raw-excerpt pass-through;
- `src/services/turnDiagnostics.js`: student server parse classification, server-reported raw length;
- `src/config/version.js`.

No prompt, model, temperature, rubric, repair, UI or summary changes.

**Behaviour changes to expect:**
- An empty student response is now retried and, if it persists, becomes a visible failure. It used to be treated as silence.
- Transient errors and unparseable output now cost one extra attempt, about +1-20 s, instead of an immediate failure.
- The previous 3-retry 429 back-off (up to 14 s) became one retry after 1 s.

**Still open:** tuning the provisional numbers from production telemetry; per-attempt latency inside a request (only the total is recorded); a "still working" hint (not added).

### 0.18 Fixed: C5 teacher-message line breaks (2026-10-07, version 1.3.7)

**Root cause (data-level, not presentation-only):** the `ChatMessage` constructor ran `text.replace(/[\n]/gm, "")` on every message. The textarea kept the line breaks, but the teacher's text was altered at creation: lines were **joined without a space**. PCK, the student agent, the logged `turn.teacher.message` and the bubble all received the altered string. About 4.4% of pilot teacher messages (54 of 1,233) show punctuation glued to the next word. A CSS-only fix was impossible, so the decision (2026-10-07) was to keep the teacher's original text end-to-end.

**Production change:**
- `src/objects/ChatMessage.js`: teacher (`role === "user"`) text is stored as typed. Other roles keep the previous newline removal.
- `src/components/ChatBubble.jsx`: the teacher bubble gets `style={{ whiteSpace: "pre-wrap" }}`. The text is still rendered as a React text node, with no HTML conversion.

**Sent and stored content:**
- For multi-line teacher messages, PCK, the student agent and the log now receive **the original text with `\n`**, where they previously got the joined text.
- Single-line messages are byte-identical to before.
- Nothing is trimmed or normalised. The C4 empty-message check still only *tests* `trim()` and does not modify the text.
- No prompt, model, retry, timeout or storage-format change: same fields, the text just keeps its newlines.

**Not changed:**
- student and other non-teacher messages, which still have newlines removed;
- history, annotation and Excel viewers, which display stored text as before and may collapse line breaks visually;
- pilot records before 1.3.7, which keep the joined text.

### 0.19 Fixed: C8 student speaker identity in the model-facing history (2026-10-07, version 1.3.8)

**Root cause (confirmed):**
- `ChatMessage.toAIformat` already sends `name` for every message (`callAI` → `/api/generate`).
- The server's `convertMessagesToGenAI` built Gemini `contents` from `role` and `content` only, so past student replies became anonymous `model` turns.
- Gemini `Content` has no speaker field.

**Old format** (`user` / `model` turns):

```
user : "<system prompt>\n\n<teacher 1>"
model: "<student A text>"
model: "<student B text>"
user : "<teacher 2>"
model: "<student B text>"
```

**New format:**

```
user : "<system prompt>\n\n<teacher 1>"
model: "<A name>: <student A text>"
model: "<B name>: <student B text>"
user : "<teacher 2>"
model: "<B name>: <student B text>"
```

The full Hebrew example is in `student_agent_findings.md` §1.1.

**Why a text prefix:** Gemini `Content` is `{role, parts}` with no speaker or name field, so the only carrier is the text. The `"name: text"` convention matches the PCK history and summary transcript. It is applied **server-side when deriving the model history**, so no client, storage or prompt change was needed.

**Production change:** `server/server.js` `convertMessagesToGenAI`, assistant branch: `text = name.trim() ? `${name.trim()}: ${content}` : content`.

**Unchanged:**
- teacher messages (no prefix), images, the system prompt;
- nameless or empty-name messages;
- `ChatMessage` and `toAIformat`;
- stored conversations;
- personas, casting and the student prompt;
- PCK, retries and timeouts.

**Persisted data:** unchanged. Only the model-facing request is affected.

**Caveats:**
- This restores speaker identity only. Repetition must be re-measured after C9.
- Watch in the live replay whether the model echoes the `name: ` prefix in its own `message` values.

### 0.20 C9 investigation, A/B and fix (2026-10-07; fixed in 1.3.9)

**Implemented in 1.3.9 (option B, exactly as tested).** Three edits in `src/utils/ai.js` `makeProsePrompt`:
1. rule 5 → "Return ONLY the "responses" array: no reasoning, analysis or explanation fields, and no text outside it";
2. the header → "DECISION PROCESS (think through these steps silently before answering; do NOT include them in the output):", with STEP 0-4 unchanged;
3. the three `thinking` blocks removed from the examples.

Plus removal of the browser's `thinking` logging and "No 'thinking' field" warning in `convertResponseToMessages`.
- The captured production prompt is byte-identical to the A/B candidate (20,443 → 19,623 chars).
- Unchanged: schema, model, temperature, `maxOutputTokens`; no native thinking.

Details: `student_agent_findings.md` §1.2.

**Contradiction:** the student prompt demands a `thinking` object in the output in three places (format rule 5, the "DECISION PROCESS (MUST INCLUDE IN OUTPUT)" header, and three examples), while `/api/generate`'s `responseSchema` allows only `{responses: [{student, message}]}`.
- The model cannot satisfy both: 0 / 30 live outputs contained `thinking`.
- No reasoning occurs elsewhere: no `thinkingConfig` is set.

**A/B** (30 synthetic contexts × 2 conditions, real Gemini, all else identical):
- **Same on both:** 0 failures, 0 empty, 0 retries, 0 repeats, 0 reasoning leakage, 0 non-cast names, 0 format problems.
- **Latency** p50 / p90 / max: CURRENT 1141 / 1326 / 2523 ms, CANDIDATE 1067 / 1321 / 1653 ms.
- **Replies:** CURRENT 49 replies at 66 chars average; CANDIDATE 55 at 58 chars.
- **Teacher attribution:** CURRENT had two invented third-person teacher attributions ("המורה אמרה"); CANDIDATE had none.

This is a sanity check only (n = 30 single-turn contexts).

**Recommendation:** option B, as three exact prompt edits:
1. rule 5 → "Return ONLY the responses array: no reasoning, analysis or explanation fields, and no text outside it";
2. header → "DECISION PROCESS (think through these steps silently before answering; do NOT include them in the output)";
3. remove the 3 `thinking` blocks from the examples.

No schema change and no rationale field. Implementing it needs a `SYSTEM_VERSION` bump and the tests listed in the C9 row of §0.7. Repetition must be re-measured afterwards with a **sequential** replay. Single-turn contexts cannot show the pilot repetition pattern.


### 0.21 Conversational-move rule for short teacher messages (2026-10-07, version 1.3.10)

**Evidence:**
- `student_stability_replay.md`: after C8 + C9, every exact repeat followed a short teacher message.
- `short_message_repetition_experiment.md` (2×2, live): on closings, the PCK block overrode the existing closure rule. Exact repeats were A 10/43, no-PCK 0/40, prompt rule 0/42. Removing only the "MUST show confusion" line was not enough.

**Change (condition C, verbatim):** one bullet in `src/utils/ai.js` `makeProsePrompt`, at the end of the NO-DUPLICATE RULE and before `📍 LESSON PHASE DETECTION`:

> When the teacher's latest message is primarily an acknowledgement, praise, thanks, or closing rather than a new content question, respond naturally to that conversational move. Do not restate an earlier answer verbatim. If the student is still confused, preserve that underlying state without forcing the same misconception or wording to be repeated.

- I captured the system prompt before and after the change for a fixed cast and scenario, both with no PCK analysis and with a fixed `more_confused` analysis. In both cases the diff is exactly this one added line, and the result is byte-identical to the live-tested condition C prompt.
- **Unchanged:** PCK steering, personas, model, temperature, schema, C8, C9.
- **Not added:** a duplicate check, a re-ask, explicit student state, `?` handling, native thinking.
- `SYSTEM_VERSION` 1.3.9 → 1.3.10 with a changelog entry.

**Tests added (8):**

| file | test | protects |
|---|---|---|
| `studentAgent.test.js` | the exact rule is in the prompt once, with and without PCK guidance | rule text |
| `studentAgent.test.js` | it is the last bullet of the no-duplicate rule, directly before lesson-phase detection (exact section text) | location; the three existing no-duplicate bullets unchanged |
| `studentAgent.test.js` | it is general guidance, outside the PCK analysis block | not tied to PCK |
| `studentAgent.test.js` | the PCK block and the persona/PCK steering section match their 1.3.9 SHA-256 fingerprints (for a fixed `more_confused` analysis); key steering lines still present | PCK / student-state steering byte-identical (B1). A future change here must be deliberate and update the fingerprint. |
| `studentAgent.test.js` | the same system prompt and unchanged history are sent for `?`, `למה?`, `נכון`, `יפה, תודה לכם.` and a content question | prompt guidance only; no deterministic classification |
| `studentAgent.test.js` | C9 silent decision process and responses-only output kept; C8 client message format `{role, content, name}` kept | C8 / C9 unchanged |
| `chatTurnOrchestration.test.js` | `?`, `למה?` and `יפה, תודה לכם.` each run the normal PCK + student turn with the text unchanged, and are logged | no short-message special-casing in the app |
| `api_generate.test.mjs` | a system prompt containing the rule and short teacher messages are forwarded verbatim; C8 `"<name>: "` prefix still applied | server pass-through + C8 |

**Results:** `npm run test:all` was run twice. Both runs passed: 184 frontend tests and 150 backend tests.

**Follow-up (not done here):**
- re-run the sequential replay (`student_stability_replay.md` method) on 1.3.10 to measure the effect over full conversations;
- B6;
- semantic loops, regression of resolved misconceptions, and contamination (explicit student state is not designed yet).


### 0.22 Same-student duplicate guard and one re-ask (2026-10-07, version 1.3.11)

**Evidence:**
- `student_duplicate_guard_study.md`: the criterion was validated on the pilot export and both replays. It caught 86% of manually judged replays, flagged 0 natural replies, and would trigger on about 5% of turns.
- `student_duplicate_reask_experiment.md`: live test, 38 triggered calls. 95% were resolved by one re-ask; student state was kept; 2 calls needed the fallback.

**Implementation:**
- `server/student_duplicate_guard.js` is a new pure module: detector, regeneration note, note placement and final rule.
- Two generic, opt-in hooks were added to `callModelWithPolicy` in `server/llm_call_policy.js`:
  - a failed outcome may supply `nextRequest` (the re-ask request);
  - it may supply `fallback: {value}` (attempt 1's usable output).
  - The loop and its `maxAttempts` cap are unchanged.
- `/api/generate` runs the detector after the structural check (C10/B24) and maps outcomes to telemetry.
- Client: `callTelemetry.js` whitelists the four optional fields; the contract helper validates them.
- No change to the student prompt, PCK steering, model or config, or the stored message format.

**Flow** (at most 2 model attempts, B24):

| attempt 1 | attempt 2 | returned | `duplicateOutcome` / `duplicateRetries` |
|---|---|---|---|
| valid, no duplicate | — | attempt 1 | `none` / 0 |
| valid, duplicate(s) | re-ask (same request + note), valid, no duplicate | attempt 2 verbatim | `resolved` / 1 |
| valid, duplicate(s) | re-ask, some replies still duplicate | attempt 2 without those replies (JSON re-serialized) | `dropped` / 1 |
| valid, duplicate(s) | re-ask, every usable reply still duplicate | attempt 2 unchanged | `kept` / 1 |
| valid, duplicate(s) | re-ask fails technically (timeout, model error, empty, parse/schema, safety) or no budget | attempt 1 unchanged | `reask_failed` / 1 (0 if no budget) |
| technical failure | valid, duplicate(s): the final attempt, so no re-ask | final rule (drop / keep) | `dropped` or `kept` / 0 |
| technical failure | technical failure | 500, as before (no duplicate fields) | — |

**Tests added (48; 42 server, 6 client):**

| file | tests | covers (task items) |
|---|---:|---|
| `server/test/student_duplicate_guard.test.mjs` (new) | 19 | 1–7: constants; normalization; exact, variant, ≥ 0.90 (including exactly 0.90), just below 0.90, < 30 characters (including 29 and padded), natural short repeats, other student, teacher / legacy messages, all earlier turns, malformed entries. Exact single and plural note wording, quote normalization / 150-character cut, note placement on a copy. Fallback: drop-one, keep-all, unusable remaining entry. |
| `server/test/api_generate_duplicate_guard.test.mjs` (new; short policy values) | 18 | 1, 2/3, 5–7, 8–10 (one regeneration for several students, attempt 2 verbatim, output format), 19 (attempt 2 = same system prompt, C8 history, config, no thinking config; only the note added), 11, 12, 13 (×5 kinds of failure on the re-ask), 14/15 (429 or parse failure then duplicate: 2 calls, no re-ask; duplicate on every attempt: 2 calls), the double technical failure is unchanged, 16 / 17 (counters per outcome; meta keys; no student, teacher or note text) |
| `server/test/llm_call_policy.test.mjs` | +5 | interpret receives `{attempt, isFinalAttempt}`; `nextRequest`; fallback after a failed next attempt; fallback when the budget leaves no room; never more than `maxAttempts` |
| `server/test/api_generate.test.mjs` | 1 updated | the success meta now includes the four duplicate keys (failure meta unchanged) |
| `src/__tests__/callTelemetry.test.js` | +3, 2 updated | fields kept when reported; omitted otherwise (backward compatible, PCK unchanged); only known outcomes and non-negative integers. The two existing whitelist tests now compare against `TELEMETRY_BASE_KEYS`. |
| `src/__tests__/conversationContract.test.js` | +2, 1 extended | a stored student entry with the new fields is valid (18); an unknown outcome or a negative count is rejected |
| `src/__tests__/chatTurnOrchestration.test.js` | +1 | server counters are logged with the turn; the PCK entry is unchanged |

**Before the fix:**
- 23 server checks failed: the new unit file (missing module), 17 of the 18 endpoint tests, 4 of the 5 policy tests, and the updated meta test.
- 7 client tests failed.
- Already passing, by design:
  - the double-technical-failure test (unchanged behaviour);
  - the "never more than `maxAttempts`" policy test (existing cap);
  - the 2 new contract-rejection cases (the fields were not yet whitelisted at all).

**Unchanged and still covered:** C8 (`api_generate.test.mjs`), C9 and the 1.3.10 rule plus the PCK fingerprint (`studentAgent.test.js`).

**Results:** `npm run test:all` was run twice. Both runs passed: 190 frontend and 192 backend tests.

**Follow-up:**
- a sequential replay (the `student_stability_replay.md` method) as the acceptance test;
- watch `duplicateOutcome` in production telemetry; the experiment expects about 5% of re-asks to need the fallback;
- explicit student state for semantic loops and regressions.

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

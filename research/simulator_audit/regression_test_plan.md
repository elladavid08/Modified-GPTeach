# Regression safety net: proposal

## 1. Current state

- **No application tests exist.** There are no `*.test.*` or `*.spec.*` files outside `node_modules` and `research/`. `package.json` has no `test` script, and the server has no test runner.
- **Tooling available:**
  - Node **18.20.8** (built-in `node:test` + `assert`, enough for server-side pure-function tests with no new dependencies);
  - `react-scripts` **2.1.8** with its bundled Jest (old; it does not officially support React 18.3);
  - no Playwright or Cypress.
- **Only test-like assets:** `TESTING_GUIDE.md` (manual scenarios) and `research/pck_feedback/tests` (Python, research parser only; not run against production).
- **Testability blockers:**
  - `server/server.js` creates the Vertex client and calls `app.listen` at import time, and does not export `app` or its helpers.
  - The prompt builders and parsers in `src/utils/ai.js` (`makeProsePrompt`, `convertResponseToMessages`) are not exported.
  - Fixing this needs a **behaviour-preserving extraction** step (§2), which is the first code change I would allow.

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

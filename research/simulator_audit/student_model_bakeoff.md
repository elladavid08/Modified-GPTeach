# Model bakeoff before the 2.5 Flash-Lite retirement (fast screening)

Status: screening only, 2026-10-12, on committed **1.3.13** (`7d37615`), harness 1.3.2.
- No production change, no `SYSTEM_VERSION` bump, no SDK change, no prompt tuning per model.
- Synthetic data only; nothing written to Firestore.
- Motivation: `student_model_options.md` (`gemini-2.5-flash-lite` retires on Vertex AI on **2026-10-20**).
- This is **not** statistical proof: 12 conversations per arm.

## 1. Summary

| | A `gemini-2.5-flash-lite` (current) | B `gemini-3.1-flash-lite` | C `gemini-3.5-flash-lite` |
|---|---|---|---|
| technical validity | ✔ | ✔ | ✔ |
| **misconception carriers holding the misconception before the explanation** | 6 / 12 | **2 / 12** (8 reason themselves to the answer) | **8 / 12** |
| invented / mixed teacher attributions | 0 / 1 | 0 / 3 | 1 / 4 |
| **PCK feedback shown to the teacher** | 134 / 144 | 89 / 144 | **38 / 144** |
| PCK on "אוקיי" after a misconception (side-by-side, 2 calls) | feedback shown 2/2 | feedback shown 2/2 (rated problematic) | **identified but not shown, 0/2** |
| whole-turn latency p50 / p90 | 4.6 / 5.6 s | 3.6 / 4.2 s | 2.9 / 4.2 s |
| approx. cost, 12 conversations | $0.29 | $0.74 (2.5×) | $0.89 (3.0×) |

**Each Lite model has one serious regression, in a different agent:**
- **3.1 Flash-Lite as the student agent** removes the scenario misconception before teaching: premature correctness in 8 of 12 carriers.
- **3.5 Flash-Lite as the PCK agent** stops showing most feedback, including the core "you did not address the misconception" case.

**Recommendation:**
- Ship a **split configuration**: student = `gemini-3.5-flash-lite`; PCK (and summary) = `gemini-3.1-flash-lite`.
- Both on the `global` endpoint, with thinking `MINIMAL` and no temperature/topP.
- First run **one 12-conversation check of exactly this split**, plus a summary smoke check, before the versioned switch. The 3.1 PCK's lenient "improved" steering could push the 3.5 students toward early correctness, and that combination has not been tested.

## 2. Arms and configuration

All arms used the real PCK → student path and the same 1.3.13 prompts, personas, examples, duplicate guard and quote-cut telemetry. The local `server/server.js` was **unmodified**. Each arm ran its own server with an analysis-only preload (scratchpad `c28/model_arm.cjs`):

| setting | A (baseline) | B | C |
|---|---|---|---|
| model (student **and** PCK, as in production) | `gemini-2.5-flash-lite` | `gemini-3.1-flash-lite` | `gemini-3.5-flash-lite` |
| location / endpoint | `us-central1` (production) | `global` / `aiplatform.googleapis.com` (3.x is not served on `us-central1`: 404) | same as B |
| thinking | none sent (2.5 default) | `thinkingConfig: { thinkingLevel: "MINIMAL" }` | same (the 3.5 default is minimal; set explicitly) |
| temperature / topP | 0.7 / 1 (production) | **removed**, per the Vertex migration guide for 3.x | removed |
| maxOutputTokens / responseSchema | student 512, PCK 2000; production schemas | unchanged | unchanged |
| SDK | `@google-cloud/vertexai` 1.10.0 (unchanged) | same | same |

**Integrity:** every captured call ran on the intended model (A 289/289, B 288/288, C 288/288, by `modelVersion`).

**Harness:** Mode B, designed casts, 6 scenarios × 2 casts × 1 run = 12 conversations per arm. The three arms ran in parallel on separate local ports.

## 3. Smoke check (B and C, s2 cast 0, 12 PCK + 12 student calls each)

- All calls were valid JSON with `STOP`.
- **0 thinking tokens** (the output budget is intact).
- No failures or retries.
- Student p50: 1.6 s (B), 1.3 s (C); PCK p50: 2.5 s (B), 2.2 s (C).

## 4. Technical results (full runs)

| | A | B | C |
|---|---|---|---|
| student / PCK failures | 0 / 0 | 0 / 0 | 0 / 0 |
| invalid JSON or schema (all calls) | 0 | 0 | 0 |
| finish reasons | all `STOP` | all `STOP` | all `STOP` |
| thinking tokens (total) | 443 (2.5 occasionally thinks) | 0 | 0 |
| max attempts (student / PCK) | 2 / 1 | 1 / 1 | 1 / 1 |
| duplicate guard | 1 re-ask (resolved) | none | none |
| exact self-duplicates (final) | 1 (a short reply below the guard's 30-character minimum) | 0 | 0 |
| prompt-example copies / placeholder leaks / invalid names | 1 (WRONG example echo) / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| `quoteCutSuspected` | 1 | 0 | 0 |
| student latency p50 / p90 | 1.30 / 1.74 s | 1.33 / 1.66 s | 1.23 / 1.53 s |
| PCK latency p50 / p90 | 3.27 / 4.01 s | 2.28 / 2.80 s | 1.63 / 2.89 s |
| **whole turn** (PCK + student) p50 / p90 | 4.60 / 5.59 s | 3.57 / 4.23 s | 2.89 / 4.24 s |
| PCK output tokens (12 conversations) | 140k | 67k | 55k |
| approx. cost, 12 conversations (student + PCK) | $0.29 ($0.11 + $0.19) | $0.74 ($0.29 + $0.45) | $0.89 ($0.34 + $0.54) |

Cost uses third-party per-token prices: 2.5 FL $0.10 / $0.40; 3.1 FL $0.25 / $1.50; 3.5 FL $0.30 / $2.50 per 1M input / output tokens (`student_model_options.md` §5). Input tokens dominate: about 1.0M student and 1.3–1.4M PCK input tokens per 12 conversations.

## 5. Student behaviour (manual review)

### 5.1 Premature correctness and misconception expression

Each slot-A carrier's replies before the explanation (T1–T4) were classified by hand: holds the misconception, hedged/doubting, or already correct.

| | A | B | C |
|---|---:|---:|---:|
| holds the misconception | 6 | **2** | **8** |
| hedged / doubting | 4 | 2 | 1 |
| correct before teaching | 2 | **8** | 3 |
| students with any detected misconception claim | 7 | 12 | 10 |

- **B: the carrier "reasons aloud" to the answer before any teaching.** Examples:
  - "רגע, בוא נראה… לפי ההגדרה למלבן יש ארבע זוויות ישרות…";
  - "תמיד חשבתי שכן… אבל רגע, אם אני בודקת את הזוויות שלו…";
  - "חשבתי שהם צורות שונות. אבל אם אני בודקת את ההגדרה…".

  The misconception is often voiced at T1 and dissolved at T2 (s2, s3, s4, s6). That removes the teaching problem the scenario is built around.
- **C keeps the misconception in 8 of 12** (A: 6). Examples:
  - "ריבוע זה צורה אחרת לגמרי ממלבן, לא?";
  - "אם האלכסונים שווים ומאונכים אז זה בטוח ריבוע, לא?".

  C's carriers also question a bare acknowledgement realistically ("אז אמרת אוקיי… זה אומר שצדקתי?", "למה אמרת רק אוקיי?").

### 5.2 Persistence, resolution, loops, regressions

| | A | B | C |
|---|---:|---:|---:|
| regression candidates | 0 | 0 | 0 |
| persistence candidates | 2 | 3 | 0 |
| resolution candidates (students with a misconception) | 5 | 2 | 7 |
| repeated questions: unanswered / after the answer | 10 / 3 | 0 / 0 | 0 / 0 |
| semantic-repetition candidates | 16 | 0 | 10 |

- No genuine loops in any arm.
- C's 10 semantic candidates are progress, or restatements on an "אוקיי"/"נכון" probe.
- A's repeated questions are mostly unanswered ones, consistent with its constantly `more_confused` PCK (§6).

### 5.3 Teacher attributions (manual, against the full teacher history)

| | A | B | C |
|---|---:|---:|---:|
| references to the teacher ("אמרת", "המורה אמר…") | 8 | 14 | 25 |
| invented | 0 | 0 | 1 (s1 cast 1 T2: "אמרת שריבוע ומלבן הם צורות שונות") |
| mixed (question, hint or other content presented as the teacher's) | 1 | 3 | 4 (s2: "כמו שאמרת, צריך שהם יחצו זה את זה" before the teacher said it; s1: "במלבן אמרת שיש צלעות נגדיות שוות") |
| rate per reply | 0.4% | 1.0% | 2.0% |

C refers to the teacher three times as often as A. Most of these references are accurate (quoting the T5 explanation), but the error count is also the highest. The numbers are small; this is the same known limitation (`student_teacher_attribution_investigation.md`).

### 5.4 Style

| | A | B | C |
|---|---|---|---|
| replies per turn | 1.94 | 2.06 | 1.78 |
| mean reply length | 79 chars | **105 chars** | 83 chars |

- B replies are longer, more articulate and more "adult" (explicit reasoning, praise of peers: "רעיון מעולה הילה!").
- C is close to A in length and tone.
- No meta-comments, rule leakage or unusual output in the full runs. One C smoke reply commented on the teacher's "את או אתה" phrasing; it did not recur.

## 6. PCK behaviour

### 6.1 In-run distribution (each arm's PCK steered its own students)

| | A | B | C |
|---|---|---|---|
| quality problematic / neutral / positive | **95** / 21 / 28 | 2 / 54 / 88 | **0** / 96 / 48 |
| understanding more_confused / confused / same / improved / misconception_reinforced | **71** / 11 / 26 / 28 / 8 | 0 / 0 / 37 / **105** / 2 | 0 / 1 / 84 / 59 / 0 |
| feedback shown (`should_provide_feedback`) | 134 | 89 | **38** |

**By teacher move:**
- **A** rates nearly every move problematic/`more_confused`, including the correct T5 explanation (6 of 11) and lesson closings. This was also the case in the 1.3.12 baseline (58% problematic).
- **B** rates **every direct and check question positive/`improved`** (12/12 each). A question alone rarely improves understanding, so this is lenient, and it steers students toward early correctness (§5.1).
- **C** is the most discriminating: explanations positive/`improved`, probes neutral/`same`, questions mixed.

### 6.2 Side-by-side on identical contexts (6 contexts from the A run, 2 calls per model, empty feedback history)

| context | A | B | C |
|---|---|---|---|
| **"אוקיי" after תמר's misconception (s2 T3)** | neutral/same, **shown**: "הוחמצה הזדמנות לזיהוי השגיאה… יכולת לומר…" | problematic/misconception_reinforced, **shown**, same message type | neutral/same, `missed: error-identification`, **`should_provide_feedback: false`, empty feedback** (2/2) |
| explanation (s1 T5) | positive/improved, shown | positive/improved, shown | positive/improved, shown |
| hint replacing "נכון" (s4 T6) | positive, shown | positive, shown | positive, shown |
| counterexample drawing (s5 T8) | 1× problematic, 1× positive | positive, shown | positive, shown |
| content question (s3 T10) | positive, shown | positive, shown | **neutral, not shown** (2/2) |
| closing (s6 T12) | positive, shown (generous) | neutral, not shown | positive, not shown |

**Reading:**
- **2.5's in-run harshness is mostly sticky feedback history.** With an empty history, its judgments are reasonable. In the runs, previous negative analyses carried forward (the last 3 analyses are passed back to PCK).
- **The 3.x PCK feedback texts are shorter but on target.**
- **C's PCK regression is in the *show* decision.** C diagnoses the missed opportunity but does not surface it. The client shows feedback only when `should_provide_feedback` is true (`src/pages/Chat.jsx:273,282`), so under C a trainee would see feedback on about 26% of turns (vs about 93% today), and would miss exactly the misconception-handling feedback the simulator exists to give.
- **B's PCK shows that feedback**, but is lenient on questions.

## 7. Answers

1. **Best Lite migration candidate:** **`gemini-3.5-flash-lite` for the student agent** (best misconception preservation, natural length, fastest), and **`gemini-3.1-flash-lite` for PCK and the summary**. Neither model is safe as the single model for both agents:
   - 3.1 as student → premature-correctness regression;
   - 3.5 as PCK → feedback-visibility regression.
2. **Serious behavioural regressions:** yes, one per model.
   - **B student:** 8/12 carriers correct before teaching.
   - **C PCK:** feedback shown on 38/144 turns, and the core missed-misconception feedback suppressed.
   - Minor for C: attribution errors 5 vs 1 (small numbers).
3. **PCK behaviour changes materially** with both 3.x models: far fewer "problematic" judgments, no sticky `more_confused`, and different show decisions. B is the closest to useful PCK behaviour, though lenient on questions. C under-shows.
4. **Latency and cost:**
   - Both 3.x models are **faster**: whole turn p50 3.6 s (B) and 2.9 s (C), against 4.6 s; PCK p50 2.3 s and 1.6 s, against 3.3 s.
   - They cost about **2.5× (B) and 3× (C)** per conversation, about $0.06–0.07 against $0.025.
   - The split (C student + B PCK) is about $0.79 per 12 conversations, about 2.7×, with an expected whole-turn p50 of about 3.5 s.
5. **Configuration to ship (pending the split check):**

   | | student (`/api/generate`) | PCK (`/api/pck-feedback`) and summary (`/api/pck-summary`) |
   |---|---|---|
   | model | `gemini-3.5-flash-lite` | `gemini-3.1-flash-lite` |
   | location / endpoint | `global` / `aiplatform.googleapis.com` | same |
   | thinking | `thinkingConfig: { thinkingLevel: "MINIMAL" }` | same |
   | temperature / topP | removed | removed |
   | maxOutputTokens / schema | 512 / unchanged | 2000 (observed max 660) / unchanged; summary 2048 |
   | SDK | unchanged for now (`@google-cloud/vertexai` with the `apiEndpoint` override); migrate to `@google/genai` later | same |

   The completion and test endpoints can follow the PCK model. Code-wise this means two model constants instead of one `MODEL_ID`, plus the endpoint and generation-config changes.
6. **Before the versioned switch:** one more bounded check, not a large head-to-head.
   - **Split arm:** 12 Mode B conversations of C-student + B-PCK. Verify that premature correctness stays near C's 3/12, and that feedback visibility and misconception feedback match B.
   - **Summary smoke check:** `/api/pck-summary` on 3.1 Flash-Lite, which the harness does not exercise.
   - This takes about an hour. If the split passes, proceed to the versioned switch (target: deployed by 2026-10-16, leaving margin before 2026-10-20).
   - **If it fails:** fall back to **B for both agents** (the PCK behaviour is acceptable; the student premature correctness is a known, documented regression to address afterwards), rather than C for both. A teacher-facing PCK that hides misconception feedback is the worse failure for this product.
   - 3.8 Flash was not run: neither Lite candidate is unsuitable in both roles.

## 8. Limitations

- **Sample:** 12 conversations per arm and one run; manual classification by one reviewer.
- **PCK side-by-side:** 6 contexts × 2 calls, with an empty feedback history, which differs from in-run conditions.
- **Arms are not separable by agent:** each arm's PCK steered its own students, so student differences include PCK steering differences. The split arm is needed for exactly this reason.
- **Prices** are third-party and approximate.
- **Analysis files:** scratchpad `c28/` (`model_arm.cjs`, `bakeoff_analyze.py`, `bakeoff_summary.json`, `usage-*.jsonl`, `pck_side.bench.js`, `pck_side.json`).
- **Runs** (git-ignored): `replay_harness/results/bakeoff-{A-2.5fl,B-3.1fl,C-3.5fl}`, plus `bakeoff-smoke-*`.

---

## 9. Split-model validation (student 3.5 Flash-Lite + PCK/summary 3.1 Flash-Lite), 2026-10-12

> **Separate from §1–§8.** Those arms used one model for both agents. This arm (**D**) tests the configuration recommended in §7. Same harness (1.3.2, Mode B, designed casts, 6 scenarios × 2 casts = 12 conversations), same 1.3.13 production logic, synthetic data only, no Firestore. No production change and no `SYSTEM_VERSION` bump.

### 9.1 Configuration

The analysis-only preload is scratchpad `c29/model_split.cjs`, loaded into the **unmodified** server. Every `generateContent` call is routed by agent, detected from its response schema:

| agent | how detected | model | endpoint | thinking | sampling | output limit / schema |
|---|---|---|---|---|---|---|
| student (`/api/generate`) | `responses` schema | `gemini-3.5-flash-lite` | `global` / `aiplatform.googleapis.com` | `thinkingLevel: MINIMAL` | temperature and topP removed | 512 / unchanged |
| PCK (`/api/pck-feedback`) | `pedagogical_quality` schema | `gemini-3.1-flash-lite` | same | same | removed | 2000 / unchanged |
| summary (`/api/pck-summary`) and other endpoints | no schema | `gemini-3.1-flash-lite` | same | same | removed (was 0.7 / 0.95) | 2048 / text |

Each call keeps the original model instance's request options (timeouts). A one-conversation smoke check confirmed the routing: 12 PCK calls on 3.1, 12 student calls on 3.5, all `STOP`, valid JSON, 0 thinking tokens.

### 9.2 Results (12 conversations)

**Technical:**
- **Calls:** 144 PCK calls (all on 3.1, valid, `STOP`) and 145 student calls (all on 3.5).
- **Failures:** 0 student, 0 PCK.
- **One student attempt** hit `MAX_TOKENS` with invalid JSON: a degenerate output (496 tokens, 569 characters), not the quote-padding shape (`quoteCutPaddedAttempts = 0`). The existing policy recovered it on attempt 2. The maximum was 2 attempts.
- **Clean otherwise:**
  - duplicate guard: no re-asks (144 × `none`); 0 exact duplicates;
  - 0 prompt-example copies, 0 placeholder leaks, 0 invalid names, 0 suspected quote cuts;
  - 0 thinking tokens.

**Latency:**

| | student p50 / p90 | PCK p50 / p90 | whole turn p50 / p90 |
|---|---|---|---|
| A (2.5, today) | 1.30 / 1.74 s | 3.27 / 4.01 s | 4.60 / 5.59 s |
| **D (split)** | **1.26 / 1.55 s** | **2.49 / 3.04 s** | **3.77 / 4.50 s** |

**Cost:** about $0.79 per 12 conversations: student $0.34 + PCK $0.45. That is about 2.7× today, about $0.066 per conversation (third-party prices).

**Student behaviour** (carrier stance before the explanation, classified manually):

| | A 2.5 | B 3.1 | C 3.5 | **D split** |
|---|---:|---:|---:|---:|
| carrier holds the misconception | 6 | 2 | 8 | **6** |
| hedged / doubting | 4 | 2 | 1 | 1 |
| correct before teaching | 2 | 8 | 3 | **5** |
| regression candidates | 0 | 0 | 0 | **0** |
| persistence / resolution candidates (ledger) | 2 / 5 | 3 / 2 | 0 / 7 | **1 / 6** |
| repeated questions (unanswered / after answer) | 10 / 3 | 0 / 0 | 0 / 0 | **0 / 0** |
| semantic-repetition candidates | 16 | 0 | 10 | **4** (restatements, no loops) |
| replies per turn / mean length | 1.94 / 79 | 2.06 / 105 | 1.78 / 83 | **1.78 / 82** |

- **Does 3.1's lenient `improved` push the 3.5 students toward early correctness?** Somewhat.
  - The 3.1 PCK rated the T2 direct question `improved` in 10 of 12 conversations, as in B.
  - Two more carriers resolved before teaching than with 3.5 alone (s2 cast 0 at T2–T4; s4 cast 0).
  - The effect is limited: misconception persistence equals today's production (6/12), and is far better than 3.1 as the student (2/12).
- **Examples of preserved misconceptions:**
  - "נראה לי שלא, כי מלבן וריבוע אלה שתי צורות שונות לגמרי";
  - "נראה לי שזה מספיק בשביל שזה יהיה מעוין";
  - "שתי התכונות האלה ביחד סוגרות את כל הצורות";
  - "דלתון ומעוין זה נראה לי צורות לגמרי שונות".
- Carriers question a bare acknowledgement realistically ("אז אמרת אוקיי, זה אומר שצדקתי והם שונים?").

**Teacher attributions** (35 candidates, manual):
- 0 invented;
- 4–5 mixed: a question premise as a statement (s1 cast 0 T8), the student's own point credited to the teacher (s5 cast 0 T7), explanation content stretched (s3 cast 1 T7, s1 cast 1 T8);
- the rest accurate, prior-lesson references, or questions about "אוקיי".
- That is about 1.6% of replies (A 0.4%, B 1.0%, C 2.0%): the known limitation, with no new failure mode.

**PCK:**

| | A | B | C | **D** |
|---|---|---|---|---|
| quality problematic / neutral / positive | 95 / 21 / 28 | 2 / 54 / 88 | 0 / 96 / 48 | **2 / 54 / 88** |
| understanding same / improved / other | 26 / 28 / 90 | 37 / 105 / 2 | 84 / 59 / 1 | **49 / 94 / 1** |
| feedback shown | 134 (93%) | 89 (62%) | 38 (26%) | **86 (60%)** |
| **bare "אוקיי"/"יפה" right after a detected misconception claim: feedback shown** | 2/2 | 1/2 | 0/6 | **1/2** |

- **By move**, D's PCK behaves like B's:
  - explanations, check questions and content questions: positive/`improved`, shown;
  - probes: mostly neutral/`same`, not shown;
  - closings: neutral, not shown.
- **Core missed-misconception case, all 3.1 evidence pooled** (B run 1/2, D run 1/2, §6.2 side-by-side 2/2): **4 of 6** shown, against 4 of 4 for 2.5 and 0 of 8 for 3.5.

### 9.3 Summary smoke check (`/api/pck-summary` on 3.1 Flash-Lite)

**Input:** four completed split-run conversations (s1 cast 0, s2 cast 1, s4 cast 0, s6 cast 1). The client's `conversationLogger.toJSON()` shape was rebuilt with `scenario`, `stats` and `turns`. `pckFeedback` was set only on turns where PCK chose to show feedback; the PCK outputs were captured in order and aligned to all 144 turns, and every shown flag matched.

| conversation | status | latency | output tokens / chars | finishReason | shown-feedback turns |
|---|---|---:|---|---|---|
| s1 cast 0 | 200 | 4.5 s | 729 / 1,590 | `STOP` | 2, 3, 5, 6, 7, 10 |
| s2 cast 1 | 200 | 3.6 s | 719 / 1,550 | `STOP` | 2, 4–11 |
| s4 cast 0 | 200 | 3.9 s | 821 / 1,709 | `STOP` | 2, 3, 4, 5, 7, 10, 11 |
| s6 cast 1 | 200 | 3.6 s | 704 / 1,509 | `STOP` | 2, 3, 4, 5, 7, 8, 10, 11 |

- **Technical:** all generated; no truncation (at most 821 of 2,048 tokens); 0 thinking tokens; the expected structure (general summary plus tips) and Hebrew.
- **Feedback moments represented correctly:**
  - s1's one negative moment (T3: "אוקיי" left the misconception unaddressed) becomes the main improvement point, with the same skill (`error-identification`);
  - s4's turn references (2, 4, 5, 7, 10, 11) all match turns where feedback was shown.
- **No contradiction** with the shown feedback. One summary (s6) adds a mild critique of T2 that the displayed T2 feedback did not contain; the summary also reads the full conversation, so this is compatible.
- **Minor issues:**
  - the teacher's grammatical gender varies between and within summaries (feminine "השתמשי" vs masculine "נסה");
  - one summary labels T10 as "error leveraging" where the shown feedback said "adapted response";
  - one generic tip (GeoGebra).

  Summaries were not compared with 2.5 summaries (this was a smoke check).
- **Note:** the old summary prompt was never written for a 3.x model, and temperature 0.7 / topP 0.95 were removed. No problems were seen.

### 9.4 Decision

1. **Safe enough to ship before the 2.5 retirement:** **yes.**
   - No technical failures, better latency, valid structured output, summaries working.
   - Misconception preservation at today's level.
   - The two known risks are bounded:
     - (a) the PCK shows feedback on about 60% of turns (vs 93% today), and in about 1 of 3 core missed-misconception moments it stays silent;
     - (b) mixed teacher attributions are about 1.6% of replies (vs 0.4%).

   Both are better than either single-model alternative, and staying on 2.5 is not possible after 2026-10-20.
2. **Does 3.5 remain the better student model under 3.1 PCK?** Yes: 6/12 carriers hold the misconception (3.1 student: 2/12). The 3.1 PCK's `improved` steering costs about 2 carriers compared with 3.5 alone, but persistence stays equal to production.
3. **Does 3.1 PCK show the important feedback often enough?** Acceptably for the migration, but less than today.
   - It shows feedback on every explanation and most content and check questions.
   - It catches the core missed-misconception case in about 2 of 3 instances (4/6), against 2.5's 4/4 (small numbers).
   - **This is the first post-migration item to fix.** For example: show feedback whenever `missed_opportunities` contains `error-identification` after a student misconception, with tests. Evaluate it on these same contexts.
4. **Is 3.1 safe for summaries?** Yes, as a smoke check: 4/4 complete, consistent with the displayed feedback, no truncation, 3.6–4.5 s.
5. **Configuration to ship:**

   | | student `/api/generate` | PCK `/api/pck-feedback` | summary `/api/pck-summary`, completion, test |
   |---|---|---|---|
   | model | `gemini-3.5-flash-lite` | `gemini-3.1-flash-lite` | `gemini-3.1-flash-lite` |
   | location / endpoint | `global` / `apiEndpoint: "aiplatform.googleapis.com"` | same | same |
   | thinking | `thinkingConfig: { thinkingLevel: "MINIMAL" }` | same | same |
   | temperature / topP | removed | removed | removed |
   | maxOutputTokens / schema | 512 / unchanged | 2000 / unchanged | 2048 / text (completion: as requested) |

   **Code-level, for the versioned switch:**
   - two model constants (student / PCK-and-other) instead of one `MODEL_ID`;
   - `VertexAI` initialized with `location: 'global'` and the `apiEndpoint` override;
   - generation configs updated;
   - telemetry `model` reported per agent, and the health endpoint and startup log reporting both models;
   - tests for routing (which endpoint uses which model), config (thinking set, no sampling parameters), and that telemetry reports the right model.
   - The SDK stays `@google-cloud/vertexai` for now; migrating to `@google/genai` is a separate follow-up.
6. **Further benchmark before the versioned migration:** **none required.** Proceed to the versioned switch (target: deployed by 2026-10-16). After deployment:
   - **(a)** rerun the 24-conversation Mode B baseline on the shipped configuration as the new reference, because earlier findings (premature correctness, attribution, quote cuts) were measured on 2.5;
   - **(b)** watch PCK feedback-show rates and `quoteCutSuspected` in production telemetry;
   - **(c)** fix the PCK missed-misconception visibility.

**Analysis files:** scratchpad `c29/`: `model_split.cjs`, `usage-D.jsonl`, `pck-D.jsonl`, `summary_smoke.mjs`, `summary_smoke.json`, `usage-D-summary.jsonl`. **Run** (git-ignored): `replay_harness/results/bakeoff-D-split`, plus `bakeoff-D-split-smoke`.

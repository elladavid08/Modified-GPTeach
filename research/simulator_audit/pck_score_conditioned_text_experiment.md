# X2: score-conditioned per-skill PCK text, experiment

Status: experiment only, 2026-10-13, on committed **1.4.3** (`93ff57b`). PCK model `gemini-3.1-flash-lite`, `global` endpoint, thinking `MINIMAL` (unchanged).
- No production, UI, schema or `SYSTEM_VERSION` change.
- Synthetic data only: frozen contexts rebuilt from the git-ignored 1.4.0 / 1.4.1 Mode B runs, plus new synthetic teacher moves. Nothing was written to Firestore.
- Plan: `pck_feedback_v2_plan.md` (X2: W4.1–W4.3). Previous step: `pck_row_text_contract_experiment.md` (X1). Display contract: invariant B28.

## Summary

- **The text goal is not reachable by prompt alone under the current schema.**
  - With `PCK_RESPONSE_SCHEMA` unchanged, 3.1 emits relevant `skills_assessment` entries as `{skill_id, is_relevant, score, what_could_be_better}`: in schema order, skipping the optional `evidence` key.
  - Arm B told the model to fill `evidence` for score 1 and 2. Across 1,258 outputs, **0 of 1,076** relevant entries contained an `evidence` key (A: 1 of 1,039).
  - So score-2 rows still have no own evidence, and **score-1 rows still have no positive part**: 0 of 56 rows in B, 0 of 75 in A. 3.1 also never lists a score-1 skill in `demonstrated_skills` (0 of 167 across both arms), so the 1.4.3 fallback cannot supply it either.
  - What arm B did change: score-2 `what_could_be_better` is now empty (86 → 0 rows, mostly misplaced praise that B28 already hides), and score-0 texts are about 40% longer.
  - Rows with displayed text went *down*: 88.2% → 86.2%.
- **The block alone changes the decisions.** Two runs, 834 calls per arm on the controls and explanations:
  - correct-answer and genuine-question controls shown **6/456 → 50/456** (p = 3 × 10⁻¹⁰);
  - a hedged correct answer + "אוקיי" is criticised as a missed error (5/24 → 22/24);
  - two bare "?" turns are praised with evidence borrowed from earlier turns (1/24 → 14/24, 0/24 → 11/24);
  - one good explanation loses its feedback (18/18 → 8/18);
  - score 1 drifts toward 2: error-leveraging 1 → 2 share, p = 0.02; score-1 rows on the Mode B score-1 turns 52 → 35.
- **This answers X1's open question.** X1 B′ (block + required fields) shifted the same controls the same way. The shift comes from the **prompt block itself**, not only from the schema change.
- **Unchanged:** the 1.4.1 missed-misconception behaviour (108/108 target calls shown with error-identification 0 in both arms), validity (0 failures, 0 retries) and latency (p50 −1% to +8%).
- **Mode B was not run**: the frozen-context gate failed, as the brief specifies.
- **Conclusion: X2 cannot be isolated safely in one-stage prompting.**
  - Text instructions that reach the model in the same call materially change who gets feedback and the scores.
  - Under the current schema they cannot even populate `evidence`.
  - A two-stage design is recommended (§8).

## 1. Arms and the exact prompt change

| arm | prompt | schema | everything else |
|---|---|---|---|
| **A** | committed 1.4.3, unchanged (32,820 chars median) | unchanged | unchanged |
| **B** | + the block below (+677 chars, +176 input tokens, +1.8%) | **unchanged** (asserted per call) | unchanged |

The block is inserted once, immediately before `## Deriving demonstrated_skills and missed_opportunities`. That is right after "STEP 4: Ground every evidence claim in the teacher's LAST message", the same position as X1.

```
## Per-skill text fields
For every skill in skills_assessment with is_relevant: true, write the text inside that skill's own entry (not only in demonstrated_skills / missed_opportunities), addressed to the teacher in second person:
- score 2 → "evidence": what you did successfully in your last message. "what_could_be_better": "" (no recommendation).
- score 1 → "evidence": what you did correctly in your last message, AND "what_could_be_better": what is still missing and how to improve.
- score 0 → "what_could_be_better": what was missing and one concrete better move. "evidence": "".
For a skill with is_relevant: false, set "evidence" and "what_could_be_better" to "".
```

**Differences from the X1 block:**
- the heading drops "(these are what the teacher sees)";
- score 1 says "what you did correctly in your last message" (was "what you did well"), to match the X2 semantics.

**Not changed:** rubric, examples, relevance gates (Gate 0–2), `should_provide_feedback`, the B27 guard, the derivation of `demonstrated_skills` / `missed_opportunities`, the schema (no new or required fields), model, configuration and thinking level.

## 2. Contexts and method

**Pipeline:**
- Each context was rebuilt exactly as the harness built it (history, drawings, PCK feedback history, scenario).
- It was sent through the real client `getPCKFeedback` to a local, unmodified 1.4.3 server, one per arm.
- An analysis-only preload inserts the block for arm B and records content-free call data. Arm A is untouched.

| set | contexts | calls per arm | what |
|---|---:|---:|---|
| missed-misconception targets (silent / shown in 1.4.0) | 18 | 108 | the 1.4.1 cases |
| controls: correct answer + probe / genuine question + probe / greeting, closing, procedural | 27 | 324 | must stay hidden |
| explanations (T5) | 6 | 54 | must stay shown |
| **every score-1 turn in the saved 1.4.0 and 1.4.1 Mode B runs** | 39 | 234 | score-1 text |
| representative score-2 (2 per scenario) / score-0 turns, 1.4.1 Mode B, seeded sample | 12 / 8 | 60 | score-2 / score-0 text |
| **targeted partial moves** | 25 | 100 | intended to elicit score 1 |
| **total** | 135 | **880** | |
| replication: all control + explanation contexts | 33 | 378 | decision drift |

**Targeted partial moves:**
- The T3 teacher turn of five real misconception prefixes (scenarios 1, 2, 3, 5, 6) is replaced by one of five moves:
  - a vague flag ("…, אני לא בטוחה שזה מדויק. בואו נמשיך.");
  - direct telling ("…, זה לא נכון. <correct fact>.");
  - a generic "why" ("…, למה את/ה חושב/ת כך?");
  - passing to the class ("מישהו חושב אחרת מ…?");
  - a partial characterization followed by telling ("…, נראה לי ש… מסתמך/ת <basis>. <fact>.").
- No gold decision was set by hand: the model's own score is evaluated.
- They elicited few score-1 rows (6 of about 146 in each arm). 3.1 mostly scores these moves 2.

**Repeats and comparison:**
- Repeats: 6 for targets and score-1 turns, 12 for controls, 9 for explanations, 3 for representative turns, 4 for partial moves.
- With the replication, each control has 24 calls per arm and each explanation 18.
- Arms ran concurrently against two local servers; same contexts, same order.

## 3. Validity, retries, latency

| | A | B |
|---|---:|---:|
| requests / final failures (main + replication) | 1,258 / 0 | 1,258 / 0 |
| requests needing 2 attempts | 0 | 0 |
| model calls, all `STOP` | 1,258 | 1,258 |
| PCK model latency p50 / p90, main | 2.48 / 3.03 s | 2.45 / 3.10 s (−1% / +2%) |
| PCK model latency p50 / p90, replication | 1.76 / 2.86 s | 1.90 / 2.87 s (+8% / 0%) |
| output tokens p50 / max (main) | 568 / 913 | 573 / 928 |

No validity or latency cost. The ≤15% latency guardrail holds.

## 4. Text by score

**Raw fields, relevant rows of shown feedback (main run):**

| | A | B | X2 target |
|---|---:|---:|---|
| score-2 rows | 595 | 623 | — |
| score 2: `evidence` present | **0** | **0** | all |
| score 2: `what_could_be_better` present | 86 (63 open with praise) | **0** | none |
| score-1 rows | 75 | 56 | — |
| score 1: `evidence` present / both parts | **0 / 0** | **0 / 0** | all |
| score 1: `what_could_be_better` present | 75 | 56 | all |
| score 1: positive text folded into `what_could_be_better` | 0 | 2 | — |
| score-0 rows: `evidence` empty and `what_could_be_better` present | 142 / 143 (99.3%) | 154 / 154 (100%) | all |
| score 0: concrete better move, heuristic (quote, question or named move) | 84.6% | 87.0% | — |
| score 0: concrete better move, hand read (12 per arm) | about 6 / 12 | about 6 / 12 | — |
| irrelevant rows: both fields empty | 485 / 485 | 580 / 580 | all |
| median length: score-0 / score-1 improvement (chars) | 116 / 112 | **162** / 124 | — |

**Why `evidence` stays empty:** the schema lists `evidence` before `what_could_be_better`, and both are optional. Under constrained decoding 3.1 skips `evidence` and keeps `what_could_be_better` (often as `""`). Across all 1,258 outputs per arm, the key appeared once in A and never in B. A prompt instruction does not change this. X1 showed that making the field **required** does populate it (B′: 100%).

**Displayed text** (the committed 1.4.3 view-model, B28, applied to the same outputs):

| | A | B |
|---|---:|---:|
| displayed rows with text | 717 / 813 (88.2%) | 718 / 833 (86.2%) |
| score-2 rows with positive text (all from `demonstrated_skills`) | 499 / 595 (83.9%) | 508 / 623 (81.5%) |
| score-1 rows with both parts | 0 / 75 | 0 / 56 |

**Score-1 positive part:** no score-1 skill appears in `demonstrated_skills` (0 of 90 rows in A, 0 of 77 in B, main + replication). This holds even though the prompt's derivation rule says "score >= 1". So no current field carries it, in either arm.

## 5. Decisions, relevance, scores

**Missed-misconception targets (1.4.1 behaviour):**

| | A | B |
|---|---:|---:|
| formerly silent (48) / formerly shown (60): shown | 48 / 60 | 48 / 60 |
| target calls with an error-identification 0 row | 108 / 108 | 108 / 108 |

**Controls and explanations** (main + replication; shown / calls):

| group | A | B | p (Fisher) |
|---|---:|---:|---:|
| correct answer + bare probe | 6 / 336 | **39 / 336** | 2 × 10⁻⁷ |
| genuine question + bare probe | 0 / 120 | **11 / 120** | 8 × 10⁻⁴ |
| explanation | 101 / 108 | 93 / 108 | 0.11 |
| greeting / closing / procedural | 33 / 192 | 35 / 192 | 0.89 |

| context (teacher message) | A | B | what B shows |
|---|---:|---:|---|
| r1 s4 cast 0 T3, "אוקיי" after a student's *correct* doubt | 5/24 | **22/24** | missed error-identification (score 0) on a correct contribution |
| r2 s5 cast 0 T9, "?" | 1/24 | **14/24** | error-leveraging 2: "הצגת דוגמה נגדית…" (the counterexample was an earlier turn) |
| r1 s1 cast 0 T9, "?" | 0/24 | **11/24** | APR 2 quoting "האם כל מלבן הוא ריבוע?" from an earlier teacher turn |
| r2 s4 cast 1 T5, explanation | 18/18 | **8/18** | feedback lost on a good explanation |
| r2 s3 cast 0 T12, "יפה מאוד." | 7/24 | 15/24 | error-leveraging 2 for the whole lesson |

The same five contexts moved in X1 B′.

**Scores** (relevant rows of shown feedback, main run):
- **Error-leveraging:** 1 → 2 (A: EL1 61 / EL2 63; B: EL1 45 / EL2 84; p = 0.02).
- **Mode B score-1 turns:** score-1 rows 52 → 35 of about 370.
- **Totals:** score 0 143 → 154, score 1 75 → 56, score 2 595 → 623.
- **Error-characterization 2:** 31 → 43.
- Rows per shown feedback are similar ({1: 272, 2: 269} vs {1: 297, 2: 262}).
- 34 of 135 contexts have a different modal (skill:score) outcome. Most are 2 vs 1 on error-leveraging, which is also noisy within an arm.

**Conclusion:** decisions, relevance and score distribution are **not** effectively unchanged. The shifts are in the direction X1 B′ found:
- false errors and praise on correct answers and bare probes;
- fewer feedbacks on some good explanations;
- less score 1.

No deterministic rule was added to compensate, as instructed.

## 6. Grounding and fabrication review

One reviewer, synthetic data.
- **Heuristic flags:** a quoted span found only in an earlier teacher turn, or a drawing mentioned when the current turn has none. A: 6, B: 14.
- **All flags and all B rows on controls were read.** B's new rows are the main source of borrowed evidence:
  - on "?": "השתמשת בשרטוט של דלתון כדוגמה נגדית…"; "השתמשת בשאלה מכוונת ומדויקת ('האם כל מלבן הוא ריבוע?')…" (both from earlier turns);
  - on "יפה מאוד.": "מינפת את בלבול התלמידים… והפכת אותו לדיון מעמיק…";
  - on "אוקיי" after a correct doubt (score 0): "לא התייחסת לטענת התלמיד שמערערת את ההכללה השגויה…". One B text on another correct-answer control even says "(או במקרה זה, אישור תובנה נכונה וחשובה)" while scoring a missed error.
- **On genuine moves**, both arms' texts are grounded in the current message. Score-0 texts name the student and the claim; about half quote a better move in both arms.
- **Score-0 texts that open with "זיהית…" against their own score 0:** A 8, B 10. Same rate.
- **History-borrowed text appears where the decision is a false positive.** The model writes a justification for a decision the current message does not support. This is the X1 finding, now without any schema change.

## 7. Mode B

**Not run.** The brief makes Mode B conditional on the frozen-context gate, which failed on decisions (§5) and on the text goal (§4).

## 8. Is X2 safe to implement independently? What would be needed

**No.** In one-stage prompting:
1. score-conditioned text instructions change the feedback decision and the scores;
2. under the current schema they do not populate `evidence`, so the main text goal (the score-1 positive part) is not met.

**Needed: separate the decision from the wording.**
- **Stage 1 (unchanged).** The current 1.4.3 PCK call stays byte-identical.
  - It alone decides `should_provide_feedback`, relevance, scores and student steering (B1).
  - Decision drift is then zero by construction, and the 1.4.1 behaviour is preserved.
- **Stage 2 (new, text only).**
  - **When:** only when stage 1 is shown.
  - **Input:** the teacher's *current* message, the last student turn(s) and the fixed list of shown rows (skill, score).
  - **Output:** a small schema with **required** per-row text whose shape depends on the score (score 2: positive; score 1: positive + improvement; score 0: improvement), and nothing else.
  - **Validation:** the server checks that the rows and scores equal stage 1 exactly; otherwise it falls back to the 1.4.3 display.
  - **Grounding:** the prompt receives only the current message, which removes the history-borrowing path. A row may come back empty when nothing in the message supports it (do not force text, see §6). The empty-row count is a content-free signal of a possible false-positive decision (A17-style counter).
  - **Latency:** it can run concurrently with the student call, which only needs stage 1. That adds latency to the sidebar, not to the student turn. Measure it.
- **Contract and versioning:**
  - a new additive stored field for the display text (e.g. a per-row `display_text`), so stored decisions stay comparable;
  - B23-style validation for stage 2;
  - an extension of the display contract (B28);
  - a `SYSTEM_VERSION` bump, because the teacher-visible text changes.
- **Not recommended:**
  - making `evidence` / `what_could_be_better` required in the one-stage schema (X1 B′: the text is fixed but decisions shift);
  - reordering schema properties (still one stage; untested, the same coupling risk);
  - deterministic rules that undo decision changes (excluded by the brief).
- **Until then:** 1.4.3 (B28) stays the display baseline.
  - Score-2 rows get positive text from `demonstrated_skills` (about 84% of score-2 rows here).
  - Score-1 rows show the improvement only. This is honest, and nothing is invented.

**The next experiment, if pursued:** a stage-2 prototype on these same 135 contexts.
- **Decisions:** identical by construction, so no drift check is needed beyond verifying the stage-1 call is unchanged.
- **Measures:**
  - text completeness by score;
  - grounding to the current message (fabrication rate on the known false-positive controls in particular);
  - added sidebar latency.
- **Then** one Mode B A/B.

## 9. Limitations

- **Contexts:** 135 frozen contexts from scripted Mode B conversations and 25 synthetic partial moves.
- **Score 1 is still thin:**
  - the partial moves elicited few score-1 rows, because 3.1 rates them 2;
  - most score-1 rows are error-leveraging on Mode B turns.
- **Review:** one reviewer for grounding and concreteness. The concreteness heuristic overstates concreteness in both arms equally (hand read about 50% vs heuristic 85–87%).
- **The mechanism of the decision shift is measured, not explained.** A length-matched neutral-text arm was not run, so content-specific and generic prompt sensitivity cannot be separated. These controls are known to be prompt-sensitive: the 1.4.1 Gate 0 clarification also raised control feedback (19/162 → 36/162 before the B27 guard, `pck_missed_misconception_experiment.md`). The guard does not cover the new B rows: it passes the missed-identification shape and does not apply to a bare "?". This supports keeping the decision prompt frozen when changing the wording (§8).
- **Live model, no seed:** the main run and the replication agree in direction and size.

**Files** (scratchpad `c42/`): `x2_block.txt`, `x2_arm.cjs` (arm preload; schema unchanged, asserted), `build_contexts.py`, `contexts.json`, `bench/x2_ab.bench.js`, `jest.bench.json`, `results-{A,B}{,-rep,-smoke}.jsonl`, `calls-{A,B}{,-rep}.jsonl`, `analyze.mjs`, `analysis.txt`, `controls_combined.txt`, `scores.txt`, `samples.json`.

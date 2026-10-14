# X9: two-stage PCK scoring prototype, experiment

Status: experiment only, 2026-10-13, on committed **1.4.3** (production code unchanged). Models: `gemini-3.1-flash-lite`, thinking MINIMAL for both stages.
- No production, `SYSTEM_VERSION`, stored-contract or Stage-1 change.
- **Expert gold:** the local, git-ignored B200 set (`pck_eval/local_b200/`).
- Aggregates and paraphrases only in this file.
- **Model calls:** Gemini on Vertex AI (pilot service account) via an unmodified local server with an analysis-only preload. No Firestore writes.

## Summary

- **Architecture works mechanically:**
  - Stage 1 (1.4.3, untouched) decides visibility, relevance, skills and steering. Stage 2 rescored exactly Stage 1's relevant skills on 743 shown feedbacks (1,486 Stage-2 calls);
  - **0 invalid outputs, 0 mismatches, 0 fallbacks, 0 retries, 0 safety violations**;
  - Stage 2's two independent runs agree on 92% of rows.
- **APR improves clearly** (all expert tiers pooled):
  - exact 126/329 (38%) → **171/329 (52%)**;
  - mean signed difference **+0.59 → +0.05**;
  - **APR 1 is now used:** expert-1 rows scored 1 rose from 0 to 69 of 184 (agreed 31/70, A1-only 29/68, consensus 9/46).
  - Agreed items: exact 43 → 66 / 115, κ_w 0.29 → 0.46. A1-only: 20 → 52 / 104, κ_w 0.00 → 0.43.
  - **But on consensus it over-corrects:** exact 63 → 53 / 110 (κ_w 0.08 → 0.28), with new under-scoring (expert 2 → 1 in 16 rows, expert 1 → 0 in 14).
- **Error identification regresses:** exact 58/85 → 48/85, signed +0.15 → −0.46 (expert 2 → 0 in 12 rows). Stage 2 applies the rubric's "explicitly states the error" literally; the experts give 2 when the teacher clearly notices and directly addresses the confusion.
- **Leveraging improves but stays inflated** (exact 12 → 27 / 81, signed +1.35 → +1.09).
- **Characterisation and interpretation:** too sparse to judge.
- **Synthetic benchmark** (scores only; decisions identical, 225/252 in both arms):
  - constraints held 12/39 → **29/39**;
  - APR score in range 24/45 → **38/45**;
  - identification 91/107 → 105/107;
  - 1 new violation.
  - **The synthetic labels follow the rubric literally, so they reward exactly the identification strictness that the experts reject.**
- **Cost:**
  - Stage 2 runs on about 62% of PCK calls: about 2,260 input + 59 output tokens;
  - **about +12–13% cost** per PCK call;
  - latency p50 0.89 s / p90 1.45 s;
  - can run in parallel with the student call (both wait only for Stage 1), so it adds no student-turn latency.
- **Mode B: not run.** Expert gold did not pass cleanly: identification regressed and consensus APR was mixed.
- **Verdict:**
  - Two-stage scoring is the **first approach that improves APR calibration with zero decision drift** (by construction). The architecture is justified.
  - **This Stage-2 v1 is not production-ready**: its rubric wording must follow the expert boundaries, not the literal rubric.
  - **Next:** Stage-2 v2 with expert-boundary wording, developed on A1-only and validated on consensus / agreed (no tuning on the validation tiers).
  - **Score-conditioned feedback text belongs in Stage 2** once scores are trusted (§8).

## 1. Stage-2 input and schema

**Context selection (from the B200 evidence):**
- **Experts annotated with the whole conversation in view.** Identification needs the immediately preceding student turn; APR often builds on student ideas from earlier turns; leveraging judges the whole error episode.
- **So Stage 2 receives the full conversation**, verbatim from the Stage-1 prompt's own sections (no re-formatting, no truncation):

| Stage-2 input | content |
|---|---|
| Lesson context | the Stage-1 "Lesson Context" section (scenario, misconception focus) |
| Conversation history | the Stage-1 "Conversation History" (all teacher / student lines, including the current teacher line) |
| Teacher's latest message | the Stage-1 quoted message |
| Skills to score | exactly the skill ids Stage 1 marked relevant, in chain order, each with its 0 / 1 / 2 rubric |

**Not given to Stage 2:**
- Stage-1 scores, quality, praise / evidence text, demonstrated / missed lists;
- feedback history and continuity rules;
- decision fields;
- examples.

**Stage-2 rubric** (`pck_eval/x9/stage2.cjs`):
- the expert-grounded semantics of `pck_b200_expert_grounding.md` §4;
- APR exactly as specified for X9;
- no participant text;
- instructions: score the latest move, do not credit earlier turns, and a missed relevant skill scores 0.

**Stage-2 output** (structured, score-first, `propertyOrdering`):

```json
{"skill_scores": [{"skill_id": "<one of the supplied ids>", "score": 0}]}
```
- `skill_id` is an enum of the supplied ids; `score` is an integer;
- `minItems` = `maxItems` = the number of supplied skills;
- `maxOutputTokens` 512; thinking MINIMAL.

**When it runs** (prototype: the preload wraps the Stage-1 model call): only if Stage 1 would display feedback:
1. `should_provide_feedback` true;
2. at least one relevant skill;
3. not suppressed by the production bare-acknowledgement guard (applied to the same message).

## 2. Validation and fallback

Stage 2 is **invalid**, and Stage-1 scores are kept, if the output:
- is not pure JSON;
- has any top-level field other than `skill_scores`;
- has a row field other than `skill_id` / `score`;
- has an unknown, unrequested or duplicate skill id;
- misses a supplied skill;
- has a score that is not an integer 0 / 1 / 2;
- or the call fails.

There is no retry. Self-tests: `pck_eval/test/stage2.test.js`, 11 rejection cases, all fall back.

**Safety by construction, verified on 1,205 outputs:**
- the Stage-1 object is returned value-identical (asserted per call), with an extra `_stage2` field;
- `should_provide_feedback`, relevance and the skill list are never touched;
- Stage 2 scored exactly the Stage-1 skill set in every case (0 mismatches);
- it never ran for hidden or guard-suppressed feedback (460 not shown, 2 guard-suppressed);
- **student steering is untouched:** the student agent receives the Stage-1 analysis; Stage-2 scores are display-only.

## 3. Expert-gold results (3 passes; A = Stage-1 scores, B = Stage-2 run 1)

### APR

| tier | arm | rows | exact | MAE | mean signed | κ_w | expert 1 → 2 | expert 1 → 1 | expert 0 → 1/2 | expert 2 → 1 | expert 1 → 0 |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| consensus | A | 110 | 63 | 0.44 | +0.40 | 0.08 | 44/46 | 0 | 1 | 0 | 2 |
| consensus | **B** | 110 | 53 | 0.55 | **−0.11** | **0.28** | 23/46 | 9 | 1 | **16** | **14** |
| agreed | A | 115 | 43 | 0.64 | +0.47 | 0.29 | 60/70 | 0 | 2 | 0 | 10 |
| agreed | **B** | 115 | **66** | **0.44** | **−0.01** | **0.46** | 21/70 | **31** | 2 | 8 | 18 |
| A1-only | A | 104 | 20 | 0.96 | +0.92 | 0.00 | 66/68 | 0 | 16 | 0 | 2 |
| A1-only | **B** | 104 | **52** | **0.51** | **+0.30** | **0.43** | 36/68 | **29** | 6 | 6 | 3 |

**Model APR score distribution** (all 620 displayed APR rows): A 2: 580 (94%) / 1: 0 / 0: 40 (6%). B 2: 294 (47%) / 1: 209 (34%) / 0: 117 (19%).
- **Stage-2 run-to-run stability:** 92% of rows identical.

### Other skills (all tiers pooled)

| skill | rows | exact A → B | mean signed A → B | note |
|---|---:|---|---|---|
| identification | 85 | 58 → **48** | +0.15 → **−0.46** | regression; expert 2 → Stage 2 0 in 12 rows (A1-only 8) |
| leveraging | 81 | 12 → 27 | +1.35 → +1.09 | better, still strongly inflated |
| characterisation | 9 | — | — | too sparse |
| interpretation | 6 | — | — | too sparse |

### Manual review (one reviewer; paraphrased; consensus / agreed / A1-only samples)

- **Correct corrections:** expert-1 APR turns where the teacher recaps or clarifies after the students reached the idea ("you sharpened the distinction; now ask them to justify it"). Stage 1 gave 2; Stage 2 gives 1. This is the intended effect.
- **New identification under-scoring:** the teacher clarifies the exact point the students were confused about (directly answering the confusion). Experts: "you noticed the confusion" = 2. Stage 2: 0, because the teacher never says "that is wrong".
- **APR 1 → 0:** the teacher states the defining property in direct reply to the students' question. Experts: 1 ("clarified; next have them apply it"). Stage 2: 0 ("direct answer"). The expert 0 is reserved for telling that bypasses the students' idea, or for wrong content.
- **APR 2 → 1 (consensus):** a teacher explanation that uses a counterexample or ends with a guiding question for the students. The consensus gave 2; Stage 2 gives 1 ("teacher-led").

These are rubric-boundary mismatches, not noise, and they are fixable in Stage-2 wording.

## 4. Synthetic benchmark (scores only)

All 116 cases × 3. The decision is identical in both arms (225/252 high), because it is owned by Stage 1.

| high bucket | A (Stage 1) | B (Stage 2) |
|---|---:|---:|
| case constraints held (no score 2, etc.) | 12/39 | **29/39** |
| APR score in allowed range / exact | 24/45 / 12/19 | **38/45 / 17/19** |
| identification in range / exact | 91/107 / 76/90 | 105/107 / 88/90 |
| characterisation in range | 8/8 | 6/8 (1 new violation, ×2) |
| interpretation in range | 5/8 | 8/8 |
| leveraging | 9/9 | 9/9 |

**Fixed by B:**
- telling explanations (APR 2 → 0 / 1);
- partial APR moves (2 → 1);
- deferrals (no 2);
- identification hints (2 → 1);
- the general-observation interpretation (2 → 1).

**Review bucket:** identification 6/6 → 3/6 (stricter); APR 3/12 → 12/12.

## 5. Cost and latency

| | Stage 1 | Stage 2 (per call) |
|---|---:|---:|
| calls | 1,205 | 1,486 (2 per eligible feedback; production needs 1) |
| share of PCK calls that need Stage 2 | — | 61.7% |
| mean input / output tokens | 9,883 / 503 | 2,258 / 59 |
| latency p50 / p90 | 2.55 / 3.68 s | **0.89 / 1.45 s** |
| failures / retries | 0 / 0 | 0 / 0 |

**Incremental cost per PCK call:** 0.617 × (2,258 + r × 59) against 9,883 + r × 503 → **+12.9% (r = 4) / +12.1% (r = 8)**, where r = output / input price ratio.

**Latency placement:**
- Stage 2 needs Stage 1's skill list, and the student call needs only Stage 1, so both can start when Stage 1 returns.
- Stage 2 (about 0.9 s) finishes before the student reply (about 1.2 s p50), so no added turn latency in the common case.
- The sidebar would show scores after Stage 2 (Stage 1 + about 0.9 s), or Stage-1 scores on timeout or invalid output.

## 6. Mode B

**Not run.** The brief requires both expert gold and synthetic scoring to pass. Expert gold did not pass cleanly:
- identification regressed;
- consensus APR showed new under-scoring.

The operational questions (latency, failures, coupling) are already answered by the replay: 0 failures, sub-second Stage 2, no coupling by construction.

## 7. Is two-stage scoring worth the architecture?

**Yes, as an architecture.** Across X2, X6, X7 and X8 it is the only design that changes score calibration without moving the decision:

| | APR calibration | decision drift | invalid / failure risk |
|---|---|---|---|
| X6 rubric text | none | none | none |
| X7 thinking LOW | none | severe | +13% failures |
| X8 scores first in one call | better | severe | none |
| **X9 two-stage (v1)** | **better** (exact +14 pts, signed → 0) | **zero by construction** | **none observed** |

**Not yet as a production change.** v1 trades APR inflation for new under-scoring on identification and at some APR boundaries. Before implementing, run **Stage-2 v2**, changing only the Stage-2 rubric wording to the expert boundaries seen in §3:
- **identification 2:** the teacher clearly notices and directly addresses the student's specific error or confusion (explicitly or by correcting / clarifying that exact point); 1 = only an indirect hint; 0 = not noticed, accepted or praised;
- **APR 0:** telling that bypasses the student's idea, or mathematically wrong content. A direct clarification that responds to the students' confusion is 1;
- **APR 2:** includes a teacher explanation that uses a counterexample or ends by having the students check or reason ("builds on their idea or makes them do the reasoning");
- **leveraging:** unchanged first; measure.

**Method for v2:** develop on A1-only turns, freeze, then evaluate once on consensus + agreed and the synthetic benchmark. This avoids tuning on the validation tiers that diagnosed v1.

Then a Mode B run (operational) and a versioned implementation, gated by a flag with Stage-1 fallback.

## 8. Should score-conditioned feedback text move into Stage 2 later?

**Yes, naturally:**
- **Ordering is already right.** X2 showed that text instructions inside Stage 1 shift decisions and, on false-positive decisions, produce fabricated or borrowed evidence. X8 showed that committing to a score first changes the judgement. A Stage 2 that writes **score first, then text conditioned on that score** (2: what was done; 1: what was done + what is missing; 0: what was missed + one concrete move) gets both properties without touching Stage 1.
- **Inputs fit.** Stage 2 already sees the full conversation and the current move, the evidence the experts used. It is the right place to ground text in the teacher's latest message.
- **The contract stays clean.** Stage 1 keeps the decision, relevance, steering and the bare-acknowledgement guard; Stage 2 owns "how good, and what to say" per shown row. The display view-model (B28) takes Stage-2 score and text when valid, Stage-1 fields otherwise.
- **Conditions:**
  1. do it only after Stage-2 scores are validated (v2);
  2. allow an empty text for a row Stage 2 cannot ground (do not force text: X2's fabrication lesson) and count it;
  3. evaluate text against the B200 expert texts (template compliance: the consensus is 100% compliant; length; grounding);
  4. version it (it changes what teachers see).

## 9. Limitations

- **Gold:** consensus has only 5 conversations; the experts themselves disagree 1-vs-2 on 40% of shared APR rows.
- **Bias in the review:** the v1 under-scoring patterns were found on the same tiers used for evaluation, so v2 must use a dev / validation split (§7).
- **Replay context:** empty feedback history and no drawings, as in X6–X8.
- **Prototype placement:** the preload calls Stage 2 inside the Stage-1 model call, so the server's Stage-1 latency meta includes it. Call records separate the two stages; a production design would run Stage 2 after Stage 1 returns.

**Files:**
- tracked, no participant data: `pck_eval/x9/stage2.cjs`, `x9_arm.cjs`, `synth_eval.mjs`, `pck_eval/test/stage2.test.js`;
- local and git-ignored: `pck_eval/local_b200/x9/` (`eval_x9.py`, `x9_eval.{json,txt}`, call records, logs), `replay-x9-p{1,2,3}.jsonl`, `pck_eval/results/x9-*`.

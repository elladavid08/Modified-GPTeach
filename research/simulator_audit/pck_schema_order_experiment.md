# X8: PCK structured-output order (scores before praise), experiment

Status: experiment only, 2026-10-13, on committed **1.4.3** (`850a9d4`; production code unchanged since 1.4.3). PCK model `gemini-3.1-flash-lite`, thinking MINIMAL in every arm.
- No production, prompt, schema-content, model or `SYSTEM_VERSION` change.
- **Expert gold:** the local, git-ignored B200 set (`pck_eval/local_b200/`).
- Aggregates only in this file.
- **Model calls:** Gemini on Vertex AI (pilot service account) via unmodified local servers with an analysis-only preload. No Firestore writes.

## Summary

- **The ordering change works mechanically**, but only with `propertyOrdering`:
  - re-ordering the schema's `properties` map changed nothing (0 / 6 smoke outputs started with `skills_assessment`);
  - adding the schema's explicit **`propertyOrdering`** (`skills_assessment` first, the other fields in their 1.4.3 order) made Gemini follow it in **100%** of 1,205 calls;
  - output stayed valid, latency and tokens unchanged.
- **It does reach the APR score**, unlike rubric text (X6) or thinking (X7):
  - **3.1 starts using APR 1:** 67 of 378 APR rows (18%) across 3 passes. A: 0 of 611.
  - **Expert-1 rows scored 1 (raw view):** consensus 0% → 21%, agreed items 0% → 38%, A1-only 0% → 31%.
  - **Mean signed difference** (displayed): consensus +0.39 → +0.25, agreed +0.48 → +0.15.
  - **APR weighted κ:** consensus 0.12 → 0.36, agreed 0.27 → 0.51.
- **But the decision and relevance regress far beyond noise:**
  - **expert gold:**
    - consensus recall 0.84 → 0.65 (κ 0.67 → 0.48), agreed 0.82 → 0.61;
    - decision flips A ↔ B 23–27% vs A ↔ A 8–10%;
    - "neutral" quality 221 → 320 (pass 1);
    - **79% of the new APR-1 rows end up hidden**, because B rates those moves "neutral" and the prompt maps neutral to "no feedback".
  - **synthetic benchmark:**
    - decision 90.1% → 77.8%;
    - false positives on negative controls 10 → 19 / 81 (11 are false "missed error" claims on hedged *correct* answers, which the bare-acknowledgement guard passes by design);
    - false negatives 15 → 37 / 171;
    - explanation, partial-APR and continuity cases lose their feedback.
- **Other skills:**
  - identification relevance and score agreement improve (consensus F1 0.30 → 0.52, κ_w 0.65 → 0.87), but new identification under-scoring appears (expert 2 → model 1: agreed raw 3 → 15) and false identification on correct answers rises;
  - leveraging inflation is unchanged;
  - p2 / p3 stay negligible.
- **Verdict:**
  - Schema reordering **is not implementable as a single-call change**: it fails the decision and synthetic guardrails, so Mode B was not run.
  - It is **causal evidence that output order drives APR inflation**: a score written before the praise is better calibrated.
  - Combined with X2, X6 and X7, there is enough evidence to **stop single-call calibration attempts and move to two-stage scoring**: a decision-free scoring stage that writes per-skill scores first, leaving the 1.4.3 decision, relevance and steering untouched.

## 1. The exact change

| | top-level output order |
|---|---|
| A (1.4.3) | `pedagogical_quality`, `predicted_student_state`, `addressed_misconception`, `how_addressed`, `misconception_risk`, `demonstrated_skills`, `missed_opportunities`, `should_provide_feedback`, `feedback_trigger`, `skills_assessment`, `feedback_message_hebrew` |
| **B** | **`skills_assessment`**, then the same ten fields in the same order |

- **Mechanism:** `responseSchema.propertyOrdering = [that list]`, plus the same order in `properties`.
- **Asserted per call** (`pck_eval/x8/x8_arm.cjs`, tracked, no participant data): identical property definitions, enums, required list, prompt, `maxOutputTokens`, thinking level and every other request field.
- **Not changed:** the prompt (its JSON example still lists the 1.4.3 order), rubric wording, semantics.
- **Property order alone is not followed:** Vertex treats `properties` as a map, and the 6 smoke outputs kept the 1.4.3 order. Only `propertyOrdering` changes generation order, so it is the minimal ordering-only change.

**Was the order followed?**
- B: the first key was `skills_assessment` in 1,205 / 1,205 successful calls.
- A: `pedagogical_quality` in 1,206 / 1,206.

## 2. Method

**Passes:**
- per arm, all 596 expert-labelled turns (577 analysed; 19 image-only / empty skipped);
- plus 2 more passes over the 324 gold-tier turns (consensus + double);
- A and B ran concurrently.

**The pass-3 outage:** a Vertex connectivity outage during pass 3 failed about 200 turns in *both* arms ("exception posting request to model", after 20 s timeouts). Those records were removed and the turns re-run once connectivity returned. Final coverage: 0 failures in every pass.

**Views:**
- **displayed:** skills count only when feedback is shown (what the teacher sees);
- **raw:** skills as returned, including hidden feedback (where the model's scoring judgement is visible).

## 3. APR (3 passes pooled)

| tier | metric | A displayed | B displayed | B raw |
|---|---|---:|---:|---:|
| consensus | relevance F1 / κ | 0.82 / 0.55 | **0.66 / 0.38** | 0.70 / 0.41 |
| | scored rows / exact | 111 / 63 | 75 / 54 | 82 / 59 |
| | MAE / mean signed | 0.44 / +0.39 | 0.28 / **+0.25** | 0.28 / +0.26 |
| | weighted κ | 0.12 | **0.36** | 0.49 |
| | expert 1 → model 2 (of expert-1 rows) | 44 / 47 (94%) | 20 / 23 (87%) | 22 / 29 (76%) |
| | expert 1 → model 1 | 0 | 2 | **6 (21%)** |
| | expert 0 → model 1/2 | 0 / 1 | 0 / 0 | 0 / 0 |
| | expert 2 → model 1 | 0 | 0 | 0 |
| agreed | relevance F1 / κ | 0.72 / 0.52 | **0.37 / 0.19** | 0.44 / 0.24 |
| | scored / exact | 107 / 40 | 40 / 22 | 50 / 29 |
| | mean signed / weighted κ | +0.48 / 0.27 | **+0.15 / 0.51** | +0.06 / 0.48 |
| | expert 1 → 2 / → 1 / → 0 | 56 / 0 / 9 | 12 / 4 / 6 | 12 / **11 (38%)** / 6 |
| | expert 2 → 1 | 0 | 0 | 3 |
| A1-only | expert 1 → 2 / → 1 | 65 / 0 | 30 / 1 | 31 / **14 (31%)** |
| | expert 0 → 2 | 12 | 3 | 3 |

**APR score-1 frequency** (all relevant rows):
- A: 0 / 611.
- B: 67 / 378 raw (18%), of which 14 were displayed and **53 hidden (79%)**.
- Per pass, B raw: 32 / 18 / 17.

## 4. Decision and relevance drift

| | A ↔ A (3 pairs) | B ↔ B | A ↔ B (passes 1 / 2 / 3) |
|---|---:|---:|---:|
| decision flips | 26 / 29 / 33 of 324 | 28 / 36 / 36 | **140 / 596**, **86 / 324**, **75 / 324** |
| APR relevance flips | 39 / 39 / 46 | 35 / 38 / 37 | 162 / 93 / 86 |
| identification relevance flips | 33 / 41 / 40 | 35 / 34 / 35 | 108 / 58 / 63 |
| leveraging relevance flips | 57 / 52 / 51 | 27 / 31 / 38 | 110 / 67 / 56 |

**Decision against expert gold** (pooled, P / R / κ):
- consensus: A 0.96 / **0.84** / 0.67 → B 0.97 / **0.65** / 0.48;
- agreed: A 0.96 / 0.82 / 0.57 → B 0.97 / 0.61 / 0.35;
- A1-only: A 0.94 / 0.64 / 0.36 → B 0.94 / 0.45 / 0.22.

**Mechanism:**
- **Quality shifts to "neutral":** pass 1 quality neutral / positive / problematic was A 221 / 309 / 47 and B 320 / 184 / 73.
- **More hidden feedback still marks skills relevant:** A 1, B 67 of 577.
- **Most new hides carry no relevant skill at all.** Offline, deriving the decision from B's own skill rows (any relevant skill, then the bare-acknowledgement guard) only partly recovers recall: consensus 0.68 → 0.75, κ 0.50 → 0.59, still below A (0.85 / 0.69).
- **Reading:** with skills first, the model applies the prompt's "a quotable student error must exist" gate before it judges the move, and lets fewer turns through. This is the same literal-gate effect X7 found with LOW thinking.

## 5. Other skills (pooled, displayed)

| | consensus A → B | agreed A → B | notes |
|---|---|---|---|
| identification | relevance F1 0.30 → 0.52; score κ_w 0.65 → 0.87 (n 13 → 23) | F1 0.41 → 0.51; κ_w 0.64 → 0.86; expert 2 → model 1: 3 → 7 (raw 3 → 15) | better agreement on shown identification rows, but **new under-scoring (2 → 1)**; synthetic: identification over-selection 7.7% → 20.5% (false errors on correct answers) |
| characterisation | F1 0.23 → 0.15 | none → 0.20 | tiny n; synthetic score-in-range 100% → 50% |
| interpretation | 0.12 → 0.12 | none → 0.10 | negligible either way |
| leveraging | F1 0.69 → 0.65; signed +1.20 → +1.05 | +1.14 → +1.20 | inflation unchanged |

## 6. Reliability and cost

| | A | B |
|---|---:|---:|
| invalid outputs / final failures (after the outage rerun) | 0 / 0 | 0 / 0 |
| requests with 2 attempts | 0 | 1 |
| output tokens p50 | 590 | 560 (−5%) |
| PCK latency p50 / p90 | 2.54 / 3.62 s | 2.53 / 3.67 s |

## 7. Synthetic benchmark guardrail (run because APR improved)

All 116 cases × 3 per arm. High-confidence bucket:

| | A | B |
|---|---:|---:|
| decision agreement | 227/252 (90.1%) | **196/252 (77.8%)** |
| false positives on negative controls | 10/81 | **19/81** |
| false negatives | 15/171 | **37/171** |
| case constraints held (no score 2, etc.) | 10/39 | **28/39** |
| APR score in allowed range | 28/49 | 20/21 |
| identification not-relevant respected | 92.3% | **79.5%** |
| decision == any relevant skill | 95.1% (14 hidden-with-relevant) | 82.5% (50) |

**By group** (decision agreement, A → B):
- unchanged:
  - missed misconceptions 54/54 → 54/54 (the 1.4.1 behaviour is intact);
  - greetings 9/9 → 9/9;
  - genuine questions 6/6 → 6/6;
  - closings 11/12 → 12/12;
- regressed:
  - correct-answer controls 42/42 → **29/42**;
  - bare acknowledgements 3/6 → 2/6;
  - "?" false praise 6/9 → 4/9;
  - explanation after misconception 5/6 → **2/6**;
  - partial APR 7/9 → **2/9**;
  - continuity 12/15 → **6/15**.

**Where the new false positives come from:**
- 11 are "problematic + identification 0" on hedged *correct* answers (`ctl-correct-*-T3`). These are false error claims that the bare-acknowledgement guard is designed to let through.
- The rest are APR praise on a correct answer and a "?".

**Verdict:** the guardrail fails, so the 24-conversation Mode B A/B was **not run**.

## 8. Conclusions

1. **Is reordering worth implementing?** Not as a production change: it trades a real APR calibration gain for a large decision and recall regression, new false errors on correct answers, and identification under-scoring.
2. **What it proves:**
   - the inflation is an **ordering / anchoring effect**: the same model, prompt and rubric give 1s once scores come first;
   - and in one call, score and decision are coupled: committing to a lower score pushes quality to "neutral", which hides the feedback.
3. **Single-call calibration attempts have reached their limit:**

   | experiment | lever | effect on calibration | effect on the decision |
   |---|---|---|---|
   | X2 | text instructions | no effect | decisions shifted |
   | X6 | APR rubric text | no effect | — |
   | X7 | thinking LOW | no effect | decision collapsed |
   | X8 | output order | **calibration improves** | decision collapses |

   Every lever that moves the score also moves the decision, because both come from one generation governed by the same gates.
4. **Next: two-stage scoring.**
   - **Stage 1:** the unchanged 1.4.3 call: decision, relevance, steering, B27.
   - **Stage 2:** run only for shown feedback with relevant skills. A small call whose output **starts** with per-skill scores (X8's lesson), given the teacher turn, the recent student turn(s), the fixed list of relevant skills and their rubric bands. It returns scores (and, later, X2's grounded text) for exactly those rows.
   - **Stage 2 cannot change the decision or relevance.** The server validates that its rows equal stage 1's and falls back to stage 1 on any mismatch.
   - **Evaluate** on the same 324 gold-tier turns: APR (and identification / leveraging) calibration against consensus and agreed items, with **zero decision drift by construction**. Then the synthetic benchmark (scores only), then Mode B.
   - **Steering:** the student agent keeps stage 1's analysis, so steering is untouched (X3, option A).
5. **The decision gate itself** (experts give feedback on non-error teaching moves; the prompt forbids it) remains the separate X5 question. X7 and X8 both show the prompt's gate binds hardest when the model reasons more literally.

## 9. Limitations

- **Gold:** expert APR gold is modest (consensus 75–111 scored rows pooled), and the experts themselves split 1-vs-2 in 40% of shared rows.
- **Outage:** pass 3 was partly re-run after a connectivity outage (same turns, same arms).
- **Replay context:** empty feedback history, no drawings for PCK, as in X6 / X7.
- **The derived-decision what-if** (§4) is offline, not a tested arm.

**Local files** (git-ignored, `pck_eval/local_b200/x8/`): `eval_x8.py`, `x8_eval{,_raw}.{json,txt}`, `derived_decision.mjs`, call records, logs; `replay-x8{A,B}-p{1,2,3}.jsonl`.
**Synthetic results:** `pck_eval/results/x8-bench-{A,B}.*` (git-ignored).

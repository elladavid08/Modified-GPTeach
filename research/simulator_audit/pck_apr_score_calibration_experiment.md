# X6-APR: expert-grounded APR score calibration, experiment

Status: experiment only, 2026-10-13, on committed **1.4.3** (`9deb00f`). PCK model `gemini-3.1-flash-lite` (thinking MINIMAL, unchanged).
- No production, prompt, schema, model or `SYSTEM_VERSION` change.
- **Expert gold:** the local, git-ignored B200 set (`pck_eval/local_b200/`, see `pck_b200_expert_grounding.md`).
- This file holds aggregates and paraphrased descriptions only (no participant text).
- **Model calls:** the turns were sent to Gemini on Vertex AI through the same service account as the pilot, via unmodified local servers with an analysis-only preload. Nothing was written to Firestore.

## Summary

- **Arm B** (rewrite the three APR score descriptions to the expert semantics) **changed no APR score.** On every turn where both arms scored APR (596 turns), A and B gave the same score; the same holds for the diagnostic arm **B′** (B plus one APR-only scoring sentence at STEP 3; 324 gold-tier turns).
- **3.1 does not use APR = 1 at all.** Across 1,232 relevant APR rows in all arms and passes, the scores are 2 or 0: never 1. APR works as a binary "good move" (2) / "missed" (0).
- **Expert 1 → model 2 is unchanged:**
  - consensus: A 14, B 16 / 15, B′ 16;
  - agreed items: A 19 / 19, B 16 / 19, B′ 17;
  - A1-only: A 68, B 67.
- **Mean signed difference (model − expert) is unchanged:** consensus A +0.36 / +0.41, B +0.43 / +0.43, B′ +0.47.
- **No new under-scoring:** no expert-2 row moved to 1 (the model never outputs 1).
- **Guardrails:** decision, APR relevance and other skills moved only within run-to-run noise, with no validity or latency cost. But **with no calibration effect there is nothing to implement.**
- **Manual review:**
  - on expert-1 turns, the model's APR text praises the teacher's *explanation itself* ("you answered their confusion with the precise definition") and scores it 2 with "positive" quality, where the experts wrote "now let the students apply / justify";
  - on expert-0 turns (the teacher handed over the information), the model also gives 2.
  - The score follows the model's overall positive judgement of the move, not the band text.
- **Not run:** the synthetic benchmark guardrail and Mode B. The expert-gold check failed on its primary criterion, so there is no candidate to protect or to measure downstream.
- **Verdict:** X6-APR as a rubric-text change is **not** a viable versioned change. APR calibration needs a structural lever (§6).

## 1. Arms and the exact prompt change

| arm | change | prompt chars |
|---|---|---:|
| **A** | committed 1.4.3 | 31,619 (median) |
| **B** | the three APR score descriptions rendered by `formatSkillsForPrompt` (`server/universal_pck_skills.js`) replaced; labels and Hebrew patterns unchanged | 32,014 |
| **B′** (diagnostic, after B was null) | B plus one APR-only sentence at "STEP 3: Score each selected skill" | 32,653 |

| band | 1.4.3 (A) | B and B′ |
|---|---|---|
| 0 | Teacher gives the correct answer immediately without engaging student thinking | Teacher gives the answer or the correction directly without engaging the student's thinking, or gives mathematically incorrect content |
| 1 | Teacher asks a generic question or returns to definition without depth | Useful and in the right direction, but teacher-led or generic: the teacher explains, restates the definition or asks a general question without building on the student's own idea. A clear, correct explanation by the teacher alone is score 1 |
| 2 | Teacher uses targeted diagnostic questions, counterexamples, or active tasks | Adapted to this student's thinking: the move takes up the student's own idea, or has the student actively check, justify, compare or reason toward the conclusion (e.g. a targeted question about their claim, a counterexample they test themselves) |

**B′ only:** one line inserted after "- Score 0: Should have been used but wasn't, or was done poorly":

> For adapted-pedagogical-response, apply its rubric strictly: score 2 only if the teacher's move takes up the student's own idea or has the student check, justify, compare or reason; a teacher explanation or a general question, even when correct and clear, is score 1.

**Unchanged:**
- relevance, decision and Gate rules, `should_provide_feedback`;
- the other skills;
- the schema (asserted per call);
- examples (none added);
- text instructions, student prompt, model / config / thinking.

**Files:** `pck_eval/x6/apr_bands_B.json`, `apr_bands_Bp.json`, `x6_arm.cjs` (tracked; no participant data).

## 2. Method

**Data:**
- every B200 expert-labelled turn (596; 577 analysed, 19 image-only / empty skipped as in production) replayed through the real client, with the full preceding conversation, the production scenario and an empty feedback history;
- A and B ran concurrently on two servers, then a second pass of the 324 gold-tier turns per arm;
- B′ ran once on the 324 gold-tier turns.

**Gold tiers:**
1. consensus (73 turns);
2. double-annotated items where both experts agree (APR: 117 agreed relevance items, 56 relevant);
3. A1-only (secondary).

**Scoring semantics:** displayed (a skill counts only when feedback is shown).

## 3. APR results

**Consensus** (APR gold relevant 50 / 73):

| | A pass 1 | A pass 2 | B pass 1 | B pass 2 | B′ |
|---|---:|---:|---:|---:|---:|
| relevance F1 / κ | 0.82 / 0.56 | 0.83 / 0.58 | 0.83 / 0.58 | 0.81 / 0.53 | 0.79 / 0.51 |
| scored rows | 36 | 37 | 37 | 35 | 34 |
| exact | 21 | 21 | 21 | 20 | 18 |
| MAE | 0.42 | 0.46 | 0.43 | 0.43 | 0.47 |
| mean signed (model − expert) | +0.36 | +0.41 | +0.43 | +0.43 | +0.47 |
| expert 1 → model 2 | 14 | 14 | 16 | 15 | 16 |
| expert 0 → model 1 / 2 | — | 0 / 1 | — | — | — |
| expert 2 → model 1 | 0 | 0 | 0 | 0 | 0 |

**Agreed double items:**

| | A p1 | A p2 | B p1 | B p2 | B′ |
|---|---:|---:|---:|---:|---:|
| relevance F1 | 0.72 | 0.70 | 0.65 | 0.71 | 0.64 |
| exact / scored | 15/36 | 12/34 | 14/31 | 15/37 | 12/30 |
| mean signed | +0.56 | +0.56 | +0.48 | +0.43 | +0.53 |
| weighted κ | 0.32 | 0.22 | 0.41 | 0.39 | 0.27 |
| expert 1 → 2 / expert 0 → 2 | 19 / 1 | 19 / 1 | 16 / 0 | 19 / 0 | 17 / 0 |

**A1-only (secondary):**
- A: 21/104 exact, +0.89, 1 → 2 in 68, 0 → 2 in 13;
- B: 21/103, +0.84, 1 → 2 in 67, 0 → 2 in 12 (2 → 0 in 2).

**Score distribution** (descriptive): every arm 2 / 0 only. A 271 / 15, B 269 / 17, B′ 142 / 8 relevant APR rows (pass 1).

**Paired effect:** on the turns where both arms scored APR, **0 APR score changes** A → B (596 turns) and A → B′ (324 turns). The small metric differences above come from which turns APR is relevant on, at the noise level.

## 4. Guardrails

| | A vs A (pass 1 vs 2) | B vs B | A vs B (pass 1) | A vs B (pass 2) | A vs B′ |
|---|---:|---:|---:|---:|---:|
| turns | 324 | 324 | 596 | 324 | 324 |
| decision flips | 20 (6.2%) | 26 (8.0%) | 64 (10.7%) | 34 (10.5%) | 36 (11.1%) |
| APR relevance flips | 36 | 41 | 83 | 50 | 43 |
| EI relevance flips / score changes | 38 / 3 | 30 / 6 | 72 / 8 | 46 / 4 | 44 / 1 |
| leveraging relevance flips | 48 | 56 | 92 | 61 | 52 |

- **Decision against consensus** (κ): A 0.58 / 0.69, B 0.59 / 0.58, B′ 0.63. Against agreed decisions: A 0.54 / 0.60, B 0.56 / 0.56, B′ 0.56.
- **Missed-identification shape** (identification 0, shown): A 33, B 39 (596 turns); B′ 27 (324).
- **Validity:** 0 final failures in all arms. 2-attempt requests: A 1, B 3, B′ 0. One B model error was retried successfully.
- **Latency p50 / p90:** A 2.37 / 3.10 s, B 2.35 / 3.18 s, B′ 2.35 / 2.96 s (≤ 1% at p50).

A-vs-B flips are slightly above A-vs-A noise but similar to B-vs-B. Without any calibration effect, B is not a candidate either way.

**Not run:**
- **The synthetic benchmark guardrail.** It exists to protect a working candidate; B and B′ change no score, so there is nothing for it to protect. B's decision and relevance behaviour on the expert set matches A within noise.
- **Mode B:** the expert-gold check failed.

## 5. Manual review

Paraphrased; one reviewer; samples from consensus, agreed and A1-only turns.

- **Expert APR = 1, A = 2** (101 such rows):
  - typical turns: the teacher states the definition in answer to the students' confusion; recaps the right distinction after the students got there; or poses a fresh question to the class;
  - experts: "you clarified the definition / you moved the discussion forward. Recommendation: have the students apply it or justify it";
  - the model writes "you responded to the confusion with the precise definition / a structured explanation that closes the gap" and scores 2, with quality "positive";
  - in several rows the model's own text describes teacher-led telling, yet still gives 2;
  - **B and B′ produced the same 2s.**
- **Cases B corrects to 1:** none.
- **Cases B newly gets wrong:** no score changes. The relevance differences are of the run-to-run kind.
- **Expert APR = 0, model 2** (14 rows): the teacher lists the properties / the full condition directly; the experts say "don't hand over the information, lead with questions". The model praises the clear, structured answer as an adapted response.
- **Expert APR = 2, model 2** (agreed): counterexample work, the students drawing or checking, building on a student's question. The model is right on these, but it gives the same 2 to telling.
- **Boundary 2 → 1:** never produced.

**Reading:**
- The APR score tracks the model's global positive verdict on the turn (quality "positive", praise written into `demonstrated_skills` before `skills_assessment`), not the band definitions.
- Rubric text that the model reads earlier in the prompt does not reach that decision under thinking MINIMAL. This holds even with an explicit scoring-step rule.

## 6. What would be needed

The same pattern as X2: instructions inside the one-stage prompt do not move a judgement the model has already committed to. The candidate levers each change something this experiment held fixed, so each needs its own single-variable test on the same expert set:

1. **Scoring before praise (schema order).**
   - The response schema emits `pedagogical_quality` and `demonstrated_skills` (praise text) before `skills_assessment`.
   - A schema property order that puts `skills_assessment` (scores) first, before any praise text, is the smallest structural probe.
   - It is a contract change: measure decision drift, as in X1.
2. **Thinking level (X7).** Thinking MINIMAL may leave no room to apply a three-way rubric. Test LOW for PCK only (plan W6.2), on the 324 gold-tier turns.
3. **Two-stage scoring** (plan W6.4; also X2's conclusion): a separate, small scoring call per relevant skill, given the teacher turn, the student turn and the expert APR definitions, returning only the score. The decision and steering stay on stage 1.
4. **Not recommended:**
   - few-shot examples first (B200: they teach format more than decisions);
   - deterministic score rules (they would require reading the text).

**Recommended next:** probe 2 (thinking LOW) and probe 1 (schema order), each against A, on the 324 gold-tier turns.
- **Metric:** APR expert 1 → model 2 and the signed difference.
- **Guardrails:** decision / relevance flips against the A-vs-A noise above, and the synthetic benchmark.
- **Order:** probe 2 first. It changes no contract and also informs X7.

## 7. Limitations

- **Gold size:** expert gold for APR scores is modest (consensus 36 scored rows; agreed 30–37).
- **Expert agreement:** the experts themselves disagree 1-vs-2 in 40% of shared APR rows. But the model's 0% use of 1 is outside any expert pattern (A1: 228 × 1).
- **Replay context:** empty feedback history and no drawings for PCK (as production, B17).
- **Review:** one reviewer; paraphrased.

**Local files** (git-ignored, `pck_eval/local_b200/`):
- `x6/eval_x6.py`, `x6_eval.json` / `.txt`, `calls-{A,B,Bp}.jsonl`, server and bench logs;
- `replay-x6{A,B}-p{1,2}.jsonl`, `replay-x6Bp-p1.jsonl`.

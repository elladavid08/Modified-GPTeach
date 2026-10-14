# B200 expert grounding for X5 / X6

Status: analysis only, 2026-10-13, on committed **1.4.3** (`7fe0867`). No production, prompt, schema, model or `SYSTEM_VERSION` change.

**Data handling:**
- The expert annotations are participant research data (`research/pck_feedback/`, untracked).
- This file contains **only aggregates, derived rules and paraphrased synthetic examples**: no participant or teacher / student text, names, conversation ids or annotation rows.
- Everything participant-derived (the turn table, replay outputs, scripts that read them) lives in the git-ignored `research/simulator_audit/pck_eval/local_b200/`.
- **Model calls:** the 1.4.3 replay sent the pilot turns to Gemini on Vertex AI through the same service account used in the pilot and the B200 evaluations, via an unmodified local server; nothing was written to Firestore.

**Annotators:** A1 = the majority annotator, A2 = the second annotator (the handoff identifies both). Skills: p1 error identification, p2 characterisation, p3 diagnostic interpretation, p4 adapted pedagogical response (APR), p5 leveraging.

## Summary

1. **What exists:**
   - 45 pilot conversations (all `systemVersion` 1.3.0, the six production scenarios, 596 teacher turns), annotated by two experts on all five skills;
   - per marked turn: the selected skills, a 0 / 1 / 2 score and an expert-written text per skill (never empty);
   - an unmarked turn means no feedback (all N).
2. **Gold strength:**
   - **consensus** (jointly reconciled): 5 conversations, 73 turns;
   - **double-annotated** (two independent annotations, no consensus): 15 conversations, 251 turns;
   - **single**: 25 conversations, 272 turns (A1).
   - A1 annotated all 45 conversations, A2 20.
3. **Expert agreement (the ceiling):**
   - decision κ 0.41;
   - relevance κ: p1 0.38, p5 0.41, p4 0.28, p2 0.26, p3 0.10;
   - score agreement where both experts selected the skill: strong for p1 (weighted κ 0.81), weak for p4 (0.31) and p5 (0.23).
4. **What the experts do that production and the B200 handoff rules do not:**
   - they give feedback on most turns (73%), often without any error in play (APR / leveraging only: 47% of consensus feedback);
   - they use **p2, p3 and p5 mainly as missed opportunities (score 0)**;
   - identification 0 with APR relevant is normal;
   - 3–4 skills per turn are common (34% of consensus feedback);
   - they re-credit the same skill on consecutive turns (70% of consensus positive rows);
   - APR is mostly **1**, not 2;
   - the consensus texts follow the score template exactly (score 2: no recommendation).
5. **1.4.3 vs experts** (577 replayed turns, plus a second pass on the 324 gold-tier turns):
   - **Decision is good:** against consensus, precision 0.96, recall 0.81, κ 0.63 (pass 2: 0.57). That is above the expert–expert κ 0.41.
   - **Score inflation is confirmed on real expert turns:** APR is scored 2 in 36 of 37 consensus rows (consensus: 25 × 1, 24 × 2); 100% of APR rows were 2 in both passes. Leveraging is credited 1–2 where consensus mostly says 0 (mean +1.2 to +1.4).
   - **Relevance:** p2 / p3 are almost never selected (they are never used as missed opportunities); p1 recall is low; never more than 2 rows.
6. **X5 and X6 can proceed without new annotation** for p1, p4 and p5 (and the decision). p2 / p3 are thin and contested between the experts.
   - **Recommended first experiment:** **X6-APR**, the APR 1-vs-2 calibration, scored against consensus and agreed items.

## 1. Inventory (`research/pck_feedback/data/`)

| artefact | content | used |
|---|---|---|
| `raw_userid_recovery_v1/annotations/` (= `raw/annotations/`, identical) | 50 completed individual annotations (A1 39, A2 11) over 45 conversations | yes |
| `raw_userid_recovery_v1/consensus_annotations/` | 5 consensus annotations; each cites its two source assignments | yes |
| `irr_round2_15/…_paired.jsonl` | IRR round 2: 15 conversations, the original annotation (= the export doc, verified identical) plus a **fresh** annotation by the other expert | yes (the 15 fresh annotations) |
| `raw_userid_recovery_v1/conversations/` | the 45 annotated conversations, including the pilot PCK output that was shown | yes |
| `processed/…`, `training/sft/…eval_turns.jsonl` | B200 derivatives (p1 / p4 only, 577-turn CV) | not as gold (derived) |

**Annotation model:**
- Experts mark "feedback points" on teacher turns. Each point lists the selected skills (p1–p5); each selected skill has a `score` (0 / 1 / 2) and `feedbackText`.
- An unmarked turn means no feedback.
- Consensus documents add `included` per skill.
- Checks:
  - every point aligns with its conversation turn (teacher-text snapshot check);
  - no missing scores or empty texts;
  - A2 sometimes splits one turn into 2–3 points (42 turns), never repeating a skill, so merging per turn is lossless.
- **Disagreements** are not resolved in the data, except in the 5 consensus conversations. Elsewhere both labels are kept and never collapsed.

## 2. Gold tiers and coverage

| tier | conversations | turns | labels |
|---|---:|---:|---|
| **consensus** (primary gold) | 5 | 73 | one reconciled label (both individual annotations also exist) |
| **double-annotated** (primary gold where the experts agree) | 15 | 251 | A1 and A2 independently; agreed items are gold, disagreements reported apart |
| **single** (secondary) | 25 | 272 | A1 only |

**Evaluation coverage, per skill** (consensus + agreed double items; single-annotated A1 in brackets):

| skill | relevant (gold +) / not relevant | score 0 | score 1 | score 2 | enough to evaluate |
|---|---|---:|---:|---:|---|
| p1 | 49 / 203 (+ 89 / 183) | 17 (28) | 8 (12) | 24 (49) | relevance yes; scores 0 / 2 yes; score 1 thin |
| p2 | 20 / 272 (+ 21 / 251) | 7 (12) | 5 (2) | 8 (7) | thin everywhere |
| p3 | 21 / 242 (+ 17 / 255) | 19 (17) | 0 (0) | 2 (0) | missed opportunity (0) only |
| p4 | 106 / 84 (+ 179 / 93) | 6 (23) | **60 (116)** | **40 (40)** | yes: relevance and 1 vs 2 well covered |
| p5 | 35 / 218 (+ 51 / 221) | **23 (46)** | 9 (3) | 3 (2) | relevance and missed (0) yes; 1 / 2 thin |
| decision | consensus 73 + agreed 194 | | | | yes |

- **Disagreements** (double tier, excluded from gold): decision 57 turns; skill items p1 72, p2 32, p3 61, p4 134, p5 71.
- **Local artefact:** `pck_eval/local_b200/b200_turns.jsonl` (git-ignored): per turn, the replay context and each source's labels. Tracked: this description only.

## 3. Expert agreement (20 double-annotated conversations, 324 turns)

| | decision | p1 | p2 | p3 | p4 | p5 |
|---|---:|---:|---:|---:|---:|---:|
| relevance κ | 0.41 | 0.38 | 0.26 | 0.10 | 0.28 | 0.41 |
| relevance κ, both experts marked the turn | — | 0.28 | 0.24 | 0.06 | −0.05 | 0.52 |
| both selected: exact score / weighted κ | — | 35/46 / 0.81 | 6/10 / 0.55 | 8/9 / — | 69/128 / 0.31 | 16/40 / 0.23 |

**Systematic differences between the two experts:**
- A2 selects p2, p3 and p5 far more (p3: 65 turns only A2 vs 12 only A1), almost always as 0.
- On p4 scores, the experts disagree 1-vs-2 in 51 of 128 shared rows.
- The **consensus** sits closer to A2 on decision (67/73 vs A1 55/73) and on p2 / p3 / p5, and is the best available tie-breaker.

## 4. Expert semantics (derived from labels and expert texts)

### Relevance

| skill | when experts mark it | evidence |
|---|---|---|
| p1 | an incorrect student statement in the recent student turn(s) (also inside praise or another student's turn) | p1 2 on 16 of 18 A1 turns with explicit "not correct"-type wording; p1 0 texts are "notice the error in X's words" |
| p2 | when an error is being handled: 0 if its type / source is not named, 1–2 if named; also after the error, when the teacher clarifies a concept distinction | consensus p2: 4 × 0, 4 × 1, 6 × 2; about half without p1 in consensus / A2, rarely for A1 |
| p3 | mostly as **0**, "ask the students how they reached this" (consensus 14 of 15 p3 labels); credit (1–2) when the teacher asks a student to explain the reasoning ("why does it look like…?") before correcting | consensus supports the p3 missed-opportunity rule; A1 uses it rarely, A2 often |
| p4 | almost every instructional move, **with or without a student error** (47% of consensus feedback has no p1 / p2 / p3); occasionally a strong opening activity | consensus p4 on 50 of 53 marked turns |
| p5 | mostly as **0 when an error episode is resolved**: the students reached the right idea and the teacher confirmed or summarised locally ("could have generalised to the inclusion principle / other shapes"). 11 of 12 consensus p5-0 rows have no p1 | consensus p5: 12 × 0, 8 × 1, 1 × 2 |

**Other relevance patterns:**
- **Identification ⟂ APR:** p1 = 0 with p4 relevant in 4 of 5 consensus p1-0 turns (A1 51 of 66, A2 18 of 24).
- **Rows per feedback** (1 / 2 / 3–4 skills): consensus 12 / 22 / 18; A1 232 / 136 / 73; A2 29 / 122 / 67.
- **Openings:** rarely marked (A1 3 of 45, A2 0 of 20, consensus 1 of 5: a strong opening activity, APR 2).
- **Closings and short praise:**
  - closing turns: A1 marks 31 of 45 (mostly p5 0), A2 8 of 20, consensus 2 of 5;
  - short praise without a question: A1 5 of 12, A2 3 of 6, consensus 0 of 1;
  - contested.
- **Repeat credit:** 70% of consensus positive rows repeat a positive score for the same skill from the previous turn (A1 53%, A2 61%).

### Scores (what separates 0 / 1 / 2, from the texts)

| skill | 0 | 1 | 2 |
|---|---|---|---|
| p1 | error not noticed (or praised) | addressed indirectly; "name the misconception explicitly" | explicitly named |
| p2 | error handled, type not named; "what kind of error / where does it come from?" | partial ("one property alone is not enough") without naming the source | source / type named (visual prototype, property vs definition, necessary vs sufficient) |
| p3 | no attempt; "ask how they reasoned" | asks why but does not let the student explain / does not go deep | asks the student to explain the reasoning, or articulates it |
| p4 | telling the answer ("instead of handing over the information…"), **or mathematically wrong teacher content** | right direction but teacher-led or generic: explains, returns to the definition, comparison question; "now ask the students to apply / justify" | targeted guidance that builds on students' ideas: counterexample, students check / justify, "why" questions |
| p5 | local confirmation or summary; "generalise to the principle and apply it to other shapes" | starts broadening beyond the case without stating or transferring the principle | states the general principle explicitly and applies or transfers it |

**What experts write** (consensus, 100% compliant):
- score 0 → recommendation only (36/36);
- score 1 → "what exists" + recommendation (40/40);
- score 2 → "what exists" only, **no recommendation** (40/40).
- A1 is close to this; A2 often adds a recommendation to score 2 (97 of 144).
- Median text length (consensus) 77–250 characters, longest for p5 / p2 score 1.

**Synthetic illustrations** (paraphrased, not from the data):
- **p4 = 1:** "A square has four right angles, so it is a rectangle", stated by the teacher → "what exists: you explained it from the definition; recommendation: let the students check it themselves".
- **p4 = 2:** "Noa says it doesn't look like a rectangle; everyone, check its angles: what does the definition require?"
- **p5 = 0** after the class concluded "every square is a rectangle": "recommendation: generalise to how one family of shapes can contain another and try it on rhombus / kite".

## 5. Comparison with production, the B200 handoff and the synthetic benchmark

| rule | production 1.4.3 prompt | B200 handoff (v2 / v2.1) | synthetic benchmark (v1.1.0) | **expert labels** |
|---|---|---|---|---|
| feedback only when a student error exists (Gate 1); "neutral → no feedback" | yes | p4 also on likely misconceptions | negative controls on correct answers / praise | **contradicted:** 47% of consensus feedback has no error skill; all 10 consensus turns that 1.4.3 hid were rated "neutral" |
| strict chain: identification 0 → only identification | yes | p1 ⟂ p4 | p1 ⟂ p4 | **p1 ⟂ p4 supported** (4/5, 51/66, 18/24) |
| max 1–2 skills (B8) | yes | over-selection is the main failure | no cap | experts use 3–4 in 17–34%; **not supported as an expert rule** (a display choice) |
| p2 relevant only if the teacher characterises (p2 strict) | opportunity-based | strict | strict (`EC-identifies-only-s6`, `EC-no-attempt-redirect-s3`, many EC = N) | **contradicted:** p2 used as 0 when the type is not named (consensus 4/14, A1 26/41, A2 21/42) |
| p3 missed opportunity → 0 | only when attempted | yes (v2.1) | left open / review | **supported by consensus** (14/15 p3 = 0); split between experts |
| p5 only for an actual leveraging move (p5 strict) | opportunity-based | strict | strict (EL = N on check questions, closings, controls) | **contradicted:** p5 = 0 is the most frequent p5 label, given at resolution points; production's v1 opportunity trigger fits better |
| no repeated positive feedback for the same skill (continuity Rule 1) | yes | — | `no_repeat_praise` in 2 `CONT-*` cases | **not supported:** experts re-credit on consecutive turns (70% in consensus) |
| score 2 has no recommendation | example says "only if score < 2" | open question (W4.4) | — | **supported by consensus** (40/40) |
| explanation turns: APR 0–1, never 2 | — | — | `explain-direct-*` APR 0–1 | **mostly supported** (APR 1 dominant), but experts give 2 when the explanation builds on students' contributions; the "never 2" is fine for pure telling only |
| "why do you think…?" | — | — | review (`rev-DI-generic-why-s1`) | **answered:** mostly APR 2 (A1 11/21), sometimes p3 credit |
| teacher-introduced wrong mathematics | trigger "incorrect_content" | — | review (`rev-EI-teacher-wrong-s4`) | **answered:** APR 0, with a correction in the text |
| generic peer redirect | — | W2.5: APR 1 | review (`rev-peer-redirect-s1-T4`) | **answered:** mostly APR 1 (A1 11/18) |
| closings / short praise after correct answers | no feedback | — | high-confidence "no feedback" controls | **contested** (A1 marks about 40–70%, mostly p5 0; consensus 2/5 closings, 0/1 short praise) |
| greetings / openings | no feedback | all N | all N | **supported** (rarely marked) |

**Synthetic benchmark labels that disagree with the experts** (flagged, not changed):
- **p2 strict:** `EC-identifies-only-s6`, `EC-no-attempt-redirect-s3`, and `EC = not_relevant` on the 18 missed-misconception cases. Experts would often allow p2 = 0.
- **p5 strict** ("not relevant"):
  - `EL-check-question-*` ×4, `EL-local-correction-s5`;
  - the closing controls `gen-close-*` ×4;
  - the correct-restatement controls (`ctl-correct-*-T6` ×5, `-T9` ×4);
  - `EI-no-error-praise-s1`, `gen-summary-request-s1`.
  - Experts often mark p5 = 0 at such resolution points. The decision label "no feedback" on these controls is therefore **expert-contested**, not unambiguous.
- **Continuity:** the `no_repeat_praise` constraints of `CONT-EI-repeat-same-error` and `CONT-APR-repeat-same-move` are a production rule (Rule 1), not an expert one.
- **Consistent with the experts:**
  - missed misconception = p1 0 (the 1.4.1 behaviour);
  - p1 ⟂ p4;
  - explicit identification = p1 2;
  - band-1 APR patterns;
  - greetings;
  - telling = APR 0–1.

## 6. 1.4.3 vs experts (local replay)

**Setup:**
- Every expert-labelled turn was replayed through committed 1.4.3: the real client and an unmodified local server, the full preceding conversation, the production scenario, an empty feedback history (as in the B200 evaluations).
- Image-only and empty turns are skipped (B22); 577 turns were analysed, with 0 failures and 0 retries.
- Pass 2 on the 324 gold-tier turns: decision agrees with pass 1 on 294 of 324; the APR score is the same in 130 of 130 shared rows.
- **Displayed semantics:** a skill counts only if feedback is shown.
- **Reference:** the pilot 1.3.0 output stored with each conversation (2.5 Flash-Lite, what teachers saw).

**Decision:**

| | consensus (73) | double, agreed (194) | vs A1 (596) | vs A2 (324) |
|---|---|---|---|---|
| 1.4.3 pass 1: P / R / κ | 0.96 / 0.81 / **0.63** | 0.96 / 0.81 / 0.57 | 0.90 / 0.70 / 0.39 | 0.89 / 0.79 / 0.56 |
| 1.4.3 pass 2 | 0.98 / 0.74 / 0.57 | | | |
| pilot 1.3.0 | 0.87 / 0.76 / 0.41 | 0.91 / 0.82 / 0.47 | 0.84 / 0.71 / 0.29 | 0.83 / 0.81 / 0.45 |
| expert vs expert | | | κ 0.41 (A1 vs A2) | |

**Decision misses:**
- consensus 10 (model quality "neutral" in all 10; 5 of them carry no error skill);
- A1 134 (100 without an error skill);
- false positives are rare (consensus 2).

**Relevance (consensus, pass 1)**, F1 with gold / model counts:

| | p1 | p2 | p3 | p4 | p5 |
|---|---|---|---|---|---|
| 1.4.3 | 0.36 (16 / 12) | 0.25 (14 / 2) | 0.21 (15 / 4) | **0.78** (50 / 37) | 0.64 (21 / 23) |
| pilot 1.3.0 | 0.32 (16 / 34) | 0.51 (14 / 29) | 0.08 (15 / 11) | 0.63 (50 / 32) | 0.46 (21 / 14) |

- **Rows per shown feedback:** 1.4.3 is always 1–2 (consensus: 12 / 33), against consensus 1 / 2 / 3+ = 12 / 22 / 18. On consensus turns with 3+ skills, 27 expert skills are missing from the model's output.
- **p2 / p3:** 1.4.3 selects them only as credit (p3 = 2), never as the missed-opportunity 0 the experts mostly use.

**Scores** (rows where both selected the skill; model − gold):

| | p1 | p4 | p5 |
|---|---|---|---|
| consensus, pass 1: exact / mean diff | 2/5 / +0.80 | 20/34 / **+0.35** (gold 1 → 2 in 13 of 14) | 1/14 / **+1.21** |
| consensus, pass 2 | 2/4 / +0.50 | 20/32 / +0.38 | 1/16 / +1.38 |
| vs A1 (all) | 45/69 / +0.32 | 66/217 / **+0.71** | 9/59 / **+1.29** |
| vs A2 (all) | 14/30 / +0.13 | 64/128 / +0.45 | 15/47 / +0.79 |
| agreed double items | 9/12 / +0.08 | 12/32 / +0.53 (17 × 1→2) | 2/7 / +1.29 |
| model score distribution (vs A1, all) | 2: 86, 0: 35, 1: 7 | **2: 267, 0: 14, 1: 0** | 2: 93, 1: 49, 0: 3 |
| expert distribution (A1) | 2: 87, 0: 66, 1: 22 | 1: 228, 2: 95, 0: 38 | 0: 90, 1: 12, 2: 9 |

The pilot 1.3.0 model shows the same pattern (APR 2 in 31 of 32 consensus rows; p5 +1.6).

## 7. X5: relevance

**Production rules contradicted by expert labels:**
1. "No quotable student error → no feedback" (Gate 1) and "neutral → no feedback": experts give APR / leveraging feedback on non-error turns, and these rules account for nearly all of 1.4.3's decision misses.
2. The strict chain ("identification 0 → assess identification only"): experts pair p1 0 with APR in most cases.
3. Continuity Rule 1 (no repeated positive credit): experts re-credit.
4. "At most 2 skills" as an assessment rule: experts often mark 3–4. Keep 2 as a *display* choice if wanted, but not as a relevance rule.

**B200 rules strongly supported:**
- p1 ⟂ p4;
- relevance ≠ success (all skills carry many 0s);
- decision = any relevant skill (true in all expert data by construction);
- p3 missed-opportunity 0 (by the consensus; one expert rarely uses it).

**B200 rules contradicted:** strict p5 and strict p2. The experts use both as missed opportunities.

**Enough agreement to justify a production change:**
- **p4 relevance:** the most frequent skill; the model already agrees as well as the experts do with each other.
- **p1:** score agreement is strong; relevance recall is the issue.
- **p5 as a missed opportunity at resolution points:** consensus 12 of 21 are 0; agreed items 11 × 0.
- **The decision rule:** stop suppressing non-error teaching moves. This raises recall, but conflicts with the synthetic "no feedback" controls on closings / praise, which are contested; test first.
- **Not yet:** p2 and p3 relevance (expert κ 0.26 / 0.10, thin data). Follow the consensus only after more agreement data.

## 8. X6: score calibration

**Confirmed on real expert turns:**
- **APR:** the model gives 2 almost always (267 of 281 rows vs A1; 100% of APR rows in both consensus passes). Experts give mostly 1 (consensus 25 / 24; A1 228 × 1 vs 95 × 2). Consensus score-1 APR rows became 2 in 13 of 14 (pass 1) and 12 of 12 (pass 2).
- **Leveraging:** inflated by 1–1.4 points. The model credits leveraging (1–2) where experts see a missed opportunity (0).
- **p1:** mild over-scoring (+0.1 to +0.8); experts' p1 scores agree with each other well (κ_w 0.81), so p1 is a fair target.

**Score 1 vs 2:**
- the most important calibration (APR is on nearly every expert feedback);
- the expert criterion is clear in the texts: 1 = teacher-led or generic, 2 = builds on students' ideas / students do the checking;
- but the experts themselves disagree 1-vs-2 in 40% of shared APR rows. Target the consensus and the score distribution, not individual rows.

## 9. Does anything still need the experts?

**Answered by the existing labels (do not ask again):**
- APR on non-error turns;
- p1 ⟂ p4;
- the p3 missed-opportunity rule (by consensus);
- p5 as a missed opportunity;
- no recommendation on score 2;
- "why" questions;
- generic peer redirects;
- teacher-introduced errors;
- repeat credit (allowed);
- openings;
- 3+ skills.

**Genuinely open:**
1. **p2 / p3 relevance policy:** the two experts systematically differ (A2 uses missed-opportunity 0 widely, A1 rarely). Only 5 consensus conversations arbitrate. Ask which annotator's practice should be the product default.
2. **Display volume:** experts mark 73% of turns with up to 4 skills. Is the product meant to show that much, or is a 1–2-row display (B8) a deliberate product reduction? That is a product decision, not an annotation question.
3. **Closings and praise after correct answers:** contested between the experts (p5 0 or nothing). Decide whether "could have generalised" belongs on every resolution turn.
4. **Exact bare acknowledgements, "?" probes, deferrals:** almost absent from the pilot data (5 bare acknowledgements, 0 bare "?"), so the 1.4.1 behaviour cannot be validated against experts. It stays covered by the synthetic benchmark.

## 10. Recommended first expert-grounded experiment: X6-APR

**One prompt change**, in the style of X1 / X2:
- rewrite the APR score bands with the expert contrast:
  - 1 = right direction but teacher-led / generic (explains, returns to the definition, comparison question without engaging the students' own ideas);
  - 2 = builds on the students' specific ideas or has the students check / justify (counterexample, "why" question, students apply the definition);
  - 0 = telling, or mathematically wrong content.
- Paraphrased synthetic examples only; no participant text in the prompt.

**Primary metrics (expert):**
- APR score distribution and mean difference against consensus and the agreed items (target: from +0.35 / +0.53 toward 0; score-1 share toward about 50% of consensus rows);
- APR weighted κ against A1 / A2 approaching the expert–expert 0.31.

**Guardrails:**
- decision / relevance on consensus and agreed items unchanged (κ ≥ pass-to-pass variation);
- p5 / p1 unchanged;
- the synthetic benchmark's high-confidence decision metrics and the 1.4.1 missed-misconception cases unchanged;
- validity, retries and latency as in X1 / X2.

**Why first:**
- the largest and clearest expert signal (systematic 1 → 2);
- the most frequent displayed skill;
- the best-covered score cell (60 + 40 gold rows);
- it changes no relevance or decision rule, so it isolates calibration.

**Next:**
- p5 as a missed opportunity at resolution points (X5-p5): relevance and score together;
- then the decision rule for non-error teaching moves, which needs the contested closing / praise controls resolved first.

## 11. Limitations

- **Pilot data:** 45 conversations from 9 teachers (1.3.0, 2.5 Flash-Lite students); consensus covers only 5 conversations.
- **Model input:** the replay used an empty feedback history and no drawings for PCK (as production: B17); the pilot conversations' later turns were shaped by the pilot's own feedback.
- **Turn features** (praise, closing, "why") are simple text heuristics used only for aggregate rates.
- **Paraphrased semantics** come from one researcher's reading of expert texts.

**Local files** (git-ignored, `pck_eval/local_b200/`):
- `build_b200_gold.py`, `b200_turns.jsonl`, `analyze_experts.py`, `expert_audit.json`, `features.py`, `features.json`, `rules.txt`;
- `bench/b200_replay.bench.js`, `jest.local.json`, `replay-r1.jsonl`, `replay-r2.jsonl`, `eval_vs_experts.py`, `eval_vs_experts.json`, `eval_summary.txt`.

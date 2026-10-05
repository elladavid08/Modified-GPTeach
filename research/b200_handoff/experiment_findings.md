# Experiment findings (developer summary)

Reference numbers come from `reports/p1_p4_reduced_task_v1/p1_p4_numeric_results_and_significance_v1.md`, unless another source is named.

**How to read the numbers**
- F1 columns are the mean across the 3 folds.
- FP/FN counts, score metrics and significance tests are pooled over 577 turns.
- Rows that failed to parse are excluded by the evaluator.
- Significance tests: exact McNemar, plus a bootstrap that resamples whole conversations (45 clusters, 10k iterations).

## 1. Setup

**Data (main line)**
- 45 Hebrew geometry simulation conversations, 9 pre-service teachers, 6 scenarios.
- 577 held-out turns, evaluated with user-grouped 3-fold CV (folds of 182 / 179 / 216 turns).
- 360 / 366 / 329 training turns per fold.
- Gold labels: 506 single-expert turns plus 71 joint-consensus turns.

**Task**
- One teacher turn in, one JSON out.
- The JSON holds the decision, p1 and p4 relevance, a 0/1/2 score per relevant dimension, and Hebrew feedback text.

**Models**
- **Gemini 2.5 Flash-Lite** (production-aligned), zero-shot and 8-shot, via Vertex with no JSON mode.
- **Gemma-4-31B-it** (local checkpoint), served by vLLM, in these variants:
  - zero-shot;
  - 8-shot with `response_format: json_object`;
  - LoRA SFT (r16/α32 on the attention projections, 3 epochs, lr 2e-4, completion-only loss);
  - "MODPO" rubric-margin DPO (arms W1/W2/W3, then v2a/v2b; β 0.1, lr 5e-7, 1 epoch, on top of SFT);
  - plain DPO (same pairs, and margin-free pairs);
  - Stage A, a label-only SFT.
- Inference: temperature 0.1, top_p 1.0, max_output_tokens 1000.

**Earlier exploratory work (background only)**
- Five-dimension task on a 71-turn consensus test set: Gemini, Gemma base, SFT, SFT + Type-A augmentation (gpt-oss-120b), and DPO.
- Qwen2.5-7B SFT baselines.
- Retrieval few-shot.

## 2. P1 / P4 main results [EVAL-P1/P4]

| model | dec F1 | p1 P | p1 R | p1 F1 | p4 F1 | p1 FP (p4-only FP) | parse / template fails |
|---|---:|---:|---:|---:|---:|---:|---:|
| Gemini FL zero-shot | 0.846 | 0.451 | 0.948 | 0.609 | 0.815 | 207 (154) | 4 / 333 |
| Gemini FL few-shot | 0.843 | 0.391 | 0.977 | 0.557 | 0.810 | 273 (175) | 0 / 124 |
| Gemma zero-shot | **0.881** | **0.678** | 0.639 | 0.653 | 0.843 | 57 (41) | 9 / 0 |
| Gemma few-shot | 0.867 | 0.665 | 0.715 | 0.682 | 0.826 | 70 (46) | 2 / 0 |
| Gemma SFT | 0.864 | 0.619 | 0.762 | 0.681 | 0.833 | 86 (66) | 0 / 0 |
| MODPO W3 | 0.874 | 0.642 | 0.779 | 0.701 | **0.843** | 80 (61) | 0 / 0 |
| plain DPO (same pairs)¹ | 0.873 | 0.635 | 0.785 | 0.699 | 0.845 | — | 0 / — |
| Stage A (labels only) | 0.869 | 0.665 | 0.755 | **0.706** | 0.834 | 69 (52) | 0 / n/a |

¹ From `reports/p1_p4_reduced_task_v1/plain_dpo_v1/plain_dpo_meanfold_table_v1.csv` (Sep 19). It has no narrative report yet, and `plain_dpo_ablation_plan_v1.md` still says "No results yet", which is stale.

## 3. Component-by-component: what improved what

### 3.1 Feedback decision (should_provide_feedback)
- **Best: Gemma zero-shot, decision F1 0.878 pooled.** No later model beat it.
- **SFT made the decision significantly worse** than zero-shot: −0.019 F1, CI [−0.033, −0.003].
- MODPO W3 recovered part of the loss: +7/−0 turns vs SFT, p = 0.016. This is post-hoc and would not survive Bonferroni correction.
- Plain DPO vs SFT on decision is null (p = 0.18).
- Gemini over-triggers feedback: −0.075 decision accuracy vs Gemma zero-shot, p = 0.0001.
- Earlier five-dimension task (71 turns): SFT had the best decision F1 (0.953), but no difference survived FDR correction [EVAL-5D-SMALL].
- *The two lines disagree on whether SFT helps the decision.* Trust the larger 577-turn result.

### 3.2 Relevance per dimension
**p1 (Error Identification) is the hard dimension.**
- Precision is stuck at 0.62–0.68 for every Gemma variant, including untrained ones.
- SFT raised recall from 0.64 to 0.76 but raised false positives from 57 to 86.
- About 75% of SFT's p1 FPs fall on turns where the gold label is p4 only. The model claims "the teacher identified the error" when the teacher made an adapted move without identifying it. The FP rate is 31.9% on p4-only turns vs 10.4% on turns with no gold feedback.
- **But 63.5% of model-p1-on-gold-p4 cases are legitimately p1.** A rule like "never p1 together with p4" collapses p1 F1 from 0.678 to 0.184.

Interventions on p1:

| intervention | effect on targeted p4-only FPs | significance |
|---|---|---|
| MODPO W3 | 66 → 61 | significant on paired tests; whole effect ≈15 examples |
| MODPO v2 (1.6× targeted pairs) | 61 → 60 | null, 0/5 criteria |
| plain DPO | ≈ W3 | W3 vs plain DPO: p = 0.58 for p1 |
| Stage A label-only | 66 → 52 (−21%) | suggestive, p = 0.06 |

- Plain DPO matching W3 means the rubric margin itself added nothing measurable.
- **Gemini Flash-Lite asserts p1 almost everywhere:** recall 0.95–0.98, precision 0.39–0.45, significantly worse than every Gemma model (p < 0.0001).

**p4 (Adapted Pedagogical Response) is easy and stable.**
- F1 is 0.83–0.85 for all Gemma models, with no meaningful separation.
- W3 vs SFT on p4 is significant but tiny (+8/−0 turns).

### 3.3 Score (0/1/2, scored only where gold and prediction both mark the dimension relevant)
Source: `p1_p4_score_agreement_v2_paper_models.md`.

| model | p1 n | p1 exact | p1 MAE | p1 κ_quad | p4 n | p4 exact | p4 MAE | p4 κ_quad |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Gemini zero-shot | 166 | 0.39 | 0.75 | 0.16 | 350 | 0.39 | 0.67 | 0.09 |
| Gemma zero-shot | 108 | 0.56 | 0.56 | 0.40 | 316 | 0.47 | 0.55 | **0.41** |
| Gemma few-shot | 125 | **0.58** | **0.47** | **0.57** | 329 | 0.51 | 0.52 | 0.38 |
| Gemma SFT | 135 | 0.49 | 0.62 | 0.35 | 311 | **0.60** | **0.41** | 0.34 |
| MODPO W3 | 138 | 0.47 | 0.63 | 0.34 | 314 | 0.60 | 0.41 | 0.35 |
| plain DPO | 139 | 0.50 | 0.60 | 0.38 | 315 | 0.62 | 0.39 | 0.37 |

- **There is no single best scorer.** Few-shot is best for the p1 score, while SFT/DPO are best on p4 exact agreement and MAE. SFT's p4 MAE gain over zero-shot is significant (−0.15).
- Trained models over-score p1. SFT's mean signed difference is +0.375 vs Inbal (`human_model_score_difference_analysis_15conv_v1.md`).
- The p1 score is the clearest gap to humans: experts agree on it with κ_w 0.77, while models reach 0.20–0.32.
- Gemini Flash-Lite scores worst and inflates scores (five-dimension mean score 1.54 vs gold 1.03 [EVAL-5D-SMALL]).
- Joint 4-class {N,0,1,2} view, pooled (`p1_p4_joint_4class_evaluation_v1.md`):
  - p1 macro-F1 is best for Gemma few-shot (0.499); p4 macro-F1 is best for W1 (0.489).
  - After Holm correction, no 4-class comparison is significant (`…_significance_conversation_v1.md`).

### 3.4 Feedback text
- Metric: BERTScore with xlm-roberta-base, template markers stripped, computed only where both gold and model wrote text.
- **Fine-tuning improves wording:** SFT, DPO and MODPO score about 0.880 on p1 and 0.871 on p4, vs about 0.853 / 0.86 for untrained Gemma and Gemini. All CIs exclude zero.
- **Preference optimization did not change text:** every MODPO and DPO arm is about equal to SFT.
- Trained models are also shorter: about 113 characters per dimension vs about 200 for prompt-only models, closer to Inbal's style.
- **BERTScore says nothing about relevance.** Gemini's BERTScore is within 0.03 of Gemma's while its relevance κ is 0.18–0.32 lower.
- No human rating of feedback usefulness exists.

## 4. Five-dimension findings (p2 / p3 / p5) [EVAL-5D-SMALL — 71 turns, nothing significant after FDR]

Sources: `reports/template_controlled_v2_1/template_controlled_final_summary.md` and `reports/dpo_v2_1_template_controlled/final_dpo_results_summary_for_avi.md`.

| model | dec F1 | p1 | p2 | p3 | p4 | p5 | dims per turn (gold 1.63) |
|---|---:|---:|---:|---:|---:|---:|---:|
| Gemini zero-shot | 0.912 | 0.48 | 0.52 | 0.39 | 0.90 | 0.62 | 3.45 |
| Gemini few-shot | 0.920 | 0.46 | 0.45 | 0.36 | 0.92 | 0.62 | 2.76 |
| Gemma zero-shot | 0.935 | 0.67 | 0.54 | 0.59 | 0.91 | 0.63 | 2.03 |
| Gemma SFT | 0.953 | 0.64 | 0.43 | 0.56 | 0.92 | 0.70 | 1.66 |
| SFT → DPO | 0.944 | 0.62 | 0.50 | 0.54 | 0.92 | 0.74 | 1.65 |

- **p2 is the weakest dimension** (F1 0.27–0.55), and the p2/p3 boundary is the main confusion.
- Type-A augmentation hurt p2 (0.27).
- p4 is again easy (0.90–0.93).
- p5 benefits from the strict "actual leveraging" rule (descriptively).
- Experts themselves disagree heavily on dimension selection. Round-2 admin IRR κ by dimension: p1 0.33, p2 0.24, p3 0.07, p4 0.06, p5 0.43.

## 5. Human agreement baseline [EVAL]
Source: `human_model_pairwise_agreement_15conv_v1.md` (15 conversations, 243 turns, Inbal vs Otman).

| measure | expert vs expert | SFT vs Inbal | SFT vs Otman |
|---|---:|---:|---:|
| decision κ | 0.41 | 0.63 | 0.47 |
| p1 relevance κ | 0.40 | 0.41 | 0.46 |
| p4 relevance κ | 0.32 | 0.56 | 0.45 |
| p1 score κ_w | 0.77 | 0.20 | 0.32 |
| p4 score κ_w | 0.22 | 0.33 | 0.50 |

- On decision and p4 relevance, the model agrees with each expert at least as well as the experts agree with each other.
- On p1 score, the model falls well short of expert–expert agreement.
- The analysis script for these numbers is missing from the repo; they are stored results only.

## 6. Rejected hypotheses [EVAL-P1/P4]
- **p1 over-prediction comes from training-label skew:** rejected. P(p1) is 0.296 in training vs 0.307 held out.
- **Context or history length drives p1 FPs:** rejected. ΔR² ≈ 0 once turn number is controlled (`sft_v2_context_length_probe_v1.md`).
- **Suppressing repeated p1 later in a conversation helps:** rejected. Even an oracle rule hurts, because 75% of true p1 events also follow an earlier p1 (`p1_temporal_state_diagnostic_v1.md`).
- **Spurious p1 text can be filtered by surface features:** rejected.
- **A few bad users or conversations explain the errors:** rejected (errors spread over 8/9 users and 29/45 conversations).
- **The r_text reward term matters:** rejected (inert).

**Late-conversation pattern (confirmed descriptively):**
- SFT's p1 FP rate rises from 1.5% at turns 1–3 to 25.2% at turn 15+.
- Gold p1 rate declines late in the conversation (final/peak ratio 0.48), but no model reproduces the decline (best 0.73; Gemini 0.83–0.86).

## 7. Limitations
- **Small, non-naive data:** 45 conversations. The held-out set was reused for hypothesis generation, and effects are around 15 examples.
- **Gold is mostly one expert**, and inter-expert κ is low.
- Gold feedback text follows the template only 91% of the time.
- **Scenarios are not held out.** Generalization to new topics, grades or languages is untested.
- **Gemini was tested only as Flash-Lite**, with no JSON mode and the research prompt, so it is not an upper bound for Gemini.
- **No production-prompt evaluation**, and no human evaluation of feedback usefulness.
- **Some older reports are unreliable:**
  - Several August reports swap the annotator names.
  - The legacy `kappa_p*_vs_gold` column is unreproducible.
  - `p1_p4_modeling_line_final_interpretation_v1.md` §1 has stale rows.
  - See `LAK_PAPER_CONTEXT.md` §7.

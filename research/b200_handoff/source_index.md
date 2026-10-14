# Source index: conclusion → evidence

All paths are relative to `research/pck_feedback/`. R = `reports/p1_p4_reduced_task_v1/`.

| conclusion | source |
|---|---|
| Authoritative experiment line, decoy dirs, known traps | `LAK_PAPER_CONTEXT.md` |
| Five skill definitions, 0/1/2 bands, Hebrew patterns | `src/pck_feedback/pck_skills.py::PCK_SKILLS` (port of `server/universal_pck_skills.js`) |
| v2 relevance/boundary rules, scenario guides | `src/pck_feedback/pck_skills_v2.py` (`RELEVANCE_CLARIFICATIONS`, `BOUNDARY_DECISION_RULES`, `SCENARIO_GUIDES`) |
| v2.1 p3 missed-opportunity rule, relevance ≠ performance | `src/pck_feedback/pck_skills_v2_1.py` |
| Final p1/p4 prompt text and order | `src/pck_feedback/prompts/p1_p4_reduced_core.py::render_reduced_prompt_text`; `prompts/p1_p4_reduced.py`; rendered example `R/reduced_prompt_full_example.md` |
| Five-dimension prompt with template | `src/pck_feedback/prompts/baseline_prompt.py::build_template_controlled_prompt` |
| Label-only (Stage A) prompt, turn position | `src/pck_feedback/prompts/p1_p4_label_only_core.py` |
| Template is researcher-derived | `reports/format_and_overprediction_v2_1/proposed_prompt_template_instruction.md`, `format_and_overprediction_summary.md` §1; `reports/template_controlled_v2_1/template_controlled_final_summary.md` §1 |
| Gold template deviations (49 labels) | `R/schema_validation_report.md` |
| Expert compliance per annotator (94% / 48%) | Recount over `data/training/sft/gemma_rubric_v2_1_p1_p4_user_cv3_v1/fold*/eval_turns.jsonl` + `data/processed/train_individual_annotations_v1.jsonl` (annotator map) — not in any report |
| Annotation structure (one text per dimension) | `data/irr_round2_15/irr_round2_15_double_annotations_raw.json`; `R/paired_protocol_extraction_diagnostic_v2.md` |
| Annotator ID → name (Inbal = PBdk…, Otman = mGWX…) | `LAK_PAPER_CONTEXT.md` §7.3; IRR export `report.annotatorNames` |
| Main CV table (decision / p1 / p4, FP, parse/template) | `R/p1_p4_numeric_results_and_significance_v1.md` §1; `R/tables/p1_p4_main_cv_results_with_gemini_v1.csv`; per-run `data/predictions/<run_id>/metrics.json` |
| Significance (McNemar, cluster bootstrap) | Same report §4, §4a, §4b; `R/tables/p1_p4_significance_table_v1.csv`, `p1_p4_decision_significance_v1.csv`; code `scripts/analyze_p1_p4_modpo_gate_f_v1.py` |
| SFT worsens decision; W3 +7/−0 | Numeric report §4a |
| p1 FPs concentrated on gold-p4-only turns; 63.5% legit | `R/p1_p4_methods_and_findings_explained_v1.md` §2.3; `R/final_error_sensitivity_and_overlap_v1.md` |
| Score agreement (exact/MAE/κ) | `R/p1_p4_score_agreement_v2_paper_models.md`; `R/tables/p1_p4_score_agreement_v2_paper_models.csv`; `scripts/recompute_score_agreement_v2_paper_models.py` |
| Do not use legacy `kappa_p*_vs_gold` | `R/p1_p4_score_agreement_recomputed_v1.md` §5 |
| Joint 4-class view | `R/p1_p4_joint_4class_evaluation_v1.md`; `R/p1_p4_joint_4class_significance_conversation_v1.md`; `scripts/analyze_joint_4class_v1.py` |
| BERTScore text results | `R/text_metrics_bertscore_results_v1.md`; `data/evaluations/text_bertscore_p1_p4_user_cv3_v1_normalized_no_template/` |
| Plain DPO ≈ MODPO W3 | `R/plain_dpo_v1/plain_dpo_meanfold_table_v1.csv`, `plain_dpo_significance_v1.csv`, `plain_dpo_score_agreement_v1.csv`, `plain_dpo_bertscore_v1.csv` |
| MODPO design, weights, results | `R/modpo_rubric_margin_plan_v1.md`, `R/modpo_gate_f_full_results_v1.md`, `R/modpo_v2_heldout_eval_results_v1.md`; `scripts/build_p1_p4_rubric_reward_v1.py::WEIGHT_VECTORS` |
| Stage A label-only | `R/sft_v2_o2_gate_e_eval_results_v1.md` |
| Human vs model agreement (15 convs) | `R/human_model_pairwise_agreement_15conv_v1.md`, `R/human_model_score_difference_analysis_15conv_v1.md` (script absent; stored results only) |
| Protocol-shift claim superseded | `R/protocol_shift_finding.md` → `R/paired_protocol_analysis_v2.md` §5 (note: annotator names swapped there) |
| Context length not causal; late-conversation FP rise | `R/sft_v2_context_length_probe_v1.md`; `R/p1_temporal_state_diagnostic_v1.md` |
| Few-shot selection and results | `scripts/build_p1_p4_user_cv3_fewshot_v1.py`; `R/user_grouped_cv_fewshot_selection.csv`; `R/user_grouped_cv_few_shot_results_v1.md`; `data/few_shot/` |
| Retrieval few-shot NO-GO | `R/retrieval_v3_validation_summary.md`; `R/protocol_shift_finding.md` |
| Five-dimension results (71 turns) | `reports/template_controlled_v2_1/template_controlled_final_summary.md`; `reports/dpo_v2_1_template_controlled/final_dpo_results_summary_for_avi.md`; `reports/current_pck_model_results_summary_v2_1.md`; `reports/error_analysis_v2_1/error_analysis_summary.md` |
| Over-selection and score inflation | `reports/format_and_overprediction_v2_1/` (`dimension_count_distribution_by_run.csv`, `score_inflation_by_run.csv`) |
| Parser behaviour | `src/pck_feedback/inference/parsing.py`; tests `tests/test_parsing.py` |
| Evaluator drops parse failures; template check | `scripts/evaluate_p1_p4_reduced_v1.py::evaluate`, `::template_issue` |
| Per-run parse status counts | `data/predictions/*p1_p4_user_cv3_v1_fold{1,2,3}*/predictions.jsonl` (`parse_status`, `parse_error`, `raw_model_output`) |
| Gemini without JSON mode | `src/pck_feedback/models/vertex_gemini.py::complete`; comment in `config/runs/gemini_2_5_flash_lite_fewshot_p1_p4_user_cv3_v1_fold1.yaml` |
| Retry policy | `src/pck_feedback/models/openai_compatible.py::_call_with_retry` |
| feedback_text-as-object crash and fix | `logs/pck-cv3-fold1-smoke-eval-227256.err`; `R/user_grouped_cv_smoke_v1.md` §2 |
| Quote repair tool | `scripts/repair_prediction_json_quotes.py`, `scripts/repair_p1_p4_reduced_prediction_json_quotes_v1.py`; `R/repair/` |
| Strict-format sensitivity | `R/final_error_sensitivity_and_overlap_v1.md` §1; `R/tables/p1_p4_format_sensitivity_v1.csv` |
| Context-overflow incidents and 32k recovery | `docs/gemma_fewshot_v2_1.md`; `logs/pck-gemma-31b-fs-v21-full-16k-204953.err`; `cluster/30_…`–`38_…sbatch` |
| Dead-endpoint loss (MODPO eval) | `R/modpo_gate_f_full_results_v1.md` §3 |
| DPO OOM fix | `reports/dpo_v2_1_template_controlled/dpo_training_memory_fix_report.md` |
| Inference settings (temp 0.1, 1000 tokens) | `config/runs/*p1_p4_user_cv3_v1_fold*.yaml` |
| SFT / DPO hyperparameters | `config/training/gemma_4_31b_sft_p1_p4_user_cv3_v1_fold1.yaml`; `config/training/gemma_4_31b_dpo_*_fold1.yaml` |
| SFT training guards | `src/pck_feedback/training/train_sft.py`; `training/build_sft_dataset.py` |
| Resume-safe inference | `src/pck_feedback/inference/run_inference.py` |
| Gold distributions (p1 400/65/29/83, p4 221/38/224/94) | `R/p1_p4_joint_4class_evaluation_v1.md` §3 |
| Few-shot candidate labels (verified) | `data/training/sft/gemma_rubric_v2_1_p1_p4_user_cv3_v1/fold{1,3}/eval_turns.jsonl` by `example_id` |

## Known artifact disagreements
- Annotator names are reversed in `user_grouped_cv_materialization_plan_v1.md` and `paired_protocol_analysis_v2.md`. Trust the IRR export.
- `user_grouped_cv_few_shot_results_v1.md` §3 says both few-shot parse failures were truncation caused by length. Raw outputs show one repetition loop and one 8-token stub.
- `plain_dpo_ablation_plan_v1.md` still says "No results yet", but result CSVs exist in `R/plain_dpo_v1/`.
- `p1_p4_modeling_line_final_interpretation_v1.md` §1 has stale zero-/few-shot rows.
- The decision-F1 effect of SFT disagrees between lines: worse than zero-shot on 577 turns, best on the 71-turn five-dimension set. Neither result is corrected for multiplicity on the small set.

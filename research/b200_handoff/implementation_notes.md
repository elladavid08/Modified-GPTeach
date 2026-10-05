# Reusable implementation patterns

All paths are relative to `research/pck_feedback/`. The code is Python. Production is JS/Node, so port the ideas, not the code.

## 1. Parsing pipeline: never raise, keep raw output

`src/pck_feedback/inference/parsing.py::parse_model_response`
1. `_strip_code_fences` (regex ```` ```(?:json)? … ``` ````).
2. `json.loads`. On failure, `_extract_json_substring` slices from the first `{` to the last `}` and marks the result `repaired`.
3. Pydantic `Prediction` construction. A `ValidationError` (e.g. `feedback_text` returned as an object) is caught and turned into a failed result.
4. `_failed_prediction` returns a safe default: no feedback, every dimension irrelevant, `parse_status="failed"`, and a `parse_error` reason.
5. The output always carries `raw_model_output`, `parse_status` (`ok`/`repaired`/`failed`), `parse_error`, `prompt_version`, `rubric_version`, latency and token counts (`schemas/prediction.py`).

Mirrors production's defensive defaulting (`server/server.js` ~837–896, per the docstring).

**Weak spots to avoid when porting:**
- Coercion is silent: `_build_dimensions` and `_coerce_score` change invalid fields without recording it.
- There is no trailing-comma or quote repair.
- `finish_reason` is not recorded.

## 2. Validation layers (separate from parsing)

- **Schema** (`scripts/build_p1_p4_rubric_reward_v1.py::schema_ok`): the dimension set is exactly the expected one, and `should_provide_feedback` is true iff some dimension is relevant.
- **Template** (`scripts/evaluate_p1_p4_reduced_v1.py::template_issue`): checks the score↔marker rule, the order of markers for score 1, that irrelevant dimensions have null values, and that text is non-empty.
- **Marker regex** (tolerates spaces and a full-width colon): `build_p1_p4_rubric_reward_v1.py::MARKER_RE` = `(?<![\w֐-׿])(?:מה\s+קיים|המלצה)\s*[:：]?`
- **Counting:** the evaluator reports parse, schema and template failures separately (`metrics.json`). Only parse failures are excluded from scoring. `final_error_sensitivity_and_overlap_v1.md` re-scores under strict rules (abstain / forced) to see how much format failures flatter a model.

## 3. Quote repair (offline, conservative)

`scripts/repair_prediction_json_quotes.py::repair_unescaped_quotes_in_strings`
- Inside a string, a `"` is escaped unless the next non-space character is `, } ] :` or end of input.
- It writes a copy, marks rows `ok_repaired`, keeps the raw output, refuses to overwrite without `--force`, and is applied the same way to every run.
- It fixes about half of the observed quote failures and is fooled by `("a", "b")`.

## 4. Prompt assembly

- **Versioned registry:** `prompts/registry.py::PROMPT_REGISTRY` maps `prompt_version` to a builder. The rubric version is a separate axis (`pck_rubrics.py`). Both are stamped on every prediction.
- **Pure-text core:** `p1_p4_reduced_core.py` and `p1_p4_label_only_core.py` have no dependencies. Training and inference render the same function, so prompts match byte-for-byte by construction.
- **Section-based assembly:** few-shot demos and the board-image notice are spliced in at a named heading. The builder refuses if the heading count is not exactly one (`baseline_prompt.build_template_controlled_prompt`).
- **Few-shot loaders** validate before use: the expected count, no duplicate IDs, the exact dimension set, decision == OR of the dimensions, and that the **target example is not in the demo set** (leakage guard) (`p1_p4_reduced.format_reduced_few_shot_examples`, `baseline_prompt.load_few_shot_examples`).
- **Scenario guide selection:** `pck_skills_v2.scenario_guidance_for_prompt` matches the scenario's `target_pck_skills` markers, with a keyword fallback in Hebrew and English. Only the relevant guide is included, which keeps prompts short.
- **Dry-run preview:** `pck-research render-prompt` (`prompts/preview.py`) renders the exact prompt to Markdown without calling a model.
- **History format:** `format_conversation_history` emits `מורה:` / `תלמיד:` lines for all prior turns. The empty-history text is `אין היסטוריה קודמת - זו התגובה הראשונה של המורה`.

## 5. Model adapters and inference settings

- **Interface:** `models/base.py::ModelAdapter.complete(PromptPayload, generation_config) -> RawCompletion`. The payload is text plus optional images. Adapters: `vertex_gemini.py` and `openai_compatible.py` (OpenAI, vLLM).
- **Retry:** 3 attempts with 2s/4s backoff on *any* exception (`openai_compatible._call_with_retry`). Improve this by not retrying 4xx and context-length errors.
- **JSON mode:** `response_format: json_object` is passed only by the OpenAI-compatible adapter. The Vertex adapter drops it. In production, set Gemini's `response_mime_type="application/json"`, ideally with a response schema. The research augmentation script already did this (`scripts/generate_type_a_candidates_v2_1_full_gpt_oss_120b.py`).
- **Paper settings:**
  - temperature 0.1, top_p 1.0, max_output_tokens 1000;
  - vLLM `max_model_len` 8192 for zero-shot and trained models, 32768 for 8-shot;
  - `enable_thinking: false` in the chat template;
  - no guided decoding.
- **Endpoint config pitfall:** a `base_url` in the run config overrides the env var. A dead endpoint showed up as "all rows failed" rather than a crash. Add a preflight `/v1/models` check; the sbatch scripts also assert `max_model_len`.

## 6. Batch robustness and logging

- **Resume-safe inference:** `inference/run_inference.py` skips `(run_id, example_id)` pairs already in the output JSONL, and appends one record per call. This enabled the 32k-context recovery of the 4 overflowing rows. `force_rerun` starts fresh.
- One failed call never aborts the batch; it is logged and counted.
- Shell runners assert expected row counts and schema, and gate on `n_parse_failed == 0` where required (`cluster/run_p1_p4_reduced_eval_v2.sh`).
- **Separate raw and parsed outputs:** every record keeps the raw text next to the parsed fields, so any parser change can be replayed offline without re-calling the model.

## 7. Training-side guards (if production ever fine-tunes)

- **SFT** (`training/train_sft.py`):
  - completion-only loss (`mask_prompt_tokens`, `derive_response_template`);
  - tokenizer length preflight that never silently truncates (`run_length_preflight`, `enforce_length_preflight`; max observed 6,425 tokens);
  - LoRA target-module validation;
  - chat-template preflight.
- **SFT dataset** (`training/build_sft_dataset.py`): targets are re-serialized into the exact inference JSON (`build_target_json`). The split is grouped by conversation or user (`group_split`). The build hard-fails on test leakage (`_assert_no_consensus_leakage`).
- **DPO:** precompute reference log-probs to avoid two resident backbones, and set `on_overlong_sequence: fail`.

## 8. Evaluation and statistics (reusable)

- **Metrics:**
  - decision, per-dimension P/R/F1 and score MAE (`eval/run_eval.py`);
  - the score is compared only where gold and prediction both include the dimension (`run_eval.py` ~L240–248);
  - quadratic weighted kappa (`eval/metrics.py::quadratic_weighted_kappa`).
- **Significance** (`scripts/analyze_p1_p4_modpo_gate_f_v1.py`): `mcnemar_exact`, `bootstrap_diff` (conversation-cluster, 10k iterations, seed 20260827), `pooled_f1`.
- **Text:** BERTScore with xlm-roberta-base layer 9, with template markers stripped first (`scripts/evaluate_feedback_text_bertscore.py`, `normalize_feedback_text_pairs.py`).

# Failure modes: structured output, parsing, context

**Scope:** 30 paper runs (577 turns per model family), `data/predictions/*p1_p4_user_cv3_v1_fold{1,2,3}*`.
Inner-val, smoke, and v2a/v2b runs are excluded. Counts were rechecked directly from `parse_status`.

**Labels:**
- **CONFIRMED**: seen in raw output or logs.
- **HYPOTHESIS**: plausible, but not verified.

## 0. Summary

| run | parse failed | schema fail | template fail (dims / turns) |
|---|---:|---:|---:|
| Gemma-31B zero-shot | 9 (1.6%) | 0 | 0 |
| Gemma-31B few-shot (json_object) | 2 (0.3%) | 0 | 0 |
| Gemini Flash-Lite zero-shot | 4 (0.7%) | 6 | 333 / 251 |
| Gemini Flash-Lite few-shot | 0 | 0 | 124 / 104 |
| SFT, DPO, MODPO (all arms) | 0 | 0 | 0 |

- No row anywhere is `repaired`.
- **For Gemini, the main format problem is template violations, not JSON syntax.**
- The evaluator drops parse-failed rows from metrics. Rows lost to HTTP errors are never written at all.

## 1. Unescaped ASCII `"` inside Hebrew prose (CONFIRMED)

- **What:** the model quotes a student inside `feedback_text`, e.g. `…את הטעות של רועי ("זה לא מדויק")…`. This raises `Expecting ',' delimiter`.
- **Frequency:**
  - 8 of 9 Gemma zero-shot failures.
  - 1 Gemini failure (fold 2, `awtDWM05R2Su7YuhmxxX__9`).
  - Also seen in earlier val and template-controlled runs.
  - Hebrew gershayim `״` never appeared; models always used ASCII `"`.
- **HYPOTHESIS:** JSON mode and/or demos prevent it. Gemma few-shot with `response_format: json_object` had 0 quote failures and correctly escaped `\"` 38–67 times per fold.
- **Repair:**
  - `scripts/repair_prediction_json_quotes.py::repair_unescaped_quotes_in_strings` escapes a `"` unless the next non-space character is `, } ] :`.
  - Run in memory on the 15 paper failures, it would fix 7.
  - It fails on quoted lists like `("…", "…")`.
  - It was never applied to the paper runs.

## 2. Trailing comma before `}` (CONFIRMED)

- **What:** `…",\n    }`. This is 3 of the 4 Gemini zero-shot failures.
- **Cause (CONFIRMED from code):** Gemini had no JSON mode. `src/pck_feedback/models/vertex_gemini.py::complete` forwards only temperature, max_output_tokens and top_p, and silently ignores `response_format`.
- No repair exists in the pipeline.

## 3. Degenerate repetition loop to max tokens (CONFIRMED)

- **What:** the model repeats a word (`למסביב…`) until `completion_tokens = 1000`, leaving an unterminated string.
- **Where:** Gemma zero-shot fold 2 `kp0Lf6j3rl3FOPUR8FZ3__3`; Gemma few-shot fold 2 `JYmpFl5ICO3ULwKexQmY__6`.
- **Conflict:** `user_grouped_cv_few_shot_results_v1.md` §3 attributes both few-shot failures to long prompts squeezing the output budget. The raw outputs show that is inaccurate: one is this loop, the other is mode 4.
- A larger token budget would not fix a loop.
- Normal outputs run at most about 430 tokens (Gemma base) and 537 (Gemini). Trained models average about 153.

## 4. Output stops after ~8 tokens (CONFIRMED symptom, cause unknown)

- **What:** Gemma few-shot fold 2 `session_1781609310273_0x53abgj9__13` returned only `{\n  "should_provide_`. That took 236 ms with an 11,472-token prompt.
- It is not a context limit: the server ran with max_model_len 32768.
- **HYPOTHESIS:** early EOS or stop under json_object decoding.
- **Not verifiable:** `models/openai_compatible.py::complete` does not record `finish_reason`.

## 5. `feedback_text` emitted as an object (CONFIRMED)

- **What:** `{"מה קיים": "...", "המלצה": "..."}` instead of a string. The model turned the template markers into JSON keys.
- **Impact:** this crashed SFT smoke eval job 227256 at row 173 with an uncaught pydantic `ValidationError` (`logs/pck-cv3-fold1-smoke-eval-227256.err`).
- **Fix:** an `except ValidationError` guard in `inference/parsing.py::parse_model_response` records the row as `failed` and keeps the raw output. Regression tests are in `tests/test_parsing.py`.
- It does not occur in the final paper runs.
- **Relevance to production:** any structured-output pipeline that puts labels inside a string field is exposed to this.

## 6. Score-conditioned template violations (CONFIRMED, the dominant problem)

- **Gemini zero-shot:** free prose with no markers.
- **Gemini few-shot:** mostly "score 2 must not contain המלצה:" — the model adds a recommendation even when the move was good.
- **Strict scoring changes results.** If template-violating dimensions count as failures, Gemini zero-shot p1 F1 drops from 0.606 to 0.393 (abstain rule) or 0.267 (forced) (`final_error_sensitivity_and_overlap_v1.md` §1; `tables/p1_p4_format_sensitivity_v1.csv`).
- **Gold itself deviates:** 9% of expert texts break the strict rule (`schema_validation_report.md`). Most common is score 2 with a recommendation.
- **Check:** `scripts/evaluate_p1_p4_reduced_v1.py::template_issue`.

## 7. Decision inconsistent with dimensions (CONFIRMED)

- **What:** `should_provide_feedback = true` while both dimensions are irrelevant.
- **Frequency:** Gemini zero-shot only, 6 rows. 0 elsewhere.
- **Detection:** reported as a "schema failure" by the evaluator, but the row is still scored.
- **Not a failure:** `feedback_text_overall = null` while the decision is true. All training targets have it null by design.

## 8. Silent normalisation hides schema errors (CONFIRMED from code)

- **Where:** `parsing.py::_build_dimensions` and `_coerce_score`.
- **What they do:**
  - null out score and text when `relevant = false`;
  - map an out-of-range score to None;
  - treat a missing dimension as irrelevant.
- **Consequence:** the evaluator's checks for "irrelevant values are not null" and "dims != {p1, p4}" can never fire on parsed rows. For example, two Gemma few-shot outputs were missing `p4` and were never flagged.
- **Earlier latent bug (documented as currently unaffected):** a missing prompt version in `REDUCED_P1_P4_PROMPT_VERSIONS` would fall through to the five-dimension IDs and silently mis-parse. See the comment at the top of `parsing.py`.
- **Production lesson:** separate *coercion* from *validation*, and log every coercion.

## 9. Markdown fences (CONFIRMED, harmless)

- Gemini fenced nearly every output.
- Fold-3 trained adapters fenced about 100 of 216 outputs; folds 1 and 2 fenced none. The fenced rows cluster by conversation. HYPOTHESIS: something in those prompts triggers it.
- `_strip_code_fences` handles all of these and still counts them as `ok`.

## 10. Context-length failures (CONFIRMED, infrastructure)

- **vLLM 400 "maximum context length":**
  - Seen repeatedly in few-shot smoke jobs at 8k context, even after cutting output to 512 tokens.
  - At 16k, 4 long-history turns (prompt ≥ 15,385 tokens) still overflowed.
  - Recovered with a 32k rerun in resume mode (cluster jobs 30–38, `docs/gemma_fewshot_v2_1.md`, `logs/pck-gemma-31b-fs-v21-full-16k-204953.err`).
- **Zero-shot rubric v2 at 8k:** 2000 output tokens overflowed, which led to the standard `max_output_tokens: 1000`.
- **Retrieval k = 12 at 32k:** 7–9 rows per config lost, and those configs were discarded as biased toward easier rows (`retrieval_v3_validation_summary.md`).
- **Retry waste:** the adapter retries every exception 3 times, including deterministic 400s (`openai_compatible.py::_call_with_retry`).
- **Context length did not cause label errors:**
  - SFT p1 FPs rise with history length in a univariate view, but the effect disappears once turn number is controlled (`sft_v2_context_length_probe_v1.md` §5).
  - The researcher's earlier proposal to truncate history was retracted.
- **Late-conversation errors are real but positional:**
  - The p1 FP rate rises from 1.5% to 25% over the conversation, while gold p1 becomes rarer late.
  - HYPOTHESIS: the model does not learn that later teacher turns rarely "identify a new error". Adding the turn number to the prompt did not fix it (Stage A).

## 11. Other infrastructure incidents (CONFIRMED)

- **Wrong endpoint, silent loss:** MODPO eval jobs 230733–41 wrote 0 predictions (182 connection errors each, about 5.4 GPU-hours lost). The cause was a `base_url` in the run config overriding the env var (`openai_compatible.py:53`). Per-row failures are logged and skipped, so a fully dead endpoint still "completes".
- **DPO training OOM:** two 31B backbones were resident at once. Fixed by precomputing reference log-probs (`reports/dpo_v2_1_template_controlled/dpo_training_memory_fix_report.md`).
- **BERTScore crash:** the scorer crashed on empty text after stripping markers. Fixed by skipping empty pairs (`dpo_candidate_resume_fix_report.md`).
- **gpt-oss-120b augmentation:**
  - JSON with unescaped quotes was handled by a regex fallback (`generate_type_a_candidates_v2_1_full_gpt_oss_120b.py::parse_output`).
  - Leaked reasoning is rejected via `FORBIDDEN_PATTERN`.
  - 70 of 1,257 outputs had duplication or copy errors.
- **Unexplained, undocumented:** jobs 225379/80 failed on every call with `'NoneType' object has no attribute 'text'`. HYPOTHESIS: the prompt or response was None.

## 12. Verbosity and over-selection (CONFIRMED, quality rather than format)

- **Over-selection:** prompt-only models select 2.0–3.5 dimensions per turn vs 1.63 in gold [5-dim, 71 turns].
- **Verbosity:** prompt-only completions are about 230–290 tokens vs about 153 for trained models; per-dimension text is about 200 characters vs about 113.
- **Score inflation:** Gemini Flash-Lite's mean score is 1.54 vs gold 1.03 (`reports/format_and_overprediction_v2_1/`).
- **Duplication:** not observed in final predictions beyond the repetition loops in §3.

# B200 PCK-feedback research → production handoff

Compact digest of the offline B200 research line (`research/pck_feedback/`) for whoever improves the
production PCK feedback agent. Research/documentation only — nothing in the research tree was changed.

## Files

| file | what it gives you |
|---|---|
| `pck_and_feedback_rules.md` | p1–p5 definitions, relevance + 0/1/2/N rubric, boundary rules, what feedback text should contain per score |
| `prompt_and_examples.md` | final prompt design (section order), JSON schema, prompt lessons, 6 few-shot candidates (verbatim Hebrew) |
| `experiment_findings.md` | models/methods tested, per-component results (decision / relevance / score / text), P1 vs P4, limitations |
| `failure_modes.md` | parse / schema / template / context-length failures with counts, confirmed cause vs hypothesis |
| `implementation_notes.md` | reusable engineering patterns (parsing, validation, retries, logging, inference settings) with file pointers |
| `production_recommendations.md` | conservative recommendations, split high-confidence vs experimental |
| `source_index.md` | conclusion → file/script/artifact map for verification |

## Evidence labels used throughout

- **[EXPERT]** — provided by domain experts (rubric text ported from production `server/universal_pck_skills.js`, expert annotations).
- **[RESEARCHER]** — written by the research team (prompt rules, boundary rules, the feedback template), not by the experts.
- **[EVAL-P1/P4]** — experimentally measured on the main p1+p4 line (577 held-out turns, user-grouped 3-fold CV).
- **[EVAL-5D-SMALL]** — measured on the earlier five-dimension task, 71-turn consensus test set (small, noisy).
- **[INFERENCE]** — my own interpretation/recommendation; not tested.

## Source artifacts (main ones)

- Orientation: `LAK_PAPER_CONTEXT.md` (names the authoritative experiment line and decoy directories).
- Rubric: `src/pck_feedback/pck_skills.py`, `pck_skills_v2.py`, `pck_skills_v2_1.py`.
- Final prompt: `src/pck_feedback/prompts/p1_p4_reduced_core.py`, `p1_p4_reduced.py`; 5-dim: `prompts/baseline_prompt.py`.
- Parsing: `src/pck_feedback/inference/parsing.py`; evaluator: `scripts/evaluate_p1_p4_reduced_v1.py`.
- Results: `reports/p1_p4_reduced_task_v1/p1_p4_numeric_results_and_significance_v1.md` (reference numbers),
  `p1_p4_methods_and_findings_explained_v1.md`, `plain_dpo_v1/*.csv`, `reports/template_controlled_v2_1/`,
  `reports/dpo_v2_1_template_controlled/final_dpo_results_summary_for_avi.md` (5-dim).
- Gold: `data/training/sft/gemma_rubric_v2_1_p1_p4_user_cv3_v1/fold{1,2,3}/eval_turns.jsonl`; IRR: `data/irr_round2_15/`.

## Key caveats (read before using any number)

1. **Main line = p1 (Error Identification) + p4 (Adapted Pedagogical Response) only.** p2/p3/p5 were only
   evaluated in an earlier five-dimension run on a 71-turn test set; those results are noisy and nothing
   there survived multiple-comparison correction.
2. **Small data:** 45 conversations, 9 teachers, 6 geometry scenarios, Hebrew. The held-out set is "used up"
   (it informed several rounds of hypotheses), so no result is confirmatory.
3. **Scenarios are not held out** — CV tests generalization to a new *teacher*, not a new *topic*.
4. **Gold is mostly one expert** (506/577 turns single annotator, 71 joint consensus). Expert–expert
   agreement is moderate-to-low (decision κ 0.41, p1 relevance κ 0.40, p4 relevance κ 0.32).
5. **No expert-written guideline for feedback text was found.** The `מה קיים:` / `המלצה:` template is a
   researcher codification of a pattern in (mostly one) expert's annotations.
6. **Gemini 2.5 Flash-Lite (the production model) was tested only without JSON-mode enforcement** and with
   the research prompt, not the production prompt.
7. The research prompt is *not* byte-identical to production (`prompts/baseline_prompt.py` docstring).
8. Base model identity: local checkpoint `/shared/cycle2_bgu_gal_prj/astrin/models/gemma-4-31B-it`, public
   identity not verifiable from the repo.

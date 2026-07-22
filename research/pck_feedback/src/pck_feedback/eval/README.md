# Evaluation -- NOT IMPLEMENTED YET

This module is a placeholder for a future stage of the PCK feedback
research pipeline. It is intentionally empty of logic right now.

## What this will eventually do

Compare one or more `data/predictions/<run_id>/predictions.jsonl` files
against `TurnExample.ground_truth` (from a dataset built with
`--only-completed-consensus`), for example:

- `should_provide_feedback` precision/recall/F1 against
  `ground_truth.has_feedback`.
- Per-dimension (`p1`-`p5`) agreement: relevance detection + score
  agreement (exact match, off-by-one, Cohen's kappa or similar) against
  `ground_truth.dimensions[p_id]`.
- Slicing results by `run_id`, `prompt_version`, and `rubric_version` (see
  `pck_feedback.pck_skills.RUBRIC_VERSION`) so prompt/rubric changes and
  model changes can be told apart.

## Why it's not built yet

Per the project plan, stage 1 only covers export, dataset building, and
baseline inference. Evaluation and fine-tuning/DPO are explicitly out of
scope until stage 1 has been reviewed and run manually against real data.

`pck-research evaluate` in the CLI currently prints a message pointing
here and exits without doing any comparison.

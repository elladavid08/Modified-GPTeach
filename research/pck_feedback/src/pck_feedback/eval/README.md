# Evaluation

Compares a `predictions.jsonl` file (produced by `pck-research infer`)
against `TurnExample.ground_truth` in a consensus-based test set (built
with `pck-research build-dataset --only-completed-consensus`).

## Usage

```bash
pck-research evaluate \
  --dataset data/processed/test_set_v1.jsonl \
  --predictions data/predictions/<run_id>/predictions.jsonl \
  --out data/eval/<run_id>/metrics.json \
  --errors-out data/eval/<run_id>/errors.jsonl
```

`--errors-out` is optional. Its format is chosen by file extension: `.csv`
writes a flattened CSV, anything else writes JSONL. If omitted, no error
report is written.

## What gets computed (`run_eval.py`, pure functions in `metrics.py`)

1. **Feedback decision**: `should_provide_feedback` (prediction) vs.
   `has_feedback` (gold) -- accuracy, precision, recall, F1, confusion
   matrix (TP/FP/TN/FN).
2. **Per-dimension (p1-p5) inclusion**: `relevant` (prediction) vs.
   `included` (gold) -- accuracy, precision, recall, F1, support (count of
   positive gold examples), for each dimension independently.
3. **Per-dimension score agreement**: evaluated ONLY over turns where
   *both* gold and prediction include that dimension -- number of
   comparable cases, exact agreement rate, MAE, a 0/1/2 confusion matrix,
   and quadratic-weighted Cohen's kappa (implemented directly, no
   third-party ML dependency; returns `null` when it isn't meaningfully
   computable, e.g. too few comparable cases).
4. **Feedback text presence** (no semantic similarity yet): how often a
   predicted-relevant dimension has non-empty `feedback_text`, overall and
   per dimension. Full gold + predicted text is included in the error
   report for manual read-through.

## Normalization rule (applied consistently)

If a dimension is excluded on either side (gold `included=False` or
predicted `relevant=False`), its `score`/`feedback_text` are NEVER read
for scoring -- regardless of whether the underlying value is `null` or an
empty string. This is enforced by construction in `run_eval.py`: score/text
are only ever pulled out after checking `included`/`relevant` first.

## Other handling

- `parse_status="failed"` predictions are excluded from all metrics above
  (a parse failure isn't a real model opinion) but are counted and listed
  in `metrics.json` (`counts.n_parse_failed`, `parse_failed_example_ids`).
- Dataset rows with `ground_truth=None` (no completed consensus for that
  conversation) are excluded from evaluation entirely.
- Missing predictions (dataset rows with no matching prediction) and extra
  predictions (referencing an `example_id` not in the dataset) are counted
  and logged rather than silently ignored or raising.
- `ground_truth` is read here ONLY for scoring -- this module never builds
  or touches a prompt, so it cannot leak into a model call.

## Out of scope (for now)

Fine-tuning/DPO training and automatic semantic-similarity scoring of
feedback text are not implemented -- see `../training/README.md`.

"""
Human-readable terminal summary for `run_eval.evaluate()`'s metrics dict.

Kept separate from `run_eval.py` so metrics computation stays presentation-
agnostic -- the exact same dict returned by `evaluate()` is both written
verbatim to `metrics.json` and formatted here for the terminal.
"""

from __future__ import annotations

from typing import Any

from pck_feedback.pck_skills import PCK_DIMENSION_IDS


def _fmt(value: Any, digits: int = 3) -> str:
    if value is None:
        return "n/a"
    if isinstance(value, float):
        return f"{value:.{digits}f}"
    return str(value)


def format_summary(metrics: dict[str, Any]) -> str:
    lines: list[str] = []
    lines.append("=== PCK Feedback Evaluation ===")
    lines.append(f"Dataset:     {metrics['dataset_path']}")
    lines.append(f"Predictions: {metrics['predictions_path']}")
    lines.append(
        f"Run: {metrics['run_id']}  Model: {metrics['model_name']}  "
        f"Prompt: {metrics['prompt_version']}  Rubric: {metrics['rubric_version']}"
    )
    lines.append("")

    counts = metrics["counts"]
    lines.append(
        f"Examples: {counts['n_dataset_examples_with_ground_truth']} with ground truth "
        f"(of {counts['n_dataset_examples_total']} total in dataset), "
        f"{counts['n_predictions_total']} predictions, {counts['n_matched']} matched"
    )
    lines.append(f"  missing predictions:             {counts['n_missing_predictions']}")
    lines.append(f"  parse failures (excluded below): {counts['n_parse_failed']}")
    lines.append(f"  extra predictions not in dataset:{counts['n_predictions_extra_not_in_dataset']}")
    lines.append(f"  evaluated:                        {counts['n_evaluated']}")
    lines.append("")

    fd = metrics["feedback_decision"]
    lines.append("--- Feedback decision (should_provide_feedback vs. has_feedback) ---")
    lines.append(
        f"  accuracy={_fmt(fd['accuracy'])}  precision={_fmt(fd['precision'])}  "
        f"recall={_fmt(fd['recall'])}  f1={_fmt(fd['f1'])}  n={fd['n']}"
    )
    cm = fd["confusion_matrix"]
    lines.append(f"  confusion matrix: TP={cm['tp']} FP={cm['fp']} TN={cm['tn']} FN={cm['fn']}")
    lines.append("")

    lines.append("--- PCK dimension inclusion (p1-p5) ---")
    for dim_id in PCK_DIMENSION_IDS:
        m = metrics["dimension_inclusion"][dim_id]
        lines.append(
            f"  {dim_id}: accuracy={_fmt(m['accuracy'])} precision={_fmt(m['precision'])} "
            f"recall={_fmt(m['recall'])} f1={_fmt(m['f1'])} support={m['support']}"
        )
    lines.append("")

    lines.append("--- PCK dimension score agreement (only when both gold and prediction include it) ---")
    for dim_id in PCK_DIMENSION_IDS:
        s = metrics["dimension_scores"][dim_id]
        lines.append(
            f"  {dim_id}: n={s['n_comparable']} exact_agreement={_fmt(s['exact_agreement'])} "
            f"mae={_fmt(s['mae'])} weighted_kappa={_fmt(s['weighted_kappa'])}"
        )
    lines.append("")

    lines.append("--- Feedback text presence (for predicted-relevant dimensions) ---")
    ft = metrics["feedback_text"]
    lines.append(f"  overall non-empty rate: {_fmt(ft['overall_nonempty_rate'])}")
    for dim_id in PCK_DIMENSION_IDS:
        d = ft["per_dimension"][dim_id]
        lines.append(
            f"  {dim_id}: n_predicted_relevant={d['n_predicted_relevant']} non_empty_rate={_fmt(d['nonempty_rate'])}"
        )

    return "\n".join(lines)

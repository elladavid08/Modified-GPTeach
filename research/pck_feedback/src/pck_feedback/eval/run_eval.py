"""
Evaluation: compare a `predictions.jsonl` file (produced by `pck-research
infer`) against `TurnExample.ground_truth` in a consensus-based test set
(built with `build-dataset --only-completed-consensus`).

Ground-truth/prediction normalization rule (applied consistently
throughout this module -- see the project's dataset sanity-check
discussion): a dimension with gold `included=False` or predicted
`relevant=False` NEVER has its `score`/`feedback_text` read for scoring,
regardless of whether those fields happen to be `null` or an empty string
underneath. This is enforced by construction below -- score/text values
are only ever pulled out for a dimension after checking `included`/
`relevant` first, never before.

`ground_truth` is read here ONLY for scoring. Nothing in this module
builds or touches a prompt, so evaluation can never leak ground truth into
a model call.
"""

from __future__ import annotations

import csv
from pathlib import Path
from typing import Any, Optional

from pck_feedback.eval.metrics import binary_classification_metrics, score_agreement_metrics
from pck_feedback.pck_skills import PCK_DIMENSION_IDS
from pck_feedback.schemas.prediction import Prediction
from pck_feedback.schemas.turn_example import TurnExample
from pck_feedback.utils.io import ensure_dir, read_jsonl, write_json, write_jsonl
from pck_feedback.utils.logging import get_logger

logger = get_logger(__name__)


def _load_dataset(dataset_path: Path) -> dict[str, TurnExample]:
    examples: dict[str, TurnExample] = {}
    for raw in read_jsonl(dataset_path):
        example = TurnExample.model_validate(raw)
        examples[example.example_id] = example
    return examples


def _load_predictions(predictions_path: Path) -> dict[str, Prediction]:
    predictions: dict[str, Prediction] = {}
    for raw in read_jsonl(predictions_path):
        prediction = Prediction.model_validate(raw)
        if prediction.example_id in predictions:
            logger.warning(
                "Duplicate prediction for example_id=%s in %s; keeping the last one encountered.",
                prediction.example_id,
                predictions_path,
            )
        predictions[prediction.example_id] = prediction
    return predictions


def _feedback_text_nonempty(text: Optional[str]) -> bool:
    return bool(text and text.strip())


def _predicted_dimension_included(prediction: Prediction, dim_id: str) -> bool:
    dim = prediction.dimensions.get(dim_id)
    return bool(dim.relevant) if dim is not None else False


def _has_mismatch(example: TurnExample, prediction: Prediction) -> bool:
    """True if this row belongs in the error report (any decision/inclusion/score disagreement)."""
    gt = example.ground_truth
    if gt.has_feedback != prediction.should_provide_feedback:
        return True

    for dim_id in PCK_DIMENSION_IDS:
        gold_dim = gt.dimensions[dim_id]
        pred_dim = prediction.dimensions.get(dim_id)
        pred_included = bool(pred_dim.relevant) if pred_dim is not None else False

        if gold_dim.included != pred_included:
            return True

        if gold_dim.included and pred_included:
            gold_score = gold_dim.score
            pred_score = pred_dim.score if pred_dim is not None else None
            if gold_score is not None and pred_score is not None and gold_score != pred_score:
                return True

    return False


def _error_row(example: TurnExample, prediction: Prediction) -> dict[str, Any]:
    gt = example.ground_truth
    row: dict[str, Any] = {
        "example_id": example.example_id,
        "conversation_id": example.conversation_id,
        "turn_number": example.turn_number,
        "teacher_message": example.teacher_message,
        "gold_has_feedback": gt.has_feedback,
        "pred_should_provide_feedback": prediction.should_provide_feedback,
        "parse_status": prediction.parse_status,
        "dimensions": {},
    }
    for dim_id in PCK_DIMENSION_IDS:
        gold_dim = gt.dimensions[dim_id]
        pred_dim = prediction.dimensions.get(dim_id)
        pred_included = bool(pred_dim.relevant) if pred_dim is not None else False
        row["dimensions"][dim_id] = {
            "gold_included": gold_dim.included,
            # Excluded dimensions never surface score/text, on either side,
            # regardless of what the underlying null/"" value happens to be.
            "gold_score": gold_dim.score if gold_dim.included else None,
            "gold_feedback_text": gold_dim.feedback_text if gold_dim.included else None,
            "pred_relevant": pred_included,
            "pred_score": (pred_dim.score if pred_included and pred_dim is not None else None),
            "pred_feedback_text": (pred_dim.feedback_text if pred_included and pred_dim is not None else None),
        }
    return row


_ERROR_REPORT_FIELDNAMES = [
    "example_id",
    "conversation_id",
    "turn_number",
    "teacher_message",
    "gold_has_feedback",
    "pred_should_provide_feedback",
    "parse_status",
] + [
    f"{dim_id}_{suffix}"
    for dim_id in PCK_DIMENSION_IDS
    for suffix in ("gold_included", "gold_score", "gold_feedback_text", "pred_relevant", "pred_score", "pred_feedback_text")
]


def _flatten_error_row(row: dict[str, Any]) -> dict[str, Any]:
    flat = {k: row[k] for k in _ERROR_REPORT_FIELDNAMES if k in row}
    for dim_id, dim_row in row["dimensions"].items():
        for suffix, value in dim_row.items():
            flat[f"{dim_id}_{suffix}"] = value
    return flat


def _write_error_report(path: Path, rows: list[dict[str, Any]]) -> None:
    if path.suffix.lower() == ".csv":
        ensure_dir(path.parent)
        with path.open("w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=_ERROR_REPORT_FIELDNAMES)
            writer.writeheader()
            for row in rows:
                writer.writerow(_flatten_error_row(row))
    else:
        write_jsonl(path, rows)


def evaluate(
    dataset_path: Path,
    predictions_path: Path,
    out_path: Path,
    *,
    errors_out_path: Optional[Path] = None,
) -> dict[str, Any]:
    """
    Compare `predictions_path` against `dataset_path` ground truth.
    Writes a metrics JSON to `out_path` and (optionally) a JSONL/CSV error
    report of mismatching rows to `errors_out_path` (format chosen by file
    extension: `.csv` -> CSV, anything else -> JSONL). Returns the same
    metrics dict that gets written to `out_path`.
    """
    dataset = _load_dataset(dataset_path)
    predictions = _load_predictions(predictions_path)

    dataset_with_gt = {eid: ex for eid, ex in dataset.items() if ex.ground_truth is not None}
    n_no_ground_truth = len(dataset) - len(dataset_with_gt)
    if n_no_ground_truth:
        logger.warning(
            "%d dataset example(s) have no ground_truth (conversation has no completed "
            "consensus annotation) -- excluded from evaluation.",
            n_no_ground_truth,
        )

    extra_prediction_ids = sorted(set(predictions) - set(dataset))
    if extra_prediction_ids:
        logger.warning(
            "%d prediction(s) reference example_id(s) not present in the dataset at all; ignored.",
            len(extra_prediction_ids),
        )

    missing_prediction_ids = sorted(set(dataset_with_gt) - set(predictions))
    matched_ids = sorted(set(dataset_with_gt) & set(predictions))

    parse_failed_ids = [eid for eid in matched_ids if predictions[eid].parse_status == "failed"]
    evaluated_ids = [eid for eid in matched_ids if predictions[eid].parse_status != "failed"]
    if parse_failed_ids:
        logger.warning(
            "%d matched prediction(s) have parse_status='failed'; excluded from metrics "
            "below (still counted in `counts.n_parse_failed`).",
            len(parse_failed_ids),
        )

    run_ids = {predictions[eid].run_id for eid in matched_ids}
    model_names = {predictions[eid].model_name for eid in matched_ids}
    prompt_versions = {predictions[eid].prompt_version for eid in matched_ids}
    rubric_versions = {predictions[eid].rubric_version for eid in matched_ids}

    def _single_or_list(values: set[str]) -> Any:
        return sorted(values)[0] if len(values) == 1 else sorted(values)

    gold_has_feedback = [dataset[eid].ground_truth.has_feedback for eid in evaluated_ids]
    pred_has_feedback = [predictions[eid].should_provide_feedback for eid in evaluated_ids]
    feedback_decision_metrics = binary_classification_metrics(gold_has_feedback, pred_has_feedback)

    dimension_inclusion: dict[str, Any] = {}
    dimension_scores: dict[str, Any] = {}
    feedback_text_per_dimension: dict[str, Any] = {}

    total_relevant_predicted = 0
    total_relevant_predicted_nonempty_text = 0

    for dim_id in PCK_DIMENSION_IDS:
        gold_included: list[bool] = []
        pred_included: list[bool] = []
        gold_scores_comparable: list[int] = []
        pred_scores_comparable: list[int] = []
        relevant_predicted_count = 0
        relevant_predicted_nonempty_text_count = 0

        for eid in evaluated_ids:
            gold_dim = dataset[eid].ground_truth.dimensions[dim_id]
            prediction = predictions[eid]
            pred_dim = prediction.dimensions.get(dim_id)
            pred_is_relevant = _predicted_dimension_included(prediction, dim_id)

            gold_included.append(gold_dim.included)
            pred_included.append(pred_is_relevant)

            if pred_is_relevant:
                relevant_predicted_count += 1
                if _feedback_text_nonempty(pred_dim.feedback_text if pred_dim is not None else None):
                    relevant_predicted_nonempty_text_count += 1

            # Score comparison ONLY when both sides include the dimension --
            # this is the normalization rule: excluded on either side means
            # score/text are never inspected, no matter what value they hold.
            if gold_dim.included and pred_is_relevant:
                gold_score = gold_dim.score
                pred_score = pred_dim.score if pred_dim is not None else None
                if gold_score is not None and pred_score is not None:
                    gold_scores_comparable.append(gold_score)
                    pred_scores_comparable.append(pred_score)

        dim_metrics = binary_classification_metrics(gold_included, pred_included)
        dim_metrics["support"] = sum(gold_included)
        dimension_inclusion[dim_id] = dim_metrics

        dimension_scores[dim_id] = score_agreement_metrics(gold_scores_comparable, pred_scores_comparable)

        feedback_text_per_dimension[dim_id] = {
            "n_predicted_relevant": relevant_predicted_count,
            "n_with_nonempty_feedback_text": relevant_predicted_nonempty_text_count,
            "nonempty_rate": (
                relevant_predicted_nonempty_text_count / relevant_predicted_count
                if relevant_predicted_count
                else None
            ),
        }
        total_relevant_predicted += relevant_predicted_count
        total_relevant_predicted_nonempty_text += relevant_predicted_nonempty_text_count

    metrics: dict[str, Any] = {
        "dataset_path": str(dataset_path),
        "predictions_path": str(predictions_path),
        "run_id": _single_or_list(run_ids),
        "model_name": _single_or_list(model_names),
        "prompt_version": _single_or_list(prompt_versions),
        "rubric_version": _single_or_list(rubric_versions),
        "counts": {
            "n_dataset_examples_total": len(dataset),
            "n_dataset_examples_no_ground_truth": n_no_ground_truth,
            "n_dataset_examples_with_ground_truth": len(dataset_with_gt),
            "n_predictions_total": len(predictions),
            "n_predictions_extra_not_in_dataset": len(extra_prediction_ids),
            "n_missing_predictions": len(missing_prediction_ids),
            "n_matched": len(matched_ids),
            "n_parse_failed": len(parse_failed_ids),
            "n_evaluated": len(evaluated_ids),
        },
        "missing_prediction_example_ids": missing_prediction_ids,
        "parse_failed_example_ids": parse_failed_ids,
        "feedback_decision": feedback_decision_metrics,
        "dimension_inclusion": dimension_inclusion,
        "dimension_scores": dimension_scores,
        "feedback_text": {
            "per_dimension": feedback_text_per_dimension,
            "overall_nonempty_rate": (
                total_relevant_predicted_nonempty_text / total_relevant_predicted
                if total_relevant_predicted
                else None
            ),
        },
    }

    write_json(out_path, metrics)
    logger.info("Wrote evaluation metrics to %s", out_path)

    if errors_out_path is not None:
        error_rows = [
            _error_row(dataset[eid], predictions[eid]) for eid in evaluated_ids if _has_mismatch(dataset[eid], predictions[eid])
        ]
        _write_error_report(errors_out_path, error_rows)
        logger.info("Wrote %d error row(s) to %s", len(error_rows), errors_out_path)

    return metrics

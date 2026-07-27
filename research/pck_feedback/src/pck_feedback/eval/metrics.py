"""
Pure metric-computation functions for `eval/run_eval.py`.

Kept free of any I/O and free of any knowledge of `TurnExample`/`Prediction`
so each metric is independently unit-testable against small, hand-built
gold/pred lists. No third-party ML dependency is required -- quadratic
weighted kappa is implemented directly from its standard definition.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Optional


def _safe_div(numerator: float, denominator: float) -> float:
    return numerator / denominator if denominator else 0.0


def binary_confusion_counts(gold: Sequence[bool], pred: Sequence[bool]) -> dict[str, int]:
    tp = sum(1 for g, p in zip(gold, pred) if g and p)
    fp = sum(1 for g, p in zip(gold, pred) if not g and p)
    tn = sum(1 for g, p in zip(gold, pred) if not g and not p)
    fn = sum(1 for g, p in zip(gold, pred) if g and not p)
    return {"tp": tp, "fp": fp, "tn": tn, "fn": fn}


def binary_classification_metrics(gold: Sequence[bool], pred: Sequence[bool]) -> dict:
    """
    Standard binary accuracy/precision/recall/F1 + confusion matrix.

    `zero_division` convention: precision/recall/F1 resolve to 0.0 (never
    raise or return NaN) when their denominator is 0 -- e.g. a dimension
    the model never predicts as relevant has precision=0.0, matching
    sklearn's `zero_division=0` default rather than sklearn's `nan` one.
    """
    if len(gold) != len(pred):
        raise ValueError(f"gold/pred length mismatch: {len(gold)} vs {len(pred)}")

    n = len(gold)
    counts = binary_confusion_counts(gold, pred)
    precision = _safe_div(counts["tp"], counts["tp"] + counts["fp"])
    recall = _safe_div(counts["tp"], counts["tp"] + counts["fn"])
    f1 = _safe_div(2 * precision * recall, precision + recall)
    accuracy = _safe_div(counts["tp"] + counts["tn"], n)
    return {
        "n": n,
        "accuracy": accuracy,
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "confusion_matrix": counts,
    }


def multiclass_confusion_matrix(
    gold: Sequence[int], pred: Sequence[int], labels: Sequence[int]
) -> dict[str, dict[str, int]]:
    """`{gold_label: {pred_label: count}}`, string-keyed for clean JSON serialization."""
    matrix = {str(g_label): {str(p_label): 0 for p_label in labels} for g_label in labels}
    for g, p in zip(gold, pred):
        matrix[str(g)][str(p)] += 1
    return matrix


def quadratic_weighted_kappa(
    gold: Sequence[int], pred: Sequence[int], labels: Sequence[int] = (0, 1, 2)
) -> Optional[float]:
    """
    Cohen's kappa with quadratic weights, computed directly from its
    standard definition (observed vs. expected weighted disagreement) --
    no external ML dependency required.

    Returns `None` when it isn't meaningfully computable: fewer than 2
    comparable cases, or zero expected disagreement (e.g. every rating on
    both sides happens to be the same single label, making the denominator
    zero) -- reported as "not feasible" rather than a misleading number.
    """
    n = len(gold)
    if n < 2:
        return None

    n_labels = len(labels)
    index = {label: i for i, label in enumerate(labels)}

    observed = [[0] * n_labels for _ in range(n_labels)]
    for g, p in zip(gold, pred):
        observed[index[g]][index[p]] += 1

    gold_hist = [sum(row) for row in observed]
    pred_hist = [sum(observed[i][j] for i in range(n_labels)) for j in range(n_labels)]

    weights = [[((i - j) ** 2) / ((n_labels - 1) ** 2) for j in range(n_labels)] for i in range(n_labels)]

    observed_weighted = sum(weights[i][j] * observed[i][j] for i in range(n_labels) for j in range(n_labels))
    expected_weighted = sum(
        weights[i][j] * gold_hist[i] * pred_hist[j] / n for i in range(n_labels) for j in range(n_labels)
    )

    if expected_weighted == 0:
        return None

    return 1 - (observed_weighted / expected_weighted)


def score_agreement_metrics(
    gold_scores: Sequence[int], pred_scores: Sequence[int], labels: Sequence[int] = (0, 1, 2)
) -> dict:
    """
    Score agreement for ONE dimension, computed only over the (gold, pred)
    pairs the caller has already filtered down to "both sides include this
    dimension AND both have a non-null score" -- see `run_eval.py`. This
    function itself makes no `included`/`relevant` decisions.
    """
    n = len(gold_scores)
    if n == 0:
        return {
            "n_comparable": 0,
            "exact_agreement": None,
            "mae": None,
            "confusion_matrix": {},
            "weighted_kappa": None,
        }
    exact = _safe_div(sum(1 for g, p in zip(gold_scores, pred_scores) if g == p), n)
    mae = _safe_div(sum(abs(g - p) for g, p in zip(gold_scores, pred_scores)), n)
    return {
        "n_comparable": n,
        "exact_agreement": exact,
        "mae": mae,
        "confusion_matrix": multiclass_confusion_matrix(gold_scores, pred_scores, labels),
        "weighted_kappa": quadratic_weighted_kappa(gold_scores, pred_scores, labels),
    }

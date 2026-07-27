import pytest

from pck_feedback.eval.metrics import (
    binary_classification_metrics,
    binary_confusion_counts,
    multiclass_confusion_matrix,
    quadratic_weighted_kappa,
    score_agreement_metrics,
)


def test_binary_confusion_counts():
    gold = [True, True, False, False]
    pred = [True, False, True, False]
    assert binary_confusion_counts(gold, pred) == {"tp": 1, "fp": 1, "tn": 1, "fn": 1}


def test_binary_classification_metrics_perfect_agreement():
    gold = [True, False, True, False]
    pred = [True, False, True, False]
    m = binary_classification_metrics(gold, pred)
    assert m["accuracy"] == 1.0
    assert m["precision"] == 1.0
    assert m["recall"] == 1.0
    assert m["f1"] == 1.0
    assert m["confusion_matrix"] == {"tp": 2, "fp": 0, "tn": 2, "fn": 0}
    assert m["n"] == 4


def test_binary_classification_metrics_no_positive_predictions_or_gold():
    """Zero-division cases resolve to 0.0, never NaN or an exception."""
    gold = [False, False]
    pred = [False, False]
    m = binary_classification_metrics(gold, pred)
    assert m["precision"] == 0.0
    assert m["recall"] == 0.0
    assert m["f1"] == 0.0
    assert m["accuracy"] == 1.0


def test_binary_classification_metrics_length_mismatch_raises():
    with pytest.raises(ValueError):
        binary_classification_metrics([True], [True, False])


def test_multiclass_confusion_matrix():
    gold = [0, 1, 2, 1]
    pred = [0, 1, 1, 1]
    matrix = multiclass_confusion_matrix(gold, pred, labels=[0, 1, 2])
    assert matrix["0"]["0"] == 1
    assert matrix["1"]["1"] == 2
    assert matrix["2"]["1"] == 1
    assert matrix["2"]["2"] == 0


def test_quadratic_weighted_kappa_perfect_agreement():
    gold = [0, 1, 2, 0, 1, 2]
    pred = [0, 1, 2, 0, 1, 2]
    kappa = quadratic_weighted_kappa(gold, pred)
    assert kappa == pytest.approx(1.0)


def test_quadratic_weighted_kappa_none_when_too_few_cases():
    assert quadratic_weighted_kappa([1], [1]) is None
    assert quadratic_weighted_kappa([], []) is None


def test_quadratic_weighted_kappa_none_when_no_expected_variance():
    """Every rating (gold AND pred) is the same single label -- undefined, not misleadingly 1.0 or 0.0."""
    assert quadratic_weighted_kappa([1, 1, 1], [1, 1, 1]) is None


def test_quadratic_weighted_kappa_penalizes_far_disagreement_more_than_near():
    # near-miss (off by one) vs. far-miss (off by two) on the same marginals
    near = quadratic_weighted_kappa([0, 1, 2, 0, 1, 2], [0, 2, 2, 0, 0, 2])
    far = quadratic_weighted_kappa([0, 1, 2, 0, 1, 2], [2, 1, 0, 0, 1, 2])
    assert far < near


def test_score_agreement_metrics_empty():
    result = score_agreement_metrics([], [])
    assert result == {
        "n_comparable": 0,
        "exact_agreement": None,
        "mae": None,
        "confusion_matrix": {},
        "weighted_kappa": None,
    }


def test_score_agreement_metrics_basic():
    gold = [0, 1, 2, 2]
    pred = [0, 1, 1, 0]
    result = score_agreement_metrics(gold, pred)
    assert result["n_comparable"] == 4
    assert result["exact_agreement"] == pytest.approx(0.5)  # 2/4 exact matches
    assert result["mae"] == pytest.approx((0 + 0 + 1 + 2) / 4)
    assert result["confusion_matrix"]["2"]["1"] == 1
    assert result["confusion_matrix"]["2"]["0"] == 1

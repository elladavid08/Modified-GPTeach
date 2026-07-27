"""
Self-contained tests for `eval/run_eval.py`: constructs `TurnExample` /
`Prediction` objects directly (rather than depending on the shared
`raw_dir` fixture, which other test files already mutate/extend) so this
suite has full control over the gold/pred scenarios it needs to cover.
"""

import datetime
from pathlib import Path

from pck_feedback.eval.run_eval import evaluate
from pck_feedback.pck_skills import RUBRIC_VERSION
from pck_feedback.schemas.prediction import DimensionResult, Prediction
from pck_feedback.schemas.turn_example import GroundTruth, GroundTruthDimension, TurnExample
from pck_feedback.utils.io import read_jsonl, write_jsonl


def _gt(has_feedback: bool, **included_dims) -> GroundTruth:
    """`included_dims` e.g. p1=(2, "text") means p1 is included with score=2, feedback_text="text"."""
    dims = {}
    for dim_id in ("p1", "p2", "p3", "p4", "p5"):
        if dim_id in included_dims:
            score, text = included_dims[dim_id]
            dims[dim_id] = GroundTruthDimension(included=True, score=score, feedback_text=text)
        else:
            dims[dim_id] = GroundTruthDimension(included=False)
    return GroundTruth(has_feedback=has_feedback, dimensions=dims)


def _example(example_id: str, ground_truth) -> TurnExample:
    return TurnExample(
        example_id=example_id,
        conversation_id=f"conv_{example_id}",
        session_id=f"conv_{example_id}",
        turn_number=1,
        teacher_message="הודעת מורה לדוגמה",
        ground_truth=ground_truth,
    )


def _prediction(
    example_id: str,
    should_provide_feedback: bool,
    parse_status: str = "ok",
    **relevant_dims,
) -> Prediction:
    """`relevant_dims` e.g. p1=(2, "text") means p1 is predicted relevant with that score/text."""
    dims = {}
    for dim_id in ("p1", "p2", "p3", "p4", "p5"):
        if dim_id in relevant_dims:
            score, text = relevant_dims[dim_id]
            dims[dim_id] = DimensionResult(relevant=True, score=score, feedback_text=text)
        else:
            dims[dim_id] = DimensionResult(relevant=False)
    return Prediction(
        example_id=example_id,
        conversation_id=f"conv_{example_id}",
        session_id=f"conv_{example_id}",
        turn_number=1,
        run_id="test_run",
        model_provider="fake_provider",
        model_name="fake-model",
        prompt_version="baseline_v1",
        rubric_version=RUBRIC_VERSION,
        created_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
        should_provide_feedback=should_provide_feedback,
        dimensions=dims,
        raw_model_output="{}",
        parse_status=parse_status,
    )


def _build_scenario(tmp_path: Path) -> tuple[Path, Path]:
    """
    Builds a small, hand-crafted dataset + predictions pair covering:
      - ex1: perfect-match prediction (p1 included, score matches exactly)
      - ex2: mismatched prediction (false positive on decision + p2 inclusion)
      - ex3: gold example with NO prediction at all (missing)
      - ex4: gold=None (no completed consensus) -- must be excluded entirely
      - ex5: prediction has parse_status="failed" -- must be excluded from metrics
      - ex_extra: a prediction for an example_id not in the dataset at all
    """
    examples = [
        _example("ex1", _gt(True, p1=(2, "משוב חיובי"))),
        _example("ex2", _gt(False)),
        _example("ex3", _gt(True, p4=(1, "משוב אחר"))),
        _example("ex4", None),
        _example("ex5", _gt(True, p5=(0, "משוב נוסף"))),
    ]
    predictions = [
        _prediction("ex1", True, p1=(2, "משוב חיובי")),  # exact match
        _prediction("ex2", True, p2=(1, "לא נכון")),  # false positive: decision + p2 inclusion
        # ex3: no prediction at all (missing)
        _prediction("ex4", False),  # has a prediction, but gold has no ground truth -- must be excluded
        _prediction("ex5", False, parse_status="failed"),  # parse failure -- excluded from metrics
        _prediction("ex_extra_not_in_dataset", True),  # references an example_id not in the dataset
    ]

    dataset_path = tmp_path / "test_set.jsonl"
    write_jsonl(dataset_path, (e.model_dump(mode="json") for e in examples))

    predictions_path = tmp_path / "predictions.jsonl"
    write_jsonl(predictions_path, (p.model_dump(mode="json") for p in predictions))

    return dataset_path, predictions_path


def test_evaluate_counts(tmp_path: Path):
    dataset_path, predictions_path = _build_scenario(tmp_path)
    out_path = tmp_path / "metrics.json"

    metrics = evaluate(dataset_path, predictions_path, out_path)

    counts = metrics["counts"]
    assert counts["n_dataset_examples_total"] == 5
    assert counts["n_dataset_examples_no_ground_truth"] == 1  # ex4
    assert counts["n_dataset_examples_with_ground_truth"] == 4  # ex1, ex2, ex3, ex5
    assert counts["n_predictions_total"] == 5
    assert counts["n_predictions_extra_not_in_dataset"] == 1  # ex_extra_not_in_dataset
    assert counts["n_missing_predictions"] == 1  # ex3
    assert counts["n_matched"] == 3  # ex1, ex2, ex5
    assert counts["n_parse_failed"] == 1  # ex5
    assert counts["n_evaluated"] == 2  # ex1, ex2

    assert metrics["missing_prediction_example_ids"] == ["ex3"]
    assert metrics["parse_failed_example_ids"] == ["ex5"]
    assert out_path.exists()


def test_evaluate_feedback_decision_metrics(tmp_path: Path):
    dataset_path, predictions_path = _build_scenario(tmp_path)
    metrics = evaluate(dataset_path, predictions_path, tmp_path / "metrics.json")

    fd = metrics["feedback_decision"]
    # ex1: gold=True, pred=True -> TP. ex2: gold=False, pred=True -> FP.
    assert fd["confusion_matrix"] == {"tp": 1, "fp": 1, "tn": 0, "fn": 0}
    assert fd["accuracy"] == 0.5
    assert fd["precision"] == 0.5
    assert fd["recall"] == 1.0
    assert fd["n"] == 2


def test_evaluate_dimension_inclusion_metrics(tmp_path: Path):
    dataset_path, predictions_path = _build_scenario(tmp_path)
    metrics = evaluate(dataset_path, predictions_path, tmp_path / "metrics.json")

    p1 = metrics["dimension_inclusion"]["p1"]
    assert p1["confusion_matrix"] == {"tp": 1, "fp": 0, "tn": 1, "fn": 0}  # ex1 included both sides, ex2 excluded both
    assert p1["support"] == 1

    p2 = metrics["dimension_inclusion"]["p2"]
    assert p2["confusion_matrix"] == {"tp": 0, "fp": 1, "tn": 1, "fn": 0}  # ex2: gold excluded, pred included
    assert p2["support"] == 0

    for dim_id in ("p3", "p4", "p5"):
        dim = metrics["dimension_inclusion"][dim_id]
        assert dim["confusion_matrix"] == {"tp": 0, "fp": 0, "tn": 2, "fn": 0}
        assert dim["support"] == 0


def test_evaluate_dimension_score_metrics_only_when_both_sides_include(tmp_path: Path):
    dataset_path, predictions_path = _build_scenario(tmp_path)
    metrics = evaluate(dataset_path, predictions_path, tmp_path / "metrics.json")

    p1_scores = metrics["dimension_scores"]["p1"]
    assert p1_scores["n_comparable"] == 1  # only ex1: both gold and pred include p1
    assert p1_scores["exact_agreement"] == 1.0
    assert p1_scores["mae"] == 0.0

    # p2: gold excludes it for ex2, so even though pred includes it, it's not comparable.
    p2_scores = metrics["dimension_scores"]["p2"]
    assert p2_scores["n_comparable"] == 0
    assert p2_scores["exact_agreement"] is None


def test_evaluate_feedback_text_presence(tmp_path: Path):
    dataset_path, predictions_path = _build_scenario(tmp_path)
    metrics = evaluate(dataset_path, predictions_path, tmp_path / "metrics.json")

    ft = metrics["feedback_text"]
    assert ft["per_dimension"]["p1"]["n_predicted_relevant"] == 1
    assert ft["per_dimension"]["p1"]["n_with_nonempty_feedback_text"] == 1
    assert ft["per_dimension"]["p1"]["nonempty_rate"] == 1.0
    assert ft["per_dimension"]["p3"]["n_predicted_relevant"] == 0
    assert ft["per_dimension"]["p3"]["nonempty_rate"] is None
    assert ft["overall_nonempty_rate"] == 1.0  # both ex1 (p1) and ex2 (p2) predicted non-empty text


def test_evaluate_error_report_only_contains_mismatches_jsonl(tmp_path: Path):
    dataset_path, predictions_path = _build_scenario(tmp_path)
    errors_path = tmp_path / "errors.jsonl"

    evaluate(dataset_path, predictions_path, tmp_path / "metrics.json", errors_out_path=errors_path)

    rows = list(read_jsonl(errors_path))
    assert len(rows) == 1  # only ex2 mismatches; ex1 is a perfect match
    assert rows[0]["example_id"] == "ex2"
    assert rows[0]["gold_has_feedback"] is False
    assert rows[0]["pred_should_provide_feedback"] is True
    assert rows[0]["dimensions"]["p2"]["gold_included"] is False
    assert rows[0]["dimensions"]["p2"]["pred_relevant"] is True
    assert rows[0]["dimensions"]["p2"]["pred_feedback_text"] == "לא נכון"


def test_evaluate_error_report_csv_format(tmp_path: Path):
    dataset_path, predictions_path = _build_scenario(tmp_path)
    errors_path = tmp_path / "errors.csv"

    evaluate(dataset_path, predictions_path, tmp_path / "metrics.json", errors_out_path=errors_path)

    content = errors_path.read_text(encoding="utf-8")
    assert "example_id" in content.splitlines()[0]
    assert "ex2" in content
    assert "ex1" not in content  # ex1 was a perfect match, not an error row


def test_evaluate_excludes_dimension_when_gold_included_false_regardless_of_text_value(tmp_path: Path):
    """
    Directly exercises the normalization rule: a gold dimension with
    included=False but a non-null/non-empty feedback_text (a raw-data
    quirk seen in real exports) must still be fully ignored for scoring.
    """
    gt = _gt(False)
    # Simulate the real-world quirk: included=False but feedback_text is "" not null.
    gt.dimensions["p3"] = GroundTruthDimension(included=False, score=None, feedback_text="")
    example = _example("ex_quirk", gt)
    prediction = _prediction("ex_quirk", False, p3=(1, "טקסט שגוי"))

    dataset_path = tmp_path / "test_set.jsonl"
    write_jsonl(dataset_path, [example.model_dump(mode="json")])
    predictions_path = tmp_path / "predictions.jsonl"
    write_jsonl(predictions_path, [prediction.model_dump(mode="json")])

    metrics = evaluate(dataset_path, predictions_path, tmp_path / "metrics.json")

    # p3: gold excluded (regardless of its "" feedback_text) but prediction included it -> FP, not a scored case.
    assert metrics["dimension_inclusion"]["p3"]["confusion_matrix"] == {"tp": 0, "fp": 1, "tn": 0, "fn": 0}
    assert metrics["dimension_scores"]["p3"]["n_comparable"] == 0

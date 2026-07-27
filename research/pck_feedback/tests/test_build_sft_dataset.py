"""
Fixture-based tests for the SFT dataset builder. Never touches Firestore,
never calls a model API, never trains anything.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Optional

import pytest

from pck_feedback.dataset.build_train_dataset import build_train_dataset
from pck_feedback.dataset.build_turn_dataset import build_dataset
from pck_feedback.inference.parsing import parse_model_response
from pck_feedback.models.run_config import RunConfig
from pck_feedback.pck_skills import PCK_DIMENSION_IDS, RUBRIC_VERSION
from pck_feedback.prompts.registry import build_prompt
from pck_feedback.schemas.train_example import AnnotatorLabel, TrainExample
from pck_feedback.schemas.turn_example import GroundTruthDimension
from pck_feedback.training.build_sft_dataset import (
    _default_out_dir,
    build_sft_dataset,
    build_target_json,
    group_split,
    train_example_to_turn_view,
)
from pck_feedback.utils.io import read_jsonl, write_jsonl


def _text_only_config(**overrides: Any) -> RunConfig:
    defaults = dict(run_id="sft_test_run", provider="fake_provider", model_name="fake-model", prompt_version="baseline_v1")
    defaults.update(overrides)
    return RunConfig(**defaults)


def _dims(**included: dict[str, Any]) -> dict[str, GroundTruthDimension]:
    """Build a full p1-p5 dimensions dict; keys in `included` override an explicit-negative default."""
    dims = {d: GroundTruthDimension(included=False) for d in PCK_DIMENSION_IDS}
    dims.update(included)
    return dims


def _synthetic_row(
    conversation_id: str,
    turn_number: int,
    *,
    assignment_id: Optional[str] = None,
    annotator_id: str = "annotator_x",
    teacher_message: str = "הודעת מורה לדוגמה",
    has_feedback: bool = False,
    dimensions: Optional[dict[str, GroundTruthDimension]] = None,
    board_image_path: Optional[str] = None,
) -> dict[str, Any]:
    assignment_id = assignment_id or f"{conversation_id}_assignment"
    label = AnnotatorLabel(has_feedback=has_feedback, dimensions=dimensions or _dims())
    example = TrainExample(
        example_id=f"{assignment_id}__{turn_number}",
        assignment_id=assignment_id,
        annotator_id=annotator_id,
        assignment_type="production",
        annotation_status="completed",
        conversation_id=conversation_id,
        session_id=conversation_id,
        turn_number=turn_number,
        scenario={"grade_level": 8, "ai_context_summary": "הקשר לדוגמה", "text": "נושא לדוגמה"},
        student_info=[],
        conversation_history=[],
        teacher_message=teacher_message,
        board_image_path=board_image_path,
        label=label,
        source={"raw_conversation_file": "x", "raw_annotation_file": "y", "exported_at": None},
    )
    return example.model_dump(mode="json")


# ---------------------------------------------------------------------------
# build_target_json
# ---------------------------------------------------------------------------


def test_target_json_always_includes_all_five_dimensions():
    label = AnnotatorLabel(has_feedback=False, dimensions=_dims())
    target = build_target_json(label)

    assert set(target["dimensions"].keys()) == set(PCK_DIMENSION_IDS)
    for dim_id in PCK_DIMENSION_IDS:
        dim = target["dimensions"][dim_id]
        assert dim == {"relevant": False, "score": None, "feedback_text": None}


def test_target_json_feedback_text_overall_is_always_null():
    label = AnnotatorLabel(
        has_feedback=True,
        dimensions=_dims(p4=GroundTruthDimension(included=True, score=2, feedback_text="כל הכבוד")),
    )
    target = build_target_json(label)
    assert target["feedback_text_overall"] is None
    assert target["should_provide_feedback"] is True
    assert target["dimensions"]["p4"] == {"relevant": True, "score": 2, "feedback_text": "כל הכבוד"}
    # Untouched dimensions still explicitly present and null'd out.
    assert target["dimensions"]["p1"] == {"relevant": False, "score": None, "feedback_text": None}


def test_target_json_round_trips_through_the_inference_parser():
    """The gold target must be parseable by the exact same parser used for model outputs."""
    label = AnnotatorLabel(
        has_feedback=True,
        dimensions=_dims(
            p1=GroundTruthDimension(included=True, score=2, feedback_text="זיהוי טוב"),
            p4=GroundTruthDimension(included=True, score=1, feedback_text="הצעה לשיפור"),
        ),
    )
    raw_text = json.dumps(build_target_json(label), ensure_ascii=False, indent=2)

    from pck_feedback.schemas.turn_example import TurnExample

    dummy_example = TurnExample(
        example_id="x__1", conversation_id="x", session_id="x", turn_number=1, teacher_message="hi"
    )
    prediction = parse_model_response(
        raw_text,
        example=dummy_example,
        run_id="round_trip_test",
        model_provider="fake",
        model_name="fake",
        prompt_version="baseline_v1",
    )

    assert prediction.parse_status == "ok"
    assert prediction.should_provide_feedback is True
    assert prediction.dimensions["p1"].relevant is True
    assert prediction.dimensions["p1"].score == 2
    assert prediction.dimensions["p1"].feedback_text == "זיהוי טוב"
    assert prediction.dimensions["p2"].relevant is False
    assert prediction.dimensions["p2"].score is None
    assert prediction.feedback_text_overall is None


# ---------------------------------------------------------------------------
# group_split
# ---------------------------------------------------------------------------


def test_group_split_is_disjoint_and_covers_all_groups():
    counts = {f"conv_{i}": 5 for i in range(10)}
    train_ids, val_ids = group_split(counts, val_fraction=0.2, seed=1)

    assert train_ids.isdisjoint(val_ids)
    assert train_ids | val_ids == set(counts)
    assert len(val_ids) > 0
    assert len(train_ids) > 0


def test_group_split_is_deterministic_given_same_seed():
    counts = {f"conv_{i}": (i + 1) for i in range(12)}
    split_a = group_split(counts, val_fraction=0.25, seed=7)
    split_b = group_split(counts, val_fraction=0.25, seed=7)
    assert split_a == split_b


def test_group_split_different_seeds_can_differ():
    counts = {f"conv_{i}": 3 for i in range(20)}
    split_a = group_split(counts, val_fraction=0.3, seed=1)
    split_b = group_split(counts, val_fraction=0.3, seed=2)
    assert split_a != split_b  # not guaranteed in general, but true for this input/seed pair


def test_group_split_keeps_everything_in_train_with_fewer_than_two_groups():
    train_ids, val_ids = group_split({"only_conv": 10}, val_fraction=0.5, seed=42)
    assert train_ids == {"only_conv"}
    assert val_ids == set()


def test_group_split_targets_approximately_the_requested_example_fraction():
    counts = {f"conv_{i}": 10 for i in range(40)}  # mirrors the real 40-conversation train set's rough shape
    train_ids, val_ids = group_split(counts, val_fraction=0.15, seed=42)

    total = sum(counts.values())
    val_count = sum(counts[c] for c in val_ids)
    assert 0 < val_count / total < 0.3  # loose bound -- greedy fill won't overshoot wildly


# ---------------------------------------------------------------------------
# train_example_to_turn_view / prompt parity
# ---------------------------------------------------------------------------


def test_prompt_text_matches_inference_prompt_builder_exactly(raw_dir: Path, tmp_path: Path):
    train_path = tmp_path / "train_examples.jsonl"
    build_train_dataset(raw_dir, train_path)  # conv_3, assignments a3+a4

    config = _text_only_config()
    manifest = build_sft_dataset(
        train_path,
        config,
        run_config_source="config/runs/baseline_gemini_text_only.yaml",
        out_dir=tmp_path / "sft_out",
        test_set_path=None,  # no test_set_v1.jsonl in this isolated fixture run
    )
    assert manifest["output"]["train_count"] == 4

    records = list(read_jsonl(tmp_path / "sft_out" / "train.jsonl"))
    example_rows = list(read_jsonl(train_path))
    by_id = {row["example_id"]: row for row in example_rows}

    for record in records:
        source_example = TrainExample.model_validate(by_id[record["example_id"]])
        view = train_example_to_turn_view(source_example)
        expected_payload = build_prompt(
            "baseline_v1", view, include_student_info=False, include_board_images=False, raw_dir=None
        )
        assert record["messages"][0]["role"] == "user"
        assert record["messages"][0]["content"] == expected_payload.text


def test_user_message_never_contains_annotation_metadata_or_secret_feedback_text(tmp_path: Path):
    secret_feedback_text = "משוב סודי של המעריך שאסור שיודלף לפרומפט"
    row = _synthetic_row(
        "conv_secret",
        1,
        assignment_id="assignment_secret_id_zzz",
        annotator_id="annotator_secret_id_yyy",
        has_feedback=True,
        dimensions=_dims(p4=GroundTruthDimension(included=True, score=1, feedback_text=secret_feedback_text)),
    )
    input_path = tmp_path / "train_examples.jsonl"
    write_jsonl(input_path, [row])

    config = _text_only_config()
    build_sft_dataset(
        input_path, config, run_config_source="fake.yaml", out_dir=tmp_path / "sft_out", test_set_path=None
    )

    records = list(read_jsonl(tmp_path / "sft_out" / "train.jsonl"))
    assert len(records) == 1
    user_content = records[0]["messages"][0]["content"]
    assistant_content = records[0]["messages"][1]["content"]

    # The annotator's own feedback text (the gold label) must never appear in the
    # user-side prompt -- only in the assistant target.
    assert secret_feedback_text not in user_content
    assert secret_feedback_text in assistant_content

    # Opaque annotation/assignment identifiers must stay out of the prompt text too.
    assert "assignment_secret_id_zzz" not in user_content
    assert "annotator_secret_id_yyy" not in user_content


def test_sft_record_metadata_preserves_traceability_fields(tmp_path: Path):
    row = _synthetic_row(
        "conv_meta",
        3,
        assignment_id="assignment_meta",
        annotator_id="annotator_meta",
        has_feedback=True,
        dimensions=_dims(p1=GroundTruthDimension(included=True, score=2, feedback_text="טוב")),
    )
    input_path = tmp_path / "train_examples.jsonl"
    write_jsonl(input_path, [row])

    config = _text_only_config()
    build_sft_dataset(
        input_path, config, run_config_source="config/runs/baseline_gemini_text_only.yaml", out_dir=tmp_path / "sft_out",
        test_set_path=None,
    )

    record = next(read_jsonl(tmp_path / "sft_out" / "train.jsonl"))
    metadata = record["metadata"]

    assert metadata["conversation_id"] == "conv_meta"
    assert metadata["turn_number"] == 3
    assert metadata["assignment_id"] == "assignment_meta"
    assert metadata["annotator_id"] == "annotator_meta"
    assert metadata["prompt_version"] == "baseline_v1"
    assert metadata["rubric_version"] == RUBRIC_VERSION
    assert metadata["has_feedback"] is True
    assert metadata["split"] == "train"


# ---------------------------------------------------------------------------
# Consensus-leakage safety check
# ---------------------------------------------------------------------------


def test_build_sft_dataset_raises_if_a_consensus_conversation_is_present(raw_dir: Path, tmp_path: Path):
    """conv_1 has a completed consensus in the shared fixtures -- reserved for the test set."""
    test_set_path = tmp_path / "test_set_v1.jsonl"
    build_dataset(raw_dir, test_set_path, only_completed_consensus=True)  # writes conv_1 rows

    poisoned_row = _synthetic_row("conv_1", 1, assignment_id="poisoned_assignment")
    input_path = tmp_path / "train_examples.jsonl"
    write_jsonl(input_path, [poisoned_row])

    config = _text_only_config()
    with pytest.raises(ValueError, match="conv_1"):
        build_sft_dataset(
            input_path, config, run_config_source="fake.yaml", out_dir=tmp_path / "sft_out", test_set_path=test_set_path
        )


def test_build_sft_dataset_passes_when_no_overlap_with_consensus_conversations(raw_dir: Path, tmp_path: Path):
    test_set_path = tmp_path / "test_set_v1.jsonl"
    build_dataset(raw_dir, test_set_path, only_completed_consensus=True)  # writes conv_1 rows only

    clean_row = _synthetic_row("conv_clean", 1)
    input_path = tmp_path / "train_examples.jsonl"
    write_jsonl(input_path, [clean_row])

    config = _text_only_config()
    manifest = build_sft_dataset(
        input_path, config, run_config_source="fake.yaml", out_dir=tmp_path / "sft_out", test_set_path=test_set_path
    )
    assert manifest["excluded_test_conversation_ids"] == ["conv_1"]
    assert manifest["output"]["train_count"] == 1


# ---------------------------------------------------------------------------
# End-to-end split + manifest
# ---------------------------------------------------------------------------


def test_build_sft_dataset_end_to_end_split_and_manifest(tmp_path: Path):
    rows = []
    for i in range(20):
        conv_id = f"conv_{i}"
        for turn in (1, 2):
            rows.append(
                _synthetic_row(
                    conv_id,
                    turn,
                    annotator_id="annotator_a" if i % 2 == 0 else "annotator_b",
                    has_feedback=(turn == 2),
                    dimensions=_dims(p2=GroundTruthDimension(included=True, score=1, feedback_text="x"))
                    if turn == 2
                    else _dims(),
                )
            )
    input_path = tmp_path / "train_examples.jsonl"
    write_jsonl(input_path, rows)

    config = _text_only_config()
    out_dir = tmp_path / "sft_out"
    manifest = build_sft_dataset(
        input_path,
        config,
        run_config_source="config/runs/baseline_gemini_text_only.yaml",
        out_dir=out_dir,
        val_fraction=0.2,
        seed=42,
        test_set_path=None,
    )

    train_records = list(read_jsonl(out_dir / "train.jsonl"))
    val_records = list(read_jsonl(out_dir / "val.jsonl"))

    assert len(train_records) == manifest["output"]["train_count"]
    assert len(val_records) == manifest["output"]["val_count"]
    assert len(train_records) + len(val_records) == 40

    train_convs = {r["metadata"]["conversation_id"] for r in train_records}
    val_convs = {r["metadata"]["conversation_id"] for r in val_records}
    assert train_convs.isdisjoint(val_convs)
    assert len(val_convs) > 0

    manifest_path = out_dir / "split_manifest.json"
    assert manifest_path.exists()
    saved_manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    assert saved_manifest["seed"] == 42
    assert saved_manifest["val_fraction"] == 0.2
    assert set(saved_manifest["train"]["conversation_ids"]) == train_convs
    assert set(saved_manifest["val"]["conversation_ids"]) == val_convs
    assert saved_manifest["prompt_version"] == "baseline_v1"
    assert saved_manifest["rubric_version"] == RUBRIC_VERSION
    assert saved_manifest["run_config_source"] == "config/runs/baseline_gemini_text_only.yaml"
    assert saved_manifest["include_board_images"] is False
    assert "annotator_distribution" in saved_manifest["train"]
    assert saved_manifest["train"]["positive_count"] + saved_manifest["train"]["negative_count"] == len(train_records)


def test_default_out_dir_is_versioned_by_recipe():
    text_only_config = _text_only_config(prompt_version="baseline_v1", include_board_images=False)
    with_images_config = _text_only_config(prompt_version="baseline_v1", include_board_images=True)

    assert _default_out_dir(text_only_config) == Path("data/training/sft/baseline_v1_text_only")
    assert _default_out_dir(with_images_config) == Path("data/training/sft/baseline_v1_with_images")


def test_include_board_images_requires_raw_dir(tmp_path: Path):
    row = _synthetic_row("conv_only", 1)
    input_path = tmp_path / "train_examples.jsonl"
    write_jsonl(input_path, [row])

    config = _text_only_config(include_board_images=True)
    with pytest.raises(ValueError):
        build_sft_dataset(input_path, config, run_config_source="fake.yaml", out_dir=tmp_path / "sft_out", raw_dir=None)

from pathlib import Path

import pytest

from pck_feedback.dataset.build_turn_dataset import build_dataset, iter_turn_examples
from pck_feedback.export.extract_images import extract_all_images
from pck_feedback.pck_skills import PCK_DIMENSION_IDS


def _examples_by_id(raw_dir: Path, **kwargs) -> dict[str, object]:
    return {e.example_id: e for e in iter_turn_examples(raw_dir, **kwargs)}


def test_all_turns_present_without_filters(raw_dir: Path):
    examples = _examples_by_id(raw_dir)
    assert set(examples.keys()) == {"conv_1__1", "conv_1__2", "conv_2__1"}


def test_conversation_id_and_session_id_are_kept_separate(raw_dir: Path):
    examples = _examples_by_id(raw_dir)

    conv_1_turn_1 = examples["conv_1__1"]
    assert conv_1_turn_1.conversation_id == "conv_1"
    assert conv_1_turn_1.session_id == "conv_1"  # happens to match here

    conv_2_turn_1 = examples["conv_2__1"]
    assert conv_2_turn_1.conversation_id == "conv_2"
    assert conv_2_turn_1.session_id == "session_abc_999"  # deliberately differs in the fixture
    assert conv_2_turn_1.conversation_id != conv_2_turn_1.session_id


def test_ground_truth_positive_turn_matches_consensus(raw_dir: Path):
    examples = _examples_by_id(raw_dir)
    gt = examples["conv_1__1"].ground_truth

    assert gt is not None
    assert gt.has_feedback is True
    assert gt.dimensions["p1"].included is True
    assert gt.dimensions["p1"].score == 2
    assert gt.dimensions["p4"].included is True
    assert gt.dimensions["p4"].score == 1
    # p3 was selected by one annotator but excluded by the team -> explicit False, not missing.
    assert gt.dimensions["p3"].included is False
    assert gt.dimensions["p2"].included is False
    assert gt.dimensions["p5"].included is False
    assert set(gt.dimensions.keys()) == set(PCK_DIMENSION_IDS)


def test_ground_truth_absent_turn_is_explicit_negative_not_null(raw_dir: Path):
    """
    Turn 2 of conv_1 is NOT present in the consensus feedbackPoints, but the
    conversation DOES have a completed consensus doc. Per the ground-truth
    contract, this must be an explicit negative label -- never None.
    """
    examples = _examples_by_id(raw_dir)
    gt = examples["conv_1__2"].ground_truth

    assert gt is not None, "ground_truth must not be None for a turn in a completed-consensus conversation"
    assert gt.has_feedback is False
    assert all(dim.included is False for dim in gt.dimensions.values())
    assert set(gt.dimensions.keys()) == set(PCK_DIMENSION_IDS)


def test_ground_truth_is_none_only_when_no_completed_consensus_exists_at_all(raw_dir: Path):
    examples = _examples_by_id(raw_dir)
    assert examples["conv_2__1"].ground_truth is None


def test_only_completed_consensus_filter_excludes_conv_2(raw_dir: Path):
    examples = _examples_by_id(raw_dir, only_completed_consensus=True)
    assert set(examples.keys()) == {"conv_1__1", "conv_1__2"}


def test_comparison_set_id_filter_restricts_to_set_items(raw_dir: Path):
    examples = _examples_by_id(raw_dir, comparison_set_id="cmpset_1")
    assert set(examples.keys()) == {"conv_1__1", "conv_1__2"}


def test_comparison_set_id_filter_raises_for_unknown_set(raw_dir: Path):
    with pytest.raises(ValueError):
        list(iter_turn_examples(raw_dir, comparison_set_id="does_not_exist"))


def test_conversation_history_accumulates_across_turns(raw_dir: Path):
    examples = _examples_by_id(raw_dir)
    assert examples["conv_1__1"].conversation_history == []
    history = examples["conv_1__2"].conversation_history
    assert len(history) == 1
    assert history[0].turn_number == 1
    assert history[0].teacher_message == "נועה טענה שריבוע הוא לא מלבן. מה דעתכם?"
    assert history[0].student_messages == ["ריבוע נראה אחרת ממלבן אז זה לא אותו דבר."]


def test_student_info_resolved_from_persona_reference(raw_dir: Path):
    examples = _examples_by_id(raw_dir)
    student_info = examples["conv_1__1"].student_info
    assert len(student_info) == 1
    assert student_info[0]["id"] == "noa"


def test_board_image_path_is_none_without_image_extraction(raw_dir: Path):
    examples = _examples_by_id(raw_dir)
    assert examples["conv_1__1"].board_image_path is None


def test_board_image_path_resolved_after_image_extraction(raw_dir_copy: Path):
    extract_all_images(raw_dir_copy)
    examples = _examples_by_id(raw_dir_copy)
    assert examples["conv_1__1"].board_image_path == "images/conv_1/1.png"
    assert examples["conv_1__2"].board_image_path is None


def test_build_dataset_writes_jsonl(raw_dir: Path, tmp_path: Path):
    out_path = tmp_path / "turn_examples.jsonl"
    count = build_dataset(raw_dir, out_path)

    assert count == 3
    lines = out_path.read_text(encoding="utf-8").strip().split("\n")
    assert len(lines) == 3


def test_build_dataset_only_completed_consensus_writes_fewer_rows(raw_dir: Path, tmp_path: Path):
    out_path = tmp_path / "test_set_v1.jsonl"
    count = build_dataset(raw_dir, out_path, only_completed_consensus=True)
    assert count == 2

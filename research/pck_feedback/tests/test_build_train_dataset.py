from pathlib import Path

from pck_feedback.dataset.build_train_dataset import build_train_dataset, iter_train_examples
from pck_feedback.pck_skills import PCK_DIMENSION_IDS


def _examples_by_id(raw_dir: Path, **kwargs) -> dict[str, object]:
    return {e.example_id: e for e in iter_train_examples(raw_dir, **kwargs)}


def test_excludes_conversations_with_completed_consensus_by_default(raw_dir: Path):
    """conv_1 has a completed consensus (from a1+a2) -- reserved for the test set, excluded here."""
    examples = _examples_by_id(raw_dir)
    assert all(not example_id.startswith("a1__") and not example_id.startswith("a2__") for example_id in examples)


def test_include_consensus_conversations_flag_brings_them_back(raw_dir: Path):
    examples = _examples_by_id(raw_dir, exclude_consensus_conversations=False)
    assert "a1__1" in examples
    assert "a2__1" in examples


def test_only_completed_annotations_included(raw_dir: Path):
    """a5 is a draft annotation (annotator_erin, conv_3) -- must never appear in the train set."""
    examples = _examples_by_id(raw_dir)
    assert all(not example_id.startswith("a5__") for example_id in examples)


def test_two_annotators_on_same_conversation_produce_separate_example_sets(raw_dir: Path):
    """a3 (carol) and a4 (dave) both annotated conv_3 -- must stay as two independent sets, never merged."""
    examples = _examples_by_id(raw_dir)
    assert set(examples.keys()) == {"a3__1", "a3__2", "a4__1", "a4__2"}

    for example_id in ("a3__1", "a3__2", "a4__1", "a4__2"):
        assert examples[example_id].conversation_id == "conv_3"


def test_annotator_label_positive_turn_reflects_that_annotators_own_selection(raw_dir: Path):
    examples = _examples_by_id(raw_dir)
    label = examples["a3__1"].label

    assert label.has_feedback is True
    assert label.dimensions["p1"].included is True
    assert label.dimensions["p1"].score == 2
    assert label.dimensions["p1"].feedback_text == "זיהוי טוב של הצורך לחזור להגדרה פורמלית."
    for dim_id in PCK_DIMENSION_IDS:
        if dim_id != "p1":
            assert examples["a3__1"].label.dimensions[dim_id].included is False


def test_annotator_label_absent_turn_is_explicit_negative(raw_dir: Path):
    """carol (a3) did not annotate turn 2 of conv_3 -- must be an explicit negative, not a missing row."""
    examples = _examples_by_id(raw_dir)
    label = examples["a3__2"].label

    assert label.has_feedback is False
    assert all(dim.included is False for dim in label.dimensions.values())
    assert set(label.dimensions.keys()) == set(PCK_DIMENSION_IDS)


def test_annotators_disagree_on_same_conversation_independently(raw_dir: Path):
    """dave (a4) labeled turn 2 (p5) but not turn 1 -- the mirror image of carol's (a3) labels."""
    examples = _examples_by_id(raw_dir)

    assert examples["a4__1"].label.has_feedback is False
    turn_2_label = examples["a4__2"].label
    assert turn_2_label.has_feedback is True
    assert turn_2_label.dimensions["p5"].included is True
    assert turn_2_label.dimensions["p5"].score == 1


def test_metadata_fields_are_preserved(raw_dir: Path):
    examples = _examples_by_id(raw_dir)
    example = examples["a3__1"]

    assert example.assignment_id == "a3"
    assert example.annotator_id == "annotator_carol"
    assert example.assignment_type == "production"
    assert example.annotation_status == "completed"
    assert example.conversation_id == "conv_3"
    assert example.session_id == "session_conv3_xyz"


def test_build_train_dataset_writes_jsonl(raw_dir: Path, tmp_path: Path):
    out_path = tmp_path / "train_examples.jsonl"
    count = build_train_dataset(raw_dir, out_path)

    assert count == 4  # a3 (2 turns) + a4 (2 turns); a1/a2/a5 excluded
    lines = out_path.read_text(encoding="utf-8").strip().split("\n")
    assert len(lines) == 4


def test_build_train_dataset_including_consensus_conversations(raw_dir: Path, tmp_path: Path):
    out_path = tmp_path / "train_examples_all.jsonl"
    count = build_train_dataset(raw_dir, out_path, exclude_consensus_conversations=False)

    # conv_1 has 2 teacher turns, so a1 and a2 each produce 2 rows (one per turn, including
    # the turn each annotator did NOT give feedback on -- an explicit negative, not a skip).
    assert count == 8  # a1 (2 turns) + a2 (2 turns) + a3 (2 turns) + a4 (2 turns); still excludes a5 (draft)

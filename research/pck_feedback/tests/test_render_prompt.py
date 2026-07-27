from pathlib import Path

import pytest

from pck_feedback.export.extract_images import extract_all_images
from pck_feedback.models.run_config import RunConfig
from pck_feedback.prompts.preview import find_example, render_prompt_preview
from pck_feedback.schemas.turn_example import GroundTruth, GroundTruthDimension, TurnExample
from pck_feedback.utils.io import write_jsonl

UNIQUE_GOLD_MARKER = "UNIQUE_GOLD_MARKER_SHOULD_NEVER_APPEAR_IN_PROMPT_XYZ123"


def _text_only_run_config(**overrides) -> RunConfig:
    defaults = dict(
        run_id="preview_test_run",
        provider="fake_provider",
        model_name="fake-model",
        prompt_version="baseline_v1",
    )
    defaults.update(overrides)
    return RunConfig(**defaults)


def _example_with_ground_truth(has_ground_truth: bool) -> TurnExample:
    ground_truth = None
    if has_ground_truth:
        ground_truth = GroundTruth(
            has_feedback=True,
            dimensions={
                "p1": GroundTruthDimension(included=True, score=2, feedback_text=UNIQUE_GOLD_MARKER),
                "p2": GroundTruthDimension(included=False),
                "p3": GroundTruthDimension(included=False),
                "p4": GroundTruthDimension(included=False),
                "p5": GroundTruthDimension(included=False),
            },
        )
    return TurnExample(
        example_id="preview_ex__1",
        conversation_id="preview_conv",
        session_id="preview_conv",
        turn_number=1,
        teacher_message="בואו נבדוק את ההגדרה של מלבן",
        ground_truth=ground_truth,
    )


def test_find_example_returns_matching_example(tmp_path: Path):
    dataset_path = tmp_path / "dataset.jsonl"
    example = _example_with_ground_truth(has_ground_truth=False)
    write_jsonl(dataset_path, [example.model_dump(mode="json")])

    found = find_example(dataset_path, "preview_ex__1")
    assert found.example_id == "preview_ex__1"


def test_find_example_raises_for_unknown_id(tmp_path: Path):
    dataset_path = tmp_path / "dataset.jsonl"
    write_jsonl(dataset_path, [_example_with_ground_truth(False).model_dump(mode="json")])

    with pytest.raises(ValueError):
        find_example(dataset_path, "does_not_exist")


def test_render_prompt_preview_includes_run_and_example_metadata(tmp_path: Path):
    config = _text_only_run_config()
    example = _example_with_ground_truth(has_ground_truth=False)
    dataset_path = tmp_path / "dataset.jsonl"

    markdown = render_prompt_preview(
        run_config=config,
        run_config_path=Path("config/runs/fake.yaml"),
        dataset_path=dataset_path,
        example=example,
    )

    assert "preview_test_run" in markdown
    assert "fake_provider" in markdown
    assert "fake-model" in markdown
    assert "baseline_v1" in markdown
    from pck_feedback.pck_skills import RUBRIC_VERSION

    assert RUBRIC_VERSION in markdown
    assert "preview_ex__1" in markdown
    assert "preview_conv" in markdown
    assert example.teacher_message in markdown


def test_render_prompt_preview_never_leaks_ground_truth(tmp_path: Path):
    """
    The prompt TEXT must be byte-identical whether or not the example has
    ground truth -- proving `.ground_truth` never influences prompt
    construction. The distinctive gold feedback_text must never appear
    anywhere in the rendered file.
    """
    config = _text_only_run_config()
    dataset_path = tmp_path / "dataset.jsonl"

    example_without_gt = _example_with_ground_truth(has_ground_truth=False)
    example_with_gt = _example_with_ground_truth(has_ground_truth=True)

    markdown_without_gt = render_prompt_preview(
        run_config=config, run_config_path=Path("x.yaml"), dataset_path=dataset_path, example=example_without_gt
    )
    markdown_with_gt = render_prompt_preview(
        run_config=config, run_config_path=Path("x.yaml"), dataset_path=dataset_path, example=example_with_gt
    )

    assert UNIQUE_GOLD_MARKER not in markdown_with_gt
    assert UNIQUE_GOLD_MARKER not in markdown_without_gt

    # Extract just the rendered prompt-text section (after the metadata headers) from each,
    # and confirm they're identical -- ground_truth presence must not change the prompt at all.
    prompt_section_marker = "## Full prompt text"
    text_without_gt = markdown_without_gt[markdown_without_gt.index(prompt_section_marker) :]
    text_with_gt = markdown_with_gt[markdown_with_gt.index(prompt_section_marker) :]
    assert text_without_gt == text_with_gt

    # The metadata line correctly reflects presence/absence, without exposing the gold content itself.
    assert "ground_truth present on dataset row: `False`" in markdown_without_gt
    assert "ground_truth present on dataset row: `True`" in markdown_with_gt


def test_render_prompt_preview_with_board_image_lists_metadata_not_base64(tmp_path: Path, raw_dir_copy: Path):
    extract_all_images(raw_dir_copy)

    example = TurnExample(
        example_id="conv_1__1",
        conversation_id="conv_1",
        session_id="conv_1",
        turn_number=1,
        teacher_message="נועה טענה שריבוע הוא לא מלבן. מה דעתכם?",
        board_image_path="images/conv_1/1.png",
    )
    config = _text_only_run_config(include_board_images=True)

    markdown = render_prompt_preview(
        run_config=config,
        run_config_path=Path("config/runs/fake_with_images.yaml"),
        dataset_path=tmp_path / "dataset.jsonl",
        example=example,
        raw_dir=raw_dir_copy,
    )

    assert "Image parts (1)" in markdown
    assert "mime_type=`image/png`" in markdown
    assert "images/conv_1/1.png" in markdown
    # The raw base64 payload from the fixture must never be inlined into the preview.
    raw_base64 = (raw_dir_copy / "conversations" / "conv_1.json").read_text(encoding="utf-8")
    board_image_b64 = "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEUlEQVR4nGP4z8DA8B+MgBgAHfAD/dPQfSYAAAAASUVORK5CYII="
    assert board_image_b64 in raw_base64  # sanity-check the fixture actually has it
    assert board_image_b64 not in markdown  # ...but it must not leak into the rendered preview


def test_render_prompt_preview_include_board_images_true_but_no_image_available(tmp_path: Path):
    example = _example_with_ground_truth(has_ground_truth=False)  # board_image_path=None
    config = _text_only_run_config(include_board_images=True)

    markdown = render_prompt_preview(
        run_config=config,
        run_config_path=Path("x.yaml"),
        dataset_path=tmp_path / "dataset.jsonl",
        example=example,
        raw_dir=tmp_path,
    )

    assert "Image parts (0)" in markdown
    assert "text-only" in markdown

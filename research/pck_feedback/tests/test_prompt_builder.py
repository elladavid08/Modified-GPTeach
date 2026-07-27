from pathlib import Path

import pytest

from pck_feedback.dataset.build_turn_dataset import iter_turn_examples
from pck_feedback.export.extract_images import extract_all_images
from pck_feedback.pck_skills import PCK_DIMENSION_IDS
from pck_feedback.prompts.baseline_prompt import (
    build_baseline_prompt,
    format_conversation_history,
    format_scenario_context,
    format_student_info,
)
from pck_feedback.prompts.registry import build_prompt, get_prompt_builder
from pck_feedback.schemas.turn_example import HistoryTurnEntry


def _example(raw_dir: Path, example_id: str):
    examples = {e.example_id: e for e in iter_turn_examples(raw_dir)}
    return examples[example_id]


def test_format_scenario_context_includes_key_fields():
    scenario = {
        "grade_level": 7,
        "ai_context_summary": "topic summary",
        "ai_prior_knowledge": "prior knowledge text",
        "misconception_focus": "misconception text",
        "ai_pedagogical_focus": ["focus 1", "focus 2"],
    }
    text = format_scenario_context(scenario)
    assert "7" in text
    assert "topic summary" in text
    assert "prior knowledge text" in text
    assert "misconception text" in text
    assert "focus 1" in text and "focus 2" in text


def test_format_scenario_context_handles_empty_scenario():
    assert format_scenario_context({}) == "No scenario context provided"


def test_format_conversation_history_empty_returns_hebrew_placeholder():
    assert "אין היסטוריה" in format_conversation_history([])


def test_format_conversation_history_formats_teacher_and_students():
    history = [HistoryTurnEntry(turn_number=1, teacher_message="שאלה", student_messages=["תשובה א", "תשובה ב"])]
    text = format_conversation_history(history)
    assert "מורה: שאלה" in text
    assert "תלמיד: תשובה א" in text
    assert "תלמיד: תשובה ב" in text


def test_format_student_info_lists_names():
    text = format_student_info([{"id": "noa", "name": "נועה", "description": "desc"}])
    assert "נועה" in text
    assert "desc" in text


def test_format_student_info_empty_returns_placeholder():
    assert "No student information" in format_student_info([])


def test_build_baseline_prompt_text_only_matches_production_style(raw_dir: Path):
    example = _example(raw_dir, "conv_1__1")
    payload = build_baseline_prompt(example, include_student_info=False, include_board_images=False)

    assert payload.images == []
    for dim_id in PCK_DIMENSION_IDS:
        assert f"**{dim_id}:" in payload.text
    assert example.teacher_message in payload.text
    assert "should_provide_feedback" in payload.text
    # Student info block should be entirely absent when not requested.
    assert "Student Information" not in payload.text


def test_build_baseline_prompt_with_student_info(raw_dir: Path):
    example = _example(raw_dir, "conv_1__1")
    payload = build_baseline_prompt(example, include_student_info=True, include_board_images=False)
    assert "Student Information" in payload.text
    assert "נועה" in payload.text


def test_build_baseline_prompt_with_board_images_requires_raw_dir(raw_dir_copy: Path):
    extract_all_images(raw_dir_copy)
    example = _example(raw_dir_copy, "conv_1__1")
    assert example.board_image_path is not None  # sanity: this turn does have an image to attach

    with pytest.raises(ValueError):
        build_baseline_prompt(example, include_board_images=True, raw_dir=None)


def test_build_baseline_prompt_attaches_image_when_available(raw_dir_copy: Path):
    extract_all_images(raw_dir_copy)
    example = _example(raw_dir_copy, "conv_1__1")

    payload = build_baseline_prompt(example, include_board_images=True, raw_dir=raw_dir_copy)

    assert len(payload.images) == 1
    assert payload.images[0].mime_type == "image/png"
    assert payload.images[0].data[:8] == b"\x89PNG\r\n\x1a\n"


def test_build_baseline_prompt_skips_image_silently_when_path_missing(raw_dir: Path):
    # raw_dir (no image extraction run) -> board_image_path is None for turn 1.
    example = _example(raw_dir, "conv_1__1")
    payload = build_baseline_prompt(example, include_board_images=True, raw_dir=raw_dir)
    assert payload.images == []  # no crash, just no image attached


def test_registry_resolves_baseline_v1():
    builder = get_prompt_builder("baseline_v1")
    assert builder is build_baseline_prompt


def test_registry_unknown_prompt_version_raises():
    with pytest.raises(ValueError):
        get_prompt_builder("does_not_exist")


def test_build_prompt_via_registry(raw_dir: Path):
    example = _example(raw_dir, "conv_1__1")
    payload = build_prompt("baseline_v1", example)
    assert example.teacher_message in payload.text


def test_prompt_includes_general_assessment_guidance(raw_dir: Path):
    example = _example(raw_dir, "conv_1__1")
    payload = build_baseline_prompt(example)
    assert "General Assessment Guidance" in payload.text
    assert "missed a pedagogical opportunity" in payload.text
    assert "not the severity" in payload.text


def test_prompt_includes_should_provide_feedback_consistency_rule(raw_dir: Path):
    example = _example(raw_dir, "conv_1__1")
    payload = build_baseline_prompt(example)
    assert "Consistency requirement" in payload.text
    assert '"relevant": true, then "should_provide_feedback" must be true' in payload.text
    assert 'have "relevant": false, then "should_provide_feedback" must be false' in payload.text


def test_prompt_includes_hebrew_patterns_illustrative_note(raw_dir: Path):
    example = _example(raw_dir, "conv_1__1")
    payload = build_baseline_prompt(example)
    assert "illustrative examples only, not exact string-matching rules" in payload.text


def test_prompt_without_board_image_has_no_image_instruction_section(raw_dir: Path):
    example = _example(raw_dir, "conv_1__1")
    payload = build_baseline_prompt(example, include_board_images=False)
    assert "Attached Board Image" not in payload.text


def test_prompt_with_board_image_includes_image_instruction_section(raw_dir_copy: Path):
    extract_all_images(raw_dir_copy)
    example = _example(raw_dir_copy, "conv_1__1")
    payload = build_baseline_prompt(example, include_board_images=True, raw_dir=raw_dir_copy)

    assert len(payload.images) == 1
    assert "Attached Board Image" in payload.text
    assert "the shape on the board" in payload.text


def test_prompt_include_board_images_true_but_no_image_available_has_no_image_section(raw_dir: Path):
    # raw_dir (no image extraction run) -> board_image_path is None for turn 1.
    example = _example(raw_dir, "conv_1__1")
    payload = build_baseline_prompt(example, include_board_images=True, raw_dir=raw_dir)
    assert payload.images == []
    assert "Attached Board Image" not in payload.text

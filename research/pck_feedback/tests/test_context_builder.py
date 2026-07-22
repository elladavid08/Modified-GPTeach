from pathlib import Path

from pck_feedback.dataset.context_builder import (
    build_conversation_history,
    load_student_personas_reference,
    resolve_board_image_path,
    resolve_student_info,
)
from pck_feedback.schemas.raw import RawStudentMessage, RawTeacherTurn, RawTurn

PERSONAS_PATH = Path(__file__).parent.parent / "config" / "student_personas_reference.json"


def _turn(number: int, teacher_message: str, student_messages: list[str]) -> RawTurn:
    return RawTurn(
        turnNumber=number,
        teacher=RawTeacherTurn(message=teacher_message),
        students=[RawStudentMessage(name="student", message=m) for m in student_messages],
    )


def test_build_conversation_history_excludes_current_and_later_turns():
    turns = [
        _turn(1, "teacher msg 1", ["student msg 1"]),
        _turn(2, "teacher msg 2", ["student msg 2a", "student msg 2b"]),
        _turn(3, "teacher msg 3", []),
    ]

    history = build_conversation_history(turns, up_to_turn_number=3)

    assert [h.turn_number for h in history] == [1, 2]
    assert history[1].teacher_message == "teacher msg 2"
    assert history[1].student_messages == ["student msg 2a", "student msg 2b"]


def test_build_conversation_history_empty_for_first_turn():
    turns = [_turn(1, "teacher msg 1", [])]
    history = build_conversation_history(turns, up_to_turn_number=1)
    assert history == []


def test_load_student_personas_reference_has_expected_ids():
    personas = load_student_personas_reference(PERSONAS_PATH)
    assert "noa" in personas
    assert personas["noa"]["name"] == "נועה"


def test_load_student_personas_reference_missing_file_returns_empty_dict(tmp_path):
    personas = load_student_personas_reference(tmp_path / "does_not_exist.json")
    assert personas == {}


def test_resolve_student_info_handles_versioned_refs():
    personas_reference = {"noa": {"id": "noa", "name": "נועה"}}
    resolved = resolve_student_info(["v1_noa"], personas_reference)
    assert resolved == [{"id": "noa", "name": "נועה"}]


def test_resolve_student_info_handles_bare_id_refs():
    personas_reference = {"hila": {"id": "hila", "name": "הילה"}}
    resolved = resolve_student_info(["hila"], personas_reference)
    assert resolved == [{"id": "hila", "name": "הילה"}]


def test_resolve_student_info_silently_skips_unknown_refs():
    resolved = resolve_student_info(["v3_unknown_persona"], {})
    assert resolved == []


def test_resolve_board_image_path_found_and_missing():
    lookup = {("conv_1", 1): "images/conv_1/1.png"}
    assert resolve_board_image_path(lookup, "conv_1", 1) == "images/conv_1/1.png"
    assert resolve_board_image_path(lookup, "conv_1", 2) is None

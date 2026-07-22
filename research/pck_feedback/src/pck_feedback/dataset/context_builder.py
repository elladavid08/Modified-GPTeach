"""
Per-turn context assembly: conversation history, student info, board image
path resolution. Kept separate from `build_turn_dataset.py` so each piece
is independently unit-testable.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any, Optional

from pck_feedback.schemas.raw import RawTurn
from pck_feedback.schemas.turn_example import HistoryTurnEntry
from pck_feedback.utils.io import read_json

# Matches production's versioned studentPersonas doc ID convention, e.g. "v1_noa", "v2.1_maayan".
_VERSIONED_REF_RE = re.compile(r"^v[\d.]+_(.+)$")


def build_conversation_history(turns: list[RawTurn], up_to_turn_number: int) -> list[HistoryTurnEntry]:
    """
    All turns strictly before `up_to_turn_number`, condensed to plain text.
    Mirrors `formatConversationHistory` (server/universal_pck_skills.js).
    """
    history: list[HistoryTurnEntry] = []
    for turn in turns:
        if turn.turnNumber >= up_to_turn_number:
            continue
        history.append(
            HistoryTurnEntry(
                turn_number=turn.turnNumber,
                teacher_message=turn.teacher.message,
                student_messages=[s.message for s in turn.students],
            )
        )
    return history


def load_student_personas_reference(path: Path) -> dict[str, dict[str, Any]]:
    """Load config/student_personas_reference.json -> {persona_id: persona_dict}."""
    if not path.exists():
        return {}
    data = read_json(path)
    return data.get("personas", {})


def _persona_id_from_ref(student_ref: str) -> str:
    match = _VERSIONED_REF_RE.match(student_ref)
    return match.group(1) if match else student_ref


def resolve_student_info(
    student_refs: list[str],
    personas_reference: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    """
    Best-effort lookup of student persona info by ref. Never raises -- refs
    that don't resolve are simply omitted, since personas.js may have
    evolved since this static reference file was ported (see
    config/student_personas_reference.json header comment).
    """
    resolved: list[dict[str, Any]] = []
    for ref in student_refs:
        persona_id = _persona_id_from_ref(ref)
        persona = personas_reference.get(persona_id)
        if persona is not None:
            resolved.append(persona)
    return resolved


def resolve_board_image_path(
    image_lookup: dict[tuple[str, int], str],
    conversation_id: str,
    turn_number: int,
) -> Optional[str]:
    """Look up the extracted PNG path for a turn, if `extract_images.py` has run."""
    return image_lookup.get((conversation_id, turn_number))

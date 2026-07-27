"""
Train dataset schema: one row per (annotation assignment, teacher turn),
built from individual pre-consensus annotator annotations
(`conversationAnnotations`) rather than the completed team consensus used
for the held-out test set (see `schemas/turn_example.py`).

Key differences from `TurnExample`:
  - `TrainExample.label` is never optional/`None` -- `build_train_dataset.py`
    only ever emits examples for turns belonging to a *completed*
    individual annotation assignment, so there is no "no label yet" case
    to represent (unlike `TurnExample.ground_truth`, which can be `None`
    when no completed consensus exists at all).
  - If two different annotators annotated the same conversation, this
    produces two entirely separate `TrainExample` sets -- one per
    `assignment_id` -- never merged into a single row per turn. Individual
    annotations are pre-consensus and may legitimately disagree; merging
    them would silently destroy that disagreement signal.
"""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field

from pck_feedback.pck_skills import PCK_DIMENSION_IDS
from pck_feedback.schemas.turn_example import GroundTruthDimension, HistoryTurnEntry


class AnnotatorLabel(BaseModel):
    """
    One annotator's label for one teacher turn. Same per-dimension shape as
    `turn_example.GroundTruth`, but sourced from a single pre-consensus
    `conversationAnnotations` document rather than a completed consensus
    annotation -- kept as a distinct type so the two are never confused.
    """

    has_feedback: bool
    dimensions: dict[str, GroundTruthDimension]

    @classmethod
    def negative(cls) -> "AnnotatorLabel":
        """Explicit negative label: turn not present in this annotator's feedbackPoints."""
        return cls(
            has_feedback=False,
            dimensions={dim_id: GroundTruthDimension(included=False) for dim_id in PCK_DIMENSION_IDS},
        )


class TrainExample(BaseModel):
    model_config = ConfigDict(extra="forbid")

    example_id: str  # f"{assignment_id}__{turn_number}"

    # --- annotation/assignment metadata ---
    assignment_id: str
    annotator_id: Optional[str] = None
    assignment_type: Optional[str] = None
    annotation_status: Optional[str] = None  # the individual annotation doc's own `status` (should be "completed")

    # --- conversation identifiers (see turn_example.py for the conversation_id vs session_id rationale) ---
    conversation_id: str
    session_id: str

    turn_number: int

    scenario: dict[str, Any] = Field(default_factory=dict)
    student_info: list[dict[str, Any]] = Field(default_factory=list)
    conversation_history: list[HistoryTurnEntry] = Field(default_factory=list)
    teacher_message: str
    board_image_path: Optional[str] = None  # relative path under data/raw/images/

    label: AnnotatorLabel

    source: dict[str, Any] = Field(default_factory=dict)
    # {raw_conversation_file, raw_annotation_file, exported_at}

"""
Turn-level dataset schema.

Each `TurnExample` is one teacher turn, evaluated independently but with
the context that was available at that point in the conversation:
lesson/scenario info, student info (if available), conversation history
before the turn, the current teacher message, and a board image path
(if a drawing existed).

See "Ground truth semantics" below -- this is the most important
correctness contract in the whole pipeline, worth reading carefully
before touching `dataset/build_turn_dataset.py`.
"""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field

from pck_feedback.pck_skills import PCK_DIMENSION_IDS


class HistoryTurnEntry(BaseModel):
    """One prior turn, condensed to plain text (mirrors formatConversationHistory)."""

    turn_number: int
    teacher_message: str
    student_messages: list[str] = Field(default_factory=list)


class GroundTruthDimension(BaseModel):
    included: bool
    score: Optional[int] = None  # 0, 1, 2 -- only meaningful when included=True
    feedback_text: Optional[str] = None


class GroundTruth(BaseModel):
    """
    Ground truth for one teacher turn, derived from a *completed* consensus
    annotation document.

    IMPORTANT -- semantics (do not "fix" this into inferring nulls):
      - A `GroundTruth` instance only ever exists when the turn's
        conversation has a completed consensus annotation. If no completed
        consensus exists for the conversation, `TurnExample.ground_truth`
        is `None` -- that is the ONLY meaning of `None`.
      - Within a completed-consensus conversation, every single turn gets a
        `GroundTruth`: if the turn is absent from the consensus
        `feedbackPoints`, that is an explicit NEGATIVE label
        (`has_feedback=False`, every dimension `included=False`) -- never a
        missing value. This makes "no feedback needed" a first-class label,
        required for precision/recall on `should_provide_feedback` later.
    """

    has_feedback: bool
    dimensions: dict[str, GroundTruthDimension]

    @classmethod
    def negative(cls) -> "GroundTruth":
        """Explicit negative label: turn not present in consensus feedbackPoints."""
        return cls(
            has_feedback=False,
            dimensions={dim_id: GroundTruthDimension(included=False) for dim_id in PCK_DIMENSION_IDS},
        )


class TurnExample(BaseModel):
    model_config = ConfigDict(extra="forbid")

    example_id: str  # f"{conversation_id}__{turn_number}"

    # --- identifiers (see plan §4 "conversation_id vs session_id") ---
    conversation_id: str  # canonical join key == conversations doc ID
    session_id: str  # conversation document's own `sessionId` field, verbatim;
    # traceability only -- NEVER used as a join key. If this ever
    # differs from `conversation_id` for a real record, log it as a
    # data-quality signal; do not silently reconcile the two.

    turn_number: int

    scenario: dict[str, Any] = Field(default_factory=dict)
    student_info: list[dict[str, Any]] = Field(default_factory=list)
    conversation_history: list[HistoryTurnEntry] = Field(default_factory=list)
    teacher_message: str
    board_image_path: Optional[str] = None  # relative path under data/raw/images/

    ground_truth: Optional[GroundTruth] = None

    source: dict[str, Any] = Field(default_factory=dict)
    # {raw_conversation_file, raw_consensus_file: str | None, exported_at: str | None}

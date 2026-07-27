"""
Raw export schemas -- mirror Firestore documents as closely as possible.

Field names intentionally match the Firestore/JS field names verbatim
(camelCase) rather than being renamed to snake_case, so that a raw exported
JSON file can be visually diffed against the Firestore console / production
code without a mental renaming step. `model_config = ConfigDict(extra="allow")`
on every model means unknown fields never break ingestion -- the raw export
stage is meant to be forward-compatible with schema drift in production.

These models are used only for light validation/typing convenience during
export and dataset-building; they are not a strict contract that production
must honor.
"""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field


class _LenientModel(BaseModel):
    model_config = ConfigDict(extra="allow")


class RawDimensionFeedback(_LenientModel):
    """
    Shared per-dimension shape, used by both individual (pre-consensus)
    annotations and consensus annotations. `included` is only ever
    meaningful on the *consensus* side (where a dimension can be explicitly
    recorded as excluded); individual annotation feedback points never
    populate it, so callers reading an individual annotation's
    `dimensionFeedback` must treat *key presence* as `included=True` rather
    than trusting this field's default -- see `build_train_dataset.py`.
    """

    included: bool = False
    score: Optional[int] = None
    feedbackText: Optional[str] = None


# ---------------------------------------------------------------------------
# conversations/{conversationId}
# ---------------------------------------------------------------------------


class RawTeacherTurn(_LenientModel):
    message: str = ""
    image: Optional[str] = None  # base64 PNG board drawing, or None
    timestamp: Optional[str] = None


class RawStudentMessage(_LenientModel):
    name: Optional[str] = None
    message: str = ""
    timestamp: Optional[str] = None


class RawTurn(_LenientModel):
    turnNumber: int
    timestamp: Optional[str] = None
    teacher: RawTeacherTurn = Field(default_factory=RawTeacherTurn)
    students: list[RawStudentMessage] = Field(default_factory=list)
    pckFeedback: Optional[dict[str, Any]] = None


class RawConversation(_LenientModel):
    # `conversation_id` is populated from the Firestore *document ID* at
    # export time (doc.id), not from a field inside the document body --
    # see export_collections.py. It is the canonical join key.
    conversation_id: str
    sessionId: Optional[str] = None
    userId: Optional[str] = None
    userSnapshot: Optional[dict[str, Any]] = None
    systemVersion: Optional[str] = None
    startTime: Optional[str] = None
    endTime: Optional[str] = None
    scenario: dict[str, Any] = Field(default_factory=dict)
    studentRefs: list[str] = Field(default_factory=list)
    turns: list[RawTurn] = Field(default_factory=list)
    stats: dict[str, Any] = Field(default_factory=dict)
    # Observed in production as a dict, a plain markdown string (a
    # human/AI-readable session summary), or None -- genuinely polymorphic
    # and not consumed anywhere downstream in this pipeline, so it's kept
    # untyped rather than forcing one shape.
    summaryFeedback: Optional[Any] = None
    lastUpdated: Optional[Any] = None


# ---------------------------------------------------------------------------
# conversationAnnotationAssignments/{assignmentId}
# ---------------------------------------------------------------------------


class RawAnnotationAssignment(_LenientModel):
    assignment_id: str  # Firestore doc ID
    conversationId: str
    annotatorId: Optional[str] = None
    assignmentType: Optional[str] = None
    status: Optional[str] = None
    createdBy: Optional[str] = None
    createdAt: Optional[Any] = None
    updatedAt: Optional[Any] = None
    completedAt: Optional[Any] = None


# ---------------------------------------------------------------------------
# conversationAnnotations/{assignmentId}  (per-annotator, pre-consensus)
# ---------------------------------------------------------------------------


class RawAnnotationFeedbackPoint(_LenientModel):
    feedbackPointId: Optional[str] = None
    turnNumber: int
    sessionId: Optional[str] = None
    teacherMessageSnapshot: Optional[str] = None
    selectedDimensions: list[str] = Field(default_factory=list)
    # Real production shape (verified against live exports): one entry per
    # dimension the annotator selected, keyed by p1-p5, each carrying that
    # dimension's own score + feedback text -- NOT a flat top-level
    # `scores`/`feedbackText` pair shared across dimensions.
    dimensionFeedback: dict[str, RawDimensionFeedback] = Field(default_factory=dict)
    internalNote: Optional[str] = None
    createdAt: Optional[str] = None
    updatedAt: Optional[str] = None


class RawAnnotation(_LenientModel):
    assignment_id: str  # Firestore doc ID (== assignmentId field)
    assignmentId: Optional[str] = None
    conversationId: str
    annotatorId: Optional[str] = None
    assignmentType: Optional[str] = None
    feedbackPoints: list[RawAnnotationFeedbackPoint] = Field(default_factory=list)
    generalComment: Optional[str] = None
    status: Optional[str] = None
    createdAt: Optional[Any] = None
    updatedAt: Optional[Any] = None
    submittedAt: Optional[Any] = None


# ---------------------------------------------------------------------------
# conversationConsensusAnnotations/{comparisonSetId}__{conversationId}
# ---------------------------------------------------------------------------


class RawConsensusFeedbackPoint(_LenientModel):
    turnNumber: int
    teacherMessageSnapshot: Optional[str] = None
    selectedDimensions: list[str] = Field(default_factory=list)
    dimensionFeedback: dict[str, RawDimensionFeedback] = Field(default_factory=dict)


class RawConsensusAnnotation(_LenientModel):
    consensus_id: str  # Firestore doc ID (== consensusId field)
    consensusId: Optional[str] = None
    comparisonSetId: Optional[str] = None
    conversationId: str
    sourceAssignmentIds: list[str] = Field(default_factory=list)
    status: Optional[str] = None  # "draft" | "completed"
    feedbackPoints: list[RawConsensusFeedbackPoint] = Field(default_factory=list)
    createdAt: Optional[Any] = None
    createdBy: Optional[str] = None
    updatedAt: Optional[Any] = None
    updatedBy: Optional[str] = None
    submittedAt: Optional[Any] = None
    submittedBy: Optional[str] = None

    @property
    def is_completed(self) -> bool:
        return self.status == "completed"


# ---------------------------------------------------------------------------
# annotationComparisonSets/{comparisonSetId}
# ---------------------------------------------------------------------------


class RawComparisonSetItem(_LenientModel):
    conversationId: str
    assignmentIds: list[str] = Field(default_factory=list)


class RawComparisonSet(_LenientModel):
    comparison_set_id: str  # Firestore doc ID
    items: list[RawComparisonSetItem] = Field(default_factory=list)
    visibleToAnnotators: Optional[bool] = None

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
    summaryFeedback: Optional[dict[str, Any]] = None
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
    scores: dict[str, int] = Field(default_factory=dict)
    feedbackText: Optional[str] = None
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


class RawDimensionFeedback(_LenientModel):
    included: bool = False
    score: Optional[int] = None
    feedbackText: Optional[str] = None


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

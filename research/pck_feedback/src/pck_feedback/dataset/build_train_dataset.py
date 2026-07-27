"""
Train dataset build: `data/raw/annotations/*` -> `train_examples.jsonl`.

Unlike `build_turn_dataset.py` (which builds the held-out test set from
*completed team consensus* annotations), this module builds a train set
from *individual, pre-consensus* annotator annotations
(`conversationAnnotations` + `conversationAnnotationAssignments`). Each
completed annotation assignment produces its own independent set of
turn-level examples for its conversation -- if two annotators annotated the
same conversation, this yields two separate example sets (one per
`assignment_id`), never merged. See `schemas/train_example.py` for the
exact contract.

By default, conversations that already have a completed consensus
annotation are excluded, since those conversations are reserved as the
held-out test set (see `build_turn_dataset.py` / `test_set_v1.jsonl`) and
must never leak into training data. Source assignments referenced by a
completed consensus's `sourceAssignmentIds` are excluded too, as a
belt-and-suspenders safety net in case an assignment's `conversationId`
ever drifted from its consensus's `conversationId`.
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path
from typing import Optional

from pck_feedback.dataset.build_turn_dataset import (
    DEFAULT_PERSONAS_REFERENCE_PATH,
    load_raw_consensus_annotations,
    load_raw_conversations,
)
from pck_feedback.dataset.context_builder import (
    build_conversation_history,
    load_student_personas_reference,
    resolve_board_image_path,
    resolve_student_info,
)
from pck_feedback.export.export_collections import COLLECTION_DIRS
from pck_feedback.export.extract_images import load_image_manifest
from pck_feedback.pck_skills import PCK_DIMENSION_IDS
from pck_feedback.schemas.raw import RawAnnotation, RawAnnotationAssignment, RawConsensusAnnotation
from pck_feedback.schemas.train_example import AnnotatorLabel, TrainExample
from pck_feedback.schemas.turn_example import GroundTruthDimension
from pck_feedback.utils.io import iter_json_files, read_json, write_jsonl
from pck_feedback.utils.logging import get_logger

logger = get_logger(__name__)


def load_raw_annotations(raw_dir: Path) -> list[RawAnnotation]:
    ann_dir = raw_dir / COLLECTION_DIRS["conversationAnnotations"]
    annotations: list[RawAnnotation] = []
    for path in iter_json_files(ann_dir):
        data = read_json(path)
        annotations.append(RawAnnotation.model_validate(data))
    return annotations


def load_raw_annotation_assignments(raw_dir: Path) -> list[RawAnnotationAssignment]:
    assignments_dir = raw_dir / COLLECTION_DIRS["conversationAnnotationAssignments"]
    assignments: list[RawAnnotationAssignment] = []
    for path in iter_json_files(assignments_dir):
        data = read_json(path)
        assignments.append(RawAnnotationAssignment.model_validate(data))
    return assignments


def _excluded_conversation_and_assignment_ids(
    consensus_docs: list[RawConsensusAnnotation],
) -> tuple[set[str], set[str]]:
    """Conversations + source assignments already "spent" on a completed consensus doc."""
    completed = [doc for doc in consensus_docs if doc.status == "completed"]
    conversation_ids = {doc.conversationId for doc in completed}
    assignment_ids = {assignment_id for doc in completed for assignment_id in doc.sourceAssignmentIds}
    return conversation_ids, assignment_ids


def _label_for_turn(turn_number: int, annotation: RawAnnotation) -> AnnotatorLabel:
    """
    Mirrors the ground-truth contract in `build_turn_dataset._ground_truth_for_turn`,
    but sourced from one annotator's own `feedbackPoints` instead of a
    consensus doc. A turn absent from `feedbackPoints` is an explicit
    negative label, never a missing value.

    `selectedDimensions` (not `dimensionFeedback` key presence) is treated
    as the source of truth for `included`, since it is the annotator's
    literal selection; `dimensionFeedback` only supplies the per-dimension
    score/text for whichever dimensions were selected.
    """
    feedback_point = next((fp for fp in annotation.feedbackPoints if fp.turnNumber == turn_number), None)
    if feedback_point is None:
        return AnnotatorLabel.negative()

    dims: dict[str, GroundTruthDimension] = {}
    for dim_id in PCK_DIMENSION_IDS:
        if dim_id in feedback_point.selectedDimensions:
            raw_dim = feedback_point.dimensionFeedback.get(dim_id)
            dims[dim_id] = GroundTruthDimension(
                included=True,
                score=raw_dim.score if raw_dim else None,
                feedback_text=raw_dim.feedbackText if raw_dim else None,
            )
        else:
            dims[dim_id] = GroundTruthDimension(included=False)

    has_feedback = any(d.included for d in dims.values())
    return AnnotatorLabel(has_feedback=has_feedback, dimensions=dims)


def iter_train_examples(
    raw_dir: Path,
    *,
    exclude_consensus_conversations: bool = True,
    personas_reference_path: Path = DEFAULT_PERSONAS_REFERENCE_PATH,
) -> Iterator[TrainExample]:
    """
    Core train-set-building generator. See module docstring for the
    per-assignment / non-merging contract.

    `exclude_consensus_conversations` (default True): skip any conversation
    that has at least one completed `conversationConsensusAnnotations` doc,
    and skip any assignment listed in such a doc's `sourceAssignmentIds`,
    so the held-out consensus test set never leaks into training data.
    """
    annotations = load_raw_annotations(raw_dir)
    assignments_by_id = {a.assignment_id: a for a in load_raw_annotation_assignments(raw_dir)}
    conversations_by_id = {c.conversation_id: c for c in load_raw_conversations(raw_dir)}
    consensus_docs = load_raw_consensus_annotations(raw_dir)
    personas_reference = load_student_personas_reference(personas_reference_path)
    image_lookup = load_image_manifest(raw_dir)

    excluded_conversation_ids, excluded_assignment_ids = _excluded_conversation_and_assignment_ids(consensus_docs)

    manifest_path = raw_dir / "export_manifest.json"
    exported_at = read_json(manifest_path).get("exported_at") if manifest_path.exists() else None

    for annotation in annotations:
        if annotation.status != "completed":
            logger.debug(
                "Skipping assignment %s: annotation status=%s (not completed)",
                annotation.assignment_id,
                annotation.status,
            )
            continue

        assignment: Optional[RawAnnotationAssignment] = assignments_by_id.get(annotation.assignment_id)
        if assignment is not None and assignment.status != "completed":
            logger.warning(
                "Skipping assignment %s: annotation doc says status=completed but its "
                "assignment doc says status=%s -- data-integrity mismatch.",
                annotation.assignment_id,
                assignment.status,
            )
            continue

        conversation_id = annotation.conversationId
        if exclude_consensus_conversations and (
            conversation_id in excluded_conversation_ids or annotation.assignment_id in excluded_assignment_ids
        ):
            logger.debug(
                "Skipping assignment %s: conversation %s is reserved for the consensus test set",
                annotation.assignment_id,
                conversation_id,
            )
            continue

        conversation = conversations_by_id.get(conversation_id)
        if conversation is None:
            logger.warning(
                "Skipping assignment %s: conversation %s not found under data/raw/conversations/",
                annotation.assignment_id,
                conversation_id,
            )
            continue

        student_info = resolve_student_info(conversation.studentRefs, personas_reference)
        annotator_id = annotation.annotatorId or (assignment.annotatorId if assignment else None)
        assignment_type = annotation.assignmentType or (assignment.assignmentType if assignment else None)

        for turn in conversation.turns:
            if not turn.teacher.message:
                continue

            history = build_conversation_history(conversation.turns, turn.turnNumber)
            board_image_path = resolve_board_image_path(image_lookup, conversation_id, turn.turnNumber)
            label = _label_for_turn(turn.turnNumber, annotation)

            yield TrainExample(
                example_id=f"{annotation.assignment_id}__{turn.turnNumber}",
                assignment_id=annotation.assignment_id,
                annotator_id=annotator_id,
                assignment_type=assignment_type,
                annotation_status=annotation.status,
                conversation_id=conversation_id,
                session_id=conversation.sessionId or conversation_id,
                turn_number=turn.turnNumber,
                scenario=conversation.scenario,
                student_info=student_info,
                conversation_history=history,
                teacher_message=turn.teacher.message,
                board_image_path=board_image_path,
                label=label,
                source={
                    "raw_conversation_file": f"{COLLECTION_DIRS['conversations']}/{conversation_id}.json",
                    "raw_annotation_file": f"{COLLECTION_DIRS['conversationAnnotations']}/{annotation.assignment_id}.json",
                    "exported_at": exported_at,
                },
            )


def build_train_dataset(
    raw_dir: Path,
    out_path: Path,
    *,
    exclude_consensus_conversations: bool = True,
    personas_reference_path: Path = DEFAULT_PERSONAS_REFERENCE_PATH,
) -> int:
    """Build the full train dataset and write it to `out_path` as JSONL. Returns the example count."""
    examples = iter_train_examples(
        raw_dir,
        exclude_consensus_conversations=exclude_consensus_conversations,
        personas_reference_path=personas_reference_path,
    )
    count = write_jsonl(out_path, (example.model_dump(mode="json") for example in examples))
    logger.info("Wrote %d train example(s) to %s", count, out_path)
    return count

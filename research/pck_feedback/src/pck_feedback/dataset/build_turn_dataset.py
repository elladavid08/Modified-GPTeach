"""
Turn-level dataset build: `data/raw/*` -> `turn_examples.jsonl`.

See `schemas/turn_example.py::GroundTruth` for the ground-truth semantics
contract this module must uphold: `ground_truth=None` means "no completed
consensus annotation exists for this conversation at all"; whenever a
completed consensus annotation DOES exist, every turn in that conversation
gets an explicit `GroundTruth` (never `None`), with turns absent from the
consensus `feedbackPoints` becoming an explicit negative label.
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path
from typing import Optional

from pck_feedback.dataset.context_builder import (
    build_conversation_history,
    load_student_personas_reference,
    resolve_board_image_path,
    resolve_student_info,
)
from pck_feedback.export.export_collections import COLLECTION_DIRS
from pck_feedback.export.extract_images import load_image_manifest
from pck_feedback.pck_skills import PCK_DIMENSION_IDS
from pck_feedback.schemas.raw import RawComparisonSet, RawConsensusAnnotation, RawConversation
from pck_feedback.schemas.turn_example import GroundTruth, GroundTruthDimension, TurnExample
from pck_feedback.utils.io import iter_json_files, read_json, write_jsonl
from pck_feedback.utils.logging import get_logger

logger = get_logger(__name__)

DEFAULT_PERSONAS_REFERENCE_PATH = Path(__file__).resolve().parents[3] / "config" / "student_personas_reference.json"


def load_raw_conversations(raw_dir: Path) -> list[RawConversation]:
    conv_dir = raw_dir / COLLECTION_DIRS["conversations"]
    conversations: list[RawConversation] = []
    for path in iter_json_files(conv_dir):
        data = read_json(path)
        conversations.append(RawConversation.model_validate(data))
    return conversations


def load_raw_consensus_annotations(raw_dir: Path) -> list[RawConsensusAnnotation]:
    consensus_dir = raw_dir / COLLECTION_DIRS["conversationConsensusAnnotations"]
    docs: list[RawConsensusAnnotation] = []
    for path in iter_json_files(consensus_dir):
        data = read_json(path)
        docs.append(RawConsensusAnnotation.model_validate(data))
    return docs


def load_raw_comparison_sets(raw_dir: Path) -> list[RawComparisonSet]:
    sets_dir = raw_dir / COLLECTION_DIRS["annotationComparisonSets"]
    docs: list[RawComparisonSet] = []
    for path in iter_json_files(sets_dir):
        data = read_json(path)
        docs.append(RawComparisonSet.model_validate(data))
    return docs


def _select_completed_consensus(
    conversation_id: str,
    consensus_docs: list[RawConsensusAnnotation],
    comparison_set_id: Optional[str],
) -> Optional[RawConsensusAnnotation]:
    """
    Pick the relevant *completed* consensus doc for a conversation.

    A conversation could in principle appear in more than one comparison
    set. If `comparison_set_id` is given, only that set's consensus doc is
    considered. Otherwise, the first completed doc (sorted by ID for
    determinism) is used and a warning is logged if more than one exists,
    since that indicates the conversation has ambiguous multi-set ground
    truth that a human should resolve.
    """
    candidates = [
        doc
        for doc in consensus_docs
        if doc.conversationId == conversation_id
        and doc.status == "completed"
        and (comparison_set_id is None or doc.comparisonSetId == comparison_set_id)
    ]
    if not candidates:
        return None
    if len(candidates) > 1:
        ids = sorted(c.consensus_id for c in candidates)
        logger.warning(
            "Conversation %s has %d completed consensus docs (%s); using %s. "
            "Pass --comparison-set-id to disambiguate.",
            conversation_id,
            len(candidates),
            ids,
            ids[0],
        )
        candidates = sorted(candidates, key=lambda c: c.consensus_id)
    return candidates[0]


def _ground_truth_for_turn(
    turn_number: int,
    consensus_doc: Optional[RawConsensusAnnotation],
) -> Optional[GroundTruth]:
    """
    Implements the ground-truth contract described in the module docstring.
    Returns None only when `consensus_doc` is None (no completed consensus
    at all for the conversation).
    """
    if consensus_doc is None:
        return None

    feedback_point = next((fp for fp in consensus_doc.feedbackPoints if fp.turnNumber == turn_number), None)

    dims: dict[str, GroundTruthDimension] = {}
    for dim_id in PCK_DIMENSION_IDS:
        raw_dim = feedback_point.dimensionFeedback.get(dim_id) if feedback_point else None
        if raw_dim is not None:
            dims[dim_id] = GroundTruthDimension(
                included=raw_dim.included,
                score=raw_dim.score,
                feedback_text=raw_dim.feedbackText,
            )
        else:
            dims[dim_id] = GroundTruthDimension(included=False)

    has_feedback = any(d.included for d in dims.values())
    return GroundTruth(has_feedback=has_feedback, dimensions=dims)


def _conversation_ids_for_comparison_set(
    comparison_set_id: str,
    comparison_sets: list[RawComparisonSet],
) -> set[str]:
    matching = [cs for cs in comparison_sets if cs.comparison_set_id == comparison_set_id]
    if not matching:
        raise ValueError(f"No comparison set found with id '{comparison_set_id}' under data/raw/comparison_sets/")
    ids: set[str] = set()
    for cs in matching:
        for item in cs.items:
            ids.add(item.conversationId)
    return ids


def iter_turn_examples(
    raw_dir: Path,
    *,
    comparison_set_id: Optional[str] = None,
    only_completed_consensus: bool = False,
    personas_reference_path: Path = DEFAULT_PERSONAS_REFERENCE_PATH,
) -> Iterator[TurnExample]:
    """
    Core dataset-building generator. See module docstring for the ground
    truth contract.

    Filters:
      - `comparison_set_id`: only include conversations that are items of
        this `annotationComparisonSets` doc.
      - `only_completed_consensus`: only include conversations that have at
        least one completed `conversationConsensusAnnotations` doc.
      Both filters can be combined; either can be used alone.
    """
    conversations = load_raw_conversations(raw_dir)
    consensus_docs = load_raw_consensus_annotations(raw_dir)
    personas_reference = load_student_personas_reference(personas_reference_path)
    image_lookup = load_image_manifest(raw_dir)

    allowed_conversation_ids: Optional[set[str]] = None
    if comparison_set_id is not None:
        comparison_sets = load_raw_comparison_sets(raw_dir)
        allowed_conversation_ids = _conversation_ids_for_comparison_set(comparison_set_id, comparison_sets)

    manifest_path = raw_dir / "export_manifest.json"
    exported_at = read_json(manifest_path).get("exported_at") if manifest_path.exists() else None

    for conversation in conversations:
        conversation_id = conversation.conversation_id

        if allowed_conversation_ids is not None and conversation_id not in allowed_conversation_ids:
            continue

        consensus_doc = _select_completed_consensus(conversation_id, consensus_docs, comparison_set_id)

        if only_completed_consensus and consensus_doc is None:
            continue

        student_info = resolve_student_info(conversation.studentRefs, personas_reference)
        raw_consensus_file = (
            f"{COLLECTION_DIRS['conversationConsensusAnnotations']}/{consensus_doc.consensus_id}.json"
            if consensus_doc is not None
            else None
        )

        for turn in conversation.turns:
            if not turn.teacher.message:
                continue

            history = build_conversation_history(conversation.turns, turn.turnNumber)
            board_image_path = resolve_board_image_path(image_lookup, conversation_id, turn.turnNumber)
            ground_truth = _ground_truth_for_turn(turn.turnNumber, consensus_doc)

            yield TurnExample(
                example_id=f"{conversation_id}__{turn.turnNumber}",
                conversation_id=conversation_id,
                session_id=conversation.sessionId or conversation_id,
                turn_number=turn.turnNumber,
                scenario=conversation.scenario,
                student_info=student_info,
                conversation_history=history,
                teacher_message=turn.teacher.message,
                board_image_path=board_image_path,
                ground_truth=ground_truth,
                source={
                    "raw_conversation_file": f"{COLLECTION_DIRS['conversations']}/{conversation_id}.json",
                    "raw_consensus_file": raw_consensus_file,
                    "exported_at": exported_at,
                },
            )


def build_dataset(
    raw_dir: Path,
    out_path: Path,
    *,
    comparison_set_id: Optional[str] = None,
    only_completed_consensus: bool = False,
    personas_reference_path: Path = DEFAULT_PERSONAS_REFERENCE_PATH,
) -> int:
    """Build the full turn-level dataset and write it to `out_path` as JSONL. Returns the example count."""
    examples = iter_turn_examples(
        raw_dir,
        comparison_set_id=comparison_set_id,
        only_completed_consensus=only_completed_consensus,
        personas_reference_path=personas_reference_path,
    )
    count = write_jsonl(out_path, (example.model_dump(mode="json") for example in examples))
    logger.info("Wrote %d turn example(s) to %s", count, out_path)
    return count

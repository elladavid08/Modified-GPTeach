"""
Firestore -> local JSON export (read-only).

Exports 5 collections into `data/raw/<local_dir>/<docId>.json`, byte-faithful
to the Firestore document body (no field is stripped -- see
`extract_images.py` for the separate, additive image-extraction step).

This module is the ONLY place in the pipeline that talks to Firestore.
Every Firestore call here must be read-only (`.stream()`, `.get()`,
`.where(...)`) -- never `.set(`, `.update(`, `.add(`, or `.delete(`.

Nothing in this module is executed by the test suite against real
Firestore; it is exercised only via `run_export()` invoked manually by a
user who has configured credentials (see README.md / .env.example).
"""

from __future__ import annotations

import datetime
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

from pck_feedback.utils.io import read_json, write_json
from pck_feedback.utils.logging import get_logger

logger = get_logger(__name__)

# Firestore collection name -> local subdirectory name under data/raw/.
COLLECTION_DIRS: dict[str, str] = {
    "conversations": "conversations",
    "conversationAnnotationAssignments": "annotation_assignments",
    "conversationAnnotations": "annotations",
    "conversationConsensusAnnotations": "consensus_annotations",
    "annotationComparisonSets": "comparison_sets",
}

DEFAULT_COLLECTIONS: tuple[str, ...] = tuple(COLLECTION_DIRS.keys())

# Field used to detect "doc hasn't changed since last export" per collection.
# `None` means always re-write (no reliable last-modified field to compare).
_UPDATED_AT_FIELD: dict[str, Optional[str]] = {
    "conversations": "lastUpdated",
    "conversationAnnotationAssignments": "updatedAt",
    "conversationAnnotations": "updatedAt",
    "conversationConsensusAnnotations": "updatedAt",
    "annotationComparisonSets": None,
}


@dataclass
class ExportConfig:
    collections: tuple[str, ...] = DEFAULT_COLLECTIONS
    output_dir: Path = Path("data/raw")
    since: Optional[str] = None  # ISO date string; filters `conversations` by startTime
    conversation_ids: Optional[list[str]] = None  # restrict export to these conversation doc IDs
    limit: Optional[int] = None  # cap docs per collection (mainly for smoke-testing)
    force: bool = False  # re-write even if local copy looks unchanged
    doc_counts: dict[str, int] = field(default_factory=dict, repr=False)


def _to_jsonable(value: Any) -> Any:
    """Recursively convert Firestore-native types (Timestamps, etc.) to JSON-safe values."""
    if isinstance(value, dict):
        return {k: _to_jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_to_jsonable(v) for v in value]
    if isinstance(value, datetime.datetime):
        return value.isoformat()
    if hasattr(value, "isoformat"):  # DatetimeWithNanoseconds, date, etc.
        try:
            return value.isoformat()
        except Exception:  # pragma: no cover
            return str(value)
    return value


def _git_sha() -> Optional[str]:
    try:
        out = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            capture_output=True,
            text=True,
            timeout=5,
            check=True,
        )
        return out.stdout.strip()
    except Exception:  # pragma: no cover - best-effort only
        return None


def _local_doc_path(output_dir: Path, collection: str, doc_id: str) -> Path:
    return output_dir / COLLECTION_DIRS[collection] / f"{doc_id}.json"


def _is_unchanged(existing: dict[str, Any], fetched: dict[str, Any], updated_at_field: Optional[str]) -> bool:
    if updated_at_field is None:
        return False
    return existing.get(updated_at_field) == fetched.get(updated_at_field)


def _matches_conversation_filter(collection: str, doc_id: str, data: dict[str, Any], conversation_ids: Optional[set[str]]) -> bool:
    if conversation_ids is None:
        return True
    if collection == "conversations":
        return doc_id in conversation_ids
    if collection == "annotationComparisonSets":
        items = data.get("items") or []
        return any(item.get("conversationId") in conversation_ids for item in items)
    # conversationAnnotationAssignments, conversationAnnotations, conversationConsensusAnnotations
    return data.get("conversationId") in conversation_ids


def export_collection(
    db: Any,
    collection: str,
    config: ExportConfig,
) -> int:
    """Export a single collection. Returns the number of docs written."""
    if collection not in COLLECTION_DIRS:
        raise ValueError(f"Unknown collection '{collection}'. Known: {sorted(COLLECTION_DIRS)}")

    conversation_ids = set(config.conversation_ids) if config.conversation_ids else None
    updated_at_field = _UPDATED_AT_FIELD[collection]

    query = db.collection(collection)
    if collection == "conversations" and config.since:
        query = query.where("startTime", ">=", config.since)
    if config.limit:
        query = query.limit(config.limit)

    written = 0
    for snapshot in query.stream():  # read-only
        doc_id = snapshot.id
        data = _to_jsonable(snapshot.to_dict() or {})

        if not _matches_conversation_filter(collection, doc_id, data, conversation_ids):
            continue

        # Stamp the canonical local identifier field expected by schemas/raw.py,
        # without ever touching the original Firestore document.
        if collection == "conversations":
            data["conversation_id"] = doc_id
        elif collection == "conversationAnnotationAssignments":
            data["assignment_id"] = doc_id
        elif collection == "conversationAnnotations":
            data["assignment_id"] = doc_id
        elif collection == "conversationConsensusAnnotations":
            data["consensus_id"] = doc_id
        elif collection == "annotationComparisonSets":
            data["comparison_set_id"] = doc_id

        target = _local_doc_path(config.output_dir, collection, doc_id)
        if not config.force and target.exists():
            try:
                existing = read_json(target)
            except Exception:  # pragma: no cover - corrupt local file, re-write it
                existing = {}
            if _is_unchanged(existing, data, updated_at_field):
                logger.debug("Skipping unchanged doc %s/%s", collection, doc_id)
                continue

        write_json(target, data)
        written += 1

    return written


def run_export(config: ExportConfig, db: Any) -> dict[str, Any]:
    """
    Run the full export across `config.collections`, writing a manifest
    file alongside the exported data.

    `db` must be a Firestore client (see `firestore_client.get_firestore_client()`).
    Passed explicitly (rather than constructed inside this function) so the
    export logic can be unit-tested against a fake/in-memory client.
    """
    doc_counts: dict[str, int] = {}
    for collection in config.collections:
        logger.info("Exporting collection: %s", collection)
        count = export_collection(db, collection, config)
        doc_counts[collection] = count
        logger.info("  wrote %d doc(s) to %s/%s", count, config.output_dir, COLLECTION_DIRS[collection])

    manifest = {
        "exported_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "collections": list(config.collections),
        "filters": {
            "since": config.since,
            "conversation_ids": config.conversation_ids,
            "limit": config.limit,
            "force": config.force,
        },
        "doc_counts": doc_counts,
        "pipeline_git_sha": _git_sha(),
    }
    write_json(config.output_dir / "export_manifest.json", manifest)
    return manifest

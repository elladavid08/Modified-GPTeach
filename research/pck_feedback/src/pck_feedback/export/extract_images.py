"""
Additive board-image extraction.

Production stores each teacher turn's board drawing as a compressed base64
PNG inline on `turn.teacher.image` (see `src/services/conversationLogger.js`).
Keeping that base64 blob inline in every downstream JSONL record would
bloat the turn-level dataset considerably, so this step decodes it once to
a real PNG file and records a lightweight manifest entry instead.

This step is purely ADDITIVE:
  - it only READS the already-exported raw conversation JSON files under
    `data/raw/conversations/`;
  - it WRITES new PNG files under `data/raw/images/<conversation_id>/<turn_number>.png`
    plus `data/raw/images_manifest.json`;
  - it never modifies, slims down, or deletes anything under `data/raw/conversations/`.

The raw conversation JSON remains a byte-faithful copy of Firestore forever
-- any slimmer/derived copy (e.g. `TurnExample.board_image_path` instead of
inline base64) is produced downstream in `dataset/build_turn_dataset.py`,
never by mutating `data/raw/`.
"""

from __future__ import annotations

import base64
import binascii
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional

from pck_feedback.utils.io import ensure_dir, iter_json_files, read_json, write_json
from pck_feedback.utils.logging import get_logger

logger = get_logger(__name__)

IMAGES_SUBDIR = "images"
MANIFEST_FILENAME = "images_manifest.json"


@dataclass
class ImageManifestEntry:
    conversation_id: str
    turn_number: int
    path: str  # relative to raw_dir
    size_bytes: int


def _decode_base64_image(raw: str) -> bytes:
    # Production stores a plain base64 string (no data: URI prefix) on
    # turn.teacher.image, but guard against a prefix anyway for robustness.
    if raw.startswith("data:"):
        _, _, raw = raw.partition(",")
    return base64.b64decode(raw)


def extract_images_from_conversation(
    conversation_doc: dict[str, Any],
    raw_dir: Path,
) -> list[ImageManifestEntry]:
    """Extract every board image found in a single raw conversation document."""
    conversation_id = conversation_doc.get("conversation_id") or conversation_doc.get("sessionId")
    if not conversation_id:
        logger.warning("Skipping conversation with no conversation_id/sessionId field")
        return []

    entries: list[ImageManifestEntry] = []
    for turn in conversation_doc.get("turns", []):
        teacher = turn.get("teacher") or {}
        image_b64 = teacher.get("image")
        turn_number = turn.get("turnNumber")
        if not image_b64 or turn_number is None:
            continue

        try:
            image_bytes = _decode_base64_image(image_b64)
        except (binascii.Error, ValueError) as exc:
            logger.warning(
                "Failed to decode board image for conversation=%s turn=%s: %s",
                conversation_id,
                turn_number,
                exc,
            )
            continue

        rel_path = Path(IMAGES_SUBDIR) / str(conversation_id) / f"{turn_number}.png"
        abs_path = raw_dir / rel_path
        ensure_dir(abs_path.parent)
        abs_path.write_bytes(image_bytes)

        entries.append(
            ImageManifestEntry(
                conversation_id=str(conversation_id),
                turn_number=int(turn_number),
                path=str(rel_path),
                size_bytes=len(image_bytes),
            )
        )

    return entries


def extract_all_images(raw_dir: Path, conversations_dirname: str = "conversations") -> dict[str, Any]:
    """
    Walk every exported raw conversation file and extract board images.
    Returns the manifest dict that gets written to `images_manifest.json`.
    """
    conversations_dir = raw_dir / conversations_dirname
    all_entries: list[ImageManifestEntry] = []

    for path in iter_json_files(conversations_dir):
        conversation_doc = read_json(path)
        entries = extract_images_from_conversation(conversation_doc, raw_dir)
        all_entries.extend(entries)

    manifest = {
        "images": [
            {
                "conversation_id": e.conversation_id,
                "turn_number": e.turn_number,
                "path": e.path,
                "size_bytes": e.size_bytes,
            }
            for e in all_entries
        ],
        "count": len(all_entries),
    }
    write_json(raw_dir / MANIFEST_FILENAME, manifest)
    logger.info("Extracted %d board image(s) to %s/%s/", len(all_entries), raw_dir, IMAGES_SUBDIR)
    return manifest


def load_image_manifest(raw_dir: Path) -> dict[tuple[str, int], str]:
    """
    Load `images_manifest.json` into a lookup dict:
    (conversation_id, turn_number) -> relative path (str).
    Returns an empty dict if no manifest exists yet (image extraction is optional).
    """
    manifest_path = raw_dir / MANIFEST_FILENAME
    if not manifest_path.exists():
        return {}
    manifest = read_json(manifest_path)
    lookup: dict[tuple[str, int], str] = {}
    for entry in manifest.get("images", []):
        lookup[(entry["conversation_id"], entry["turn_number"])] = entry["path"]
    return lookup

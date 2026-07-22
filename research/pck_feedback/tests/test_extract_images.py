import json
from pathlib import Path

from pck_feedback.export.extract_images import extract_all_images, load_image_manifest


def test_extract_all_images_is_additive_and_does_not_mutate_raw_json(raw_dir_copy: Path):
    conv_1_path = raw_dir_copy / "conversations" / "conv_1.json"
    before = conv_1_path.read_text(encoding="utf-8")

    manifest = extract_all_images(raw_dir_copy)

    after = conv_1_path.read_text(encoding="utf-8")
    assert before == after, "extract_all_images must never modify the raw conversation JSON"

    # conv_1 turn 1 has an image, turn 2 does not; conv_2 has no images at all.
    assert manifest["count"] == 1
    entry = manifest["images"][0]
    assert entry["conversation_id"] == "conv_1"
    assert entry["turn_number"] == 1

    png_path = raw_dir_copy / entry["path"]
    assert png_path.exists()
    assert png_path.read_bytes()[:8] == b"\x89PNG\r\n\x1a\n"  # PNG magic bytes

    manifest_on_disk = json.loads((raw_dir_copy / "images_manifest.json").read_text(encoding="utf-8"))
    assert manifest_on_disk == manifest


def test_load_image_manifest_lookup(raw_dir_copy: Path):
    extract_all_images(raw_dir_copy)
    lookup = load_image_manifest(raw_dir_copy)
    assert ("conv_1", 1) in lookup
    assert ("conv_1", 2) not in lookup
    assert ("conv_2", 1) not in lookup


def test_load_image_manifest_before_extraction_returns_empty(raw_dir_copy: Path):
    # No images_manifest.json yet -- must not raise.
    lookup = load_image_manifest(raw_dir_copy)
    assert lookup == {}

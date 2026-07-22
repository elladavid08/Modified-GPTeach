import datetime
from pathlib import Path

from fakes.fake_firestore import FakeFirestoreClient

from pck_feedback.export.export_collections import (
    ExportConfig,
    _is_unchanged,
    _matches_conversation_filter,
    _to_jsonable,
    export_collection,
    run_export,
)
from pck_feedback.utils.io import read_json


def _sample_db() -> FakeFirestoreClient:
    return FakeFirestoreClient(
        {
            "conversations": {
                "conv_1": {
                    "sessionId": "conv_1",
                    "startTime": "2026-01-05T10:00:00.000Z",
                    "turns": [],
                    "lastUpdated": datetime.datetime(2026, 1, 5, 10, 20, tzinfo=datetime.timezone.utc),
                },
                "conv_2": {
                    "sessionId": "session_abc_999",
                    "startTime": "2026-02-01T09:00:00.000Z",
                    "turns": [],
                    "lastUpdated": datetime.datetime(2026, 2, 1, 9, 10, tzinfo=datetime.timezone.utc),
                },
            },
            "conversationConsensusAnnotations": {
                "cmpset_1__conv_1": {
                    "conversationId": "conv_1",
                    "status": "completed",
                    "updatedAt": "2026-01-07T10:30:00.000Z",
                }
            },
            "annotationComparisonSets": {
                "cmpset_1": {"items": [{"conversationId": "conv_1", "assignmentIds": ["a1", "a2"]}]},
            },
        }
    )


def test_to_jsonable_converts_datetimes_recursively():
    value = {
        "a": datetime.datetime(2026, 1, 1, tzinfo=datetime.timezone.utc),
        "b": [1, datetime.datetime(2026, 1, 2, tzinfo=datetime.timezone.utc)],
    }
    result = _to_jsonable(value)
    assert result["a"] == "2026-01-01T00:00:00+00:00"
    assert result["b"][1] == "2026-01-02T00:00:00+00:00"


def test_matches_conversation_filter_none_means_include_everything():
    assert _matches_conversation_filter("conversations", "conv_1", {}, None) is True


def test_matches_conversation_filter_conversations_by_doc_id():
    assert _matches_conversation_filter("conversations", "conv_1", {}, {"conv_1"}) is True
    assert _matches_conversation_filter("conversations", "conv_2", {}, {"conv_1"}) is False


def test_matches_conversation_filter_by_conversation_id_field():
    data = {"conversationId": "conv_1"}
    assert _matches_conversation_filter("conversationConsensusAnnotations", "doc_x", data, {"conv_1"}) is True
    assert _matches_conversation_filter("conversationConsensusAnnotations", "doc_x", data, {"conv_9"}) is False


def test_matches_conversation_filter_comparison_sets_by_items():
    data = {"items": [{"conversationId": "conv_1"}, {"conversationId": "conv_5"}]}
    assert _matches_conversation_filter("annotationComparisonSets", "set_1", data, {"conv_5"}) is True
    assert _matches_conversation_filter("annotationComparisonSets", "set_1", data, {"conv_9"}) is False


def test_is_unchanged_respects_field_and_none_field():
    assert _is_unchanged({"updatedAt": "t1"}, {"updatedAt": "t1"}, "updatedAt") is True
    assert _is_unchanged({"updatedAt": "t1"}, {"updatedAt": "t2"}, "updatedAt") is False
    assert _is_unchanged({"updatedAt": "t1"}, {"updatedAt": "t1"}, None) is False


def test_export_collection_writes_files_and_stamps_identifier_field(tmp_path: Path):
    db = _sample_db()
    config = ExportConfig(output_dir=tmp_path)

    written = export_collection(db, "conversations", config)

    assert written == 2
    conv1 = read_json(tmp_path / "conversations" / "conv_1.json")
    assert conv1["conversation_id"] == "conv_1"
    assert conv1["sessionId"] == "conv_1"


def test_export_collection_conversation_ids_filter_restricts_related_docs(tmp_path: Path):
    db = _sample_db()
    config = ExportConfig(output_dir=tmp_path, conversation_ids=["conv_1"])

    written_convs = export_collection(db, "conversations", config)
    written_consensus = export_collection(db, "conversationConsensusAnnotations", config)

    assert written_convs == 1
    assert written_consensus == 1
    assert (tmp_path / "conversations" / "conv_1.json").exists()
    assert not (tmp_path / "conversations" / "conv_2.json").exists()


def test_export_collection_incremental_skip_when_unchanged(tmp_path: Path):
    db = _sample_db()
    config = ExportConfig(output_dir=tmp_path)

    first_written = export_collection(db, "conversations", config)
    second_written = export_collection(db, "conversations", config)

    assert first_written == 2
    assert second_written == 0  # nothing changed, so nothing re-written


def test_export_collection_force_overwrites_even_when_unchanged(tmp_path: Path):
    db = _sample_db()
    config = ExportConfig(output_dir=tmp_path, force=True)

    export_collection(db, "conversations", config)
    second_written = export_collection(db, "conversations", config)

    assert second_written == 2


def test_run_export_writes_manifest_with_doc_counts(tmp_path: Path):
    db = _sample_db()
    config = ExportConfig(
        collections=("conversations", "conversationConsensusAnnotations", "annotationComparisonSets"),
        output_dir=tmp_path,
    )

    manifest = run_export(config, db)

    assert manifest["doc_counts"] == {
        "conversations": 2,
        "conversationConsensusAnnotations": 1,
        "annotationComparisonSets": 1,
    }
    manifest_on_disk = read_json(tmp_path / "export_manifest.json")
    assert manifest_on_disk["doc_counts"] == manifest["doc_counts"]

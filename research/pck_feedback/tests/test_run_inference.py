from pathlib import Path

import pytest
from fakes.fake_adapter import FakeAdapter

from pck_feedback.dataset.build_turn_dataset import build_dataset
from pck_feedback.inference.run_inference import run_inference
from pck_feedback.models.run_config import RunConfig
from pck_feedback.utils.io import read_jsonl


def _run_config(**overrides) -> RunConfig:
    defaults = dict(
        run_id="test_run",
        provider="fake_provider",
        model_name="fake-model",
        prompt_version="baseline_v1",
    )
    defaults.update(overrides)
    return RunConfig(**defaults)


def _build_dataset(raw_dir: Path, tmp_path: Path) -> Path:
    dataset_path = tmp_path / "turn_examples.jsonl"
    build_dataset(raw_dir, dataset_path)
    return dataset_path


def test_run_inference_end_to_end(raw_dir: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    dataset_path = _build_dataset(raw_dir, tmp_path)
    fake_adapter = FakeAdapter()
    monkeypatch.setattr("pck_feedback.inference.run_inference.get_adapter", lambda config: fake_adapter)

    out_path = tmp_path / "predictions.jsonl"
    summary = run_inference(dataset_path, _run_config(), out_path)

    assert summary == {"processed": 5, "skipped": 0, "failed": 0}
    assert len(fake_adapter.calls) == 5

    predictions = list(read_jsonl(out_path))
    assert len(predictions) == 5
    for prediction in predictions:
        assert prediction["run_id"] == "test_run"
        assert prediction["model_provider"] == "fake_provider"
        assert prediction["parse_status"] == "ok"
        assert prediction["rubric_version"]


def test_run_inference_resumes_and_skips_existing(raw_dir: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    dataset_path = _build_dataset(raw_dir, tmp_path)
    fake_adapter = FakeAdapter()
    monkeypatch.setattr("pck_feedback.inference.run_inference.get_adapter", lambda config: fake_adapter)

    out_path = tmp_path / "predictions.jsonl"
    run_inference(dataset_path, _run_config(), out_path)
    assert len(fake_adapter.calls) == 5

    # Re-running the exact same command must skip every already-completed
    # (run_id, example_id) pair -- no new model calls, no duplicate lines.
    summary = run_inference(dataset_path, _run_config(), out_path)

    assert summary == {"processed": 0, "skipped": 5, "failed": 0}
    assert len(fake_adapter.calls) == 5  # unchanged -- no new calls made
    predictions = list(read_jsonl(out_path))
    assert len(predictions) == 5  # not duplicated


def test_run_inference_force_rerun_reprocesses_everything(
    raw_dir: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    dataset_path = _build_dataset(raw_dir, tmp_path)
    fake_adapter = FakeAdapter()
    monkeypatch.setattr("pck_feedback.inference.run_inference.get_adapter", lambda config: fake_adapter)

    out_path = tmp_path / "predictions.jsonl"
    run_inference(dataset_path, _run_config(), out_path)

    summary = run_inference(dataset_path, _run_config(), out_path, force_rerun=True)

    assert summary == {"processed": 5, "skipped": 0, "failed": 0}
    assert len(fake_adapter.calls) == 10  # 5 from first run + 5 from force rerun
    predictions = list(read_jsonl(out_path))
    assert len(predictions) == 5  # overwritten, not appended on top of the old file


def test_run_inference_include_board_images_requires_raw_dir(
    raw_dir: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    dataset_path = _build_dataset(raw_dir, tmp_path)
    monkeypatch.setattr("pck_feedback.inference.run_inference.get_adapter", lambda config: FakeAdapter())

    config = _run_config(include_board_images=True)
    with pytest.raises(ValueError):
        run_inference(dataset_path, config, tmp_path / "predictions.jsonl", raw_dir=None)


def test_run_inference_handles_model_call_failure_without_aborting_batch(
    raw_dir: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    dataset_path = _build_dataset(raw_dir, tmp_path)
    fake_adapter = FakeAdapter(fail_first_n=1)
    monkeypatch.setattr("pck_feedback.inference.run_inference.get_adapter", lambda config: fake_adapter)

    out_path = tmp_path / "predictions.jsonl"
    summary = run_inference(dataset_path, _run_config(), out_path)

    assert summary == {"processed": 4, "skipped": 0, "failed": 1}
    predictions = list(read_jsonl(out_path))
    assert len(predictions) == 4


def test_run_inference_limit_processes_only_first_n_rows(
    raw_dir: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    dataset_path = _build_dataset(raw_dir, tmp_path)
    fake_adapter = FakeAdapter()
    monkeypatch.setattr("pck_feedback.inference.run_inference.get_adapter", lambda config: fake_adapter)

    out_path = tmp_path / "predictions.jsonl"
    summary = run_inference(dataset_path, _run_config(), out_path, limit=1)

    assert summary == {"processed": 1, "skipped": 0, "failed": 0}
    assert len(list(read_jsonl(out_path))) == 1

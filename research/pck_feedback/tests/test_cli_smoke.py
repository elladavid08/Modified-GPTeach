"""
Fixture-based CLI smoke tests.

Per the project's execution boundaries: these tests never touch Firestore,
Vertex AI, OpenAI, or any other external API/network/credentials. `infer`
is exercised end-to-end with a monkeypatched fake adapter (see
`fakes/fake_adapter.py`) standing in for a real model, which lets the full
CLI wiring (config load -> dataset read -> prompt build -> "model" call ->
parse -> write predictions.jsonl) be smoke-tested safely.
"""

from pathlib import Path

from fakes.fake_adapter import FakeAdapter
from typer.testing import CliRunner

from pck_feedback.cli.main import app
from pck_feedback.utils.io import read_jsonl

runner = CliRunner()


def test_build_dataset_command(raw_dir: Path, tmp_path: Path):
    out_path = tmp_path / "turn_examples.jsonl"

    result = runner.invoke(
        app,
        ["build-dataset", "--raw-dir", str(raw_dir), "--out", str(out_path)],
    )

    assert result.exit_code == 0, result.output
    assert "Wrote 5 turn example(s)" in result.output
    assert out_path.exists()
    assert len(list(read_jsonl(out_path))) == 5


def test_build_dataset_command_only_completed_consensus(raw_dir: Path, tmp_path: Path):
    out_path = tmp_path / "test_set_v1.jsonl"

    result = runner.invoke(
        app,
        [
            "build-dataset",
            "--raw-dir",
            str(raw_dir),
            "--out",
            str(out_path),
            "--only-completed-consensus",
        ],
    )

    assert result.exit_code == 0, result.output
    assert len(list(read_jsonl(out_path))) == 2


def test_extract_images_command(raw_dir_copy: Path):
    result = runner.invoke(app, ["extract-images", "--raw-dir", str(raw_dir_copy)])

    assert result.exit_code == 0, result.output
    assert "Extracted 1 board image" in result.output
    assert (raw_dir_copy / "images" / "conv_1" / "1.png").exists()


def test_evaluate_command_is_a_stub():
    result = runner.invoke(app, ["evaluate"])
    assert result.exit_code == 0
    assert "not implemented yet" in result.output.lower()


def test_infer_command_end_to_end_with_fake_adapter(raw_dir: Path, tmp_path: Path, monkeypatch):
    dataset_path = tmp_path / "turn_examples.jsonl"
    runner.invoke(app, ["build-dataset", "--raw-dir", str(raw_dir), "--out", str(dataset_path)])

    run_config_path = tmp_path / "fake_run.yaml"
    run_config_path.write_text(
        "run_id: fake_cli_run\nprovider: fake_provider\nmodel_name: fake-model\n",
        encoding="utf-8",
    )

    fake_adapter = FakeAdapter()
    monkeypatch.setattr("pck_feedback.inference.run_inference.get_adapter", lambda config: fake_adapter)

    out_path = tmp_path / "predictions.jsonl"
    result = runner.invoke(
        app,
        [
            "infer",
            "--run-config",
            str(run_config_path),
            "--dataset",
            str(dataset_path),
            "--out",
            str(out_path),
        ],
    )

    assert result.exit_code == 0, result.output
    assert "'processed': 5" in result.output
    predictions = list(read_jsonl(out_path))
    assert len(predictions) == 5


def test_infer_command_resumes_on_second_invocation(raw_dir: Path, tmp_path: Path, monkeypatch):
    dataset_path = tmp_path / "turn_examples.jsonl"
    runner.invoke(app, ["build-dataset", "--raw-dir", str(raw_dir), "--out", str(dataset_path)])

    run_config_path = tmp_path / "fake_run.yaml"
    run_config_path.write_text(
        "run_id: fake_cli_run\nprovider: fake_provider\nmodel_name: fake-model\n",
        encoding="utf-8",
    )

    fake_adapter = FakeAdapter()
    monkeypatch.setattr("pck_feedback.inference.run_inference.get_adapter", lambda config: fake_adapter)

    out_path = tmp_path / "predictions.jsonl"
    infer_args = [
        "infer",
        "--run-config",
        str(run_config_path),
        "--dataset",
        str(dataset_path),
        "--out",
        str(out_path),
    ]
    runner.invoke(app, infer_args)
    assert len(fake_adapter.calls) == 5

    result = runner.invoke(app, infer_args)
    assert result.exit_code == 0, result.output
    assert "'skipped': 5" in result.output
    assert len(fake_adapter.calls) == 5  # no new calls on the resumed run

"""
Fixture-based CLI smoke tests.

Per the project's execution boundaries: these tests never touch Firestore,
Vertex AI, OpenAI, or any other external API/network/credentials. `infer`
is exercised end-to-end with a monkeypatched fake adapter (see
`fakes/fake_adapter.py`) standing in for a real model, which lets the full
CLI wiring (config load -> dataset read -> prompt build -> "model" call ->
parse -> write predictions.jsonl) be smoke-tested safely.
"""

import json
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


def test_render_prompt_command(raw_dir: Path, tmp_path: Path):
    dataset_path = tmp_path / "test_set.jsonl"
    runner.invoke(
        app,
        ["build-dataset", "--raw-dir", str(raw_dir), "--out", str(dataset_path), "--only-completed-consensus"],
    )

    run_config_path = tmp_path / "fake_run.yaml"
    run_config_path.write_text(
        "run_id: preview_run\nprovider: fake_provider\nmodel_name: fake-model\n",
        encoding="utf-8",
    )

    out_path = tmp_path / "preview.md"
    result = runner.invoke(
        app,
        [
            "render-prompt",
            "--run-config",
            str(run_config_path),
            "--dataset",
            str(dataset_path),
            "--example-id",
            "conv_1__1",
            "--out",
            str(out_path),
        ],
    )

    assert result.exit_code == 0, result.output
    assert out_path.exists()
    content = out_path.read_text(encoding="utf-8")
    assert "preview_run" in content
    assert "conv_1__1" in content
    assert "## Full prompt text" in content
    # This command must never call a model API -- there is no adapter/network wiring
    # anywhere in its code path, so there is nothing to monkeypatch here (unlike `infer`).


def test_render_prompt_command_unknown_example_id_fails(raw_dir: Path, tmp_path: Path):
    dataset_path = tmp_path / "test_set.jsonl"
    runner.invoke(
        app,
        ["build-dataset", "--raw-dir", str(raw_dir), "--out", str(dataset_path), "--only-completed-consensus"],
    )
    run_config_path = tmp_path / "fake_run.yaml"
    run_config_path.write_text(
        "run_id: preview_run\nprovider: fake_provider\nmodel_name: fake-model\n",
        encoding="utf-8",
    )

    result = runner.invoke(
        app,
        [
            "render-prompt",
            "--run-config",
            str(run_config_path),
            "--dataset",
            str(dataset_path),
            "--example-id",
            "does_not_exist",
            "--out",
            str(tmp_path / "preview.md"),
        ],
    )
    assert result.exit_code != 0


def test_evaluate_command_end_to_end(raw_dir: Path, tmp_path: Path, monkeypatch):
    dataset_path = tmp_path / "test_set.jsonl"
    runner.invoke(
        app,
        ["build-dataset", "--raw-dir", str(raw_dir), "--out", str(dataset_path), "--only-completed-consensus"],
    )

    run_config_path = tmp_path / "fake_run.yaml"
    run_config_path.write_text(
        "run_id: fake_cli_run\nprovider: fake_provider\nmodel_name: fake-model\n",
        encoding="utf-8",
    )
    monkeypatch.setattr("pck_feedback.inference.run_inference.get_adapter", lambda config: FakeAdapter())

    predictions_path = tmp_path / "predictions.jsonl"
    runner.invoke(
        app,
        [
            "infer",
            "--run-config",
            str(run_config_path),
            "--dataset",
            str(dataset_path),
            "--out",
            str(predictions_path),
        ],
    )

    metrics_path = tmp_path / "metrics.json"
    errors_path = tmp_path / "errors.jsonl"
    result = runner.invoke(
        app,
        [
            "evaluate",
            "--dataset",
            str(dataset_path),
            "--predictions",
            str(predictions_path),
            "--out",
            str(metrics_path),
            "--errors-out",
            str(errors_path),
        ],
    )

    assert result.exit_code == 0, result.output
    assert "PCK Feedback Evaluation" in result.output
    assert "Feedback decision" in result.output
    assert metrics_path.exists()
    metrics = json.loads(metrics_path.read_text(encoding="utf-8"))
    assert metrics["counts"]["n_evaluated"] == 2
    assert errors_path.exists()


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


def test_build_sft_dataset_command(raw_dir: Path, tmp_path: Path):
    train_path = tmp_path / "train_examples.jsonl"
    runner.invoke(app, ["build-train-dataset", "--raw-dir", str(raw_dir), "--out", str(train_path)])

    out_dir = tmp_path / "sft_out"
    result = runner.invoke(
        app,
        [
            "build-sft-dataset",
            "--input",
            str(train_path),
            "--run-config",
            "config/runs/baseline_gemini_text_only.yaml",
            "--out-dir",
            str(out_dir),
            "--test-set",
            str(tmp_path / "does_not_exist.jsonl"),
        ],
    )

    assert result.exit_code == 0, result.output
    assert "Wrote 4 train / 0 val" in result.output
    assert (out_dir / "train.jsonl").exists()
    assert (out_dir / "val.jsonl").exists()
    assert (out_dir / "split_manifest.json").exists()
    records = list(read_jsonl(out_dir / "train.jsonl"))
    assert len(records) == 4
    assert records[0]["messages"][0]["role"] == "user"
    assert records[0]["messages"][1]["role"] == "assistant"


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

"""
`pck-research` CLI entrypoint.

    pck-research export              -- Firestore (read-only) -> data/raw/*.json
    pck-research extract-images      -- data/raw/conversations/*.json -> data/raw/images/*.png (additive)
    pck-research build-dataset       -- data/raw/* -> turn_examples.jsonl (consensus-based test set)
    pck-research build-train-dataset -- data/raw/* -> train_examples.jsonl (individual-annotation train set)
    pck-research render-prompt       -- dry-run: render one example's exact prompt to a local Markdown file (no model call)
    pck-research infer               -- turn_examples.jsonl -> predictions.jsonl (resume-safe)
    pck-research evaluate            -- test_set_v1.jsonl + predictions.jsonl -> metrics.json (+ terminal summary, + optional error report)

None of these commands are executed automatically by this codebase -- they
are meant to be run manually, after credentials are configured (see
../.env.example and ../README.md).
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

import typer
import yaml
from dotenv import load_dotenv

app = typer.Typer(
    help="Offline research pipeline for PCK feedback modeling and evaluation.",
    no_args_is_help=True,
)


@app.callback()
def _main() -> None:
    # Loads a local `.env` from the current working directory if present.
    # Harmless no-op if it doesn't exist -- never required for build-dataset
    # or any command that doesn't talk to Firestore/a model API.
    load_dotenv()


def _split_csv(value: Optional[str]) -> Optional[list[str]]:
    if not value:
        return None
    return [v.strip() for v in value.split(",") if v.strip()]


@app.command()
def export(
    config: Path = typer.Option(Path("config/export.yaml"), help="Path to export config YAML."),
    since: Optional[str] = typer.Option(None, help="ISO date; overrides config's 'since'."),
    conversation_ids: Optional[str] = typer.Option(
        None, help="Comma-separated conversation IDs; overrides config's 'conversation_ids'."
    ),
    limit: Optional[int] = typer.Option(None, help="Cap docs per collection; overrides config's 'limit'."),
    force: bool = typer.Option(False, help="Re-write docs even if locally unchanged."),
) -> None:
    """Export conversations + annotation/consensus data from Firestore (read-only)."""
    from pck_feedback.export.export_collections import DEFAULT_COLLECTIONS, ExportConfig, run_export
    from pck_feedback.firestore_client import get_firestore_client

    raw_cfg: dict = {}
    if config.exists():
        raw_cfg = yaml.safe_load(config.read_text(encoding="utf-8")) or {}

    export_config = ExportConfig(
        collections=tuple(raw_cfg.get("collections", DEFAULT_COLLECTIONS)),
        output_dir=Path(raw_cfg.get("output_dir", "data/raw")),
        since=since or raw_cfg.get("since"),
        conversation_ids=_split_csv(conversation_ids) or raw_cfg.get("conversation_ids"),
        limit=limit if limit is not None else raw_cfg.get("limit"),
        force=force or bool(raw_cfg.get("force", False)),
    )

    typer.echo(f"Exporting collections {list(export_config.collections)} -> {export_config.output_dir}")
    db = get_firestore_client()
    manifest = run_export(export_config, db)
    typer.echo(f"Done. Doc counts: {manifest['doc_counts']}")


@app.command("extract-images")
def extract_images_cmd(
    raw_dir: Path = typer.Option(Path("data/raw"), help="Directory containing exported raw data."),
) -> None:
    """Decode board-drawing base64 images from exported conversations into PNG files (additive)."""
    from pck_feedback.export.extract_images import extract_all_images

    manifest = extract_all_images(raw_dir)
    typer.echo(f"Extracted {manifest['count']} board image(s) to {raw_dir}/images/")


@app.command("build-dataset")
def build_dataset_cmd(
    raw_dir: Path = typer.Option(Path("data/raw"), help="Directory containing exported raw data."),
    out: Path = typer.Option(Path("data/processed/turn_examples.jsonl"), help="Output JSONL path."),
    comparison_set_id: Optional[str] = typer.Option(
        None, help="Only include conversations that are items of this annotationComparisonSets doc."
    ),
    only_completed_consensus: bool = typer.Option(
        False, help="Only include conversations that have a completed consensus annotation."
    ),
) -> None:
    """Build the turn-level dataset from exported raw data."""
    from pck_feedback.dataset.build_turn_dataset import build_dataset

    count = build_dataset(
        raw_dir,
        out,
        comparison_set_id=comparison_set_id,
        only_completed_consensus=only_completed_consensus,
    )
    typer.echo(f"Wrote {count} turn example(s) to {out}")


@app.command("build-train-dataset")
def build_train_dataset_cmd(
    raw_dir: Path = typer.Option(Path("data/raw"), help="Directory containing exported raw data."),
    out: Path = typer.Option(
        Path("data/processed/train_individual_annotations.jsonl"), help="Output JSONL path."
    ),
    include_consensus_conversations: bool = typer.Option(
        False,
        help=(
            "Include conversations that already have a completed consensus annotation. "
            "By default these are excluded so the held-out consensus test set never leaks into training data."
        ),
    ),
) -> None:
    """Build the train dataset from completed individual (pre-consensus) annotator annotations."""
    from pck_feedback.dataset.build_train_dataset import build_train_dataset

    count = build_train_dataset(
        raw_dir,
        out,
        exclude_consensus_conversations=not include_consensus_conversations,
    )
    typer.echo(f"Wrote {count} train example(s) to {out}")


@app.command("render-prompt")
def render_prompt_cmd(
    run_config: Path = typer.Option(..., help="Path to a run config YAML under config/runs/."),
    dataset: Path = typer.Option(..., help="Path to a turn_examples.jsonl dataset."),
    example_id: str = typer.Option(..., help="The `example_id` (from the dataset) to render a prompt preview for."),
    out: Path = typer.Option(..., help="Output Markdown file path for the rendered prompt preview."),
    raw_dir: Optional[Path] = typer.Option(
        None, help="Required if the run config has include_board_images=true."
    ),
) -> None:
    """
    Dry-run: render the exact prompt `infer` would build (and send) for one
    example, to a local Markdown file. Never calls a model API, never
    connects to Firestore, never runs inference.
    """
    from pck_feedback.models.run_config import RunConfig
    from pck_feedback.prompts.preview import find_example, render_prompt_preview
    from pck_feedback.utils.io import ensure_dir

    config = RunConfig.from_yaml(run_config)

    if config.include_board_images and raw_dir is None:
        raise typer.BadParameter(
            f"Run config '{config.run_id}' has include_board_images=true, so --raw-dir must be provided."
        )

    example = find_example(dataset, example_id)

    markdown = render_prompt_preview(
        run_config=config,
        run_config_path=run_config,
        dataset_path=dataset,
        example=example,
        raw_dir=raw_dir,
    )

    ensure_dir(out.parent)
    out.write_text(markdown, encoding="utf-8")
    typer.echo(f"Wrote prompt preview for example_id={example_id} to {out}")


@app.command()
def infer(
    run_config: Path = typer.Option(..., help="Path to a run config YAML under config/runs/."),
    dataset: Path = typer.Option(..., help="Path to a turn_examples.jsonl dataset."),
    out: Path = typer.Option(..., help="Output predictions.jsonl path."),
    raw_dir: Optional[Path] = typer.Option(
        None, help="Required if the run config has include_board_images=true."
    ),
    force_rerun: bool = typer.Option(
        False, help="Ignore existing predictions in --out and start fresh instead of resuming."
    ),
    limit: Optional[int] = typer.Option(None, help="Process at most this many dataset rows (for smoke tests)."),
) -> None:
    """Run baseline PCK feedback inference over a turn-level dataset."""
    from pck_feedback.inference.run_inference import run_inference
    from pck_feedback.models.run_config import RunConfig

    config = RunConfig.from_yaml(run_config)
    typer.echo(f"Running inference: run_id={config.run_id} provider={config.provider} model={config.model_name}")
    summary = run_inference(
        dataset,
        config,
        out,
        raw_dir=raw_dir,
        force_rerun=force_rerun,
        limit=limit,
    )
    typer.echo(f"Done. {summary}")


@app.command()
def evaluate(
    dataset: Path = typer.Option(
        ..., help="Path to a turn_examples.jsonl built with `build-dataset --only-completed-consensus`."
    ),
    predictions: Path = typer.Option(..., help="Path to a predictions.jsonl file produced by `pck-research infer`."),
    out: Path = typer.Option(..., help="Output metrics JSON path."),
    errors_out: Optional[Path] = typer.Option(
        None,
        help="Optional error report path for mismatching rows only, for manual inspection. "
        "Format is chosen by extension: '.csv' -> CSV, anything else -> JSONL.",
    ),
) -> None:
    """Evaluate model predictions against the completed-consensus test set's ground truth."""
    from pck_feedback.eval.report import format_summary
    from pck_feedback.eval.run_eval import evaluate as run_evaluate

    metrics = run_evaluate(dataset, predictions, out, errors_out_path=errors_out)
    typer.echo(format_summary(metrics))


if __name__ == "__main__":
    app()

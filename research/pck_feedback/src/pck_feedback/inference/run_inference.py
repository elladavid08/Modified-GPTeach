"""
Inference loop: turn_examples.jsonl -> prompt -> model adapter -> parse ->
predictions.jsonl.

Resume-safe by design: before making any model calls, it reads whatever
already exists at `out_path` and skips every `(run_id, example_id)` pair
already present there, appending only new predictions. This makes it safe
to re-run the exact same command after an API timeout, rate limit, or a
partially-finished GPU run, without duplicating or re-billing completed
turns. Pass `force_rerun=True` to ignore existing results and start fresh.
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from pck_feedback.inference.parsing import parse_model_response
from pck_feedback.models.registry import get_adapter
from pck_feedback.models.run_config import RunConfig
from pck_feedback.pck_skills import RUBRIC_VERSION
from pck_feedback.prompts.registry import build_prompt
from pck_feedback.schemas.turn_example import TurnExample
from pck_feedback.utils.io import append_jsonl_record, ensure_dir, read_jsonl
from pck_feedback.utils.logging import get_logger

logger = get_logger(__name__)


def _load_completed_keys(out_path: Path) -> set[tuple[str, str]]:
    completed: set[tuple[str, str]] = set()
    for record in read_jsonl(out_path):
        run_id = record.get("run_id")
        example_id = record.get("example_id")
        if run_id and example_id:
            completed.add((run_id, example_id))
    return completed


def run_inference(
    dataset_path: Path,
    run_config: RunConfig,
    out_path: Path,
    *,
    raw_dir: Optional[Path] = None,
    force_rerun: bool = False,
    limit: Optional[int] = None,
) -> dict[str, int]:
    """
    Run baseline inference over a turn-level dataset.

    `raw_dir` is required only when `run_config.include_board_images` is
    True (needed to resolve `TurnExample.board_image_path` to actual PNG
    bytes). Returns a small summary dict: {processed, skipped, failed}.
    """
    if run_config.include_board_images and raw_dir is None:
        raise ValueError(
            f"Run config '{run_config.run_id}' has include_board_images=true, "
            "so --raw-dir must be provided to resolve board image paths."
        )

    ensure_dir(out_path.parent)

    completed_keys: set[tuple[str, str]] = set()
    if not force_rerun and out_path.exists():
        completed_keys = _load_completed_keys(out_path)
        logger.info(
            "Resume mode: found %d existing prediction(s) for out_path=%s (will be skipped)",
            len(completed_keys),
            out_path,
        )

    if force_rerun and out_path.exists():
        out_path.unlink()

    adapter = None  # lazily created on first example that actually needs a model call

    processed = 0
    skipped = 0
    failed = 0

    for i, raw_record in enumerate(read_jsonl(dataset_path)):
        if limit is not None and i >= limit:
            break

        example = TurnExample.model_validate(raw_record)
        key = (run_config.run_id, example.example_id)

        if key in completed_keys:
            skipped += 1
            continue

        if adapter is None:
            adapter = get_adapter(run_config)

        prompt = build_prompt(
            run_config.prompt_version,
            example,
            include_student_info=run_config.include_student_info,
            include_board_images=run_config.include_board_images,
            raw_dir=raw_dir,
        )

        try:
            completion = adapter.complete(prompt, run_config.generation)
        except Exception as exc:  # noqa: BLE001 - a single failed call must not abort the batch
            logger.error("Model call failed for %s: %s", example.example_id, exc)
            failed += 1
            continue

        prediction = parse_model_response(
            completion.text,
            example=example,
            run_id=run_config.run_id,
            model_provider=adapter.provider_name,
            model_name=run_config.model_name,
            prompt_version=run_config.prompt_version,
            rubric_version=RUBRIC_VERSION,
            latency_ms=completion.latency_ms,
            prompt_tokens=completion.prompt_tokens,
            completion_tokens=completion.completion_tokens,
        )

        append_jsonl_record(out_path, prediction.model_dump(mode="json"))
        processed += 1

    logger.info(
        "Inference run '%s' complete: processed=%d skipped=%d failed=%d",
        run_config.run_id,
        processed,
        skipped,
        failed,
    )
    return {"processed": processed, "skipped": skipped, "failed": failed}

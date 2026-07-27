"""
Prompt preview rendering: builds the exact `PromptPayload` that
`inference/run_inference.py` would send to a model for one `TurnExample`,
and renders it to a human-readable Markdown string -- WITHOUT calling any
model API, connecting to Firestore, or running inference.

This is a dry-run tool. It calls the exact same `build_prompt()` /
`RunConfig` machinery `run_inference.py` uses, so the rendered text is
guaranteed to be byte-for-byte what `pck-research infer` would send for
that example -- not a separate approximation that could drift out of sync.

`TurnExample.ground_truth` is never passed into `build_prompt()` (see
`prompts/baseline_prompt.py`, which never reads that field at all), so
gold labels cannot appear in the rendered prompt text. This module also
records whether `ground_truth` happened to be present on the source
dataset row, purely as metadata, to make that guarantee easy to eyeball.
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from pck_feedback.models.run_config import RunConfig
from pck_feedback.pck_skills import RUBRIC_VERSION
from pck_feedback.prompts.registry import build_prompt
from pck_feedback.schemas.turn_example import TurnExample
from pck_feedback.utils.io import read_jsonl


def find_example(dataset_path: Path, example_id: str) -> TurnExample:
    """Load one `TurnExample` by `example_id` from a turn_examples.jsonl dataset."""
    for raw in read_jsonl(dataset_path):
        if raw.get("example_id") == example_id:
            return TurnExample.model_validate(raw)
    raise ValueError(f"example_id '{example_id}' not found in {dataset_path}")


def render_prompt_preview(
    *,
    run_config: RunConfig,
    run_config_path: Path,
    dataset_path: Path,
    example: TurnExample,
    raw_dir: Optional[Path] = None,
) -> str:
    """
    Render a Markdown preview of the exact prompt `infer` would build (and
    send, if it were actually run) for `example`. No model call is made
    and no network/Firestore access happens here.
    """
    payload = build_prompt(
        run_config.prompt_version,
        example,
        include_student_info=run_config.include_student_info,
        include_board_images=run_config.include_board_images,
        raw_dir=raw_dir,
    )

    lines: list[str] = []
    lines.append(f"# Prompt preview: {example.example_id}")
    lines.append("")
    lines.append(
        "This is a DRY-RUN preview only -- no model API was called to produce this file, "
        "and no Firestore connection was made. It was built with the exact same prompt "
        "builder + run config that `pck-research infer` would use for this example."
    )
    lines.append("")

    lines.append("## Run configuration")
    lines.append(f"- run_config file: `{run_config_path}`")
    lines.append(f"- run_id: `{run_config.run_id}`")
    lines.append(f"- provider: `{run_config.provider}`")
    lines.append(f"- model_name: `{run_config.model_name}`")
    lines.append(f"- prompt_version: `{run_config.prompt_version}`")
    lines.append(f"- rubric_version: `{RUBRIC_VERSION}`")
    lines.append(f"- include_student_info: `{run_config.include_student_info}`")
    lines.append(f"- include_board_images: `{run_config.include_board_images}`")
    if run_config.generation:
        lines.append(f"- generation: `{run_config.generation}`")
    if run_config.provider_config:
        lines.append(f"- provider_config: `{run_config.provider_config}`")
    lines.append("")

    lines.append("## Example")
    lines.append(f"- dataset: `{dataset_path}`")
    lines.append(f"- example_id: `{example.example_id}`")
    lines.append(f"- conversation_id: `{example.conversation_id}`")
    lines.append(f"- session_id: `{example.session_id}`")
    lines.append(f"- turn_number: `{example.turn_number}`")
    lines.append(
        f"- ground_truth present on dataset row: `{example.ground_truth is not None}` "
        "(recorded here as metadata only -- NOT read by the prompt builder, see note below)"
    )
    lines.append("")
    lines.append(
        "> **Note:** `TurnExample.ground_truth` is only ever read by `pck-research evaluate`. "
        "The prompt builder function receives the whole `TurnExample` object but never "
        "accesses `.ground_truth` -- so gold labels cannot appear in the prompt text below, "
        "regardless of whether this dataset row has one."
    )
    lines.append("")

    if payload.images:
        lines.append(f"## Image parts ({len(payload.images)})")
        lines.append(
            "Image bytes are NOT inlined into this preview (base64 would make it unreadable "
            "and bloat the file) -- metadata only:"
        )
        for i, image in enumerate(payload.images, start=1):
            lines.append(f"- image {i}: mime_type=`{image.mime_type}`, size={len(image.data)} bytes")
        if example.board_image_path:
            lines.append(f"- source path (relative to --raw-dir): `{example.board_image_path}`")
        lines.append("")
    elif run_config.include_board_images:
        lines.append("## Image parts (0)")
        lines.append(
            "`include_board_images: true` in the run config, but no image was attached for "
            "this example (either it has no board drawing, or `--raw-dir` didn't resolve one) "
            "-- the prompt below is text-only."
        )
        lines.append("")

    lines.append("## Full prompt text (exactly as it would be sent to the model)")
    lines.append("")
    lines.append("```text")
    lines.append(payload.text)
    lines.append("```")

    return "\n".join(lines)

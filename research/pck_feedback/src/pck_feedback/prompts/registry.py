"""
Prompt version registry: maps a `prompt_version` string (set in a run
config YAML) to the builder function that constructs the actual prompt.

Adding a new prompt variant later means adding one entry here -- run
configs only need to change their `prompt_version` field, everything else
(adapters, CLI, schemas) stays the same.
"""

from __future__ import annotations

from pathlib import Path
from typing import Callable, Optional

from pck_feedback.prompts.baseline_prompt import PromptPayload, build_baseline_prompt
from pck_feedback.schemas.turn_example import TurnExample

PromptBuilder = Callable[..., PromptPayload]

PROMPT_REGISTRY: dict[str, PromptBuilder] = {
    "baseline_v1": build_baseline_prompt,
}


def get_prompt_builder(prompt_version: str) -> PromptBuilder:
    try:
        return PROMPT_REGISTRY[prompt_version]
    except KeyError as exc:
        raise ValueError(
            f"Unknown prompt_version '{prompt_version}'. Known versions: {sorted(PROMPT_REGISTRY)}"
        ) from exc


def build_prompt(
    prompt_version: str,
    example: TurnExample,
    *,
    include_student_info: bool = False,
    include_board_images: bool = False,
    raw_dir: Optional[Path] = None,
) -> PromptPayload:
    builder = get_prompt_builder(prompt_version)
    return builder(
        example,
        include_student_info=include_student_info,
        include_board_images=include_board_images,
        raw_dir=raw_dir,
    )

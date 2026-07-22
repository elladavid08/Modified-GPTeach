"""
Run config loading: `config/runs/*.yaml` -> `RunConfig`.

A run config selects everything about one inference run: which provider
(Vertex/Gemini or an OpenAI-compatible endpoint) and model, which prompt
version, whether to include student info / board images, and generation
parameters. Credentials are never stored here -- only environment variable
*names* to read them from at call time.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml


@dataclass
class RunConfig:
    run_id: str
    provider: str  # "vertex_gemini" | "openai_compatible"
    model_name: str
    prompt_version: str = "baseline_v1"
    include_student_info: bool = False
    include_board_images: bool = False
    generation: dict[str, Any] = field(default_factory=dict)
    # Provider-specific settings, e.g. for vertex_gemini: {project_env_var,
    # location_env_var, credentials_env_var}; for openai_compatible:
    # {base_url_env_var, api_key_env_var}. Adapters read only the keys they
    # recognize and apply sane defaults for the rest.
    provider_config: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_yaml(cls, path: Path) -> "RunConfig":
        with path.open("r", encoding="utf-8") as f:
            raw = yaml.safe_load(f) or {}

        known_top_level = {
            "run_id",
            "provider",
            "model_name",
            "prompt_version",
            "include_student_info",
            "include_board_images",
            "generation",
        }
        provider_config = {k: v for k, v in raw.items() if k not in known_top_level}

        return cls(
            run_id=raw["run_id"],
            provider=raw["provider"],
            model_name=raw["model_name"],
            prompt_version=raw.get("prompt_version", "baseline_v1"),
            include_student_info=raw.get("include_student_info", False),
            include_board_images=raw.get("include_board_images", False),
            generation=raw.get("generation", {}),
            provider_config=provider_config,
        )

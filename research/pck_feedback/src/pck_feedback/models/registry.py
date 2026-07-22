"""
Provider registry: `run_config.provider` string -> `ModelAdapter` factory.

Adding a new provider later (still no Anthropic-specific code planned)
means adding one entry here; the CLI, run configs, and inference loop don't
need to change.
"""

from __future__ import annotations

from pck_feedback.models.base import ModelAdapter
from pck_feedback.models.run_config import RunConfig

_PROVIDER_FACTORIES = {}


def _vertex_gemini_factory(config: RunConfig) -> ModelAdapter:
    from pck_feedback.models.vertex_gemini import VertexGeminiAdapter

    return VertexGeminiAdapter(model_name=config.model_name, provider_config=config.provider_config)


def _openai_compatible_factory(config: RunConfig) -> ModelAdapter:
    from pck_feedback.models.openai_compatible import OpenAICompatibleAdapter

    return OpenAICompatibleAdapter(model_name=config.model_name, provider_config=config.provider_config)


_PROVIDER_FACTORIES["vertex_gemini"] = _vertex_gemini_factory
_PROVIDER_FACTORIES["openai_compatible"] = _openai_compatible_factory


def get_adapter(config: RunConfig) -> ModelAdapter:
    try:
        factory = _PROVIDER_FACTORIES[config.provider]
    except KeyError as exc:
        raise ValueError(
            f"Unknown provider '{config.provider}'. Known providers: {sorted(_PROVIDER_FACTORIES)}"
        ) from exc
    return factory(config)

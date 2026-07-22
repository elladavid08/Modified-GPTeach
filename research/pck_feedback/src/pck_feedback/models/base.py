"""
Model adapter interface.

Every adapter (Vertex/Gemini today; OpenAI-compatible today, which also
covers future locally/GPU-hosted models served behind an OpenAI-compatible
API such as vLLM or TGI) implements the same `ModelAdapter.complete()`
method: take a provider-agnostic `PromptPayload` in, return a
`RawCompletion` out. No JSON parsing happens inside an adapter -- that's
handled uniformly afterwards by `inference/parsing.py`, so every provider's
output is validated/defaulted identically.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Optional

from pck_feedback.prompts.baseline_prompt import PromptPayload


@dataclass
class RawCompletion:
    text: str
    latency_ms: Optional[float] = None
    prompt_tokens: Optional[int] = None
    completion_tokens: Optional[int] = None
    raw_response: Optional[Any] = None  # kept for debugging only, never serialized as-is


class ModelAdapter(ABC):
    """Base class for all model adapters. Adapters must not do any JSON parsing."""

    provider_name: str

    @abstractmethod
    def complete(self, prompt: PromptPayload, generation_config: dict[str, Any]) -> RawCompletion:
        """Call the underlying model and return its raw text response."""
        raise NotImplementedError

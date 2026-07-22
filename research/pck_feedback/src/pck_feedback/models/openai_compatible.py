"""
OpenAI-compatible model adapter.

Covers OpenAI itself AND any self-hosted server that exposes an
OpenAI-compatible chat-completions API (vLLM, TGI, Ollama, ...) -- this is
the intended path for future local/GPU-hosted models, per the plan's
requirement to support pluggable providers without any Anthropic-specific
code.

The `openai` Python SDK is an optional dependency (extra: `openai`),
imported lazily inside `OpenAICompatibleAdapter.__init__` so importing this
module never fails for users who've only installed core dependencies to
run the fixture-based test suite.
"""

from __future__ import annotations

import base64
import os
import time
from typing import Any

from tenacity import retry, stop_after_attempt, wait_exponential

from pck_feedback.models.base import ModelAdapter, RawCompletion
from pck_feedback.prompts.baseline_prompt import PromptPayload
from pck_feedback.utils.logging import get_logger

logger = get_logger(__name__)

DEFAULT_BASE_URL_ENV_VAR = "PCK_RESEARCH_OPENAI_BASE_URL"
DEFAULT_API_KEY_ENV_VAR = "PCK_RESEARCH_OPENAI_API_KEY"


class OpenAICompatibleConfigError(RuntimeError):
    """Raised when required OpenAI-compatible credentials/config are missing."""


class OpenAICompatibleAdapter(ModelAdapter):
    provider_name = "openai_compatible"

    def __init__(self, model_name: str, provider_config: dict[str, Any] | None = None):
        provider_config = provider_config or {}

        try:
            from openai import OpenAI
        except ImportError as exc:  # pragma: no cover - exercised manually, not in fixture tests
            raise OpenAICompatibleConfigError(
                "openai is not installed. Install the 'openai' extra: pip install -e '.[openai]'"
            ) from exc

        base_url_env_var = provider_config.get("base_url_env_var", DEFAULT_BASE_URL_ENV_VAR)
        api_key_env_var = provider_config.get("api_key_env_var", DEFAULT_API_KEY_ENV_VAR)

        base_url = provider_config.get("base_url") or os.environ.get(base_url_env_var)
        # Local/self-hosted OpenAI-compatible servers (vLLM, TGI, Ollama)
        # frequently don't require a real API key -- fall back to a
        # placeholder rather than forcing a value that doesn't exist.
        api_key = provider_config.get("api_key") or os.environ.get(api_key_env_var) or "not-needed"

        if not base_url:
            raise OpenAICompatibleConfigError(
                f"No base_url configured. Set env var {base_url_env_var} (see .env.example) "
                "or 'base_url' in the run config's provider section "
                "(e.g. https://api.openai.com/v1, or http://localhost:8000/v1 for a local server)."
            )

        self.model_name = model_name
        self._client = OpenAI(api_key=api_key, base_url=base_url)

    def complete(self, prompt: PromptPayload, generation_config: dict[str, Any]) -> RawCompletion:
        content: list[dict[str, Any]] = [{"type": "text", "text": prompt.text}]
        for image in prompt.images:
            b64 = base64.b64encode(image.data).decode("ascii")
            content.append(
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:{image.mime_type};base64,{b64}"},
                }
            )

        messages = [{"role": "user", "content": content}]

        start = time.monotonic()
        response = self._call_with_retry(messages, generation_config)
        latency_ms = (time.monotonic() - start) * 1000

        text = response.choices[0].message.content or ""
        usage = getattr(response, "usage", None)
        prompt_tokens = getattr(usage, "prompt_tokens", None) if usage else None
        completion_tokens = getattr(usage, "completion_tokens", None) if usage else None

        return RawCompletion(
            text=text,
            latency_ms=latency_ms,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            raw_response=response,
        )

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=20))
    def _call_with_retry(self, messages: list[dict[str, Any]], generation_config: dict[str, Any]) -> Any:
        return self._client.chat.completions.create(
            model=self.model_name,
            messages=messages,
            temperature=generation_config.get("temperature", 0.7),
            max_tokens=generation_config.get("max_output_tokens", 2000),
            top_p=generation_config.get("top_p", 1.0),
        )

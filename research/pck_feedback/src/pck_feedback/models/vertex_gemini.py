"""
Vertex AI / Gemini model adapter.

Mirrors the production model choice (`gemini-2.5-flash-lite` via Vertex AI,
see `server/server.js` lines ~47-58, 783-794) so the baseline can be a
close analogue of live behavior, while using research-only credentials
(never the production `server/service-account-key.json`).

The `google-cloud-aiplatform` SDK is an optional dependency (extra:
`vertex`), imported lazily inside `VertexGeminiAdapter.__init__` so that
importing this module never fails for users who've only installed core
dependencies to run the fixture-based test suite.
"""

from __future__ import annotations

import os
import time
from typing import Any

from tenacity import retry, stop_after_attempt, wait_exponential

from pck_feedback.models.base import ModelAdapter, RawCompletion
from pck_feedback.prompts.baseline_prompt import PromptPayload
from pck_feedback.utils.logging import get_logger

logger = get_logger(__name__)

DEFAULT_PROJECT_ENV_VAR = "PCK_RESEARCH_VERTEX_PROJECT_ID"
DEFAULT_LOCATION_ENV_VAR = "PCK_RESEARCH_VERTEX_LOCATION"
DEFAULT_CREDENTIALS_ENV_VAR = "PCK_RESEARCH_VERTEX_GOOGLE_APPLICATION_CREDENTIALS"
DEFAULT_LOCATION = "us-central1"


class VertexGeminiConfigError(RuntimeError):
    """Raised when required Vertex AI credentials/config are missing."""


class VertexGeminiAdapter(ModelAdapter):
    provider_name = "vertex_gemini"

    def __init__(self, model_name: str, provider_config: dict[str, Any] | None = None):
        provider_config = provider_config or {}

        try:
            import vertexai
            from vertexai.generative_models import GenerativeModel
        except ImportError as exc:  # pragma: no cover - exercised manually, not in fixture tests
            raise VertexGeminiConfigError(
                "google-cloud-aiplatform is not installed. Install the 'vertex' extra: "
                "pip install -e '.[vertex]'"
            ) from exc

        project_env_var = provider_config.get("project_env_var", DEFAULT_PROJECT_ENV_VAR)
        location_env_var = provider_config.get("location_env_var", DEFAULT_LOCATION_ENV_VAR)
        credentials_env_var = provider_config.get("credentials_env_var", DEFAULT_CREDENTIALS_ENV_VAR)

        project = provider_config.get("project") or os.environ.get(project_env_var)
        location = provider_config.get("location") or os.environ.get(location_env_var, DEFAULT_LOCATION)
        cred_path = os.environ.get(credentials_env_var)

        if not project:
            raise VertexGeminiConfigError(
                f"Vertex project not set. Set env var {project_env_var} (see .env.example) "
                "or 'project' in the run config's provider section."
            )

        credentials = None
        if cred_path:
            from google.oauth2 import service_account

            if not os.path.isfile(cred_path):
                raise VertexGeminiConfigError(f"{credentials_env_var} points to a file that does not exist: {cred_path}")
            credentials = service_account.Credentials.from_service_account_file(cred_path)
        else:
            logger.warning(
                "%s is not set; falling back to Application Default Credentials for Vertex AI.",
                credentials_env_var,
            )

        vertexai.init(project=project, location=location, credentials=credentials)
        self.model_name = model_name
        self._model = GenerativeModel(model_name)

    def complete(self, prompt: PromptPayload, generation_config: dict[str, Any]) -> RawCompletion:
        from vertexai.generative_models import GenerationConfig, Part

        parts: list[Any] = [Part.from_text(prompt.text)]
        for image in prompt.images:
            parts.append(Part.from_data(data=image.data, mime_type=image.mime_type))

        gen_config = GenerationConfig(
            temperature=generation_config.get("temperature", 0.7),
            max_output_tokens=generation_config.get("max_output_tokens", 2000),
            top_p=generation_config.get("top_p", 1.0),
        )

        start = time.monotonic()
        response = self._call_with_retry(parts, gen_config)
        latency_ms = (time.monotonic() - start) * 1000

        text = response.text if hasattr(response, "text") else str(response)
        usage = getattr(response, "usage_metadata", None)
        prompt_tokens = getattr(usage, "prompt_token_count", None) if usage else None
        completion_tokens = getattr(usage, "candidates_token_count", None) if usage else None

        return RawCompletion(
            text=text,
            latency_ms=latency_ms,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            raw_response=response,
        )

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=20))
    def _call_with_retry(self, parts: list[Any], gen_config: Any) -> Any:
        return self._model.generate_content(parts, generation_config=gen_config)

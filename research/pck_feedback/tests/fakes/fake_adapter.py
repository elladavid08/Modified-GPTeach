"""A fully offline, deterministic fake `ModelAdapter` for testing the inference loop."""

from __future__ import annotations

import json
from typing import Any, Optional

from pck_feedback.models.base import ModelAdapter, RawCompletion
from pck_feedback.prompts.baseline_prompt import PromptPayload

DEFAULT_RESPONSE = json.dumps(
    {
        "should_provide_feedback": True,
        "dimensions": {
            "p1": {"relevant": True, "score": 1, "feedback_text": "fake feedback"},
        },
        "feedback_text_overall": "fake overall feedback",
    }
)


class FakeAdapter(ModelAdapter):
    provider_name = "fake_provider"

    def __init__(
        self,
        model_name: str = "fake-model",
        responses: Optional[list[str]] = None,
        fail_first_n: int = 0,
    ):
        self.model_name = model_name
        self.calls: list[str] = []
        self._responses = list(responses) if responses else None
        self._fail_first_n = fail_first_n

    def complete(self, prompt: PromptPayload, generation_config: dict[str, Any]) -> RawCompletion:
        self.calls.append(prompt.text)
        if len(self.calls) <= self._fail_first_n:
            raise RuntimeError("simulated model call failure")

        text = self._responses.pop(0) if self._responses else DEFAULT_RESPONSE
        return RawCompletion(text=text, latency_ms=1.0, prompt_tokens=10, completion_tokens=5)

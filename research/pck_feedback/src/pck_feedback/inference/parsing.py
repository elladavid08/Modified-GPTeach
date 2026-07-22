"""
Shared model-response parsing, used by every adapter's output uniformly
(no per-provider parsing logic) so baseline and future fine-tuned models are
evaluated on equal footing.

Mirrors production's defensive-defaulting approach (server/server.js
~837-896): a malformed/partial response never crashes the run -- it
produces a `Prediction` with `parse_status="failed"` (or `"repaired"` when
a best-effort fix was needed) instead.
"""

from __future__ import annotations

import datetime
import json
import re
from typing import Any, Optional

from pck_feedback.pck_skills import PCK_DIMENSION_IDS, RUBRIC_VERSION
from pck_feedback.schemas.prediction import DimensionResult, Prediction
from pck_feedback.schemas.turn_example import TurnExample
from pck_feedback.utils.logging import get_logger

logger = get_logger(__name__)

_JSON_FENCE_RE = re.compile(r"```(?:json)?\s*(.*?)\s*```", re.DOTALL)


def _strip_code_fences(text: str) -> str:
    match = _JSON_FENCE_RE.search(text)
    return match.group(1) if match else text


def _extract_json_substring(text: str) -> Optional[str]:
    """Best-effort repair: slice from the first '{' to the last '}'."""
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    return text[start : end + 1]


def _try_parse_json(raw_text: str) -> tuple[Optional[dict[str, Any]], str, Optional[str]]:
    """
    Returns (parsed_dict_or_None, parse_status, parse_error).
    parse_status is "ok", "repaired", or "failed".
    """
    stripped = _strip_code_fences(raw_text).strip()

    try:
        return json.loads(stripped), "ok", None
    except json.JSONDecodeError as exc:
        first_error = str(exc)

    repaired = _extract_json_substring(stripped)
    if repaired is not None:
        try:
            return json.loads(repaired), "repaired", None
        except json.JSONDecodeError as exc:
            return None, "failed", f"initial error: {first_error}; repair attempt error: {exc}"

    return None, "failed", first_error


def _coerce_score(value: Any) -> Optional[int]:
    if value is None:
        return None
    try:
        score = int(value)
    except (TypeError, ValueError):
        return None
    return score if score in (0, 1, 2) else None


def _build_dimensions(parsed: dict[str, Any]) -> dict[str, DimensionResult]:
    raw_dims = parsed.get("dimensions") or {}
    dimensions: dict[str, DimensionResult] = {}
    for dim_id in PCK_DIMENSION_IDS:
        raw_dim = raw_dims.get(dim_id) if isinstance(raw_dims, dict) else None
        if not isinstance(raw_dim, dict):
            dimensions[dim_id] = DimensionResult(relevant=False, score=None, feedback_text=None)
            continue
        relevant = bool(raw_dim.get("relevant", False))
        dimensions[dim_id] = DimensionResult(
            relevant=relevant,
            score=_coerce_score(raw_dim.get("score")) if relevant else None,
            feedback_text=(raw_dim.get("feedback_text") if relevant else None),
        )
    return dimensions


def parse_model_response(
    raw_text: str,
    *,
    example: TurnExample,
    run_id: str,
    model_provider: str,
    model_name: str,
    prompt_version: str,
    rubric_version: str = RUBRIC_VERSION,
    latency_ms: Optional[float] = None,
    prompt_tokens: Optional[int] = None,
    completion_tokens: Optional[int] = None,
) -> Prediction:
    """
    Parse one raw model text response into a standardized `Prediction`.
    Never raises -- worst case returns `parse_status="failed"` with safe
    defaults, so a single bad response never aborts a batch inference run.
    """
    parsed, parse_status, parse_error = _try_parse_json(raw_text)

    if parsed is None:
        logger.warning("Failed to parse model response for %s: %s", example.example_id, parse_error)
        return Prediction(
            example_id=example.example_id,
            conversation_id=example.conversation_id,
            session_id=example.session_id,
            turn_number=example.turn_number,
            run_id=run_id,
            model_provider=model_provider,
            model_name=model_name,
            prompt_version=prompt_version,
            rubric_version=rubric_version,
            created_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
            should_provide_feedback=False,
            dimensions=Prediction.empty_dimensions(),
            feedback_text_overall=None,
            raw_model_output=raw_text,
            parse_status="failed",
            parse_error=parse_error,
            latency_ms=latency_ms,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
        )

    if parse_status == "repaired":
        logger.info("Repaired malformed JSON response for %s", example.example_id)

    return Prediction(
        example_id=example.example_id,
        conversation_id=example.conversation_id,
        session_id=example.session_id,
        turn_number=example.turn_number,
        run_id=run_id,
        model_provider=model_provider,
        model_name=model_name,
        prompt_version=prompt_version,
        rubric_version=rubric_version,
        created_at=datetime.datetime.now(datetime.timezone.utc).isoformat(),
        should_provide_feedback=bool(parsed.get("should_provide_feedback", False)),
        dimensions=_build_dimensions(parsed),
        feedback_text_overall=parsed.get("feedback_text_overall"),
        raw_model_output=raw_text,
        parse_status=parse_status,
        parse_error=parse_error,
        latency_ms=latency_ms,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
    )

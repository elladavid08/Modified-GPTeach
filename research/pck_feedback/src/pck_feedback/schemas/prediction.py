"""
Standardized model prediction schema.

This schema is identical across every model (baseline API models today,
locally-hosted/fine-tuned models later), so that `eval/` (future stage) can
compare any prediction file against the same `TurnExample.ground_truth`
without per-model special-casing.
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from pck_feedback.pck_skills import PCK_DIMENSION_IDS


class DimensionResult(BaseModel):
    relevant: bool
    score: Optional[int] = None  # 0, 1, 2 -- only meaningful when relevant=True
    feedback_text: Optional[str] = None


class Prediction(BaseModel):
    model_config = ConfigDict(extra="forbid")

    example_id: str
    conversation_id: str
    session_id: str
    turn_number: int

    run_id: str
    model_provider: str  # "vertex_gemini" | "openai_compatible" (extensible)
    model_name: str
    prompt_version: str
    rubric_version: str  # pck_feedback.pck_skills.RUBRIC_VERSION at run time

    created_at: str  # ISO 8601

    should_provide_feedback: bool
    dimensions: dict[str, DimensionResult] = Field(default_factory=dict)  # keys: p1..p5
    feedback_text_overall: Optional[str] = None

    raw_model_output: str
    parse_status: str  # "ok" | "repaired" | "failed"
    parse_error: Optional[str] = None

    latency_ms: Optional[float] = None
    prompt_tokens: Optional[int] = None
    completion_tokens: Optional[int] = None

    @classmethod
    def empty_dimensions(cls) -> dict[str, DimensionResult]:
        return {dim_id: DimensionResult(relevant=False) for dim_id in PCK_DIMENSION_IDS}

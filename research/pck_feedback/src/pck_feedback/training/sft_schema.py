"""
SFT training record schema: one row per (annotation assignment, teacher
turn), ready for `datasets.load_dataset("json", ...)` + `trl.SFTTrainer`.

`messages` is the single source of truth used for training (conversational
format, auto-detected by TRL): one "user" turn (the exact prompt built by
`prompts.registry.build_prompt`, identical to what `pck-research infer`
would send for the same context) and one "assistant" turn (the strict-JSON
gold target, in the same shape as `schemas.prediction.Prediction`).

`metadata` exists purely for traceability (conversation_id, turn_number,
assignment_id, annotator_id, split, ...) and is a separate top-level field,
never nested inside `messages` -- so no label/annotation metadata can ever
leak into what a trainer feeds the model as input/output text.
"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict


class SFTMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Literal["user", "assistant"]
    content: str


class SFTMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid")

    conversation_id: str
    session_id: str
    turn_number: int
    assignment_id: str
    annotator_id: Optional[str] = None
    assignment_type: Optional[str] = None

    prompt_version: str
    rubric_version: str
    run_config: str  # path to the run config YAML used to build this record
    include_student_info: bool
    include_board_images: bool
    board_image_path: Optional[str] = None  # reference only -- never inlined into `messages`

    has_feedback: bool
    split: Literal["train", "val"]


class SFTRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    example_id: str
    messages: list[SFTMessage]
    metadata: SFTMetadata

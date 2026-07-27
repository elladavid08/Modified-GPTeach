"""
Baseline PCK feedback prompt builder.

Mirrors the *structure* of the production prompt (scenario context, skill
rubrics, conversation history, current teacher message -- see
`server/server.js` lines ~380-399 and `server/universal_pck_skills.js`),
but is NOT a byte-for-byte reproduction:

  - dimension labels are `p1`-`p5` (research/annotation IDs) instead of
    production's `skill_id` strings (see pck_skills.SKILL_ID_TO_RESEARCH_ID);
  - it optionally adds student-info and board-image context that the live
    `/api/pck-feedback` endpoint does not currently use;
  - it asks for a JSON shape aligned with `schemas.prediction.Prediction`,
    not production's internal analysis JSON.

This module builds a provider-agnostic `PromptPayload` (text + optional
images). Model adapters (`models/vertex_gemini.py`,
`models/openai_compatible.py`) translate `PromptPayload` into their own
request format.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from pck_feedback.pck_skills import PCK_DIMENSION_IDS, format_skills_for_prompt
from pck_feedback.schemas.turn_example import TurnExample

NO_HISTORY_TEXT_HE = "אין היסטוריה קודמת - זו התגובה הראשונה של המורה"


@dataclass
class PromptImage:
    mime_type: str
    data: bytes


@dataclass
class PromptPayload:
    """Provider-agnostic prompt: text plus zero or more images."""

    text: str
    images: list[PromptImage] = field(default_factory=list)


def format_scenario_context(scenario: dict) -> str:
    """
    Python port of `formatScenarioContextForPrompt` (server/server.js:125-155).
    """
    if not scenario:
        return "No scenario context provided"

    lines: list[str] = []
    lines.append(f"**Grade Level**: {scenario.get('grade_level') or 'Middle School'}")
    lines.append(f"**Topic**: {scenario.get('ai_context_summary') or scenario.get('text') or 'Geometry lesson'}")

    if scenario.get("ai_prior_knowledge"):
        lines.append(f"**Prior Knowledge**: {scenario['ai_prior_knowledge']}")

    if scenario.get("misconception_focus"):
        lines.append(f"**Likely Misconception**: {scenario['misconception_focus']}")

    pedagogical_focus = scenario.get("ai_pedagogical_focus") or []
    if pedagogical_focus:
        lines.append("**Pedagogical Focus Areas**:")
        for focus in pedagogical_focus:
            lines.append(f"- {focus}")

    return "\n".join(lines)


def format_conversation_history(history: list) -> str:
    """
    Python port of `formatConversationHistory` (server/universal_pck_skills.js:434-449).
    `history` is a list of `HistoryTurnEntry`-like objects (or dicts with the
    same shape): {turn_number, teacher_message, student_messages: [str]}.
    """
    if not history:
        return NO_HISTORY_TEXT_HE

    lines: list[str] = []
    for turn in history:
        teacher_message = turn.teacher_message if hasattr(turn, "teacher_message") else turn["teacher_message"]
        student_messages = turn.student_messages if hasattr(turn, "student_messages") else turn.get("student_messages", [])
        lines.append(f"מורה: {teacher_message}")
        for student_message in student_messages:
            lines.append(f"תלמיד: {student_message}")

    return "\n".join(lines).strip()


def format_student_info(student_info: list[dict]) -> str:
    """New (research-only) block: brief student persona summaries, if available."""
    if not student_info:
        return "No student information available for this conversation."

    lines: list[str] = []
    for student in student_info:
        name = student.get("name") or student.get("id") or "Unknown student"
        description = student.get("description") or ""
        lines.append(f"- {name}: {description}".strip())
    return "\n".join(lines)


def _output_schema_instructions() -> str:
    dims = ", ".join(f'"{d}"' for d in PCK_DIMENSION_IDS)
    return f"""
Respond with STRICT JSON only (no markdown fences, no commentary before or after), matching exactly this shape:

{{
  "should_provide_feedback": true | false,
  "dimensions": {{
    // one entry for EACH of: {dims}
    "p1": {{"relevant": true | false, "score": 0 | 1 | 2 | null, "feedback_text": "..." | null}},
    "p2": {{"relevant": true | false, "score": 0 | 1 | 2 | null, "feedback_text": "..." | null}},
    "p3": {{"relevant": true | false, "score": 0 | 1 | 2 | null, "feedback_text": "..." | null}},
    "p4": {{"relevant": true | false, "score": 0 | 1 | 2 | null, "feedback_text": "..." | null}},
    "p5": {{"relevant": true | false, "score": 0 | 1 | 2 | null, "feedback_text": "..." | null}}
  }},
  "feedback_text_overall": "..." | null
}}

Rules:
- "relevant": true only for dimensions that actually apply to this teacher turn (per the "When relevant?" guidance for each skill above, and the "General Assessment Guidance" above regarding missed opportunities). Set "score" and "feedback_text" to null when "relevant" is false.
- "score" must be an integer 0, 1, or 2, following the rubric above, whenever "relevant" is true. The score reflects the QUALITY of the teacher's pedagogical move for that dimension, not the severity of the student's error or problem -- a well-handled turn can and should score 2.
- "feedback_text" (when present) should be short and actionable, written in Hebrew. When a dimension is relevant and the teacher handled it well (score=2), feedback_text may be positive/confirming (e.g. praising a strong diagnostic question) rather than corrective.
- Consistency requirement: if ANY of {dims} has "relevant": true, then "should_provide_feedback" must be true. If ALL of {dims} have "relevant": false, then "should_provide_feedback" must be false.
- "feedback_text_overall" is an optional short Hebrew summary combining the most important point(s) across dimensions; use null if "should_provide_feedback" is false.
""".strip()


def _general_assessment_guidance() -> str:
    return (
        "- Evaluate not only how the teacher responded to an explicit student error, but also "
        "whether the teacher's current move missed a pedagogical opportunity, given the lesson's "
        "goal, the likely misconception, and the conversation history so far.\n"
        "- However, p1 (Error Identification), p2 (Error Type Characterization), and p3 "
        "(Diagnostic Interpretation of Student Thinking) should generally be marked relevant only "
        "when there is an actual student error or misconception to identify, characterize, or "
        "interpret in this turn or the preceding student message(s). p4 (Adapted Pedagogical "
        "Response) and p5 (Leveraging Error for Learning) may still be relevant even without a new "
        "explicit error, if the teacher had an opportunity to deepen or extend student understanding.\n"
        "- For every dimension, the score (0/1/2) evaluates the quality of the teacher's pedagogical "
        "move for that dimension, not the severity of the underlying error or problem. If a dimension "
        "is relevant and the teacher handled it well, score=2 is valid, and the feedback text can be "
        "positive/confirming rather than corrective."
    )


BOARD_IMAGE_INSTRUCTION = (
    "An image of the board is attached as part of this prompt's context. Use it to understand "
    'any references in the conversation history or the teacher\'s current turn to visual '
    'elements on the board (e.g. "the shape on the board", "the two shapes", "the diagram above").'
)


def build_baseline_prompt(
    example: TurnExample,
    *,
    include_student_info: bool = False,
    include_board_images: bool = False,
    raw_dir: Optional[Path] = None,
) -> PromptPayload:
    """
    Build the baseline research prompt for a single `TurnExample`.

    `include_student_info` / `include_board_images` are config-gated (see
    `config/runs/*.yaml`) rather than always-on, so that
    `baseline_gemini_text_only.yaml` stays close to current production
    behavior (no images, no explicit student-info block) while
    `baseline_gemini_with_board_images.yaml` can opt into richer context.
    """
    images: list[PromptImage] = []
    if include_board_images and example.board_image_path:
        if raw_dir is None:
            raise ValueError(
                "include_board_images=True requires raw_dir to resolve TurnExample.board_image_path"
            )
        image_path = raw_dir / example.board_image_path
        if image_path.exists():
            images.append(PromptImage(mime_type="image/png", data=image_path.read_bytes()))
        # If the image file is missing (e.g. dataset built before image
        # extraction ran), we silently proceed text-only rather than
        # failing the whole inference run for one turn.

    sections: list[str] = []

    sections.append(
        "You are a PCK (Pedagogical Content Knowledge) expert analyzing a "
        "Hebrew geometry teacher's pedagogical move, offline, on a single "
        "teacher turn taken from a completed simulated lesson."
    )

    sections.append("## General Assessment Guidance\n" + _general_assessment_guidance())

    sections.append("## Lesson Context\n" + format_scenario_context(example.scenario))

    if include_student_info:
        sections.append("## Student Information\n" + format_student_info(example.student_info))

    sections.append(
        "## PCK Skills to Assess (p1-p5)\n"
        'Note: the "Hebrew patterns" listed below for each score band are illustrative examples '
        "only, not exact string-matching rules -- judge the teacher's move by its pedagogical "
        "substance and meaning, not by matching these exact phrases.\n\n" + format_skills_for_prompt()
    )

    sections.append("## Conversation History (Hebrew)\n" + format_conversation_history(example.conversation_history))

    if images:
        sections.append("## Attached Board Image\n" + BOARD_IMAGE_INSTRUCTION)

    sections.append(f'## Teacher\'s Turn to Analyze\n"{example.teacher_message}"')

    sections.append("## Required Output Format\n" + _output_schema_instructions())

    text = "\n\n".join(sections)

    return PromptPayload(text=text, images=images)

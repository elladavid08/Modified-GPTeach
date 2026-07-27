"""
SFT training-set build: a `TrainExample` JSONL (e.g.
`data/processed/train_individual_annotations_v1.jsonl`, produced by
`dataset/build_train_dataset.py`) -> `{train,val}.jsonl` + a
`split_manifest.json`, ready for HuggingFace `datasets` / `trl.SFTTrainer`.

This stage does NOT run Firestore export, does NOT call any model API, and
does NOT train anything -- it only reshapes already-built individual-
annotator training examples into SFT records.

Input construction is byte-for-byte identical to inference: each
`TrainExample` is converted to a `TurnExample`-shaped view (dropping only
annotation/label metadata, which no prompt builder ever reads anyway) and
passed through the exact same `prompts.registry.build_prompt()` used by
`pck-research infer` / `render-prompt`, driven by a real run config YAML
(default: `config/runs/baseline_gemini_text_only.yaml`) so the SFT input
distribution is traceable to a named, versioned recipe.

The assistant target is the annotator's own label (`TrainExample.label`)
re-serialized into the exact strict-JSON shape described in
`prompts.baseline_prompt._output_schema_instructions()` -- the same shape
`schemas.prediction.Prediction` uses -- so a trained model's outputs can be
parsed by the exact same `inference.parsing.parse_model_response()` used for
the baseline API models, without any SFT-specific parsing path.

Split strategy: group-based by `conversation_id` (a safe superset of
`assignment_id` -- currently 1:1 in the data, but this stays leak-safe even
if a future export ever has two annotators on the same conversation), so no
teacher turn's context ever appears on both sides of the split.
"""

from __future__ import annotations

import json
import random
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Optional

from pck_feedback.models.run_config import RunConfig
from pck_feedback.pck_skills import PCK_DIMENSION_IDS, RUBRIC_VERSION
from pck_feedback.prompts.registry import build_prompt
from pck_feedback.schemas.train_example import AnnotatorLabel, TrainExample
from pck_feedback.schemas.turn_example import TurnExample
from pck_feedback.training.sft_schema import SFTMessage, SFTMetadata, SFTRecord
from pck_feedback.utils.io import ensure_dir, read_jsonl, write_json, write_jsonl
from pck_feedback.utils.logging import get_logger

logger = get_logger(__name__)

DEFAULT_TEST_SET_PATH = Path("data/processed/test_set_v1.jsonl")


def train_example_to_turn_view(example: TrainExample) -> TurnExample:
    """
    Structural adapter so a `TrainExample` row can be passed through the
    exact same `prompts.registry.build_prompt()` that inference uses,
    unmodified. `ground_truth` is always `None` here -- deliberately: no
    prompt builder ever reads it (see `prompts/baseline_prompt.py`), and the
    annotator's actual label (`TrainExample.label`) is never copied into
    this view at all, so it cannot leak into prompt text.
    """
    return TurnExample(
        example_id=example.example_id,
        conversation_id=example.conversation_id,
        session_id=example.session_id,
        turn_number=example.turn_number,
        scenario=example.scenario,
        student_info=example.student_info,
        conversation_history=example.conversation_history,
        teacher_message=example.teacher_message,
        board_image_path=example.board_image_path,
        ground_truth=None,
        source=example.source,
    )


def build_target_json(label: AnnotatorLabel) -> dict[str, Any]:
    """
    Convert one annotator's label into the exact strict-JSON shape described
    in `prompts.baseline_prompt._output_schema_instructions()` (identical to
    `schemas.prediction.Prediction`'s shape). All five dimensions are always
    present -- even when irrelevant, with relevant=false/score=null/
    feedback_text=null -- matching exactly what the model is asked to
    produce at inference time.

    `feedback_text_overall` is always `None`: annotators only ever wrote
    per-dimension feedback text, never a cross-dimension summary, so there
    is no real gold value to put here -- synthesizing one would not be a
    faithful label.
    """
    dimensions: dict[str, dict[str, Any]] = {}
    for dim_id in PCK_DIMENSION_IDS:
        dim = label.dimensions.get(dim_id)
        included = bool(dim and dim.included)
        dimensions[dim_id] = {
            "relevant": included,
            "score": dim.score if (included and dim) else None,
            "feedback_text": dim.feedback_text if (included and dim) else None,
        }
    return {
        "should_provide_feedback": label.has_feedback,
        "dimensions": dimensions,
        "feedback_text_overall": None,
    }


def _target_text(label: AnnotatorLabel) -> str:
    # Pretty-printed to match the style shown in the prompt's own schema
    # example -- consistent with what the model is asked to produce.
    return json.dumps(build_target_json(label), ensure_ascii=False, indent=2)


def _build_record(
    example: TrainExample,
    *,
    run_config: RunConfig,
    run_config_source: str,
    raw_dir: Optional[Path],
    split: str,
) -> SFTRecord:
    view = train_example_to_turn_view(example)
    payload = build_prompt(
        run_config.prompt_version,
        view,
        include_student_info=run_config.include_student_info,
        include_board_images=run_config.include_board_images,
        raw_dir=raw_dir,
    )

    # No system message: mirrors both model adapters today, which send the
    # whole built prompt as a single "user" message (see
    # models/openai_compatible.py / models/vertex_gemini.py).
    messages = [
        SFTMessage(role="user", content=payload.text),
        SFTMessage(role="assistant", content=_target_text(example.label)),
    ]

    metadata = SFTMetadata(
        conversation_id=example.conversation_id,
        session_id=example.session_id,
        turn_number=example.turn_number,
        assignment_id=example.assignment_id,
        annotator_id=example.annotator_id,
        assignment_type=example.assignment_type,
        prompt_version=run_config.prompt_version,
        rubric_version=RUBRIC_VERSION,
        run_config=run_config_source,
        include_student_info=run_config.include_student_info,
        include_board_images=run_config.include_board_images,
        board_image_path=example.board_image_path,
        has_feedback=example.label.has_feedback,
        split=split,  # type: ignore[arg-type]
    )

    return SFTRecord(example_id=example.example_id, messages=messages, metadata=metadata)


def _load_train_examples(input_path: Path) -> list[TrainExample]:
    return [TrainExample.model_validate(row) for row in read_jsonl(input_path)]


def _load_excluded_conversation_ids(test_set_path: Optional[Path]) -> set[str]:
    if test_set_path is None or not test_set_path.exists():
        logger.warning(
            "Consensus test-set path %s not found -- skipping the leakage safety check. "
            "This must never happen for a real build; it is only acceptable in isolated tests.",
            test_set_path,
        )
        return set()
    return {row["conversation_id"] for row in read_jsonl(test_set_path)}


def _assert_no_consensus_leakage(examples: list[TrainExample], excluded_ids: set[str]) -> None:
    leaked = sorted({e.conversation_id for e in examples} & excluded_ids)
    if leaked:
        raise ValueError(
            "Refusing to build an SFT dataset: the following conversation_id(s) are reserved "
            f"for the held-out consensus test set and must never be used for training: {leaked}"
        )


def group_split(
    conversation_example_counts: dict[str, int],
    *,
    val_fraction: float,
    seed: int,
) -> tuple[set[str], set[str]]:
    """
    Deterministically (given `seed`) partitions conversation ids into
    train/val groups, targeting `val_fraction` of *examples* (not groups) in
    val, via a seeded shuffle + greedy fill. Never leaves train empty: with
    fewer than 2 groups, or a non-positive `val_fraction`, everything stays
    in train -- a validation split needs at least 2 independent
    conversations to be meaningful.
    """
    conv_ids = sorted(conversation_example_counts)  # sort first so the shuffle itself is the only randomness
    if len(conv_ids) < 2 or val_fraction <= 0:
        return set(conv_ids), set()

    total = sum(conversation_example_counts.values())
    target_val = total * val_fraction

    rng = random.Random(seed)
    rng.shuffle(conv_ids)

    val_ids: set[str] = set()
    val_count = 0
    for conv_id in conv_ids:
        if val_count >= target_val or len(val_ids) >= len(conversation_example_counts) - 1:
            break
        val_ids.add(conv_id)
        val_count += conversation_example_counts[conv_id]

    train_ids = set(conversation_example_counts) - val_ids
    return train_ids, val_ids


def _default_out_dir(run_config: RunConfig) -> Path:
    suffix = "with_images" if run_config.include_board_images else "text_only"
    return Path("data/training/sft") / f"{run_config.prompt_version}_{suffix}"


def _dimension_summary(examples: list[TrainExample]) -> dict[str, dict[str, Any]]:
    summary: dict[str, dict[str, Any]] = {}
    for dim_id in PCK_DIMENSION_IDS:
        included = [e.label.dimensions[dim_id] for e in examples if e.label.dimensions[dim_id].included]
        score_hist = Counter(d.score for d in included)
        summary[dim_id] = {
            "included_count": len(included),
            "included_rate": round(len(included) / len(examples), 4) if examples else 0.0,
            "score_histogram": {
                str(k): v for k, v in sorted(score_hist.items(), key=lambda kv: (kv[0] is None, kv[0]))
            },
        }
    return summary


def _split_stats(examples: list[TrainExample]) -> dict[str, Any]:
    positive = sum(1 for e in examples if e.label.has_feedback)
    return {
        "example_count": len(examples),
        "conversation_count": len({e.conversation_id for e in examples}),
        "positive_count": positive,
        "negative_count": len(examples) - positive,
        "annotator_distribution": dict(Counter(e.annotator_id for e in examples)),
        "dimension_summary": _dimension_summary(examples),
    }


def build_sft_dataset(
    input_path: Path,
    run_config: RunConfig,
    *,
    run_config_source: str,
    out_dir: Optional[Path] = None,
    raw_dir: Optional[Path] = None,
    val_fraction: float = 0.15,
    seed: int = 42,
    test_set_path: Optional[Path] = DEFAULT_TEST_SET_PATH,
) -> dict[str, Any]:
    """
    Build `train.jsonl` / `val.jsonl` / `split_manifest.json` under `out_dir`
    (defaulting to a versioned
    `data/training/sft/<prompt_version>_<text_only|with_images>/` folder)
    from a `TrainExample` JSONL at `input_path`. Returns the same summary
    dict that gets written to `split_manifest.json`.
    """
    if run_config.include_board_images and raw_dir is None:
        raise ValueError(
            f"Run config '{run_config.run_id}' has include_board_images=true, so raw_dir must be provided."
        )

    examples = _load_train_examples(input_path)
    excluded_ids = _load_excluded_conversation_ids(test_set_path)
    _assert_no_consensus_leakage(examples, excluded_ids)

    counts_by_conv: dict[str, int] = defaultdict(int)
    for example in examples:
        counts_by_conv[example.conversation_id] += 1

    train_conv_ids, val_conv_ids = group_split(dict(counts_by_conv), val_fraction=val_fraction, seed=seed)

    train_examples = [e for e in examples if e.conversation_id in train_conv_ids]
    val_examples = [e for e in examples if e.conversation_id in val_conv_ids]

    resolved_out_dir = out_dir or _default_out_dir(run_config)
    ensure_dir(resolved_out_dir)

    train_records = (
        _build_record(
            e, run_config=run_config, run_config_source=run_config_source, raw_dir=raw_dir, split="train"
        ).model_dump(mode="json")
        for e in train_examples
    )
    val_records = (
        _build_record(
            e, run_config=run_config, run_config_source=run_config_source, raw_dir=raw_dir, split="val"
        ).model_dump(mode="json")
        for e in val_examples
    )

    train_count = write_jsonl(resolved_out_dir / "train.jsonl", train_records)
    val_count = write_jsonl(resolved_out_dir / "val.jsonl", val_records)

    manifest = {
        "input_path": str(input_path),
        "input_example_count": len(examples),
        "run_config_source": run_config_source,
        "run_id": run_config.run_id,
        "prompt_version": run_config.prompt_version,
        "rubric_version": RUBRIC_VERSION,
        "include_student_info": run_config.include_student_info,
        "include_board_images": run_config.include_board_images,
        "seed": seed,
        "val_fraction": val_fraction,
        "excluded_test_conversation_ids": sorted(excluded_ids),
        "train": {
            "conversation_ids": sorted(train_conv_ids),
            **_split_stats(train_examples),
        },
        "val": {
            "conversation_ids": sorted(val_conv_ids),
            **_split_stats(val_examples),
        },
        "output": {
            "out_dir": str(resolved_out_dir),
            "train_path": str(resolved_out_dir / "train.jsonl"),
            "val_path": str(resolved_out_dir / "val.jsonl"),
            "train_count": train_count,
            "val_count": val_count,
        },
    }

    write_json(resolved_out_dir / "split_manifest.json", manifest)
    logger.info("Wrote %d train / %d val SFT record(s) to %s", train_count, val_count, resolved_out_dir)
    return manifest

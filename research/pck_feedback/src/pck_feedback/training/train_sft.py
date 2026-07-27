"""
SFT training (LoRA) for the PCK feedback model.

This module is a separate, optional stage gated behind the `train` extra
(`pip install -e ".[train]"`) -- torch/transformers/trl/peft/datasets are
ALL imported lazily, inside functions, never at module import time, so the
rest of this pipeline (dataset build, inference, evaluation) and its
fixture-based test suite never need them installed. This mirrors the same
lazy-import pattern already used by `models/vertex_gemini.py` /
`models/openai_compatible.py` for their own heavy/credentialed SDKs.

Meant to run on a GPU host (e.g. the B200 cluster), invoked manually via:

    pck-research train-sft --config config/training/sft_baseline_v1.yaml

Never invoked automatically by any other command in this codebase.

Two things this module treats as non-negotiable, per explicit project
requirements:

1. **Completion-only loss.** The (long, mostly-boilerplate rubric) user
   prompt must never contribute to the training loss -- only the assistant's
   JSON completion should. This is enforced by an explicit, custom data
   collator (`build_completion_only_collator`) built on top of two small,
   pure, dependency-free functions (`find_response_start_index`,
   `mask_prompt_tokens`) that are unit-tested directly in
   `tests/test_train_sft.py` without needing torch/transformers at all --
   see that file for a walkthrough proving prompt tokens end up masked
   (label = -100) while completion tokens do not.
2. **No silent truncation.** `run_length_preflight` measures every
   example's real tokenized length with the actual base-model tokenizer
   before training starts. If any example exceeds `max_seq_length`,
   `enforce_length_preflight` either raises a clear, actionable error
   (default: `on_overlong_sequence: fail`) or explicitly (never silently)
   drops the offending examples if the config opts into
   `on_overlong_sequence: drop`.
"""

from __future__ import annotations

import time
from collections.abc import Callable, Sequence
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Optional

import yaml

from pck_feedback.utils.io import ensure_dir, read_jsonl, write_json
from pck_feedback.utils.logging import get_logger

logger = get_logger(__name__)

DEFAULT_IGNORE_INDEX = -100


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------


@dataclass
class LoraSpec:
    r: int = 16
    alpha: int = 32
    dropout: float = 0.05
    target_modules: list[str] = field(
        default_factory=lambda: ["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"]
    )


@dataclass
class TrainingArgsSpec:
    num_train_epochs: float = 3
    per_device_train_batch_size: int = 1
    per_device_eval_batch_size: int = 1
    gradient_accumulation_steps: int = 8
    learning_rate: float = 2.0e-4
    lr_scheduler_type: str = "cosine"
    warmup_ratio: float = 0.03
    weight_decay: float = 0.0
    bf16: bool = True
    gradient_checkpointing: bool = True
    packing: bool = False
    completion_only_loss: bool = True
    eval_strategy: str = "epoch"
    eval_steps: Optional[int] = None  # only used when eval_strategy == "steps"
    save_strategy: str = "epoch"
    save_steps: Optional[int] = None  # only used when save_strategy == "steps"
    save_total_limit: int = 3
    load_best_model_at_end: bool = True
    logging_steps: int = 5
    seed: int = 42
    max_steps: Optional[int] = None  # smoke-test override; None/-1 = full run


@dataclass
class TrainingConfig:
    run_id: str
    base_model: str
    output_dir: Path
    train_dataset: Path
    val_dataset: Path
    max_seq_length: int = 8192
    method: str = "lora"  # lora | qlora | full -- only "lora" is implemented so far
    on_overlong_sequence: str = "fail"  # "fail" | "drop" -- never "truncate" silently
    lora: LoraSpec = field(default_factory=LoraSpec)
    training: TrainingArgsSpec = field(default_factory=TrainingArgsSpec)

    @classmethod
    def from_yaml(cls, path: Path) -> "TrainingConfig":
        raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
        lora_raw = raw.get("lora") or {}
        training_raw = raw.get("training") or {}
        return cls(
            run_id=raw["run_id"],
            base_model=raw["base_model"],
            output_dir=Path(raw["output_dir"]),
            train_dataset=Path(raw["train_dataset"]),
            val_dataset=Path(raw["val_dataset"]),
            max_seq_length=raw.get("max_seq_length", 8192),
            method=raw.get("method", "lora"),
            on_overlong_sequence=raw.get("on_overlong_sequence", "fail"),
            lora=LoraSpec(**lora_raw),
            training=TrainingArgsSpec(**training_raw),
        )


# ---------------------------------------------------------------------------
# Completion-only loss masking -- pure, dependency-free core logic.
# Unit-tested in tests/test_train_sft.py without torch/transformers.
# ---------------------------------------------------------------------------


def find_response_start_index(input_ids: Sequence[int], response_template_ids: Sequence[int]) -> Optional[int]:
    """
    Returns the index of the first token AFTER the last occurrence of
    `response_template_ids` inside `input_ids` -- i.e. where the assistant's
    actual completion begins. Returns `None` if the template isn't found
    (e.g. it got cut off by truncation).

    Searches from the end: each SFT record here has exactly one user turn
    followed by one assistant turn, so the template should appear once,
    but searching backward is a defensive choice in case the template's
    token sequence happens to also appear earlier (e.g. inside the user
    prompt's own JSON-schema example block).
    """
    n, m = len(input_ids), len(response_template_ids)
    if m == 0 or n < m:
        return None
    for start in range(n - m, -1, -1):
        if list(input_ids[start : start + m]) == list(response_template_ids):
            return start + m
    return None


def mask_prompt_tokens(
    input_ids: Sequence[int],
    response_template_ids: Sequence[int],
    *,
    ignore_index: int = DEFAULT_IGNORE_INDEX,
) -> list[int]:
    """
    Builds the `labels` sequence for completion-only SFT: every token up to
    and including the assistant response template is set to `ignore_index`
    (excluded from the loss by every standard HF/PyTorch cross-entropy
    implementation, which ignores label == -100), and every token from the
    assistant's actual completion onward is left as-is (included in the
    loss). This is the mechanism that makes "train only on the assistant
    JSON target, never the long user prompt/rubric" true, not just a
    comment -- see `tests/test_train_sft.py::test_mask_prompt_tokens_*`.
    """
    start = find_response_start_index(input_ids, response_template_ids)
    if start is None:
        # Defensive: never fall back to training on an unmasked prompt.
        # A fully-masked example contributes exactly zero loss and is
        # logged loudly, which is much safer than silently training on
        # prompt tokens because a template match failed.
        logger.warning(
            "Could not locate the assistant response template in a tokenized example -- "
            "masking the ENTIRE example from the loss (contributes 0) rather than risking "
            "training on unmasked prompt tokens."
        )
        return [ignore_index] * len(input_ids)
    return [ignore_index] * start + list(input_ids[start:])


def derive_response_template(tokenizer: Any) -> str:
    """
    The exact literal text a chat template inserts right before the
    assistant's turn begins (e.g. "<|im_start|>assistant\\n" for a
    ChatML-style template like Qwen2.5's). Derived generically -- works for
    any tokenizer with a chat template, without hardcoding a model-specific
    string -- by diffing `apply_chat_template(..., add_generation_prompt=True)`
    against the same call with `add_generation_prompt=False`: the suffix
    that appears is exactly the assistant-turn marker.
    """
    dummy_messages = [{"role": "user", "content": "x"}]
    with_marker = tokenizer.apply_chat_template(dummy_messages, tokenize=False, add_generation_prompt=True)
    without_marker = tokenizer.apply_chat_template(dummy_messages, tokenize=False, add_generation_prompt=False)
    if not with_marker.startswith(without_marker):
        raise ValueError(
            "This tokenizer's chat template doesn't behave as expected (add_generation_prompt=True "
            "output does not extend add_generation_prompt=False output) -- cannot safely derive a "
            "response template for completion-only loss masking. Inspect the tokenizer's chat "
            "template manually before proceeding."
        )
    return with_marker[len(without_marker) :]


def build_completion_only_collator(tokenizer: Any, response_template: str) -> Callable[[list[dict[str, Any]]], Any]:
    """
    Returns a torch-based data collator (lazy torch import) that pads a
    batch of already-tokenized examples (each a dict with an `input_ids`
    key) and applies `mask_prompt_tokens` to build `labels` -- the actual
    mechanism enforcing completion-only loss at training time. Written
    explicitly here (rather than relying solely on a library flag like
    `SFTConfig(completion_only_loss=True)`) so the masking behavior is
    transparent, inspectable, and covered by a plain-Python unit test that
    doesn't depend on any particular trl/transformers version's internals.
    """
    import torch  # lazy: only needed once we're actually training

    response_template_ids = tokenizer.encode(response_template, add_special_tokens=False)

    def collate(examples: list[dict[str, Any]]) -> dict[str, "torch.Tensor"]:
        input_ids_list = [ex["input_ids"] for ex in examples]
        max_len = max(len(ids) for ids in input_ids_list)
        pad_id = tokenizer.pad_token_id if tokenizer.pad_token_id is not None else tokenizer.eos_token_id

        batch_input_ids: list[list[int]] = []
        batch_labels: list[list[int]] = []
        batch_attention_mask: list[list[int]] = []
        for ids in input_ids_list:
            labels = mask_prompt_tokens(ids, response_template_ids)
            pad_len = max_len - len(ids)
            batch_input_ids.append(list(ids) + [pad_id] * pad_len)
            batch_labels.append(labels + [DEFAULT_IGNORE_INDEX] * pad_len)
            batch_attention_mask.append([1] * len(ids) + [0] * pad_len)

        return {
            "input_ids": torch.tensor(batch_input_ids, dtype=torch.long),
            "labels": torch.tensor(batch_labels, dtype=torch.long),
            "attention_mask": torch.tensor(batch_attention_mask, dtype=torch.long),
        }

    return collate


# ---------------------------------------------------------------------------
# Tokenizer length preflight -- never silently truncate.
# ---------------------------------------------------------------------------


@dataclass
class LengthPreflightResult:
    dataset_path: str
    example_count: int
    max_tokens: int
    avg_tokens: float
    num_exceeding: int
    exceeding_example_ids: list[str]


def measure_sequence_lengths(
    dataset_path: Path,
    tokenize_messages_fn: Callable[[list[dict[str, str]]], Sequence[int]],
    *,
    max_seq_length: int,
) -> LengthPreflightResult:
    """
    Measures the real tokenized length of every example in an SFT `messages`
    JSONL file (see `training/sft_schema.py`), using `tokenize_messages_fn`
    (typically `tokenizer.apply_chat_template`) -- never a character-count
    approximation. `tokenize_messages_fn` is injected so this function can
    be unit-tested with a fake tokenizer, without needing transformers
    installed (see `tests/test_train_sft.py`).
    """
    lengths: list[int] = []
    exceeding: list[str] = []
    for row in read_jsonl(dataset_path):
        n_tokens = len(tokenize_messages_fn(row["messages"]))
        lengths.append(n_tokens)
        if n_tokens > max_seq_length:
            exceeding.append(row["example_id"])

    if not lengths:
        raise ValueError(f"No examples found in {dataset_path} -- cannot run a length preflight on an empty dataset.")

    return LengthPreflightResult(
        dataset_path=str(dataset_path),
        example_count=len(lengths),
        max_tokens=max(lengths),
        avg_tokens=sum(lengths) / len(lengths),
        num_exceeding=len(exceeding),
        exceeding_example_ids=exceeding,
    )


def run_length_preflight(config: TrainingConfig, tokenizer: Any) -> dict[str, LengthPreflightResult]:
    """Runs `measure_sequence_lengths` for both the train and val splits and logs a summary."""

    def tokenize_messages(messages: list[dict[str, str]]) -> Sequence[int]:
        return tokenizer.apply_chat_template(messages, tokenize=True, add_generation_prompt=False)

    results: dict[str, LengthPreflightResult] = {}
    for split, path in (("train", config.train_dataset), ("val", config.val_dataset)):
        result = measure_sequence_lengths(path, tokenize_messages, max_seq_length=config.max_seq_length)
        results[split] = result
        logger.info(
            "[length preflight] split=%s n=%d max_tokens=%d avg_tokens=%.1f exceeding_max_seq_length=%d",
            split,
            result.example_count,
            result.max_tokens,
            result.avg_tokens,
            result.num_exceeding,
        )
    return results


def enforce_length_preflight(results: dict[str, LengthPreflightResult], config: TrainingConfig) -> dict[str, list[str]]:
    """
    Applies `config.on_overlong_sequence` to the preflight results. Returns
    a `{split: [dropped_example_ids]}` dict (empty if nothing was dropped)
    for the caller to actually exclude those rows and to record in the
    training manifest. Never truncates silently: "fail" (default) raises;
    "drop" logs loudly and returns the ids to exclude.
    """
    total_exceeding = sum(r.num_exceeding for r in results.values())
    if total_exceeding == 0:
        return {}

    if config.on_overlong_sequence == "fail":
        details = {split: r.exceeding_example_ids for split, r in results.items() if r.num_exceeding}
        raise ValueError(
            f"{total_exceeding} example(s) exceed max_seq_length={config.max_seq_length} tokens and "
            "on_overlong_sequence='fail' (the default) -- refusing to silently truncate. Either "
            "raise max_seq_length, or set on_overlong_sequence: drop in the training config to "
            f"explicitly exclude these examples. Offending example_ids: {details}"
        )

    if config.on_overlong_sequence == "drop":
        details = {split: r.exceeding_example_ids for split, r in results.items() if r.num_exceeding}
        logger.warning(
            "%d example(s) exceed max_seq_length=%d and will be DROPPED (on_overlong_sequence='drop'). "
            "This is an explicit choice, not a silent truncation -- dropped example_ids: %s",
            total_exceeding,
            config.max_seq_length,
            details,
        )
        return details

    raise ValueError(f"Unknown on_overlong_sequence: {config.on_overlong_sequence!r} (expected 'fail' or 'drop').")


# ---------------------------------------------------------------------------
# Training entrypoint (heavy imports live entirely inside this function).
# ---------------------------------------------------------------------------


def run_training(
    config: TrainingConfig,
    *,
    preflight_only: bool = False,
    max_steps_override: Optional[int] = None,
) -> dict[str, Any]:
    """
    Runs the length preflight, then (unless `preflight_only`) fine-tunes
    `config.base_model` with LoRA on `config.train_dataset` /
    `config.val_dataset`, saves the adapter + tokenizer to
    `config.output_dir`, and writes `training_manifest.json` alongside it.

    Requires the `train` extra to be installed (`pip install -e ".[train]"`)
    -- never called by any other command in this codebase.
    """
    if config.method != "lora":
        raise NotImplementedError(
            f"method={config.method!r} is not implemented yet -- only 'lora' is supported so far "
            "(see training/README.md for the qlora/full-fine-tune scope note)."
        )

    from transformers import AutoTokenizer

    tokenizer = AutoTokenizer.from_pretrained(config.base_model)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    preflight_results = run_length_preflight(config, tokenizer)
    dropped_ids = enforce_length_preflight(preflight_results, config)

    preflight_summary = {split: asdict(result) for split, result in preflight_results.items()}
    if preflight_only:
        logger.info("--preflight-only: skipping model load and training.")
        return {"preflight": preflight_summary, "dropped_example_ids": dropped_ids}

    import torch
    from datasets import load_dataset
    from peft import LoraConfig
    from transformers import AutoModelForCausalLM
    from trl import SFTConfig, SFTTrainer

    def _load_split(path: Path, dropped: list[str]):
        ds = load_dataset("json", data_files=str(path), split="train")
        if dropped:
            ds = ds.filter(lambda row: row["example_id"] not in set(dropped))

        def _tokenize(row: dict[str, Any]) -> dict[str, Any]:
            input_ids = tokenizer.apply_chat_template(row["messages"], tokenize=True, add_generation_prompt=False)
            return {"input_ids": input_ids}

        return ds.map(_tokenize, remove_columns=ds.column_names)

    train_ds = _load_split(config.train_dataset, dropped_ids.get("train", []))
    val_ds = _load_split(config.val_dataset, dropped_ids.get("val", []))

    response_template = derive_response_template(tokenizer)
    # This is the actual enforcement point for "completion-only loss is
    # critical": the collator masks every prompt token's label to -100
    # before the trainer ever computes a loss on it. See module docstring
    # and tests/test_train_sft.py for the unit-tested core logic.
    data_collator = build_completion_only_collator(tokenizer, response_template)

    model = AutoModelForCausalLM.from_pretrained(config.base_model, torch_dtype=torch.bfloat16)

    lora_config = LoraConfig(
        r=config.lora.r,
        lora_alpha=config.lora.alpha,
        lora_dropout=config.lora.dropout,
        target_modules=config.lora.target_modules,
        task_type="CAUSAL_LM",
    )

    resolved_max_steps = max_steps_override if max_steps_override is not None else (config.training.max_steps or -1)

    training_args = SFTConfig(
        output_dir=str(config.output_dir),
        num_train_epochs=config.training.num_train_epochs,
        per_device_train_batch_size=config.training.per_device_train_batch_size,
        per_device_eval_batch_size=config.training.per_device_eval_batch_size,
        gradient_accumulation_steps=config.training.gradient_accumulation_steps,
        learning_rate=config.training.learning_rate,
        lr_scheduler_type=config.training.lr_scheduler_type,
        warmup_ratio=config.training.warmup_ratio,
        weight_decay=config.training.weight_decay,
        bf16=config.training.bf16,
        gradient_checkpointing=config.training.gradient_checkpointing,
        packing=config.training.packing,
        max_seq_length=config.max_seq_length,
        eval_strategy=config.training.eval_strategy,
        eval_steps=config.training.eval_steps,
        save_strategy=config.training.save_strategy,
        save_steps=config.training.save_steps,
        save_total_limit=config.training.save_total_limit,
        load_best_model_at_end=config.training.load_best_model_at_end,
        logging_steps=config.training.logging_steps,
        seed=config.training.seed,
        max_steps=resolved_max_steps,
    )

    trainer = SFTTrainer(
        model=model,
        args=training_args,
        train_dataset=train_ds,
        eval_dataset=val_ds,
        data_collator=data_collator,
        peft_config=lora_config,
        processing_class=tokenizer,
    )

    start = time.monotonic()
    train_result = trainer.train()
    elapsed_seconds = time.monotonic() - start

    ensure_dir(config.output_dir)
    trainer.save_model(str(config.output_dir))
    tokenizer.save_pretrained(str(config.output_dir))

    manifest = {
        "run_id": config.run_id,
        "base_model": config.base_model,
        "method": config.method,
        "train_dataset": str(config.train_dataset),
        "val_dataset": str(config.val_dataset),
        "max_seq_length": config.max_seq_length,
        "on_overlong_sequence": config.on_overlong_sequence,
        "dropped_example_ids": dropped_ids,
        "preflight": preflight_summary,
        "lora": asdict(config.lora),
        "training_args": asdict(config.training),
        "resolved_max_steps": resolved_max_steps,
        "final_train_loss": train_result.metrics.get("train_loss"),
        "elapsed_seconds": elapsed_seconds,
    }
    write_json(config.output_dir / "training_manifest.json", manifest)
    logger.info("Training complete in %.1fs. Wrote checkpoint + manifest to %s", elapsed_seconds, config.output_dir)
    return manifest

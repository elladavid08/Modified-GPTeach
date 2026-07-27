"""
Tests for `training/train_sft.py`.

Everything here runs fully offline with no network access and, deliberately,
without requiring torch/transformers/trl/peft to be installed (the `train`
extra) -- these are pure-Python tests of the config parsing and the
completion-only-loss / length-preflight *logic*, using a fake tokenizer
(`fakes/fake_tokenizer.py`) wherever a tokenizer-shaped object is needed.
The one exception (`build_completion_only_collator`, which needs a real
`torch.Tensor`) is skipped automatically here via `pytest.importorskip` and
will actually run once the `train` extra is installed (e.g. on the B200
cluster).
"""

from __future__ import annotations

from pathlib import Path

import pytest
from fakes.fake_tokenizer import FakeChatTemplateTokenizer

from pck_feedback.training.train_sft import (
    LengthPreflightResult,
    LoraSpec,
    TrainingArgsSpec,
    TrainingConfig,
    derive_response_template,
    enforce_length_preflight,
    find_response_start_index,
    mask_prompt_tokens,
    measure_sequence_lengths,
)
from pck_feedback.utils.io import write_jsonl

# ---------------------------------------------------------------------------
# TrainingConfig.from_yaml
# ---------------------------------------------------------------------------


def test_training_config_from_yaml_applies_defaults_when_sections_omitted(tmp_path: Path):
    path = tmp_path / "minimal.yaml"
    path.write_text(
        "run_id: x\nbase_model: Qwen/Qwen2.5-7B-Instruct\noutput_dir: out\n"
        "train_dataset: train.jsonl\nval_dataset: val.jsonl\n",
        encoding="utf-8",
    )
    config = TrainingConfig.from_yaml(path)

    assert config.max_seq_length == 8192
    assert config.method == "lora"
    assert config.on_overlong_sequence == "fail"
    assert config.lora == LoraSpec()
    assert config.training == TrainingArgsSpec()


def test_training_config_from_yaml_parses_full_config():
    config = TrainingConfig.from_yaml(Path("config/training/sft_baseline_v1.yaml"))

    assert config.run_id == "sft_baseline_v1"
    assert config.base_model == "Qwen/Qwen2.5-7B-Instruct"
    assert config.method == "lora"
    assert config.on_overlong_sequence == "fail"
    assert config.lora.r == 16
    assert config.lora.target_modules == ["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"]
    assert config.training.num_train_epochs == 3
    assert config.training.completion_only_loss is True
    assert config.training.packing is False
    assert config.training.max_steps is None


def test_smoke_training_config_overrides_max_steps_and_writes_to_a_separate_output_dir():
    full = TrainingConfig.from_yaml(Path("config/training/sft_baseline_v1.yaml"))
    smoke = TrainingConfig.from_yaml(Path("config/training/sft_baseline_v1_smoke.yaml"))

    assert smoke.training.max_steps == 5
    assert smoke.output_dir != full.output_dir  # must never collide with a real checkpoint


# ---------------------------------------------------------------------------
# Completion-only loss masking (the "critical" requirement)
# ---------------------------------------------------------------------------


def test_derive_response_template_extracts_the_generation_prompt_suffix():
    tokenizer = FakeChatTemplateTokenizer()
    template = derive_response_template(tokenizer)
    assert template == "<|im_start|>assistant\n"


def test_find_response_start_index_locates_token_right_after_template():
    input_ids = [10, 20, 30, 99, 98, 40, 50]
    start = find_response_start_index(input_ids, [99, 98])
    assert start == 5
    assert input_ids[start:] == [40, 50]


def test_find_response_start_index_returns_none_when_template_absent():
    assert find_response_start_index([1, 2, 3, 4], [99, 98]) is None


def test_find_response_start_index_returns_none_for_empty_template():
    assert find_response_start_index([1, 2, 3], []) is None


def test_mask_prompt_tokens_masks_prompt_and_template_but_not_completion():
    input_ids = [1, 2, 3, 99, 98, 4, 5]
    labels = mask_prompt_tokens(input_ids, [99, 98])

    # Every prompt token AND the template itself must be masked...
    assert labels[:5] == [-100, -100, -100, -100, -100]
    # ...while the assistant's actual completion tokens must be untouched.
    assert labels[5:] == [4, 5]
    assert len(labels) == len(input_ids)


def test_mask_prompt_tokens_fully_masks_when_template_is_missing_rather_than_leaking_prompt():
    input_ids = [1, 2, 3, 4, 5]
    labels = mask_prompt_tokens(input_ids, [99, 98])
    # Defensive fallback: better to contribute zero loss than to accidentally
    # train on an unmasked prompt because the template couldn't be found.
    assert labels == [-100] * len(input_ids)


def test_end_to_end_prompt_tokens_never_appear_unmasked_using_the_fake_chat_template():
    """
    Integration-style check of the whole completion-only pipeline using the
    fake tokenizer: tokenize a full [user, assistant] conversation the same
    way `train_sft.py` does, derive the response template from the SAME
    tokenizer instance, mask it, and confirm every prompt-turn token ends up
    with label=-100 while every assistant-turn token keeps its real id.
    """
    tokenizer = FakeChatTemplateTokenizer()
    messages = [
        {"role": "user", "content": "long rubric prompt text here"},
        {"role": "assistant", "content": "the json completion"},
    ]
    full_text = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=False)
    input_ids = tokenizer.apply_chat_template(messages, tokenize=True, add_generation_prompt=False)

    response_template = derive_response_template(tokenizer)
    response_template_ids = tokenizer.encode(response_template, add_special_tokens=False)

    labels = mask_prompt_tokens(input_ids, response_template_ids)

    prompt_only_ids = tokenizer.encode(
        full_text[: full_text.index(response_template) + len(response_template)], add_special_tokens=False
    )
    n_prompt_tokens = len(prompt_only_ids)

    assert labels[:n_prompt_tokens] == [-100] * n_prompt_tokens
    assert labels[n_prompt_tokens:] == input_ids[n_prompt_tokens:]
    assert -100 not in labels[n_prompt_tokens:]  # completion tokens are never masked


# ---------------------------------------------------------------------------
# Length preflight (never silently truncate)
# ---------------------------------------------------------------------------


def _tokenize_by_char_count(messages: list[dict[str, str]]) -> list[int]:
    """A deterministic fake 'tokenizer': one fake token per character of content."""
    total_chars = sum(len(m["content"]) for m in messages)
    return list(range(total_chars))


def test_measure_sequence_lengths_reports_max_avg_and_exceeding_ids(tmp_path: Path):
    path = tmp_path / "dataset.jsonl"
    write_jsonl(
        path,
        [
            {"example_id": "short", "messages": [{"role": "user", "content": "a" * 10}, {"role": "assistant", "content": "b"}]},
            {"example_id": "long", "messages": [{"role": "user", "content": "a" * 100}, {"role": "assistant", "content": "b"}]},
        ],
    )

    result = measure_sequence_lengths(path, _tokenize_by_char_count, max_seq_length=50)

    assert result.example_count == 2
    assert result.max_tokens == 101
    assert result.avg_tokens == pytest.approx((11 + 101) / 2)
    assert result.num_exceeding == 1
    assert result.exceeding_example_ids == ["long"]


def test_measure_sequence_lengths_raises_on_empty_dataset(tmp_path: Path):
    path = tmp_path / "empty.jsonl"
    path.write_text("", encoding="utf-8")
    with pytest.raises(ValueError):
        measure_sequence_lengths(path, _tokenize_by_char_count, max_seq_length=100)


def test_enforce_length_preflight_is_a_no_op_when_nothing_exceeds():
    results = {
        "train": LengthPreflightResult("train.jsonl", 10, 50, 30.0, 0, []),
        "val": LengthPreflightResult("val.jsonl", 2, 40, 35.0, 0, []),
    }
    config = TrainingConfig.from_yaml(Path("config/training/sft_baseline_v1.yaml"))
    assert enforce_length_preflight(results, config) == {}


def test_enforce_length_preflight_raises_by_default_and_names_offending_examples():
    results = {
        "train": LengthPreflightResult("train.jsonl", 10, 9000, 500.0, 2, ["ex_1", "ex_2"]),
        "val": LengthPreflightResult("val.jsonl", 2, 40, 35.0, 0, []),
    }
    config = TrainingConfig.from_yaml(Path("config/training/sft_baseline_v1.yaml"))
    assert config.on_overlong_sequence == "fail"

    with pytest.raises(ValueError, match="ex_1"):
        enforce_length_preflight(results, config)


def test_enforce_length_preflight_drop_mode_returns_ids_without_raising():
    results = {
        "train": LengthPreflightResult("train.jsonl", 10, 9000, 500.0, 1, ["ex_1"]),
        "val": LengthPreflightResult("val.jsonl", 2, 40, 35.0, 0, []),
    }
    config = TrainingConfig.from_yaml(Path("config/training/sft_baseline_v1.yaml"))
    config.on_overlong_sequence = "drop"

    dropped = enforce_length_preflight(results, config)
    assert dropped == {"train": ["ex_1"]}


def test_enforce_length_preflight_rejects_unknown_mode():
    results = {"train": LengthPreflightResult("train.jsonl", 1, 10, 10.0, 1, ["ex_1"])}
    config = TrainingConfig.from_yaml(Path("config/training/sft_baseline_v1.yaml"))
    config.on_overlong_sequence = "truncate"  # not a supported value -- must never silently truncate

    with pytest.raises(ValueError, match="Unknown on_overlong_sequence"):
        enforce_length_preflight(results, config)


# ---------------------------------------------------------------------------
# Torch-dependent collator -- only runs where the `train` extra is installed.
# ---------------------------------------------------------------------------


def test_build_completion_only_collator_masks_prompt_tokens_in_a_real_batch():
    pytest.importorskip("torch")
    from pck_feedback.training.train_sft import build_completion_only_collator

    tokenizer = FakeChatTemplateTokenizer()
    response_template = derive_response_template(tokenizer)
    collator = build_completion_only_collator(tokenizer, response_template)

    messages_a = [{"role": "user", "content": "prompt one"}, {"role": "assistant", "content": "answer one"}]
    messages_b = [{"role": "user", "content": "a much longer prompt two"}, {"role": "assistant", "content": "answer two"}]
    examples = [
        {"input_ids": tokenizer.apply_chat_template(messages_a, tokenize=True, add_generation_prompt=False)},
        {"input_ids": tokenizer.apply_chat_template(messages_b, tokenize=True, add_generation_prompt=False)},
    ]

    batch = collator(examples)
    labels = batch["labels"].tolist()

    for row_labels, ex in zip(labels, examples):
        # Every position where attention_mask would be 1 up to the completion
        # must be masked; at minimum, the first token of every example must
        # be masked (it's always part of the prompt), and NOT every label in
        # the row can be -100 for a well-formed example (the completion must
        # survive).
        assert row_labels[0] == -100
        assert any(label != -100 for label in row_labels)

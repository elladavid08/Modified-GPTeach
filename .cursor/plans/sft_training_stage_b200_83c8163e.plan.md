---
name: SFT training stage B200
overview: Plan the first practical SFT training run (LoRA fine-tune of an open model) on the B200 cluster using the already-built data/training/sft/baseline_v1_text_only/{train,val}.jsonl, then serve and evaluate it against test_set_v1.jsonl by reusing the existing OpenAI-compatible inference/evaluation pipeline with zero new inference code.
todos:
  - id: pyproject-train-extra
    content: Add optional 'train' extra (torch/transformers/trl/peft/accelerate/datasets) to pyproject.toml
    status: pending
  - id: training-config-yaml
    content: Add config/training/sft_baseline_v1.yaml
    status: pending
  - id: train-sft-script
    content: Implement src/pck_feedback/training/train_sft.py (TrainingConfig + LoRA/TRL loop + training_manifest.json)
    status: pending
  - id: cli-train-sft
    content: Wire `pck-research train-sft` command into cli/main.py
    status: pending
  - id: vllm-run-config
    content: Add config/runs/sft_baseline_v1_vllm.yaml for serving the fine-tuned model via the existing OpenAI-compatible adapter
    status: pending
  - id: training-readme
    content: Document the B200 cluster workflow in src/pck_feedback/training/README.md
    status: pending
isProject: false
---


# Plan: First SFT training stage for PCK feedback (B200 cluster)

## Scope guardrails
- No training runs locally in this session -- this plan only adds code/config; the actual GPU job runs on the B200 cluster, invoked manually by the user.
- No calls to Gemini/Vertex/OpenAI anywhere in the training or serving path.
- No production app changes.
- Training data excludes the 5 consensus conversations (already guaranteed by `build_sft_dataset.py`'s hard exclusion check -- verified in `data/training/sft/baseline_v1_text_only/split_manifest.json`).

## Key data facts (measured from the actual files, informs config choices below)
- `train.jsonl`: 428 examples / 36 conversations. `val.jsonl`: 78 examples / 4 conversations (incl. minority annotator, per the last split fix).
- Prompt (`messages[0]`, user turn) length: avg ~11.6K chars, max ~19.5K chars (the rubric + skills section dominates). Assistant target: avg ~700 chars, max ~1.5K chars.
- Rough token estimate (mixed Hebrew/English, ~3 chars/token blended): up to ~6.5K tokens per example -- `max_seq_length` must comfortably exceed this.
- Only 2 annotators in the data (373/82 examples project-wide), heavily skewed -- the model will disproportionately learn one annotator's style/thresholds.

## 1. Base model options (first run)

| Model | Why | License note |
|---|---|---|
| **Qwen2.5-7B-Instruct (recommended)** | Strong multilingual/Hebrew capability, efficient tokenizer (helps with the long rubric prompt), reliable structured-JSON instruction following, first-class TRL/PEFT/vLLM support | Apache-2.0 |
| Qwen2.5-14B-Instruct | Same family, more capacity if B200 headroom and iteration time allow after v1 | Apache-2.0 |
| Llama-3.1-8B-Instruct | Very strong general instruction-following | Meta community license (usage restrictions) |
| Gemma-2-9b-it | Google lineage (some alignment with production's Gemini), decent multilingual | Gemma license (usage restrictions) |

Recommendation: start with **Qwen2.5-7B-Instruct** -- best balance of Hebrew quality, JSON-following reliability, and ecosystem support for a first run; confirm the chosen license is acceptable for the project before committing further.

## 2. LoRA vs QLoRA vs full fine-tuning

Given only 428 training examples: **standard LoRA in bf16 (not QLoRA, not full fine-tuning)**.
- A B200's memory (~180GB+ HBM) makes 4-bit quantization (QLoRA) unnecessary for a 7-8B model -- unquantized LoRA gives cleaner gradients for such a small dataset.
- Full fine-tuning of all weights on 428 examples risks catastrophic overfitting/forgetting of the base model's general Hebrew/instruction-following ability; LoRA constrains the update to a small adapter, which is the standard, lower-risk choice for small SFT sets.
- LoRA also keeps checkpoints small (tens-hundreds of MB) and training fast (should complete in minutes on a single B200), matching "practical, not overly complex."
- QLoRA remains a documented fallback if a much larger base model (e.g. 30B+) is chosen later.

## 3. Required Python dependencies

Add a new optional extra to [research/pck_feedback/pyproject.toml](research/pck_feedback/pyproject.toml) (mirrors the existing `vertex`/`openai` extras pattern -- core install stays light):
```toml
[project.optional-dependencies]
train = [
    "torch>=2.4",
    "transformers>=4.44",
    "trl>=0.10",
    "peft>=0.12",
    "accelerate>=0.33",
    "datasets>=2.20",
]
```
`bitsandbytes` intentionally omitted from the default `train` extra (only needed for the QLoRA fallback, not v1). Installed only on the B200 cluster via `pip install -e ".[train]"` -- never required for the existing fixture test suite.

## 4. Training script structure

New file: `research/pck_feedback/src/pck_feedback/training/train_sft.py`
- `TrainingConfig` dataclass + `TrainingConfig.from_yaml(path)`, mirroring [`models/run_config.py`](research/pck_feedback/src/pck_feedback/models/run_config.py)'s pattern.
- Heavy ML imports (`torch`, `transformers`, `trl`, `peft`, `datasets`) done lazily inside the training function only -- same lazy-import pattern already used by `models/vertex_gemini.py` / `models/openai_compatible.py` -- so core install/tests are unaffected.
- Steps: load `train.jsonl`/`val.jsonl` via `datasets.load_dataset("json", data_files=...)` (already in the `messages` conversational format `build_sft_dataset.py` produces) -> load base model + tokenizer -> build `peft.LoraConfig` from config -> build `trl.SFTConfig`/`TrainingArguments` (no packing, completion-only loss masking on the assistant turn) -> `trl.SFTTrainer(...).train()` -> save adapter + tokenizer to `output_dir` -> write a `training_manifest.json` (config used, git sha, dataset paths + row counts + hashes, base model, final train/eval loss, wall-clock time) alongside the checkpoint, in the same spirit as `build_sft_dataset.py`'s `split_manifest.json`.
- Wire as `pck-research train-sft --config config/training/sft_baseline_v1.yaml` in [cli/main.py](research/pck_feedback/src/pck_feedback/cli/main.py), consistent with every other stage.
- No packing (`packing: false`): dataset is small enough that padding waste is negligible, and it avoids mixing unrelated conversations' context in one packed sequence.

## 5. Training config YAML structure

New file: `research/pck_feedback/config/training/sft_baseline_v1.yaml`
```yaml
run_id: sft_baseline_v1
base_model: Qwen/Qwen2.5-7B-Instruct
output_dir: data/training/checkpoints/sft_baseline_v1

train_dataset: data/training/sft/baseline_v1_text_only/train.jsonl
val_dataset: data/training/sft/baseline_v1_text_only/val.jsonl

max_seq_length: 8192
method: lora   # lora | qlora | full -- v1 uses lora

lora:
  r: 16
  alpha: 32
  dropout: 0.05
  target_modules: ["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"]

training:
  num_train_epochs: 3
  per_device_train_batch_size: 1
  gradient_accumulation_steps: 8
  learning_rate: 2.0e-4
  lr_scheduler_type: cosine
  warmup_ratio: 0.03
  bf16: true
  gradient_checkpointing: true
  packing: false
  completion_only_loss: true
  eval_strategy: epoch
  save_strategy: epoch
  save_total_limit: 3
  load_best_model_at_end: true
  logging_steps: 5
  seed: 42
```

## 6. Output/checkpoint folder structure

Everything under `data/` (already git-ignored, matches the existing `data/processed/`, `data/predictions/`, `data/training/sft/` convention):
```
data/training/checkpoints/sft_baseline_v1/
  adapter_model.safetensors
  adapter_config.json
  tokenizer.json / tokenizer_config.json / ...
  trainer_state.json
  training_manifest.json     # config + git sha + dataset hashes + final metrics
  checkpoint-*/               # intermediate epoch checkpoints (up to save_total_limit)
```

## 7. Running training on the B200 cluster

1. On the cluster: clone/pull the `research-pck-pipeline` branch, `cd research/pck_feedback`, create a venv, `pip install -e ".[train]"`.
2. Since `data/` is git-ignored, `scp`/`rsync` the built `data/training/sft/baseline_v1_text_only/{train,val}.jsonl` (and `data/processed/test_set_v1.jsonl` for the later eval step) from this machine to the cluster.
3. Verify the cluster's PyTorch/CUDA build actually supports B200 (Blackwell, compute capability 10.0) -- this typically requires `torch>=2.4` with CUDA 12.4+; many clusters provide a ready-made container/module for this. Confirm with `python -c "import torch; print(torch.cuda.get_device_name(0))"` before submitting a real job.
4. Single-GPU first run (dataset is tiny -- no need for multi-GPU/FSDP/DeepSpeed complexity):
   ```bash
   accelerate launch --num_processes 1 -m pck_feedback.training.train_sft --config config/training/sft_baseline_v1.yaml
   ```
   (or via the cluster's job scheduler, e.g. an sbatch script wrapping the same command).
5. Recommended first smoke test before the full run: a truncated config (`--max-steps 5` or a config override) to confirm the script runs end-to-end on B200 hardware without wasting a full training budget on a config bug.

## 8. Running inference with the fine-tuned model

No new inference code is needed -- [`config/runs/baseline_openai_compat.yaml`](research/pck_feedback/config/runs/baseline_openai_compat.yaml) already documents exactly this "future local/GPU-hosted model" case, and `OpenAICompatibleAdapter` ([research/pck_feedback/src/pck_feedback/models/openai_compatible.py](research/pck_feedback/src/pck_feedback/models/openai_compatible.py)) already supports pointing `base_url` at any local OpenAI-compatible server.

1. Serve the fine-tuned model behind vLLM's OpenAI-compatible server on the B200, using native LoRA serving (avoids a separate merge step):
   ```bash
   vllm serve Qwen/Qwen2.5-7B-Instruct \
     --enable-lora --lora-modules sft_baseline_v1=data/training/checkpoints/sft_baseline_v1 \
     --port 8000
   ```
2. Add a new run config `config/runs/sft_baseline_v1_vllm.yaml` (copy of `baseline_openai_compat.yaml` with `model_name: sft_baseline_v1`, same `prompt_version: baseline_v1`).
3. Point `PCK_RESEARCH_OPENAI_BASE_URL` at the vLLM server (e.g. `http://localhost:8000/v1`, or the cluster's internal address) and run:
   ```bash
   pck-research infer --run-config config/runs/sft_baseline_v1_vllm.yaml \
     --dataset data/processed/test_set_v1.jsonl \
     --out data/predictions/sft_baseline_v1/predictions.jsonl
   ```

## 9. Evaluating against `test_set_v1.jsonl`

Also zero new code -- reuse the existing `evaluate` command exactly as for the two Gemini baselines:
```bash
pck-research evaluate \
  --dataset data/processed/test_set_v1.jsonl \
  --predictions data/predictions/sft_baseline_v1/predictions.jsonl \
  --out data/eval/sft_baseline_v1/metrics.json \
  --errors-out data/eval/sft_baseline_v1/errors.jsonl
```
Then compare `metrics.json` against the two existing baseline reports (`baseline_gemini_text_only`, `baseline_gemini_with_board_images`) using the same comparison methodology already used for those two.

## 10. Risks

- **Tiny dataset (428 train / 78 val)**: high overfitting risk for a 7-8B model even with LoRA; mitigate with few epochs (2-3), `load_best_model_at_end` on eval loss, low LoRA rank, and close monitoring of train/eval loss divergence.
- **Long prompts (~6-7K tokens) dominated by static rubric text**: completion-only loss masking (assistant-turn-only) avoids wasting capacity on the boilerplate, but confirm the actual tokenizer's token counts before committing `max_seq_length` (chosen 8192 is a safety margin, not a measured value).
- **Small, unrepresentative validation set (78 examples / 4 conversations)**: eval loss/metrics during training will be noisy -- treat as a rough signal, not a precise one, same caveat already noted for `test_set_v1.jsonl`'s small size (71 turns / 5 conversations) in the baseline eval.
- **Annotator imbalance (373 vs 82 examples project-wide)**: the model will disproportionately learn the majority annotator's style/thresholds; document this as a known limitation of this first SFT pass.
- **B200/Blackwell software support**: must confirm the cluster's torch/CUDA build actually supports compute capability 10.0 before submitting a real job -- flagged explicitly as a pre-flight check in step 7.
- **Base model Hebrew/JSON reliability is unverified pre-fine-tuning**: worth a very quick zero-shot sanity check (2-3 prompts) on the chosen base model before investing in a full training run.

## 11. Minimal first implementation steps

1. Add the `train` optional extra to `pyproject.toml`.
2. Add `config/training/sft_baseline_v1.yaml`.
3. Implement `src/pck_feedback/training/train_sft.py` (`TrainingConfig` + LoRA/TRL training loop + `training_manifest.json` output).
4. Wire `pck-research train-sft` into `cli/main.py`.
5. Add `config/runs/sft_baseline_v1_vllm.yaml` (serving config, no new adapter code).
6. Document the B200 cluster workflow (data transfer, `vllm serve` command, env vars) in `src/pck_feedback/training/README.md`.
7. (User, on the cluster) Run the smoke test, then the full training run, then serve + `infer` + `evaluate` against `test_set_v1.jsonl`, then compare against the two existing Gemini baseline reports.

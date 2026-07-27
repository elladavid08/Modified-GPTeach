# Training / Fine-tuning / DPO

## What's implemented here so far

- **SFT dataset build** (`build_sft_dataset.py`, wired as
  `pck-research build-sft-dataset`): converts an already-built individual-
  annotator train JSONL (`dataset/build_train_dataset.py`'s output) into
  HuggingFace/TRL-ready `messages`-format `train.jsonl` / `val.jsonl`, using
  the exact same prompt builder as inference for the user turn and the
  annotator's own label (re-serialized into the `Prediction`-shaped strict
  JSON) as the assistant target. Splits by `conversation_id` (group-based,
  leak-safe) and hard-fails if any held-out consensus/test conversation is
  present in the input. This stage never calls a model API, never connects
  to Firestore, and never trains anything -- it is a dataset reshape only.

- **SFT LoRA training** (`train_sft.py`, wired as `pck-research train-sft`):
  fine-tunes an open base model (default: Qwen2.5-7B-Instruct) with LoRA on
  the SFT dataset above. Requires the `train` extra
  (`pip install -e ".[train]"` -- torch/transformers/trl/peft/accelerate/
  datasets) and a GPU host; **never invoked automatically** by any other
  command, and never called by the fixture-based test suite. See "Running
  on the B200 cluster" below for the full step-by-step workflow.

## Why LoRA (not full fine-tuning or QLoRA) for `sft_baseline_v1`

The train set has ~430 examples across ~4-6 annotated conversations -- small
enough that full fine-tuning of a 7B model would very likely overfit and
also has no real memory-budget benefit on a B200 (180GB+ HBM comfortably
fits a 7B model's full-fine-tune optimizer states). QLoRA's quantization
exists to fit large models into small GPUs; the B200 doesn't need that
trade-off for a 7B model, so plain (non-quantized) LoRA gives the best
accuracy/simplicity balance for this first run. `method: full` / `method:
qlora` are reserved in the config schema (`TrainingConfig.method`) but not
implemented yet -- `run_training()` raises `NotImplementedError` if
selected.

## Two things enforced at training time, not just documented

1. **Completion-only loss.** The user prompt (the long rubric + conversation
   history) never contributes to the training loss -- only the assistant's
   JSON completion does. This is enforced by an explicit custom data
   collator (`build_completion_only_collator`), built on two small, pure,
   dependency-free functions (`find_response_start_index`,
   `mask_prompt_tokens`) that are unit-tested in `tests/test_train_sft.py`
   with a fake tokenizer -- no torch/transformers needed to verify the
   masking logic itself.
2. **No silent truncation.** Before any model is loaded, `run_training()`
   tokenizes every train/val example with the *real* base-model tokenizer
   and reports max/avg token length and how many examples exceed
   `max_seq_length` (`run_length_preflight` / `measure_sequence_lengths`).
   If any example is too long, training refuses to start
   (`on_overlong_sequence: fail`, the default) unless the config explicitly
   opts into `on_overlong_sequence: drop`, which excludes (never truncates)
   the offending examples and records exactly which ones in
   `training_manifest.json`.

## Running on the B200 cluster

All commands below are run from `research/pck_feedback/` on the GPU host.

### 0. Install dependencies (GPU host only)

```bash
python -m venv .venv && source .venv/bin/activate
pip install -e ".[train]"
```

This installs torch/transformers/trl/peft/accelerate/datasets. It does
**not** install vLLM -- see "Serving a trained model with vLLM" below for
why and how to install that separately.

### 1. Copy over the SFT dataset (and, for comparison, the test set)

Copy from your workstation (or re-run `build-sft-dataset` on the cluster if
you also copy `data/raw/` and `data/processed/train_individual_annotations_v1.jsonl`):

- `data/training/sft/baseline_v1_text_only/train.jsonl`
- `data/training/sft/baseline_v1_text_only/val.jsonl`
- `data/processed/test_set_v1.jsonl` (needed later, for evaluation)

### 2. Preflight: measure real tokenized lengths (no GPU needed, seconds to run)

```bash
pck-research train-sft \
  --config config/training/sft_baseline_v1.yaml \
  --preflight-only
```

This loads only the tokenizer (not the model), reports max/avg token
length per split, and exits. If it reports any example exceeding
`max_seq_length` it raises immediately -- re-check `max_seq_length` in the
config, or explicitly set `on_overlong_sequence: drop`, before continuing.

### 3. Smoke test (a few minutes, confirms the whole pipeline runs)

```bash
pck-research train-sft --config config/training/sft_baseline_v1_smoke.yaml
```

Runs only 5 optimizer steps (see `training.max_steps: 5` in that config)
and writes to a separate `data/training/checkpoints/sft_baseline_v1_smoke/`
so it can never be confused with a real checkpoint. Confirms: dependencies
are installed correctly, the dataset loads and tokenizes, the
completion-only collator runs without shape errors, an eval/save step
succeeds, and `training_manifest.json` is written.

Alternatively, smoke-test the real config directly without a separate file:

```bash
pck-research train-sft --config config/training/sft_baseline_v1.yaml --max-steps 5
```

(`--max-steps` overrides `training.max_steps` for one run only; it does not
edit the YAML file, and it still writes to `sft_baseline_v1`'s real
`output_dir` -- prefer the dedicated smoke config above to avoid polluting
the real checkpoint directory.)

### 4. Full training run

```bash
pck-research train-sft --config config/training/sft_baseline_v1.yaml
```

Writes the LoRA adapter + tokenizer to
`data/training/checkpoints/sft_baseline_v1/`, plus
`training_manifest.json` recording the base model, LoRA/training
hyperparameters, the length-preflight results, and the final train loss --
copy this whole directory back for evaluation/serving.

## Serving a trained model with vLLM

`pip install -e ".[train]"` deliberately does **not** install vLLM --
vLLM's own dependency pins (CUDA/torch versions, etc.) are best kept
independent of the training extra, and vLLM is only needed at *inference*
time, typically in a separate process/container from training. Choose one:

- **Install vLLM directly** on the same host/venv (or a fresh one) once
  training is done:

  ```bash
  pip install vllm
  ```

  (Check the [vLLM installation docs](https://docs.vllm.ai/) for the CUDA/
  torch version matrix appropriate for the B200/Blackwell driver stack --
  pin an explicit version if the cluster provides one.)

- **Use a cluster/container module**, if the B200 cluster provides a
  pre-built vLLM container or environment module -- prefer that over a
  fresh pip install if available, since it will already be matched to the
  cluster's CUDA driver.

Then serve the LoRA adapter (no merge-into-base-model step needed):

```bash
vllm serve Qwen/Qwen2.5-7B-Instruct \
  --enable-lora \
  --lora-modules sft_baseline_v1=data/training/checkpoints/sft_baseline_v1 \
  --port 8000
```

**Critical:** the run config's `model_name` (see
`config/runs/sft_baseline_v1_vllm.yaml`) must exactly match the name given
after `=` in `--lora-modules` above -- if it doesn't match, vLLM will
silently serve the base model instead of the fine-tuned adapter. Point
`PCK_RESEARCH_OPENAI_BASE_URL` (see `../../.env.example`) at
`http://localhost:8000/v1` (or wherever the server is reachable from),
then run inference exactly like any other run config:

```bash
pck-research infer \
  --run-config config/runs/sft_baseline_v1_vllm.yaml \
  --dataset data/processed/test_set_v1.jsonl \
  --out data/predictions/sft_baseline_v1/predictions.jsonl
```

## Comparing three baselines on the same test set

1. **Gemini prompt baseline** -- already run, see
   `config/runs/baseline_gemini_text_only.yaml`.
2. **Qwen2.5-7B-Instruct, prompt-only (no fine-tuning)** -- serve the base
   model with vLLM (`vllm serve Qwen/Qwen2.5-7B-Instruct --port 8000`, no
   `--enable-lora` needed) and run inference with
   `config/runs/qwen2_5_7b_base_vllm.yaml`. This isolates how much of any
   improvement comes from fine-tuning vs. just using a different base model.
3. **Qwen2.5-7B-Instruct + SFT LoRA** -- serve as described above with
   `config/runs/sft_baseline_v1_vllm.yaml`.

Evaluate each the same way, against the same 5-conversation consensus test
set:

```bash
pck-research evaluate \
  --dataset data/processed/test_set_v1.jsonl \
  --predictions data/predictions/<run>/predictions.jsonl \
  --out data/predictions/<run>/metrics.json
```

## Risks to watch for on this first run

- **Tiny dataset (~430 examples, ~4-6 conversations):** high overfitting
  risk, especially over 3 epochs -- watch `eval_loss` in
  `training_manifest.json`'s logs; consider fewer epochs or a lower
  learning rate if val loss starts rising while train loss keeps dropping.
- **Small validation split:** with only a handful of held-out
  conversations, validation metrics will be noisy -- don't over-index on
  small deltas.
- **Annotator imbalance:** the train/val split (seed=10, see
  `data/training/sft/baseline_v1_text_only/split_manifest.json`) was chosen
  specifically to include at least one minority-annotator conversation in
  validation, but the training set itself is still majority-annotator-
  heavy -- the model may skew toward that annotator's labeling style.
- **Long prompts:** the rubric + conversation-history prompt is long
  relative to the assistant's JSON completion -- this is exactly why
  completion-only loss (above) matters; without it, the model would mostly
  learn to imitate prompt boilerplate rather than the labeling task.

## What is still NOT implemented (out of scope until explicitly requested)

- `method: qlora` / `method: full` (only `method: lora` is implemented).
- Preference-based training (e.g. DPO) once enough comparison data between
  model outputs exists.
- Any automation that runs training/serving/evaluation end-to-end without
  manual, explicit steps -- every stage above is a separate, manually
  invoked command, on purpose.

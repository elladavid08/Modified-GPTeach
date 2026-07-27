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

## What is still NOT implemented (out of scope until explicitly requested)

- Actually running supervised fine-tuning (no `transformers`/`trl` training
  loop, no GPU job, no model checkpoints produced anywhere in this repo).
- Preference-based training (e.g. DPO) once enough comparison data between
  model outputs exists.
- Serving a fine-tuned checkpoint behind an OpenAI-compatible endpoint
  (vLLM/TGI) so it can be evaluated with the exact same
  `models/openai_compatible.py` adapter used for the API baselines --
  no separate adapter code needed for "local" vs. "API" models.

## Explicit scope note

Per the project plan: "Do not train yet. Do not run GPU jobs yet." Only the
SFT dataset-build stage above is implemented; the actual training script is
a future, separately-planned stage.

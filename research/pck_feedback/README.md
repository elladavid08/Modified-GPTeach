# PCK Feedback Research Pipeline

Offline research pipeline for **PCK (Pedagogical Content Knowledge) feedback**
modeling and evaluation, run entirely outside of the production website on
already-completed teacher-simulation conversations.

This is stage 1: **export -> dataset build -> baseline inference**. Evaluation
and fine-tuning/DPO are explicitly out of scope for now (see `src/pck_feedback/eval/README.md`
and `src/pck_feedback/training/README.md`).

## Isolation from the production website

- This directory (`research/pck_feedback/`) is a **separate Python codebase**.
  It imports nothing from `src/` or `server/`, and nothing in `src/`/`server/`
  imports from here.
- It has its **own virtualenv and dependencies** (`pyproject.toml` in this
  directory) -- it does not touch the root `package.json` or `server/package.json`.
- It **never writes to Firestore**. Export and inference are read-only against
  Firestore and write only to local files under `data/` (git-ignored).
- Credentials are supplied via **dedicated environment variables** (see
  `.env.example`) -- this pipeline does not default to reusing
  `server/service-account-key.json`. Use a read-only IAM service account for
  the export step if possible.
- Nothing here changes any existing route, page, or server behavior in the
  production app.

## What's implemented so far (stage 1)

1. **Export** (`pck-research export`) -- pulls `conversations`,
   `conversationAnnotationAssignments`, `conversationAnnotations`,
   `conversationConsensusAnnotations`, and `annotationComparisonSets` from
   Firestore into byte-faithful local JSON files under `data/raw/`.
2. **Dataset build** (`pck-research build-dataset`) -- turns raw exports into
   a turn-level JSONL dataset (`data/processed/turn_examples.jsonl`), one
   example per teacher turn, joined with consensus-annotation ground truth
   where available.
3. **Inference** (`pck-research infer`) -- runs a configurable baseline PCK
   feedback model (Vertex/Gemini or an OpenAI-compatible endpoint, e.g. for a
   future local/GPU-hosted model) over the dataset and writes standardized
   predictions to `data/predictions/<run_id>/predictions.jsonl`.

## Setup

```bash
cd research/pck_feedback
python3 -m venv .venv
source .venv/bin/activate

# Core deps only (schemas, prompt builder, dataset build, CLI, tests):
pip install -e ".[dev]"

# Add extras when you're ready to actually run export/inference:
pip install -e ".[firestore]"   # Firestore export
pip install -e ".[vertex]"      # Vertex AI / Gemini adapter
pip install -e ".[openai]"      # OpenAI-compatible adapter (OpenAI, vLLM, TGI, ...)
# or all at once:
pip install -e ".[all]"

cp .env.example .env
# then edit .env with your own credentials -- see comments in that file.
```

## Running the unit tests (no credentials / network required)

```bash
source .venv/bin/activate
pytest
```

All tests run against local fixture files under `tests/fixtures/` and never
touch Firestore, Vertex AI, or any other external API.

## CLI usage (once you have credentials configured)

```bash
# 1. Export raw data from Firestore (read-only).
pck-research export --config config/export.yaml

# 2. Extract board-drawing images to PNG files (additive, does not touch data/raw/*.json).
pck-research extract-images --raw-dir data/raw

# 3. Build the turn-level dataset.
pck-research build-dataset --raw-dir data/raw --out data/processed/turn_examples.jsonl

# ... or build the first eval-ready test set from completed consensus conversations only:
pck-research build-dataset --raw-dir data/raw --only-completed-consensus \
  --out data/processed/test_set_v1.jsonl

# 4. Run baseline inference.
pck-research infer --run-config config/runs/baseline_gemini_text_only.yaml \
  --dataset data/processed/test_set_v1.jsonl \
  --out data/predictions/baseline_gemini_text_only/predictions.jsonl

# Re-running the same `infer` command resumes/skips (run_id, example_id) pairs
# already present in --out -- safe after an API timeout or partial run.

# 5. Evaluation is not implemented yet.
pck-research evaluate   # prints a "not implemented yet" message and exits.
```

## Folder structure

```
research/pck_feedback/
  config/                    # export + run configs (no secrets -- only env var *names*)
  src/pck_feedback/
    schemas/                 # raw export / turn example / prediction pydantic models
    pck_skills.py            # p1-p5 rubrics ported from server/universal_pck_skills.js + RUBRIC_VERSION
    firestore_client.py      # read-only Firestore client init
    export/                  # Firestore -> data/raw/*.json, image extraction
    dataset/                 # data/raw/ -> turn_examples.jsonl
    prompts/                 # baseline prompt builder + versioned registry
    models/                  # ModelAdapter interface + Vertex/Gemini + OpenAI-compatible adapters
    inference/               # response parsing + run_inference.py (resume-safe)
    eval/                    # NOT IMPLEMENTED YET (stub)
    training/                # NOT IMPLEMENTED YET, explicitly out of scope for now (stub)
    cli/                     # `pck-research` command entrypoint
  data/                      # git-ignored; created at runtime by the CLI
  tests/                     # fixture-based unit tests (no network/credentials)
```

## Design notes worth knowing before extending this pipeline

- **`conversation_id` vs `session_id`**: always join on `conversation_id`
  (the Firestore document ID). `session_id` (the conversation document's own
  `sessionId` field) is carried through for traceability only. See
  `schemas/turn_example.py` for why these are kept separate.
- **Ground truth is explicit, never inferred as null per-turn**: if a
  conversation has a *completed* consensus annotation, every teacher turn in
  it gets a `ground_truth` -- turns absent from the consensus
  `feedbackPoints` get an explicit negative label
  (`has_feedback: false`, all dimensions `included: false`), not `null`.
  `ground_truth = null` means only "this conversation has no completed
  consensus at all". See `schemas/turn_example.py::GroundTruth`.
- **Raw exports are byte-faithful to Firestore**, including inline base64
  board images. Image extraction to PNG files is additive and never mutates
  `data/raw/`.
- **Rubric vs. prompt versioning**: `pck_skills.RUBRIC_VERSION` and a
  prompt's `prompt_version` are independent axes, both stamped on every
  `Prediction`, so future experiments can tell "the rubric changed" apart
  from "the prompt wording changed".
- **Baseline prompt is not a byte-for-byte reproduction of production**: it
  reuses the same rubric text and structure as
  `server/universal_pck_skills.js` / `server/server.js`, but standardizes on
  `p1`-`p5` labels and optionally adds student-info / board-image context
  that the live app's PCK call does not currently use.

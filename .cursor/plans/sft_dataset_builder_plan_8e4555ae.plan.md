---
name: SFT dataset builder plan
overview: Add a new, isolated `pck-research build-sft-dataset` stage that converts the already-built `train_individual_annotations_v1.jsonl` (individual-annotator train examples) into HuggingFace/TRL-ready SFT `messages` JSONL files, reusing the exact inference prompt builder for inputs and a strict-JSON gold target derived from each annotator's label, with a group-based train/val split. No training, no GPU, no production code changes.
todos:
  - id: schema
    content: Add training/sft_schema.py (pydantic schema for one SFT output row)
    status: pending
  - id: builder
    content: "Add training/build_sft_dataset.py: TrainExample->prompt view, target JSON construction, consensus-exclusion safety check, group-based split, diagnostics"
    status: pending
  - id: cli
    content: Wire `pck-research build-sft-dataset` command into cli/main.py
    status: pending
  - id: tests
    content: Add fixture-based tests/test_build_sft_dataset.py (parity, round-trip, exclusion guard, split determinism/disjointness)
    status: pending
  - id: run
    content: Run build-sft-dataset on train_individual_annotations_v1.jsonl and report resulting stats to the user
    status: pending
isProject: false
---


# Plan: SFT dataset builder for PCK feedback (`train_individual_annotations_v1.jsonl` -> `data/training/sft/{train,val}.jsonl`)

## Scope guardrails (explicit)
- No model training, no GPU jobs, no calls to `trl`/`transformers` training APIs.
- No changes outside `research/pck_feedback/` (production app untouched).
- Input is the **already-built** `data/processed/train_individual_annotations_v1.jsonl` -- this stage does **not** re-run export, `build-train-dataset`, or touch Firestore.
- Hard safety check: the 5 completed-consensus conversations (from `data/processed/test_set_v1.jsonl`) must never appear in the SFT output; `build-train-dataset` already excludes them (verified: zero overlap today, 40 train conversations / 5 test conversations), but the new builder will re-assert this itself rather than trusting it silently.

## Current data shape (verified by inspection, read-only)
- `data/processed/train_individual_annotations_v1.jsonl`: 506 `TrainExample` rows, 40 unique `conversation_id`s, 40 unique `assignment_id`s (1:1 today -- no conversation currently has 2 annotators, though the schema/code must not assume that stays true), 2 annotators (34 vs 6 assignments -- heavily skewed), 373 positive (`has_feedback=true`) / 133 negative turns (73.8% / 26.2%), 44 rows with a `board_image_path`.
- Schema: [research/pck_feedback/src/pck_feedback/schemas/train_example.py](research/pck_feedback/src/pck_feedback/schemas/train_example.py) (`TrainExample` / `AnnotatorLabel`) -- same per-dimension shape as `GroundTruthDimension`, always has all 5 dims populated (never partially missing).

## 1. Reuse the exact inference input construction (no prompt duplication)

`build_prompt()` in [research/pck_feedback/src/pck_feedback/prompts/registry.py](research/pck_feedback/src/pck_feedback/prompts/registry.py) takes a `TurnExample`-shaped object with fields `scenario`, `student_info`, `conversation_history`, `teacher_message`, `board_image_path` -- `TrainExample` has all of these already. Add a small adapter:

```python
def _train_example_to_turn_view(ex: TrainExample) -> TurnExample:
    return TurnExample(
        example_id=ex.example_id,
        conversation_id=ex.conversation_id,
        session_id=ex.session_id,
        turn_number=ex.turn_number,
        scenario=ex.scenario,
        student_info=ex.student_info,
        conversation_history=ex.conversation_history,
        teacher_message=ex.teacher_message,
        board_image_path=ex.board_image_path,
        ground_truth=None,   # never read by the prompt builder anyway
        source=ex.source,
    )
```

Then call `build_prompt(run_config.prompt_version, view, include_student_info=..., include_board_images=..., raw_dir=...)` -- byte-for-byte the same builder `render-prompt` and `infer` use. This is driven by an **existing run config YAML** (default `config/runs/baseline_gemini_text_only.yaml`) so the SFT input distribution is guaranteed to match a specific, named inference recipe (prompt_version, include_student_info, include_board_images), exactly like `render-prompt`/`infer` already do in [research/pck_feedback/src/pck_feedback/cli/main.py](research/pck_feedback/src/pck_feedback/cli/main.py).

- `--raw-dir` is only needed to resolve whether the "Attached Board Image" instruction paragraph is rendered (mirrors `include_board_images` behavior exactly); the SFT JSONL never inlines image bytes -- only the existing `board_image_path` string is kept as a metadata reference, matching the user's "optional board image reference if available" wording.
- Default recipe: `baseline_gemini_text_only.yaml` (text-only, closest to production) since the initial SFT target is a text LLM, not a VLM.

## 2. Gold target construction (strict JSON, same schema as `Prediction`)

Map `TrainExample.label` (an `AnnotatorLabel`) into the exact JSON shape described in `_output_schema_instructions()` in [research/pck_feedback/src/pck_feedback/prompts/baseline_prompt.py](research/pck_feedback/src/pck_feedback/prompts/baseline_prompt.py):

```json
{
  "should_provide_feedback": true,
  "dimensions": {
    "p1": {"relevant": false, "score": null, "feedback_text": null},
    "p4": {"relevant": true, "score": 1, "feedback_text": "..."}
  },
  "feedback_text_overall": null
}
```
- `should_provide_feedback` <- `label.has_feedback`; `dimensions[d].relevant` <- `dimensions[d].included`; `score`/`feedback_text` copied only when `included=true` (else forced to `null`, consistent with the normalization rule already agreed for eval).
- **Design decision needing confirmation**: `feedback_text_overall` has no equivalent field in annotator data (only per-dimension text exists) -- default to always `null` in gold targets (faithful to what annotators actually recorded, no synthesized summary invented). Flagged as a question below.
- Serialize with `json.dumps(target, ensure_ascii=False, indent=2)` (matches the pretty style shown in the prompt's own schema example), no markdown fences -- consistent with what the model is asked to produce at inference time.
- A round-trip test will assert `parse_model_response()` on this exact string reconstructs the same dimensions (using the existing parser as a consistency check, without depending on it at runtime).

## 3. New files (all under `research/pck_feedback/`, isolated)

- `src/pck_feedback/training/build_sft_dataset.py` -- core logic: load `TrainExample` rows, build prompt via `_train_example_to_turn_view` + `build_prompt`, build gold target JSON, assemble one `messages`-format record per row, apply the consensus-exclusion safety check, perform the group-based split, write `train.jsonl` / `val.jsonl` / a `split_manifest.json`.
- `src/pck_feedback/training/sft_schema.py` -- pydantic model for one output row (see format below), for validation before writing.
- CLI command in [research/pck_feedback/src/pck_feedback/cli/main.py](research/pck_feedback/src/pck_feedback/cli/main.py):
```
pck-research build-sft-dataset \
  --run-config config/runs/baseline_gemini_text_only.yaml \
  --input data/processed/train_individual_annotations_v1.jsonl \
  --raw-dir data/raw \
  --out-dir data/training/sft \
  --val-fraction 0.15 \
  --seed 42
```
- Tests: `tests/test_build_sft_dataset.py`, fixture-based (reusing `tests/fixtures/raw/...` the same way `test_build_train_dataset.py` does), covering: schema validity, prompt-text parity with `build_prompt()` output, target round-trips through `parse_model_response`, consensus-conversation exclusion (including a deliberately "poisoned" fixture row to prove the safety check fires), group-disjointness of the split, and determinism given a fixed seed.

## 4. Output record format (one JSON object per line)

```json
{
  "example_id": "07wCy2ezYtSjb7aZL1ZQ__2",
  "messages": [
    {"role": "user", "content": "<full built prompt text, identical to inference>"},
    {"role": "assistant", "content": "<strict JSON target string>"}
  ],
  "metadata": {
    "conversation_id": "session_...",
    "session_id": "session_...",
    "turn_number": 2,
    "assignment_id": "07wCy2ezYtSjb7aZL1ZQ",
    "annotator_id": "PBdkrLbEhuhlL8swM87kak3tomu2",
    "assignment_type": "production",
    "prompt_version": "baseline_v1",
    "rubric_version": "<pck_skills.RUBRIC_VERSION>",
    "run_config": "baseline_gemini_text_only.yaml",
    "include_student_info": false,
    "include_board_images": false,
    "board_image_path": null,
    "has_feedback": true,
    "split": "train"
  }
}
```
No system message (mirrors both adapters today, which send the whole built prompt as a single `user` message -- see [research/pck_feedback/src/pck_feedback/models/openai_compatible.py](research/pck_feedback/src/pck_feedback/models/openai_compatible.py) lines 71-82).

## 5. Negative examples & class balance strategy

- This is generative SFT (every turn already supervises all 5 dimensions' relevant/score/text, not just a single class label), so "negative" turns (133/506, 26.2%) are high-value: they are exactly the signal needed to correct the baseline's over-triggering behavior found in evaluation. **Default: keep the natural ratio, do not down/up-sample.**
- The build script will print a diagnostic summary (pos/neg counts, per-dimension included-rate, per-dimension score histogram) for both the full set and each split, so skew is visible before training rather than silently baked in.
- Leave an optional (unused-by-default) `--max-pos-neg-ratio` knob reserved for a future run if the trained model still over-triggers after a first SFT pass -- not applied now.

## 6. Train/validation split strategy

- **Group key: `conversation_id`** (a superset-safe choice over `assignment_id` -- they're 1:1 today, but grouping by conversation guarantees that if a conversation is ever multiply-annotated in a future export, all of its annotator variants stay on the same side of the split, since they share overlapping context).
- Seeded (`--seed`, default 42) shuffle of the 40 conversation groups, then split ~85/15 (`--val-fraction`, default 0.15) by group count with a greedy fill to keep example counts (not just group counts) close to the target ratio, since group sizes range 5-43 turns.
- Also report (not enforce) the annotator split (34 vs 6 assignments) and pos/neg ratio per split in the manifest, so the small/skewed val set's composition is transparent.
- Hard assertion: no `conversation_id` used for the split may equal any `conversation_id` present in `data/processed/test_set_v1.jsonl` -- raises a clear error rather than silently proceeding if violated.
- `data/training/sft/split_manifest.json` records: seed, val_fraction, per-split conversation_id lists, example/pos/neg counts per split, source input file path + row count, confirmation of the consensus-exclusion check.

## 7. Output files
- `data/training/sft/train.jsonl`
- `data/training/sft/val.jsonl`
- `data/training/sft/split_manifest.json` (reproducibility/audit trail, same spirit as `export_manifest.json`)

## 8. HuggingFace / TRL format notes (for the future training stage, not implemented now)
- `messages`-format JSONL loads directly via `datasets.load_dataset("json", data_files=...)` and is auto-detected as "conversational" by `trl.SFTTrainer`, which will apply the target model's chat template automatically -- this is the least glue code for B200 training later.
- Important reminder to carry into the (future, separate) training plan: enable TRL's completion-only loss masking (train only on the assistant turn, not the long rubric-heavy user prompt) -- otherwise the model wastes capacity fitting deterministic prompt text. This is a training-time config flag, not a dataset-format concern, so it doesn't change anything built here.
- `prompt`/`completion` TRL format is trivially derivable from `messages` at load time (`messages[:-1]` / `messages[-1:]`) if a future trainer prefers explicit separation -- not duplicated in the file itself, to avoid redundant fields.

## Open question before implementing
`feedback_text_overall` has no annotator-authored equivalent -- plan defaults to always `null` in gold targets rather than synthesizing a summary from per-dimension texts.

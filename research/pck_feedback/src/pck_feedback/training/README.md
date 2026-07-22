# Training / Fine-tuning / DPO -- NOT IMPLEMENTED, OUT OF SCOPE FOR NOW

This module is a placeholder only. There is no training or DPO logic in
this repository, and none should be added until explicitly requested and
planned separately.

## What this will eventually cover (future stage, not now)

- Supervised fine-tuning of a local/GPU-hosted model on turn-level examples
  with consensus ground truth, using the same `TurnExample` /
  `Prediction` schemas as the baseline inference stage.
- Preference-based training (e.g. DPO) once enough comparison data between
  model outputs exists.
- Serving a fine-tuned checkpoint behind an OpenAI-compatible endpoint
  (vLLM/TGI) so it can be evaluated with the exact same
  `models/openai_compatible.py` adapter used for the API baselines --
  no separate adapter code needed for "local" vs. "API" models.

## Explicit scope note

Per the project plan: "Do not implement training yet. Do not implement DPO
yet." This directory exists only to reserve the location in the folder
structure for later.

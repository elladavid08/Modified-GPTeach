"""
PCK Feedback Research Pipeline
==============================

Offline research pipeline for exporting completed teacher-simulation
conversations, building a turn-level dataset, and running PCK feedback
models offline for evaluation / future fine-tuning.

This package is fully isolated from the production RAMBAM-sim website:
it is a separate Python codebase, imports nothing from `src/` or `server/`,
and never writes to Firestore.
"""

__version__ = "0.1.0"

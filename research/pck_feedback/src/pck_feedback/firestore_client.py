"""
Read-only Firestore client initialization.

Deliberately isolated from the production server's Firebase Admin init
(`server/services/firebaseAdmin.js`): this pipeline uses its own dedicated
environment variables (see `.env.example`) and never defaults to the
production `server/service-account-key.json` path. This means a research
run cannot accidentally pick up production write-capable credentials just
because they happen to be present on the machine.

CONVENTION (enforced by code review, not by the SDK): every call site in
this package that touches Firestore must only ever call read methods
(`.get()`, `.stream()`, `.where(...)`) on collections/documents. Nothing in
this pipeline should ever call `.set(`, `.update(`, `.add(`, or `.delete(`
on a Firestore reference. `export/export_collections.py` is the only module
that talks to Firestore at all.

The `firebase-admin` SDK is an optional dependency (extra: `firestore`).
It is imported lazily inside `get_firestore_client()` so that importing
this module (or anything that imports it) never fails for users who have
only installed the core dependencies to run fixture-based tests.
"""

from __future__ import annotations

import os
from typing import TYPE_CHECKING

from pck_feedback.utils.logging import get_logger

if TYPE_CHECKING:
    from google.cloud.firestore import Client as FirestoreClient

logger = get_logger(__name__)

CREDENTIALS_ENV_VAR = "PCK_RESEARCH_GOOGLE_APPLICATION_CREDENTIALS"
PROJECT_ID_ENV_VAR = "PCK_RESEARCH_FIRESTORE_PROJECT_ID"

_client: "FirestoreClient | None" = None


class FirestoreConfigError(RuntimeError):
    """Raised when required Firestore credentials/config are missing."""


def get_firestore_client(*, force_new: bool = False) -> "FirestoreClient":
    """
    Lazily initialize and return a Firestore client using research-only
    credentials. Safe to call multiple times -- reuses a module-level
    singleton unless `force_new=True`.

    Raises `FirestoreConfigError` with an actionable message if the
    `firestore` extra isn't installed or required env vars are unset.
    Never called at import time anywhere in this package.
    """
    global _client
    if _client is not None and not force_new:
        return _client

    try:
        import firebase_admin
        from firebase_admin import credentials
    except ImportError as exc:  # pragma: no cover - exercised manually, not in fixture tests
        raise FirestoreConfigError(
            "firebase-admin is not installed. Install the 'firestore' extra: "
            "pip install -e '.[firestore]'"
        ) from exc

    cred_path = os.environ.get(CREDENTIALS_ENV_VAR)
    project_id = os.environ.get(PROJECT_ID_ENV_VAR)

    if not cred_path:
        raise FirestoreConfigError(
            f"Environment variable {CREDENTIALS_ENV_VAR} is not set. "
            "Copy .env.example to .env and fill in a path to a service "
            "account key with READ-ONLY Firestore permissions."
        )
    if not project_id:
        raise FirestoreConfigError(
            f"Environment variable {PROJECT_ID_ENV_VAR} is not set. "
            "Copy .env.example to .env and fill in your Firestore project ID."
        )
    if not os.path.isfile(cred_path):
        raise FirestoreConfigError(
            f"{CREDENTIALS_ENV_VAR} points to a file that does not exist: {cred_path}"
        )

    logger.info("Initializing read-only Firestore client for project=%s", project_id)

    # Use a distinct app name so this never collides with a default app
    # that some other tool/process on the same machine may have initialized.
    app_name = "pck-research-readonly"
    try:
        app = firebase_admin.get_app(app_name)
    except ValueError:
        cred = credentials.Certificate(cred_path)
        app = firebase_admin.initialize_app(cred, {"projectId": project_id}, name=app_name)

    from firebase_admin import firestore as admin_firestore

    _client = admin_firestore.client(app=app)
    return _client

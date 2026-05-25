# Repository Structure

This document describes how branches are organized in this repository.  
Update this file whenever branch strategy or branch contents change.

**Last updated:** 2026-05-25

---

## Overview

| Category | Prefix / name | Purpose |
|----------|---------------|---------|
| Production | `main` | Stable version running online |
| Baseline | `baseline/` | Frozen reference versions for comparison |
| Experiments | `feature/` | New methods or features under development |
| Archive | `archive/` | Historical snapshots kept for reference |

---

## Active Branches

### `main`

- **Role:** Current stable production branch.
- **Version:** 1.3.0 (tag: `v2026.05.25-production`)
- **Contents:** Full online deployment — service account auth, Firebase auth, PCK feedback, pre/post tests, Windows Server / IIS deployment support.
- **Deploy from:** This branch on the remote server.

### `baseline/prompt-only`

- **Role:** Frozen baseline reference — the standard prompt-only system before experimental methods (RAG, DST, etc.) are added.
- **Created from:** `main` at commit `ab0d5b9` (2026-05-25).
- **Contents:** Same as `main` at creation time. Use this branch to compare behavior against future `feature/*` branches.
- **Do not merge into:** Experimental branches should branch *from* this (or from `main` at the same point), not overwrite it.

---

## Experimental Branches (`feature/`)

Use the `feature/` prefix for each new method or capability you want to try.

**Naming convention:**

```
feature/<short-description>
```

**Examples:**

| Branch | Purpose |
|--------|---------|
| `feature/rag` | Retrieval-augmented generation for student/PCK context |
| `feature/pck-oriented-dst` | PCK-oriented Dynamic Student Teacher (DST) approach |
| `feature/dst-pck-feedback` | *(example)* Dynamic Student Teacher (DST) approach to PCK feedback |

**Workflow:**

1. Branch from `main` (or from `baseline/prompt-only` if you want a strict baseline comparison):
   ```bash
   git checkout main
   git pull origin main
   git checkout -b feature/your-experiment-name
   ```
2. Develop and test locally or on a staging environment.
3. When ready, open a pull request into `main`.
4. Add a row to the table below and update this file.

### Current `feature/` branches

| Branch | Status | Description |
|--------|--------|-------------|
| `feature/pck-oriented-dst` | Active development | PCK-oriented Dynamic Student Teacher (DST) — branched from `main` at `b337436` (2026-05-25). Current local working branch. |

---

## Archive Branches (`archive/`)

Read-only snapshots of older or experimental work. Do not deploy from these.

| Branch | Original source | Description |
|--------|-----------------|-------------|
| `archive/local-gcloud-auth` | `code-cleanup` | Last version that ran locally with `gcloud auth application-default login` (no service account JSON). Includes codebase cleanup. |
| `archive/old-codex-experiment` | `codex/find-repository-structure-and-project-details` | Early Codex-assisted exploration; not used in production. |
| `archive/old-server-deployment` | `server-deployment` | Early remote-server deployment experiments. |

---

## Temporary Branches

| Branch | Status | Notes |
|--------|--------|-------|
| `service-account-auth` | Pending deletion | Identical to `main` after branch reorganization (2026-05-25). Kept for one week as a safety net, then can be removed. |

---

## Tags

| Tag | Type | Points to | Description |
|-----|------|-----------|-------------|
| `v2026.05.25-production` | Annotated | `main` | Stable online production version after service account deployment. |
| `backup/main-2026-05-25` | Lightweight | pre-reorg `main` | Safety snapshot before branch reorganization. |
| `backup/code-cleanup-2026-05-25` | Lightweight | `code-cleanup` | Safety snapshot. |
| `backup/service-account-auth-2026-05-25` | Lightweight | `service-account-auth` | Safety snapshot. |
| `backup/server-deployment-2026-05-25` | Lightweight | `server-deployment` | Safety snapshot. |
| `backup/codex-2026-05-25` | Lightweight | codex branch | Safety snapshot. |

---

## Branch Reorganization History

**2026-05-25**

- Promoted `service-account-auth` to `main` (fast-forward).
- Created `archive/*` branches from legacy branches.
- Created backup tags before any deletions.
- Deleted obsolete branches: `code-cleanup`, `server-deployment`, `codex/find-repository-structure-and-project-details`.
- Closed PR #1 (Codex experiment).
- Created `baseline/prompt-only` from `main`.
- Created `feature/pck-oriented-dst` from `main` for PCK-oriented DST development.

---

## Maintenance Checklist

When you add, rename, merge, or delete a branch, update:

- [ ] The relevant section in this file
- [ ] The "Last updated" date at the top
- [ ] `DEPLOYMENT_GUIDE.md` if the deploy branch name changes

"""
Minimal in-memory fake of the tiny slice of the Firestore client API that
`export/export_collections.py` uses (`.collection(name).where(...).limit(n).stream()`),
so `run_export()` can be exercised in unit tests without any real network
access, credentials, or the `firebase-admin` package installed.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class FakeSnapshot:
    id: str
    _data: dict[str, Any]

    def to_dict(self) -> dict[str, Any]:
        return dict(self._data)


class FakeQuery:
    def __init__(self, docs: list[FakeSnapshot]):
        self._docs = docs

    def where(self, field: str, op: str, value: Any) -> "FakeQuery":
        if op != ">=":
            raise NotImplementedError(f"FakeQuery only supports '>=' for this test double, got '{op}'")
        filtered = [d for d in self._docs if (d.to_dict().get(field) or "") >= value]
        return FakeQuery(filtered)

    def limit(self, n: int) -> "FakeQuery":
        return FakeQuery(self._docs[:n])

    def stream(self):
        return iter(self._docs)


class FakeFirestoreClient:
    def __init__(self, collections: dict[str, dict[str, dict[str, Any]]]):
        """`collections`: {collection_name: {doc_id: doc_dict}}"""
        self._collections = collections

    def collection(self, name: str) -> FakeQuery:
        docs_by_id = self._collections.get(name, {})
        return FakeQuery([FakeSnapshot(id=doc_id, _data=data) for doc_id, data in docs_by_id.items()])

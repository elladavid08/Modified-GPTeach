"""Shared file I/O helpers: JSON / JSONL read+write, path utilities.

All JSON writes use `ensure_ascii=False` so Hebrew text stays readable in
the raw files instead of being escaped to \\uXXXX sequences.
"""

from __future__ import annotations

import json
from collections.abc import Iterable, Iterator
from pathlib import Path
from typing import Any


def ensure_dir(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path


def write_json(path: Path, data: Any) -> None:
    ensure_dir(path.parent)
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2, sort_keys=True)
        f.write("\n")


def read_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def iter_json_files(directory: Path) -> Iterator[Path]:
    if not directory.exists():
        return
    yield from sorted(directory.glob("*.json"))


def write_jsonl(path: Path, records: Iterable[dict[str, Any]], mode: str = "w") -> int:
    """Write an iterable of dict records as JSONL. Returns the number of records written."""
    ensure_dir(path.parent)
    count = 0
    with path.open(mode, encoding="utf-8") as f:
        for record in records:
            f.write(json.dumps(record, ensure_ascii=False, sort_keys=True))
            f.write("\n")
            count += 1
    return count


def append_jsonl_record(path: Path, record: dict[str, Any]) -> None:
    ensure_dir(path.parent)
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False, sort_keys=True))
        f.write("\n")


def read_jsonl(path: Path) -> Iterator[dict[str, Any]]:
    if not path.exists():
        return
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            yield json.loads(line)

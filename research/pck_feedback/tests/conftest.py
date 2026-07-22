import shutil
from pathlib import Path

import pytest

FIXTURES_DIR = Path(__file__).parent / "fixtures"


@pytest.fixture
def raw_dir() -> Path:
    """Read-only fixture raw data directory. Do not write into this from a test."""
    return FIXTURES_DIR / "raw"


@pytest.fixture
def raw_dir_copy(tmp_path: Path) -> Path:
    """A writable copy of the fixture raw data, for tests that write (e.g. image extraction)."""
    dest = tmp_path / "raw"
    shutil.copytree(FIXTURES_DIR / "raw", dest)
    return dest

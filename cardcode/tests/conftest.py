import pytest
from pathlib import Path


@pytest.fixture
def tmp_data_dir(tmp_path):
    """Provide a temporary data directory for tests."""
    return tmp_path / "cardcode_data"


@pytest.fixture
def config_overrides(tmp_data_dir):
    """Config overrides pointing to temp directories."""
    return {
        "data_dir": str(tmp_data_dir),
        "claude_dir": str(tmp_data_dir / "claude"),
        "projects_dir": str(tmp_data_dir / "projects"),
    }

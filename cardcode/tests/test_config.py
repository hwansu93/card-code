import os
from pathlib import Path

from cardcode.config import load_config, CardCodeConfig


def test_default_config():
    config = load_config()
    assert config.port == 8420
    assert config.data_dir == Path.home() / ".cardcode"
    assert config.claude_dir == Path.home() / ".claude"


def test_config_from_env(monkeypatch):
    monkeypatch.setenv("CARDCODE_PORT", "9999")
    monkeypatch.setenv("CARDCODE_DATA_DIR", "/tmp/cc_test")
    config = load_config()
    assert config.port == 9999
    assert config.data_dir == Path("/tmp/cc_test")


def test_config_from_dict():
    config = load_config(overrides={"port": 7777, "data_dir": "/tmp/custom"})
    assert config.port == 7777
    assert config.data_dir == Path("/tmp/custom")

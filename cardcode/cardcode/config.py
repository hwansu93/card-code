from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class CardCodeConfig:
    claude_dir: Path = field(default_factory=lambda: Path.home() / ".claude")
    projects_dir: Path | None = None
    tmux_socket: str | None = None
    data_dir: Path = field(default_factory=lambda: Path.home() / ".cardcode")
    port: int = 8420
    host: str = "0.0.0.0"
    base_path: str = ""

    @property
    def db_path(self) -> Path:
        return self.data_dir / "board.db"


def _read_toml(path: Path) -> dict:
    """Read a TOML config file. Returns empty dict if not found."""
    if not path.exists():
        return {}
    try:
        import tomllib
    except ImportError:
        try:
            import tomli as tomllib
        except ImportError:
            return {}
    with open(path, "rb") as f:
        data = tomllib.load(f)
    return data.get("cardcode", {})


def load_config(overrides: dict | None = None) -> CardCodeConfig:
    """Load config: config.toml -> env vars -> dict overrides."""
    kwargs: dict = {}

    # 1. Read from config.toml (check default location first)
    default_data_dir = Path.home() / ".cardcode"
    toml_path = default_data_dir / "config.toml"

    # Check env for data_dir override (affects where we look for config.toml)
    env_data_dir = os.environ.get("CARDCODE_DATA_DIR")
    if env_data_dir:
        toml_path = Path(env_data_dir) / "config.toml"

    toml_config = _read_toml(toml_path)

    path_fields = {"claude_dir", "projects_dir", "data_dir"}
    for key, val in toml_config.items():
        if key in path_fields and val:
            kwargs[key] = Path(val)
        elif key == "port" and val:
            kwargs[key] = int(val)
        elif val is not None and val != "":
            kwargs[key] = val

    # 2. Overlay env vars
    env_map = {
        "CARDCODE_CLAUDE_DIR": ("claude_dir", Path),
        "CARDCODE_PROJECTS_DIR": ("projects_dir", Path),
        "CARDCODE_TMUX_SOCKET": ("tmux_socket", str),
        "CARDCODE_DATA_DIR": ("data_dir", Path),
        "CARDCODE_PORT": ("port", int),
        "CARDCODE_HOST": ("host", str),
        "CARDCODE_BASE_PATH": ("base_path", str),
    }

    for env_key, (field_name, type_fn) in env_map.items():
        val = os.environ.get(env_key)
        if val:
            kwargs[field_name] = type_fn(val)

    # 3. Overlay dict overrides
    if overrides:
        for k, v in overrides.items():
            if k in path_fields and v is not None:
                kwargs[k] = Path(v)
            else:
                kwargs[k] = v

    return CardCodeConfig(**kwargs)

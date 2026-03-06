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

    @property
    def db_path(self) -> Path:
        return self.data_dir / "board.db"


def load_config(overrides: dict | None = None) -> CardCodeConfig:
    """Load config from env vars, with optional dict overrides taking precedence."""
    kwargs: dict = {}

    env_map = {
        "CARDCODE_CLAUDE_DIR": ("claude_dir", Path),
        "CARDCODE_PROJECTS_DIR": ("projects_dir", Path),
        "CARDCODE_TMUX_SOCKET": ("tmux_socket", str),
        "CARDCODE_DATA_DIR": ("data_dir", Path),
        "CARDCODE_PORT": ("port", int),
    }

    for env_key, (field_name, type_fn) in env_map.items():
        val = os.environ.get(env_key)
        if val:
            kwargs[field_name] = type_fn(val)

    if overrides:
        for k, v in overrides.items():
            if k in ("claude_dir", "projects_dir", "data_dir") and v is not None:
                kwargs[k] = Path(v)
            else:
                kwargs[k] = v

    return CardCodeConfig(**kwargs)

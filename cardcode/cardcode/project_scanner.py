from __future__ import annotations
from pathlib import Path


def scan_projects(base_dir: Path) -> list[dict]:
    """Scan a directory for git repositories (one level deep)."""
    if not base_dir.exists():
        return []
    projects = []
    try:
        for entry in sorted(base_dir.iterdir()):
            if entry.is_dir() and (entry / ".git").exists():
                projects.append({"name": entry.name, "path": str(entry)})
    except PermissionError:
        pass
    return projects

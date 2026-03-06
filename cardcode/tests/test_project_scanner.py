import pytest
from pathlib import Path
from cardcode.project_scanner import scan_projects


def test_scan_finds_git_repos(tmp_path):
    (tmp_path / "project-a" / ".git").mkdir(parents=True)
    (tmp_path / "project-b" / ".git").mkdir(parents=True)
    (tmp_path / "not-a-project").mkdir()
    projects = scan_projects(tmp_path)
    names = {p["name"] for p in projects}
    assert "project-a" in names
    assert "project-b" in names
    assert "not-a-project" not in names


def test_scan_returns_paths(tmp_path):
    (tmp_path / "myapp" / ".git").mkdir(parents=True)
    projects = scan_projects(tmp_path)
    assert projects[0]["path"] == str(tmp_path / "myapp")


def test_scan_empty_dir(tmp_path):
    assert scan_projects(tmp_path) == []


def test_scan_nonexistent_dir(tmp_path):
    assert scan_projects(tmp_path / "nope") == []

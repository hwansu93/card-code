import json
import pytest

from cardcode.session_watcher import parse_jsonl_metrics, detect_session_status


@pytest.fixture
def jsonl_file(tmp_path):
    path = tmp_path / "session.jsonl"
    lines = [
        {"type": "assistant", "message": {"usage": {"input_tokens": 1000, "output_tokens": 500}}, "costUsd": 0.05},
        {"type": "assistant", "message": {"usage": {"input_tokens": 1500, "output_tokens": 700}}, "costUsd": 0.12},
    ]
    path.write_text("\n".join(json.dumps(l) for l in lines))
    return path


def test_parse_jsonl_metrics(jsonl_file):
    metrics = parse_jsonl_metrics(jsonl_file)
    assert metrics["cost_usd"] == pytest.approx(0.17)
    assert metrics["input_tokens"] == 2500
    assert metrics["output_tokens"] == 1200


def test_parse_jsonl_metrics_empty(tmp_path):
    path = tmp_path / "empty.jsonl"
    path.write_text("")
    metrics = parse_jsonl_metrics(path)
    assert metrics["cost_usd"] is None
    assert metrics["input_tokens"] == 0
    assert metrics["output_tokens"] == 0


def test_parse_jsonl_metrics_missing_file(tmp_path):
    path = tmp_path / "nope.jsonl"
    metrics = parse_jsonl_metrics(path)
    assert metrics["cost_usd"] is None


def test_detect_session_status_alive():
    pane_text = "Some output from claude\nProcessing files...\n\u2588"
    status = detect_session_status(pane_text, session_alive=True)
    assert status == "alive"


def test_detect_session_status_idle():
    pane_text = "Task completed.\n\n> "
    status = detect_session_status(pane_text, session_alive=True)
    assert status == "idle"


def test_detect_session_status_waiting():
    pane_text = "Do you want to proceed? (y/n)"
    status = detect_session_status(pane_text, session_alive=True)
    assert status == "waiting"


def test_detect_session_status_dead():
    status = detect_session_status("", session_alive=False)
    assert status == "dead"

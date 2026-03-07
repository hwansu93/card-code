import pytest
from pydantic import ValidationError

from cardcode.models import (
    CardCreate, Card, CardUpdate, CardMove,
    Column, ColumnCreate, ColumnUpdate,
    generate_ksuid,
)


def test_generate_ksuid_is_string():
    kid = generate_ksuid()
    assert isinstance(kid, str)
    assert len(kid) > 10


def test_generate_ksuid_is_time_sortable():
    ids = [generate_ksuid() for _ in range(10)]
    assert ids == sorted(ids)


def test_card_create_defaults():
    card = CardCreate(title="Test task")
    assert card.title == "Test task"
    assert card.column_name == "backlog"
    assert card.provider == "claude-code"


def test_card_from_row():
    row = {
        "id": "abc123",
        "title": "Test",
        "description": None,
        "project": None,
        "project_path": None,
        "column_name": "backlog",
        "position": 0.0,
        "provider": "claude-code",
        "session_id": None,
        "tmux_session": None,
        "jsonl_path": None,
        "session_status": None,
        "cost_usd": 0.0,
        "input_tokens": 0,
        "output_tokens": 0,
        "context_pct": 0.0,
        "initial_prompt": None,
        "handoff_notes": None,
        "manual_overrides": "{}",
        "is_launching": 0,
        "created_at": "2026-03-06T12:00:00Z",
        "started_at": None,
        "completed_at": None,
        "updated_at": "2026-03-06T12:00:00Z",
    }
    card = Card(**row)
    assert card.id == "abc123"
    assert card.title == "Test"


def test_card_update_partial():
    update = CardUpdate(title="New title")
    assert update.title == "New title"
    assert update.description is None
    data = update.model_dump(exclude_none=True)
    assert "title" in data
    assert "description" not in data


def test_card_move():
    move = CardMove(column_name="active", position=1.5)
    assert move.column_name == "active"
    assert move.position == 1.5


def test_column_model():
    col = Column(id="col_1", name="backlog", position=0.0, created_at="2026-03-07T00:00:00Z")
    assert col.id == "col_1"
    assert col.name == "backlog"
    assert col.position == 0.0
    assert col.created_at == "2026-03-07T00:00:00Z"


def test_column_create_valid():
    cc = ColumnCreate(name="active")
    assert cc.name == "active"


def test_column_create_rejects_empty():
    with pytest.raises(ValidationError):
        ColumnCreate(name="")


def test_column_create_rejects_long_name():
    with pytest.raises(ValidationError):
        ColumnCreate(name="x" * 51)


def test_column_update_partial_name():
    cu = ColumnUpdate(name="new name")
    assert cu.name == "new name"
    assert cu.position is None


def test_column_update_partial_position():
    cu = ColumnUpdate(position=2.5)
    assert cu.name is None
    assert cu.position == 2.5


def test_column_update_both():
    cu = ColumnUpdate(name="done", position=3.0)
    assert cu.name == "done"
    assert cu.position == 3.0


def test_column_update_rejects_empty_name():
    with pytest.raises(ValidationError):
        ColumnUpdate(name="")

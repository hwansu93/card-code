import pytest
import aiosqlite
from pathlib import Path

from cardcode.database import init_db, get_db


@pytest.fixture
def db_path(tmp_path):
    return tmp_path / "test.db"


@pytest.mark.asyncio
async def test_init_db_creates_tables(db_path):
    await init_db(db_path)
    async with aiosqlite.connect(db_path) as db:
        cursor = await db.execute(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        )
        tables = [row[0] for row in await cursor.fetchall()]
    assert "cards" in tables
    assert "queued_prompts" in tables
    assert "projects" in tables


@pytest.mark.asyncio
async def test_init_db_is_idempotent(db_path):
    await init_db(db_path)
    await init_db(db_path)  # should not raise
    async with aiosqlite.connect(db_path) as db:
        cursor = await db.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='cards'"
        )
        assert await cursor.fetchone() is not None


@pytest.mark.asyncio
async def test_cards_table_columns(db_path):
    await init_db(db_path)
    async with aiosqlite.connect(db_path) as db:
        cursor = await db.execute("PRAGMA table_info(cards)")
        columns = {row[1] for row in await cursor.fetchall()}
    expected = {
        "id", "title", "description", "project", "project_path",
        "column_name", "position", "provider", "session_id",
        "tmux_session", "jsonl_path", "session_status",
        "cost_usd", "input_tokens", "output_tokens", "context_pct",
        "initial_prompt", "handoff_notes", "manual_overrides",
        "is_launching", "created_at", "started_at", "completed_at",
        "updated_at",
    }
    assert expected.issubset(columns)

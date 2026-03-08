from __future__ import annotations

from typing import Any

import aiosqlite
from pathlib import Path

from cardcode.models import generate_ksuid

SCHEMA = """
CREATE TABLE IF NOT EXISTS cards (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    project TEXT,
    project_path TEXT,
    column_name TEXT NOT NULL DEFAULT 'backlog',
    position REAL NOT NULL DEFAULT 0,
    provider TEXT DEFAULT 'claude-code',
    session_id TEXT,
    tmux_session TEXT,
    jsonl_path TEXT,
    session_status TEXT,
    cost_usd REAL DEFAULT 0,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    context_pct REAL DEFAULT 0,
    initial_prompt TEXT,
    handoff_notes TEXT,
    last_output TEXT,
    manual_overrides TEXT DEFAULT '{}',
    is_launching INTEGER DEFAULT 0,
    is_external INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    started_at TEXT,
    completed_at TEXT,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS queued_prompts (
    id TEXT PRIMARY KEY,
    card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    prompt_text TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
    name TEXT PRIMARY KEY,
    path TEXT NOT NULL,
    last_seen TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS columns (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    position REAL NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
"""

DEFAULT_COLUMNS = [
    ("backlog", 1.0),
    ("queue", 2.0),
    ("active", 3.0),
    ("review", 4.0),
    ("done", 5.0),
]


async def init_db(db_path: Path) -> None:
    """Initialize the database with schema. Idempotent via IF NOT EXISTS."""
    db_path.parent.mkdir(parents=True, exist_ok=True)
    async with aiosqlite.connect(db_path) as db:
        await db.executescript(SCHEMA)
        cursor = await db.execute("SELECT COUNT(*) FROM columns")
        row = await cursor.fetchone()
        count = row[0] if row else 0
        if count == 0:
            for name, position in DEFAULT_COLUMNS:
                await db.execute(
                    "INSERT INTO columns (id, name, position) VALUES (?, ?, ?)",
                    (generate_ksuid(), name, position),
                )
        # Migrate: add last_output column if missing
        try:
            await db.execute("ALTER TABLE cards ADD COLUMN last_output TEXT")
        except Exception:
            pass  # Column already exists

        await db.commit()


async def get_db(db_path: Path) -> aiosqlite.Connection:
    """Get a database connection with row factory enabled."""
    db = await aiosqlite.connect(db_path)
    db.row_factory = aiosqlite.Row
    await db.execute("PRAGMA journal_mode=WAL")
    await db.execute("PRAGMA foreign_keys=ON")
    return db


async def get_columns(db: aiosqlite.Connection) -> list[aiosqlite.Row]:
    """Return all columns ordered by position."""
    cursor = await db.execute("SELECT * FROM columns ORDER BY position")
    return list(await cursor.fetchall())


async def get_column_by_name(db: aiosqlite.Connection, name: str) -> aiosqlite.Row | None:
    """Return a column by name, or None if not found."""
    cursor = await db.execute("SELECT * FROM columns WHERE name = ?", (name,))
    return await cursor.fetchone()


async def create_column(db: aiosqlite.Connection, id: str, name: str, position: float) -> None:
    """Insert a new column."""
    await db.execute(
        "INSERT INTO columns (id, name, position) VALUES (?, ?, ?)",
        (id, name, position),
    )
    await db.commit()


async def update_column(
    db: aiosqlite.Connection, id: str, name: str | None = None, position: float | None = None
) -> None:
    """Update a column's name and/or position."""
    updates = []
    params: list[Any] = []
    if name is not None:
        updates.append("name = ?")
        params.append(name)
    if position is not None:
        updates.append("position = ?")
        params.append(position)
    if not updates:
        return
    params.append(id)
    await db.execute(f"UPDATE columns SET {', '.join(updates)} WHERE id = ?", params)
    await db.commit()


async def delete_column(db: aiosqlite.Connection, id: str) -> None:
    """Delete a column by id."""
    await db.execute("DELETE FROM columns WHERE id = ?", (id,))
    await db.commit()

from __future__ import annotations

import aiosqlite
from pathlib import Path


async def export_board(db_path: Path) -> dict:
    """Export all cards, columns, and queued prompts as JSON."""
    async with aiosqlite.connect(db_path) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM cards ORDER BY position")
        cards = [dict(row) for row in await cursor.fetchall()]
        cursor = await db.execute("SELECT * FROM columns ORDER BY position")
        columns = [dict(row) for row in await cursor.fetchall()]
        cursor = await db.execute("SELECT * FROM queued_prompts ORDER BY created_at")
        prompts = [dict(row) for row in await cursor.fetchall()]
    return {"cards": cards, "columns": columns, "queued_prompts": prompts}


ALLOWED_CARD_COLS = {
    "id", "title", "description", "column_name", "position", "project",
    "project_path", "provider", "session_id", "tmux_session", "jsonl_path",
    "session_status", "cost_usd", "input_tokens", "output_tokens",
    "context_pct", "initial_prompt", "handoff_notes", "manual_overrides",
    "is_launching", "is_external", "created_at", "started_at",
    "completed_at", "updated_at",
}


async def import_board(db_path: Path, data: dict) -> int:
    """Import cards, columns, and prompts from exported JSON. Returns count of imported cards."""
    async with aiosqlite.connect(db_path) as db:
        db.row_factory = aiosqlite.Row
        for col in data.get("columns", []):
            cursor = await db.execute(
                "SELECT id FROM columns WHERE name = ?", (col["name"],)
            )
            if await cursor.fetchone() is None:
                await db.execute(
                    "INSERT INTO columns (id, name, position) VALUES (?, ?, ?)",
                    (col["id"], col["name"], col["position"]),
                )
        count = 0
        for card in data.get("cards", []):
            card = {k: v for k, v in card.items() if k in ALLOWED_CARD_COLS}
            cols = ", ".join(card.keys())
            placeholders = ", ".join("?" for _ in card)
            await db.execute(
                f"INSERT OR REPLACE INTO cards ({cols}) VALUES ({placeholders})",
                list(card.values()),
            )
            count += 1
        for prompt in data.get("queued_prompts", []):
            cols = ", ".join(prompt.keys())
            placeholders = ", ".join("?" for _ in prompt)
            await db.execute(
                f"INSERT OR REPLACE INTO queued_prompts ({cols}) VALUES ({placeholders})",
                list(prompt.values()),
            )
        await db.commit()
    return count

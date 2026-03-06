from __future__ import annotations

import aiosqlite
from pathlib import Path


async def export_board(db_path: Path) -> dict:
    """Export all cards and queued prompts as JSON."""
    async with aiosqlite.connect(db_path) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM cards ORDER BY position")
        cards = [dict(row) for row in await cursor.fetchall()]
        cursor = await db.execute("SELECT * FROM queued_prompts ORDER BY created_at")
        prompts = [dict(row) for row in await cursor.fetchall()]
    return {"cards": cards, "queued_prompts": prompts}


async def import_board(db_path: Path, data: dict) -> int:
    """Import cards and prompts from exported JSON. Returns count of imported cards."""
    async with aiosqlite.connect(db_path) as db:
        count = 0
        for card in data.get("cards", []):
            columns = ", ".join(card.keys())
            placeholders = ", ".join("?" for _ in card)
            await db.execute(
                f"INSERT OR REPLACE INTO cards ({columns}) VALUES ({placeholders})",
                list(card.values()),
            )
            count += 1
        for prompt in data.get("queued_prompts", []):
            columns = ", ".join(prompt.keys())
            placeholders = ", ".join("?" for _ in prompt)
            await db.execute(
                f"INSERT OR REPLACE INTO queued_prompts ({columns}) VALUES ({placeholders})",
                list(prompt.values()),
            )
        await db.commit()
    return count

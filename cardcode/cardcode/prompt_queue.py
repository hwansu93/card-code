from __future__ import annotations

import aiosqlite


async def get_next_pending(db: aiosqlite.Connection, card_id: str) -> dict | None:
    cursor = await db.execute(
        "SELECT * FROM queued_prompts WHERE card_id = ? AND status = 'pending' ORDER BY created_at ASC LIMIT 1",
        (card_id,),
    )
    row = await cursor.fetchone()
    return dict(row) if row else None


async def mark_sent(db: aiosqlite.Connection, prompt_id: str) -> None:
    await db.execute("UPDATE queued_prompts SET status = 'sent' WHERE id = ?", (prompt_id,))
    await db.commit()


async def mark_failed(db: aiosqlite.Connection, prompt_id: str) -> None:
    await db.execute("UPDATE queued_prompts SET status = 'failed' WHERE id = ?", (prompt_id,))
    await db.commit()

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request, Response

from cardcode.database import get_db
from cardcode.models import Card, CardCreate, CardUpdate, CardMove, generate_ksuid

router = APIRouter(prefix="/api")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _get_card_or_404(db, card_id: str) -> dict:
    cursor = await db.execute("SELECT * FROM cards WHERE id = ?", (card_id,))
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Card not found")
    return dict(row)


@router.get("/cards")
async def list_cards(request: Request, project: str | None = None) -> list[Card]:
    db = await get_db(request.app.state.config.db_path)
    try:
        if project:
            cursor = await db.execute(
                "SELECT * FROM cards WHERE project = ? ORDER BY position",
                (project,),
            )
        else:
            cursor = await db.execute("SELECT * FROM cards ORDER BY position")
        rows = await cursor.fetchall()
        return [Card(**dict(row)) for row in rows]
    finally:
        await db.close()


@router.post("/cards", status_code=201)
async def create_card(request: Request, body: CardCreate) -> Card:
    db = await get_db(request.app.state.config.db_path)
    try:
        now = _now()
        card_id = generate_ksuid()

        cursor = await db.execute(
            "SELECT COALESCE(MAX(position), 0) + 1 FROM cards WHERE column_name = ?",
            (body.column_name,),
        )
        position = (await cursor.fetchone())[0]

        await db.execute(
            """INSERT INTO cards (id, title, description, project, project_path,
               column_name, position, provider, initial_prompt, handoff_notes,
               created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                card_id, body.title, body.description, body.project,
                body.project_path, body.column_name, position, body.provider,
                body.initial_prompt, body.handoff_notes, now, now,
            ),
        )
        await db.commit()

        row = await _get_card_or_404(db, card_id)
        card = Card(**row)

        await request.app.state.ws_manager.broadcast(
            {"type": "card_created", "card": card.model_dump()}
        )
        return card
    finally:
        await db.close()


@router.patch("/cards/{card_id}")
async def update_card(request: Request, card_id: str, body: CardUpdate) -> Card:
    db = await get_db(request.app.state.config.db_path)
    try:
        await _get_card_or_404(db, card_id)
        updates = body.model_dump(exclude_none=True)
        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update")

        updates["updated_at"] = _now()
        set_clause = ", ".join(f"{k} = ?" for k in updates)
        values = list(updates.values()) + [card_id]

        await db.execute(
            f"UPDATE cards SET {set_clause} WHERE id = ?", values
        )
        await db.commit()

        row = await _get_card_or_404(db, card_id)
        card = Card(**row)

        await request.app.state.ws_manager.broadcast(
            {"type": "card_updated", "card": card.model_dump()}
        )
        return card
    finally:
        await db.close()


@router.patch("/cards/{card_id}/move")
async def move_card(request: Request, card_id: str, body: CardMove) -> Card:
    db = await get_db(request.app.state.config.db_path)
    try:
        await _get_card_or_404(db, card_id)
        now = _now()

        await db.execute(
            "UPDATE cards SET column_name = ?, position = ?, updated_at = ? WHERE id = ?",
            (body.column_name, body.position, now, card_id),
        )
        await db.commit()

        row = await _get_card_or_404(db, card_id)
        card = Card(**row)

        await request.app.state.ws_manager.broadcast(
            {"type": "card_moved", "id": card_id, "column": body.column_name, "position": body.position}
        )
        return card
    finally:
        await db.close()


@router.delete("/cards/{card_id}", status_code=204)
async def delete_card(request: Request, card_id: str):
    db = await get_db(request.app.state.config.db_path)
    try:
        await _get_card_or_404(db, card_id)
        await db.execute("DELETE FROM cards WHERE id = ?", (card_id,))
        await db.commit()

        await request.app.state.ws_manager.broadcast(
            {"type": "card_deleted", "id": card_id}
        )
        return Response(status_code=204)
    finally:
        await db.close()

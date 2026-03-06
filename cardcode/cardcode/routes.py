from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request, Response

from pydantic import BaseModel

from cardcode.database import get_db
from cardcode.export import export_board, import_board
from cardcode.models import Card, CardCreate, CardUpdate, CardMove, QueuedPrompt, generate_ksuid
from cardcode.project_scanner import scan_projects
from cardcode.tmux_manager import TmuxManager

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


class PromptBody(BaseModel):
    text: str


@router.post("/cards/{card_id}/spawn")
async def spawn_session(request: Request, card_id: str) -> Card:
    db = await get_db(request.app.state.config.db_path)
    try:
        row = await _get_card_or_404(db, card_id)
        card = Card(**row)

        project_path = card.project_path or "."
        project_name = card.project or "default"

        tmux = TmuxManager(request.app.state.config.tmux_socket)
        session_name = tmux.spawn_session(
            project_path=project_path,
            project_name=project_name,
            initial_prompt=card.initial_prompt,
        )

        now = _now()
        await db.execute(
            """UPDATE cards SET tmux_session = ?, column_name = 'active',
               session_status = 'alive', is_launching = 1,
               started_at = ?, updated_at = ? WHERE id = ?""",
            (session_name, now, now, card_id),
        )
        await db.commit()

        row = await _get_card_or_404(db, card_id)
        updated = Card(**row)

        await request.app.state.ws_manager.broadcast(
            {"type": "card_updated", "card": updated.model_dump()}
        )
        return updated
    finally:
        await db.close()


@router.post("/cards/{card_id}/prompt")
async def send_prompt(request: Request, card_id: str, body: PromptBody) -> dict:
    db = await get_db(request.app.state.config.db_path)
    try:
        row = await _get_card_or_404(db, card_id)
        card = Card(**row)

        if not card.tmux_session:
            raise HTTPException(status_code=400, detail="No active session")

        tmux = TmuxManager(request.app.state.config.tmux_socket)
        tmux.send_keys(card.tmux_session, body.text)

        return {"status": "sent", "card_id": card_id}
    finally:
        await db.close()


@router.post("/cards/{card_id}/queue-prompt", status_code=201)
async def queue_prompt(request: Request, card_id: str, body: PromptBody) -> QueuedPrompt:
    db = await get_db(request.app.state.config.db_path)
    try:
        await _get_card_or_404(db, card_id)
        prompt_id = generate_ksuid()
        now = _now()

        await db.execute(
            """INSERT INTO queued_prompts (id, card_id, prompt_text, status, created_at)
               VALUES (?, ?, ?, 'pending', ?)""",
            (prompt_id, card_id, body.text, now),
        )
        await db.commit()

        return QueuedPrompt(
            id=prompt_id, card_id=card_id, prompt_text=body.text,
            status="pending", created_at=now,
        )
    finally:
        await db.close()


@router.post("/cards/{card_id}/stop")
async def stop_session(request: Request, card_id: str) -> Card:
    db = await get_db(request.app.state.config.db_path)
    try:
        row = await _get_card_or_404(db, card_id)
        card = Card(**row)

        if card.tmux_session:
            tmux = TmuxManager(request.app.state.config.tmux_socket)
            try:
                tmux.kill_session(card.tmux_session)
            except Exception:
                pass

        now = _now()
        await db.execute(
            "UPDATE cards SET session_status = 'dead', updated_at = ? WHERE id = ?",
            (now, card_id),
        )
        await db.commit()

        row = await _get_card_or_404(db, card_id)
        updated = Card(**row)

        await request.app.state.ws_manager.broadcast(
            {"type": "status_changed", "id": card_id, "session_status": "dead"}
        )
        return updated
    finally:
        await db.close()


@router.get("/projects")
async def list_projects(request: Request) -> list[dict]:
    config = request.app.state.config
    if config.projects_dir:
        return scan_projects(config.projects_dir)
    return []


@router.get("/cards/archived")
async def list_archived(request: Request) -> list[Card]:
    db = await get_db(request.app.state.config.db_path)
    try:
        cursor = await db.execute(
            "SELECT * FROM cards WHERE column_name = 'archive' ORDER BY completed_at DESC, updated_at DESC"
        )
        rows = await cursor.fetchall()
        return [Card(**dict(row)) for row in rows]
    finally:
        await db.close()


@router.get("/settings")
async def get_settings(request: Request) -> dict:
    config = request.app.state.config
    return {
        "claude_dir": str(config.claude_dir),
        "projects_dir": str(config.projects_dir) if config.projects_dir else "",
        "data_dir": str(config.data_dir),
        "port": config.port,
        "base_path": config.base_path,
    }


@router.post("/settings")
async def save_settings(request: Request) -> dict:
    data = await request.json()
    config_path = request.app.state.config.data_dir / "config.toml"
    config_path.parent.mkdir(parents=True, exist_ok=True)

    lines = ["[cardcode]"]
    for key in ["claude_dir", "projects_dir", "data_dir", "port", "base_path"]:
        if key in data and data[key]:
            val = data[key]
            if isinstance(val, int) or (isinstance(val, str) and val.isdigit()):
                lines.append(f'{key} = {val}')
            else:
                lines.append(f'{key} = "{val}"')

    config_path.write_text("\n".join(lines) + "\n")
    return {"status": "saved", "path": str(config_path)}


@router.get("/settings/integrations")
async def check_integrations(request: Request) -> dict:
    """Check if required tools are available."""
    import shutil
    return {
        "tmux": shutil.which("tmux") is not None,
        "claude": shutil.which("claude") is not None,
        "git": shutil.which("git") is not None,
    }


@router.get("/config")
async def get_config(request: Request) -> dict:
    config = request.app.state.config
    return {
        "port": config.port,
        "data_dir": str(config.data_dir),
        "claude_dir": str(config.claude_dir),
        "projects_dir": str(config.projects_dir) if config.projects_dir else None,
    }


@router.post("/export")
async def export_data(request: Request) -> dict:
    return await export_board(request.app.state.config.db_path)


@router.post("/import")
async def import_data(request: Request) -> dict:
    data = await request.json()
    count = await import_board(request.app.state.config.db_path, data)
    return {"imported": count}

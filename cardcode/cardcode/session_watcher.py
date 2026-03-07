from __future__ import annotations

import asyncio
import json
import logging
import re
from datetime import datetime, timezone
from pathlib import Path

from cardcode.card_reconciler import find_unmatched_external, find_unmatched_sessions
from cardcode.config import CardCodeConfig
from cardcode.database import get_db
from cardcode.models import generate_ksuid
from cardcode.prompt_queue import get_next_pending, mark_failed, mark_sent
from cardcode.tmux_manager import TmuxManager

logger = logging.getLogger(__name__)


def parse_jsonl_metrics(jsonl_path: Path) -> dict:
    """Parse the latest cost metrics from a Claude Code JSONL file."""
    result = {
        "cost_usd": 0.0,
        "input_tokens": 0,
        "output_tokens": 0,
        "context_pct": 0.0,
    }

    if not jsonl_path.exists():
        return result

    text = jsonl_path.read_text().strip()
    if not text:
        return result

    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            continue

        if entry.get("type") == "cost":
            result["cost_usd"] = entry.get("costUsd", result["cost_usd"])
            result["input_tokens"] = entry.get("inputTokens", result["input_tokens"])
            result["output_tokens"] = entry.get("outputTokens", result["output_tokens"])

        if "contextPercent" in entry:
            result["context_pct"] = entry["contextPercent"]

    return result


_WAITING_PATTERNS = [
    r"\(y/n\)",
    r"\(Y/n\)",
    r"Do you want to",
    r"Allow\?",
    r"Approve\?",
    r"Permission",
]

_IDLE_PATTERNS = [
    r"^>\s*$",
    r"^\$\s*$",
    r"completed",
    r"Task completed",
]


def detect_session_status(pane_text: str, session_alive: bool) -> str:
    """Detect the status of a Claude Code session from pane output.
    Returns: 'alive', 'idle', 'waiting', or 'dead'
    """
    if not session_alive:
        return "dead"

    lines = pane_text.strip().splitlines()
    tail = "\n".join(lines[-5:]) if lines else ""

    for pattern in _WAITING_PATTERNS:
        if re.search(pattern, tail, re.IGNORECASE):
            return "waiting"

    for pattern in _IDLE_PATTERNS:
        if re.search(pattern, tail, re.MULTILINE):
            return "idle"

    return "alive"


async def watcher_loop(config: CardCodeConfig, ws_manager, interval: float = 5.0):
    """Background loop that polls tmux sessions and updates card metrics."""
    tmux = TmuxManager(config.tmux_socket)
    while True:
        try:
            await _poll_once(config, tmux, ws_manager)
        except Exception:
            logger.exception("Error in watcher loop")
        await asyncio.sleep(interval)


async def _poll_once(config: CardCodeConfig, tmux: TmuxManager, ws_manager):
    """Single poll iteration."""
    db = await get_db(config.db_path)
    try:
        # Get all active cards with sessions
        cursor = await db.execute(
            "SELECT * FROM cards WHERE column_name = 'active' AND tmux_session IS NOT NULL"
        )
        active_cards = [dict(row) for row in await cursor.fetchall()]

        sessions = tmux.list_sessions()

        for card in active_cards:
            session_name = card["tmux_session"]
            is_alive = tmux.is_session_alive(session_name)
            pane_text = tmux.capture_pane(session_name) if is_alive else ""

            new_status = detect_session_status(pane_text, session_alive=is_alive)
            old_status = card.get("session_status")

            metrics = {}
            if card.get("jsonl_path"):
                metrics = parse_jsonl_metrics(Path(card["jsonl_path"]))

            updates = {"session_status": new_status}
            updates.update(metrics)
            updates["updated_at"] = datetime.now(timezone.utc).isoformat()

            set_clause = ", ".join(f"{k} = ?" for k in updates)
            values = list(updates.values()) + [card["id"]]
            await db.execute(f"UPDATE cards SET {set_clause} WHERE id = ?", values)

            if new_status != old_status:
                await ws_manager.broadcast({
                    "type": "status_changed",
                    "id": card["id"],
                    "session_status": new_status,
                })

            if metrics:
                await ws_manager.broadcast({
                    "type": "metrics_updated",
                    "id": card["id"],
                    **metrics,
                })

            # Auto-send queued prompts when idle
            if new_status == "idle":
                prompt = await get_next_pending(db, card["id"])
                if prompt:
                    try:
                        tmux.send_keys(session_name, prompt["prompt_text"])
                        await mark_sent(db, prompt["id"])
                        await ws_manager.broadcast({
                            "type": "prompt_sent",
                            "id": card["id"],
                            "prompt_id": prompt["id"],
                        })
                    except Exception:
                        await mark_failed(db, prompt["id"])

        # Auto-discover unmatched tmux sessions
        all_cards_cursor = await db.execute("SELECT * FROM cards")
        all_cards = [dict(row) for row in await all_cards_cursor.fetchall()]
        unmatched = find_unmatched_sessions(sessions, all_cards)

        for session in unmatched:
            now = datetime.now(timezone.utc).isoformat()
            card_id = generate_ksuid()
            await db.execute(
                """INSERT INTO cards (id, title, column_name, position, tmux_session,
                   session_status, created_at, updated_at)
                   VALUES (?, ?, 'active', 0, ?, 'alive', ?, ?)""",
                (card_id, f"Auto: {session['name']}", session["name"], now, now),
            )

        # Auto-discover external (non-tmux) Claude processes
        externals = tmux.list_external_claude_processes()
        unmatched_ext = find_unmatched_external(externals, all_cards)

        for ext in unmatched_ext:
            now = datetime.now(timezone.utc).isoformat()
            card_id = generate_ksuid()
            title = f"External: {ext.get('cwd', '').split('/')[-1] or 'claude'}"
            await db.execute(
                """INSERT INTO cards (id, title, column_name, position, session_id,
                   project_path, session_status, is_external, created_at, updated_at)
                   VALUES (?, ?, 'active', 0, ?, ?, 'alive', 1, ?, ?)""",
                (card_id, title, str(ext["pid"]), ext.get("cwd"), now, now),
            )

        await db.commit()
    finally:
        await db.close()

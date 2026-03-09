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


def parse_jsonl_metrics(path: str | Path) -> dict:
    """Parse Claude Code JSONL for token counts and context percentage."""
    metrics = {
        "input_tokens": 0,
        "output_tokens": 0,
        "cost_usd": None,
        "context_pct": None,
    }
    try:
        with open(path, 'r') as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    entry = json.loads(line)
                except json.JSONDecodeError:
                    continue

                # Accumulate token usage from assistant entries
                if entry.get("type") == "assistant":
                    usage = entry.get("message", {}).get("usage", {})
                    metrics["input_tokens"] += usage.get("input_tokens", 0)
                    metrics["output_tokens"] += usage.get("output_tokens", 0)

                # Check for cost (may be null)
                cost = entry.get("costUsd")
                if cost is not None:
                    metrics["cost_usd"] = (metrics["cost_usd"] or 0) + cost

                # Check for context percentage (take the latest non-null value)
                ctx = entry.get("contextPercent")
                if ctx is not None:
                    metrics["context_pct"] = ctx
    except Exception:
        pass

    return metrics


def parse_pane_metrics(pane_text: str) -> dict:
    """Parse cost/token/context metrics from captured tmux pane text.

    Claude Code displays metrics in its status area. Various formats
    are matched via regex.
    """
    result: dict = {}

    # Cost patterns: "Cost: $0.12", "$1.23 cost"
    cost_match = re.search(r'(?:cost[:\s]*)\$([0-9]+\.?[0-9]*)', pane_text, re.IGNORECASE)
    if cost_match:
        try:
            result["cost_usd"] = float(cost_match.group(1))
        except ValueError:
            pass

    # Context percentage: "Context: 67%", "context 80%"
    ctx_match = re.search(r'(?:context[:\s]*)([0-9]+(?:\.[0-9]+)?)\s*%', pane_text, re.IGNORECASE)
    if ctx_match:
        try:
            result["context_pct"] = float(ctx_match.group(1)) / 100.0
        except ValueError:
            pass

    # Token patterns - "12.4k in" or "1,234 input"
    in_match = re.search(r'([0-9][0-9,]*\.?[0-9]*)\s*k?\s*(?:input|in)\b', pane_text, re.IGNORECASE)
    if in_match:
        try:
            val = in_match.group(1).replace(",", "")
            tokens = float(val)
            if "k" in in_match.group(0).lower():
                tokens *= 1000
            result["input_tokens"] = int(tokens)
        except ValueError:
            pass

    out_match = re.search(r'([0-9][0-9,]*\.?[0-9]*)\s*k?\s*(?:output|out)\b', pane_text, re.IGNORECASE)
    if out_match:
        try:
            val = out_match.group(1).replace(",", "")
            tokens = float(val)
            if "k" in out_match.group(0).lower():
                tokens *= 1000
            result["output_tokens"] = int(tokens)
        except ValueError:
            pass

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


def _session_name_to_title(session_name: str) -> str:
    """Convert a tmux session name to a human-readable title."""
    name = session_name
    # Remove cc- prefix from CardCode-spawned sessions
    if name.startswith("cc-"):
        name = name[3:]
    # Remove trailing hex suffix (e.g., -a1b2c3)
    parts = name.rsplit("-", 1)
    if len(parts) == 2 and len(parts[1]) >= 6:
        try:
            int(parts[1], 16)
            name = parts[0]
        except ValueError:
            pass
    # Replace separators with spaces and title-case
    name = name.replace("_", " ").replace("-", " ")
    return name.title()


def _discover_jsonl(project_path: str) -> str | None:
    """Find the newest JSONL file for a project path using Claude Code's directory naming."""
    if not project_path:
        return None

    # Claude Code encodes paths: /foo/bar → -foo-bar
    encoded = project_path.replace('/', '-')
    if not encoded.startswith('-'):
        encoded = '-' + encoded

    claude_dir = Path.home() / '.claude' / 'projects' / encoded
    if not claude_dir.exists():
        return None

    # Find newest .jsonl file directly in this directory
    jsonl_files = sorted(
        claude_dir.glob('*.jsonl'),
        key=lambda f: f.stat().st_mtime,
        reverse=True
    )

    if jsonl_files:
        return str(jsonl_files[0])

    return None


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
        # Get all cards with live sessions, regardless of column
        cursor = await db.execute(
            "SELECT * FROM cards WHERE tmux_session IS NOT NULL AND session_status != 'dead'"
        )
        active_cards = [dict(row) for row in await cursor.fetchall()]

        sessions = tmux.list_sessions()
        # Build a lookup from session name → pane_current_path for backfilling
        session_path_map = {s["name"]: s.get("pane_current_path") for s in sessions}

        for card in active_cards:
            session_name = card["tmux_session"]
            is_alive = tmux.is_session_alive(session_name)
            pane_text = tmux.capture_pane(session_name) if is_alive else ""

            new_status = detect_session_status(pane_text, session_alive=is_alive)
            old_status = card.get("session_status")

            # Backfill project_path from tmux if currently NULL
            if not card.get("project_path"):
                tmux_path = session_path_map.get(session_name)
                if tmux_path:
                    await db.execute(
                        "UPDATE cards SET project_path = ? WHERE id = ?",
                        (tmux_path, card["id"]),
                    )
                    card["project_path"] = tmux_path

            # Try to discover jsonl_path if not set
            if not card.get("jsonl_path") and card.get("project_path"):
                discovered = _discover_jsonl(card["project_path"])
                if discovered:
                    await db.execute(
                        "UPDATE cards SET jsonl_path = ? WHERE id = ?",
                        (discovered, card["id"]),
                    )
                    card["jsonl_path"] = discovered

            metrics = {}
            if card.get("jsonl_path"):
                metrics = parse_jsonl_metrics(card["jsonl_path"])

            # Fall back to parsing metrics from pane text
            if not metrics and pane_text:
                metrics = parse_pane_metrics(pane_text)

            updates = {"session_status": new_status}
            updates.update(metrics)
            updates["updated_at"] = datetime.now(timezone.utc).isoformat()

            # Store last output when session is alive, or capture final output on death
            if pane_text.strip():
                updates["last_output"] = pane_text
            elif new_status == "dead" and old_status != "dead":
                # Session just died - try to capture any remaining output
                last_chance = tmux.capture_pane(session_name, lines=100)
                if last_chance.strip():
                    updates["last_output"] = last_chance

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
            title = _session_name_to_title(session["name"])
            project_path = session.get("pane_current_path") or None
            await db.execute(
                """INSERT INTO cards (id, title, column_name, position, tmux_session,
                   project_path, session_status, started_at, created_at, updated_at)
                   VALUES (?, ?, 'active', 0, ?, ?, 'alive', ?, ?, ?)""",
                (card_id, title, session["name"], project_path, now, now, now),
            )

        # Auto-discover external (non-tmux) Claude processes
        externals = tmux.list_external_claude_processes()
        unmatched_ext = find_unmatched_external(externals, all_cards)

        for ext in unmatched_ext:
            now = datetime.now(timezone.utc).isoformat()
            card_id = generate_ksuid()
            dir_name = ext.get("cwd", "").split("/")[-1] or "Claude"
            title = dir_name.replace("_", " ").replace("-", " ").title()
            await db.execute(
                """INSERT INTO cards (id, title, column_name, position, session_id,
                   project_path, session_status, is_external, started_at, created_at, updated_at)
                   VALUES (?, ?, 'active', 0, ?, ?, 'alive', 1, ?, ?, ?)""",
                (card_id, title, str(ext["pid"]), ext.get("cwd"), now, now, now),
            )

        await db.commit()
    finally:
        await db.close()

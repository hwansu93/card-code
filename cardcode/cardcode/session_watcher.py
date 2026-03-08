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


def _discover_jsonl(claude_dir: Path, project_path: str) -> Path | None:
    """Try to find the most recent JSONL session file for a project.

    Claude Code stores sessions under ~/.claude/projects/<hash>/sessions/.
    We scan project dirs for one whose path matches, then return the newest .jsonl.
    """
    projects_dir = claude_dir / "projects"
    if not projects_dir.is_dir():
        return None

    # Normalise for comparison
    norm_project = project_path.rstrip("/")

    for candidate in projects_dir.iterdir():
        if not candidate.is_dir():
            continue

        # Check for a config file that maps to the project path
        for config_name in ("project.json", "config.json", ".project"):
            config_file = candidate / config_name
            if config_file.exists():
                try:
                    text = config_file.read_text().strip()
                    if norm_project in text:
                        return _newest_jsonl(candidate)
                except Exception:
                    continue

        # Heuristic: directory name might encode the project path
        # Claude uses a hash of the absolute path as the directory name
        # Check CLAUDE.md or any file that references the project path
        claude_md = candidate / "CLAUDE.md"
        if claude_md.exists():
            try:
                if norm_project in claude_md.read_text():
                    return _newest_jsonl(candidate)
            except Exception:
                pass

    # Last resort: find the most recently modified .jsonl across all project dirs
    # Only if there's a single active one (avoid false matches)
    return None


def _newest_jsonl(project_dir: Path) -> Path | None:
    """Return the most recently modified .jsonl file under a project dir."""
    best: Path | None = None
    best_mtime: float = 0

    for jsonl in project_dir.rglob("*.jsonl"):
        try:
            mtime = jsonl.stat().st_mtime
            if mtime > best_mtime:
                best = jsonl
                best_mtime = mtime
        except OSError:
            continue

    return best


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

        for card in active_cards:
            session_name = card["tmux_session"]
            is_alive = tmux.is_session_alive(session_name)
            pane_text = tmux.capture_pane(session_name) if is_alive else ""

            new_status = detect_session_status(pane_text, session_alive=is_alive)
            old_status = card.get("session_status")

            # Try to discover jsonl_path if not set
            if not card.get("jsonl_path") and card.get("project_path"):
                discovered = _discover_jsonl(config.claude_dir, card["project_path"])
                if discovered:
                    await db.execute(
                        "UPDATE cards SET jsonl_path = ? WHERE id = ?",
                        (str(discovered), card["id"]),
                    )
                    card["jsonl_path"] = str(discovered)

            metrics = {}
            if card.get("jsonl_path"):
                metrics = parse_jsonl_metrics(Path(card["jsonl_path"]))

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
            await db.execute(
                """INSERT INTO cards (id, title, column_name, position, tmux_session,
                   session_status, created_at, updated_at)
                   VALUES (?, ?, 'active', 0, ?, 'alive', ?, ?)""",
                (card_id, title, session["name"], now, now),
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
                   project_path, session_status, is_external, created_at, updated_at)
                   VALUES (?, ?, 'active', 0, ?, ?, 'alive', 1, ?, ?)""",
                (card_id, title, str(ext["pid"]), ext.get("cwd"), now, now),
            )

        await db.commit()
    finally:
        await db.close()

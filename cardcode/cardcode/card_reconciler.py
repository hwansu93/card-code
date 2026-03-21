from __future__ import annotations


def match_session_to_card(session: dict, cards: list[dict], skip_launching: bool = True) -> dict | None:
    """Match a tmux session to a card. Cascade: tmux_name match."""
    session_name = session["name"]
    for card in cards:
        if skip_launching and card.get("is_launching"):
            continue
        if card.get("tmux_session") == session_name:
            return card
    return None


def find_unmatched_sessions(sessions: list[dict], cards: list[dict]) -> list[dict]:
    """Find tmux sessions that don't match any existing card."""
    matched_names = {card["tmux_session"] for card in cards if card.get("tmux_session")}
    return [s for s in sessions if s["name"] not in matched_names]


def find_unmatched_external(externals: list[dict], cards: list[dict]) -> list[dict]:
    """Find external Claude processes that don't match any existing card."""
    matched_pids = set()
    for card in cards:
        if card.get("is_external") and card.get("session_id"):
            try:
                matched_pids.add(int(card["session_id"]))
            except (ValueError, TypeError):
                pass
    return [e for e in externals if e["pid"] not in matched_pids]

from __future__ import annotations

import os
import struct
import time
from pydantic import BaseModel


_last_ts: int = 0
_last_random: int = 0


def generate_ksuid() -> str:
    """Generate a KSUID: 4-byte timestamp (epoch offset) + 16-byte random, base36-encoded.

    Monotonic within the same second: if called multiple times in the same
    second, the random portion is incremented to guarantee sort order.
    """
    global _last_ts, _last_random
    epoch_offset = 1400000000
    ts = int(time.time()) - epoch_offset
    rand = int.from_bytes(os.urandom(16), "big")
    if ts == _last_ts and rand <= _last_random:
        rand = _last_random + 1
    _last_ts = ts
    _last_random = rand
    payload = struct.pack(">I", ts) + rand.to_bytes(16, "big")
    n = int.from_bytes(payload, "big")
    chars = "0123456789abcdefghijklmnopqrstuvwxyz"
    result = []
    while n:
        n, r = divmod(n, 36)
        result.append(chars[r])
    return "".join(reversed(result)).zfill(27)


class CardCreate(BaseModel):
    title: str
    description: str | None = None
    project: str | None = None
    project_path: str | None = None
    column_name: str = "backlog"
    provider: str = "claude-code"
    initial_prompt: str | None = None
    handoff_notes: str | None = None


class CardUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    project: str | None = None
    project_path: str | None = None
    initial_prompt: str | None = None
    handoff_notes: str | None = None
    session_status: str | None = None


class CardMove(BaseModel):
    column_name: str
    position: float


class Card(BaseModel):
    id: str
    title: str
    description: str | None = None
    project: str | None = None
    project_path: str | None = None
    column_name: str
    position: float
    provider: str
    session_id: str | None = None
    tmux_session: str | None = None
    jsonl_path: str | None = None
    session_status: str | None = None
    cost_usd: float = 0.0
    input_tokens: int = 0
    output_tokens: int = 0
    context_pct: float = 0.0
    initial_prompt: str | None = None
    handoff_notes: str | None = None
    manual_overrides: str = "{}"
    is_launching: int = 0
    is_external: int = 0
    created_at: str
    started_at: str | None = None
    completed_at: str | None = None
    updated_at: str
    model_config = {"from_attributes": True}


class QueuedPrompt(BaseModel):
    id: str
    card_id: str
    prompt_text: str
    status: str = "pending"
    created_at: str


class Project(BaseModel):
    name: str
    path: str
    last_seen: str

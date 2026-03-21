# CardCode Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a self-hosted Kanban web dashboard for managing Claude Code sessions via tmux, with live metrics over WebSocket.

**Architecture:** Single FastAPI monolith serving REST API, WebSocket, and static files. Background tasks poll tmux sessions for metrics. SQLite for persistence. Vanilla JS frontend with SortableJS for drag-drop.

**Tech Stack:** Python 3.13, FastAPI, uvicorn, aiosqlite, Pydantic v2, vanilla HTML/CSS/JS, SortableJS, Lucide icons

---

## Task 1: Project Scaffolding

**Files:**
- Create: `pyproject.toml`
- Create: `cardcode/__init__.py`
- Create: `cardcode/__main__.py`
- Create: `config.example.toml`
- Create: `tests/__init__.py`
- Create: `tests/conftest.py`

**Step 1: Create pyproject.toml**

```toml
[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[project]
name = "cardcode"
version = "0.1.0"
description = "Kanban dashboard for Claude Code sessions"
requires-python = ">=3.13"
dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.34",
    "aiosqlite>=0.20",
    "pydantic>=2.10",
    "tomli>=2.0; python_version < '3.11'",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.0",
    "pytest-asyncio>=0.24",
    "httpx>=0.28",
    "pytest-cov>=6.0",
]

[project.scripts]
cardcode = "cardcode.__main__:main"
```

**Step 2: Create cardcode/__init__.py**

```python
__version__ = "0.1.0"
```

**Step 3: Create cardcode/__main__.py**

```python
import uvicorn

def main():
    uvicorn.run("cardcode.app:app", host="0.0.0.0", port=8420, reload=True)

if __name__ == "__main__":
    main()
```

**Step 4: Create config.example.toml**

```toml
[cardcode]
claude_dir = "~/.claude"
projects_dir = ""  # auto-detect from git repos
tmux_socket = ""   # auto-detect
data_dir = "~/.cardcode"
port = 8420
```

**Step 5: Create tests/__init__.py and tests/conftest.py**

```python
# tests/__init__.py
# empty

# tests/conftest.py
import pytest
import tempfile
import os
from pathlib import Path

@pytest.fixture
def tmp_data_dir(tmp_path):
    """Provide a temporary data directory for tests."""
    return tmp_path / "cardcode_data"

@pytest.fixture
def config_overrides(tmp_data_dir):
    """Config overrides pointing to temp directories."""
    return {
        "data_dir": str(tmp_data_dir),
        "claude_dir": str(tmp_data_dir / "claude"),
        "projects_dir": str(tmp_data_dir / "projects"),
    }
```

**Step 6: Install in dev mode**

Run: `cd /mnt/data/projects/cardcode && pip install -e ".[dev]"`
Expected: Successfully installed cardcode + deps

**Step 7: Verify pytest runs**

Run: `cd /mnt/data/projects/cardcode && pytest --co`
Expected: "no tests ran" (collection works, no tests yet)

**Step 8: Commit**

```bash
git add pyproject.toml cardcode/ tests/ config.example.toml
git commit -m "feat: project scaffolding with pyproject.toml and test setup"
```

---

## Task 2: Configuration

**Files:**
- Create: `cardcode/config.py`
- Create: `tests/test_config.py`

**Step 1: Write the failing tests**

```python
# tests/test_config.py
import os
from pathlib import Path

from cardcode.config import load_config, CardCodeConfig


def test_default_config():
    config = load_config()
    assert config.port == 8420
    assert config.data_dir == Path.home() / ".cardcode"
    assert config.claude_dir == Path.home() / ".claude"


def test_config_from_env(monkeypatch):
    monkeypatch.setenv("CARDCODE_PORT", "9999")
    monkeypatch.setenv("CARDCODE_DATA_DIR", "/tmp/cc_test")
    config = load_config()
    assert config.port == 9999
    assert config.data_dir == Path("/tmp/cc_test")


def test_config_from_dict():
    config = load_config(overrides={"port": 7777, "data_dir": "/tmp/custom"})
    assert config.port == 7777
    assert config.data_dir == Path("/tmp/custom")
```

**Step 2: Run tests to verify they fail**

Run: `pytest tests/test_config.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'cardcode.config'`

**Step 3: Write minimal implementation**

```python
# cardcode/config.py
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class CardCodeConfig:
    claude_dir: Path = field(default_factory=lambda: Path.home() / ".claude")
    projects_dir: Path | None = None
    tmux_socket: str | None = None
    data_dir: Path = field(default_factory=lambda: Path.home() / ".cardcode")
    port: int = 8420

    @property
    def db_path(self) -> Path:
        return self.data_dir / "board.db"


def load_config(overrides: dict | None = None) -> CardCodeConfig:
    """Load config from env vars, with optional dict overrides taking precedence."""
    kwargs: dict = {}

    env_map = {
        "CARDCODE_CLAUDE_DIR": ("claude_dir", Path),
        "CARDCODE_PROJECTS_DIR": ("projects_dir", Path),
        "CARDCODE_TMUX_SOCKET": ("tmux_socket", str),
        "CARDCODE_DATA_DIR": ("data_dir", Path),
        "CARDCODE_PORT": ("port", int),
    }

    for env_key, (field_name, type_fn) in env_map.items():
        val = os.environ.get(env_key)
        if val:
            kwargs[field_name] = type_fn(val)

    if overrides:
        for k, v in overrides.items():
            if k in ("claude_dir", "projects_dir", "data_dir") and v is not None:
                kwargs[k] = Path(v)
            else:
                kwargs[k] = v

    return CardCodeConfig(**kwargs)
```

**Step 4: Run tests to verify they pass**

Run: `pytest tests/test_config.py -v`
Expected: 3 passed

**Step 5: Commit**

```bash
git add cardcode/config.py tests/test_config.py
git commit -m "feat: config loading from env vars with defaults"
```

---

## Task 3: Database + Migrations

**Files:**
- Create: `cardcode/database.py`
- Create: `tests/test_database.py`

**Step 1: Write the failing tests**

```python
# tests/test_database.py
import pytest
import pytest_asyncio
import aiosqlite
from pathlib import Path

from cardcode.database import init_db, get_db


@pytest.fixture
def db_path(tmp_path):
    return tmp_path / "test.db"


@pytest.mark.asyncio
async def test_init_db_creates_tables(db_path):
    await init_db(db_path)
    async with aiosqlite.connect(db_path) as db:
        cursor = await db.execute(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        )
        tables = [row[0] for row in await cursor.fetchall()]
    assert "cards" in tables
    assert "queued_prompts" in tables
    assert "projects" in tables


@pytest.mark.asyncio
async def test_init_db_is_idempotent(db_path):
    await init_db(db_path)
    await init_db(db_path)  # should not raise
    async with aiosqlite.connect(db_path) as db:
        cursor = await db.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='cards'"
        )
        assert await cursor.fetchone() is not None


@pytest.mark.asyncio
async def test_cards_table_columns(db_path):
    await init_db(db_path)
    async with aiosqlite.connect(db_path) as db:
        cursor = await db.execute("PRAGMA table_info(cards)")
        columns = {row[1] for row in await cursor.fetchall()}
    expected = {
        "id", "title", "description", "project", "project_path",
        "column_name", "position", "provider", "session_id",
        "tmux_session", "jsonl_path", "session_status",
        "cost_usd", "input_tokens", "output_tokens", "context_pct",
        "initial_prompt", "handoff_notes", "manual_overrides",
        "is_launching", "created_at", "started_at", "completed_at",
        "updated_at",
    }
    assert expected.issubset(columns)
```

**Step 2: Run tests to verify they fail**

Run: `pytest tests/test_database.py -v`
Expected: FAIL

**Step 3: Write minimal implementation**

```python
# cardcode/database.py
from __future__ import annotations

import aiosqlite
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS cards (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    project TEXT,
    project_path TEXT,
    column_name TEXT NOT NULL DEFAULT 'backlog',
    position REAL NOT NULL DEFAULT 0,
    provider TEXT DEFAULT 'claude-code',
    session_id TEXT,
    tmux_session TEXT,
    jsonl_path TEXT,
    session_status TEXT,
    cost_usd REAL DEFAULT 0,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    context_pct REAL DEFAULT 0,
    initial_prompt TEXT,
    handoff_notes TEXT,
    manual_overrides TEXT DEFAULT '{}',
    is_launching INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    started_at TEXT,
    completed_at TEXT,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS queued_prompts (
    id TEXT PRIMARY KEY,
    card_id TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
    prompt_text TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
    name TEXT PRIMARY KEY,
    path TEXT NOT NULL,
    last_seen TEXT NOT NULL
);
"""


async def init_db(db_path: Path) -> None:
    """Initialize the database with schema. Idempotent via IF NOT EXISTS."""
    db_path.parent.mkdir(parents=True, exist_ok=True)
    async with aiosqlite.connect(db_path) as db:
        await db.executescript(SCHEMA)
        await db.commit()


async def get_db(db_path: Path) -> aiosqlite.Connection:
    """Get a database connection with row factory enabled."""
    db = await aiosqlite.connect(db_path)
    db.row_factory = aiosqlite.Row
    await db.execute("PRAGMA journal_mode=WAL")
    await db.execute("PRAGMA foreign_keys=ON")
    return db
```

**Step 4: Run tests to verify they pass**

Run: `pytest tests/test_database.py -v`
Expected: 3 passed

**Step 5: Commit**

```bash
git add cardcode/database.py tests/test_database.py
git commit -m "feat: SQLite database schema with cards, queued_prompts, projects tables"
```

---

## Task 4: Pydantic Models + KSUID

**Files:**
- Create: `cardcode/models.py`
- Create: `tests/test_models.py`

**Step 1: Write the failing tests**

```python
# tests/test_models.py
from cardcode.models import CardCreate, Card, CardUpdate, CardMove, generate_ksuid


def test_generate_ksuid_is_string():
    kid = generate_ksuid()
    assert isinstance(kid, str)
    assert len(kid) > 10


def test_generate_ksuid_is_time_sortable():
    ids = [generate_ksuid() for _ in range(10)]
    assert ids == sorted(ids)


def test_card_create_defaults():
    card = CardCreate(title="Test task")
    assert card.title == "Test task"
    assert card.column_name == "backlog"
    assert card.provider == "claude-code"


def test_card_from_row():
    row = {
        "id": "abc123",
        "title": "Test",
        "description": None,
        "project": None,
        "project_path": None,
        "column_name": "backlog",
        "position": 0.0,
        "provider": "claude-code",
        "session_id": None,
        "tmux_session": None,
        "jsonl_path": None,
        "session_status": None,
        "cost_usd": 0.0,
        "input_tokens": 0,
        "output_tokens": 0,
        "context_pct": 0.0,
        "initial_prompt": None,
        "handoff_notes": None,
        "manual_overrides": "{}",
        "is_launching": 0,
        "created_at": "2026-03-06T12:00:00Z",
        "started_at": None,
        "completed_at": None,
        "updated_at": "2026-03-06T12:00:00Z",
    }
    card = Card(**row)
    assert card.id == "abc123"
    assert card.title == "Test"


def test_card_update_partial():
    update = CardUpdate(title="New title")
    assert update.title == "New title"
    assert update.description is None
    # Only set fields should be in the dump
    data = update.model_dump(exclude_none=True)
    assert "title" in data
    assert "description" not in data


def test_card_move():
    move = CardMove(column_name="active", position=1.5)
    assert move.column_name == "active"
    assert move.position == 1.5
```

**Step 2: Run tests to verify they fail**

Run: `pytest tests/test_models.py -v`
Expected: FAIL

**Step 3: Write minimal implementation**

```python
# cardcode/models.py
from __future__ import annotations

import os
import struct
import time
from pydantic import BaseModel, Field


def generate_ksuid() -> str:
    """Generate a KSUID: 4-byte timestamp (epoch offset) + 16-byte random, base36-encoded."""
    epoch_offset = 1400000000
    ts = int(time.time()) - epoch_offset
    payload = struct.pack(">I", ts) + os.urandom(16)
    # Convert to base36 for sortability and readability
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
```

**Step 4: Run tests to verify they pass**

Run: `pytest tests/test_models.py -v`
Expected: 6 passed

**Step 5: Commit**

```bash
git add cardcode/models.py tests/test_models.py
git commit -m "feat: Pydantic models with KSUID generation"
```

---

## Task 5: WebSocket Manager

**Files:**
- Create: `cardcode/websocket.py`
- Create: `tests/test_websocket.py`

**Step 1: Write the failing tests**

```python
# tests/test_websocket.py
import pytest
import asyncio
from unittest.mock import AsyncMock, MagicMock

from cardcode.websocket import ConnectionManager


@pytest.mark.asyncio
async def test_connect_and_disconnect():
    manager = ConnectionManager()
    ws = AsyncMock()
    await manager.connect(ws)
    assert ws in manager.active_connections
    manager.disconnect(ws)
    assert ws not in manager.active_connections


@pytest.mark.asyncio
async def test_broadcast():
    manager = ConnectionManager()
    ws1 = AsyncMock()
    ws2 = AsyncMock()
    await manager.connect(ws1)
    await manager.connect(ws2)
    await manager.broadcast({"type": "test", "data": "hello"})
    ws1.send_json.assert_called_once_with({"type": "test", "data": "hello"})
    ws2.send_json.assert_called_once_with({"type": "test", "data": "hello"})


@pytest.mark.asyncio
async def test_broadcast_removes_dead_connections():
    manager = ConnectionManager()
    ws_alive = AsyncMock()
    ws_dead = AsyncMock()
    ws_dead.send_json.side_effect = Exception("connection closed")
    await manager.connect(ws_alive)
    await manager.connect(ws_dead)
    await manager.broadcast({"type": "test"})
    assert ws_dead not in manager.active_connections
    assert ws_alive in manager.active_connections
```

**Step 2: Run tests to verify they fail**

Run: `pytest tests/test_websocket.py -v`
Expected: FAIL

**Step 3: Write minimal implementation**

```python
# cardcode/websocket.py
from __future__ import annotations

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        dead = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                dead.append(connection)
        for conn in dead:
            self.active_connections.remove(conn)
```

**Step 4: Run tests to verify they pass**

Run: `pytest tests/test_websocket.py -v`
Expected: 3 passed

**Step 5: Commit**

```bash
git add cardcode/websocket.py tests/test_websocket.py
git commit -m "feat: WebSocket connection manager with broadcast"
```

---

## Task 6: FastAPI App Factory + Health Endpoint

**Files:**
- Create: `cardcode/app.py`
- Create: `tests/test_app.py`

**Step 1: Write the failing tests**

```python
# tests/test_app.py
import pytest
from httpx import AsyncClient, ASGITransport

from cardcode.app import create_app


@pytest.fixture
def app(tmp_path):
    return create_app(overrides={"data_dir": str(tmp_path / "data")})


@pytest.mark.asyncio
async def test_health_endpoint(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_static_index(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/")
    # Should serve index.html or return 404 if not yet created
    assert resp.status_code in (200, 404)
```

**Step 2: Run tests to verify they fail**

Run: `pytest tests/test_app.py -v`
Expected: FAIL

**Step 3: Write minimal implementation**

```python
# cardcode/app.py
from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from cardcode.config import load_config, CardCodeConfig
from cardcode.database import init_db
from cardcode.websocket import ConnectionManager


@asynccontextmanager
async def lifespan(app: FastAPI):
    config: CardCodeConfig = app.state.config
    await init_db(config.db_path)
    yield


def create_app(overrides: dict | None = None) -> FastAPI:
    config = load_config(overrides=overrides)
    app = FastAPI(title="CardCode", version="0.1.0", lifespan=lifespan)
    app.state.config = config
    app.state.ws_manager = ConnectionManager()

    @app.get("/health")
    async def health():
        return {"status": "ok"}

    # Mount static files if directory exists
    static_dir = Path(__file__).parent.parent / "static"
    if static_dir.is_dir():
        app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")

    return app


# Default app instance for uvicorn
app = create_app()
```

**Step 4: Update __main__.py to use create_app**

```python
# cardcode/__main__.py
import uvicorn

def main():
    uvicorn.run("cardcode.app:app", host="0.0.0.0", port=8420, reload=True)

if __name__ == "__main__":
    main()
```

**Step 5: Run tests to verify they pass**

Run: `pytest tests/test_app.py -v`
Expected: 2 passed

**Step 6: Commit**

```bash
git add cardcode/app.py cardcode/__main__.py tests/test_app.py
git commit -m "feat: FastAPI app factory with health endpoint and lifespan"
```

---

## Task 7: Card CRUD API Routes

**Files:**
- Create: `cardcode/routes.py`
- Create: `tests/test_routes.py`

**Step 1: Write the failing tests**

```python
# tests/test_routes.py
import pytest
from httpx import AsyncClient, ASGITransport

from cardcode.app import create_app


@pytest.fixture
def app(tmp_path):
    return create_app(overrides={"data_dir": str(tmp_path / "data")})


@pytest.fixture
async def client(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.mark.asyncio
async def test_create_card(client):
    resp = await client.post("/api/cards", json={"title": "Fix login bug"})
    assert resp.status_code == 201
    data = resp.json()
    assert data["title"] == "Fix login bug"
    assert data["column_name"] == "backlog"
    assert data["id"]  # has KSUID


@pytest.mark.asyncio
async def test_list_cards(client):
    await client.post("/api/cards", json={"title": "Card 1"})
    await client.post("/api/cards", json={"title": "Card 2"})
    resp = await client.get("/api/cards")
    assert resp.status_code == 200
    assert len(resp.json()) == 2


@pytest.mark.asyncio
async def test_list_cards_filter_by_project(client):
    await client.post("/api/cards", json={"title": "A", "project": "foo"})
    await client.post("/api/cards", json={"title": "B", "project": "bar"})
    resp = await client.get("/api/cards?project=foo")
    data = resp.json()
    assert len(data) == 1
    assert data[0]["project"] == "foo"


@pytest.mark.asyncio
async def test_update_card(client):
    create = await client.post("/api/cards", json={"title": "Old"})
    card_id = create.json()["id"]
    resp = await client.patch(f"/api/cards/{card_id}", json={"title": "New"})
    assert resp.status_code == 200
    assert resp.json()["title"] == "New"


@pytest.mark.asyncio
async def test_move_card(client):
    create = await client.post("/api/cards", json={"title": "Moveable"})
    card_id = create.json()["id"]
    resp = await client.patch(
        f"/api/cards/{card_id}/move",
        json={"column_name": "active", "position": 1.5},
    )
    assert resp.status_code == 200
    assert resp.json()["column_name"] == "active"
    assert resp.json()["position"] == 1.5


@pytest.mark.asyncio
async def test_delete_card(client):
    create = await client.post("/api/cards", json={"title": "Deleteme"})
    card_id = create.json()["id"]
    resp = await client.delete(f"/api/cards/{card_id}")
    assert resp.status_code == 204
    # Verify gone
    resp = await client.get("/api/cards")
    assert len(resp.json()) == 0


@pytest.mark.asyncio
async def test_get_nonexistent_card_returns_404(client):
    resp = await client.patch("/api/cards/nonexistent", json={"title": "X"})
    assert resp.status_code == 404
```

**Step 2: Run tests to verify they fail**

Run: `pytest tests/test_routes.py -v`
Expected: FAIL

**Step 3: Write the routes implementation**

```python
# cardcode/routes.py
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

        # Get next position in the target column
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
```

**Step 4: Register routes in app.py**

Add to `create_app()` in `cardcode/app.py`, before the static mount:

```python
from cardcode.routes import router
app.include_router(router)
```

**Step 5: Run tests to verify they pass**

Run: `pytest tests/test_routes.py -v`
Expected: 7 passed

**Step 6: Commit**

```bash
git add cardcode/routes.py cardcode/app.py tests/test_routes.py
git commit -m "feat: card CRUD REST API with WebSocket broadcasts"
```

---

## Task 8: Tmux Manager

**Files:**
- Create: `cardcode/tmux_manager.py`
- Create: `tests/test_tmux_manager.py`

**Step 1: Write the failing tests**

Note: tmux tests mock subprocess to avoid requiring tmux in CI.

```python
# tests/test_tmux_manager.py
import pytest
from unittest.mock import patch, MagicMock

from cardcode.tmux_manager import TmuxManager


@pytest.fixture
def tmux():
    return TmuxManager()


def test_session_name_format(tmux):
    name = tmux.make_session_name("my-project")
    assert name.startswith("cc-my-project-")


@patch("cardcode.tmux_manager.subprocess.run")
def test_list_sessions_parses_output(mock_run, tmux):
    mock_run.return_value = MagicMock(
        returncode=0,
        stdout="cc-proj-abc123: 1 windows (created Mon Mar  6 12:00:00 2026)\n",
    )
    sessions = tmux.list_sessions()
    assert len(sessions) == 1
    assert sessions[0]["name"] == "cc-proj-abc123"


@patch("cardcode.tmux_manager.subprocess.run")
def test_list_sessions_empty_when_no_server(mock_run, tmux):
    mock_run.return_value = MagicMock(returncode=1, stdout="", stderr="no server running")
    sessions = tmux.list_sessions()
    assert sessions == []


@patch("cardcode.tmux_manager.subprocess.run")
def test_spawn_session(mock_run, tmux):
    mock_run.return_value = MagicMock(returncode=0)
    name = tmux.spawn_session(
        project_path="/home/user/projects/myapp",
        project_name="myapp",
        initial_prompt="Fix the bug",
    )
    assert name.startswith("cc-myapp-")
    assert mock_run.called


@patch("cardcode.tmux_manager.subprocess.run")
def test_send_keys(mock_run, tmux):
    mock_run.return_value = MagicMock(returncode=0)
    tmux.send_keys("cc-proj-abc", "hello world")
    mock_run.assert_called()
    call_args = mock_run.call_args[0][0]
    assert "send-keys" in call_args


@patch("cardcode.tmux_manager.subprocess.run")
def test_kill_session(mock_run, tmux):
    mock_run.return_value = MagicMock(returncode=0)
    tmux.kill_session("cc-proj-abc")
    call_args = mock_run.call_args[0][0]
    assert "kill-session" in call_args
```

**Step 2: Run tests to verify they fail**

Run: `pytest tests/test_tmux_manager.py -v`
Expected: FAIL

**Step 3: Write minimal implementation**

```python
# cardcode/tmux_manager.py
from __future__ import annotations

import os
import subprocess
import time


class TmuxManager:
    def __init__(self, socket: str | None = None):
        self.socket = socket
        self.prefix = "cc-"

    def _cmd(self, *args: str) -> list[str]:
        cmd = ["tmux"]
        if self.socket:
            cmd += ["-S", self.socket]
        cmd += list(args)
        return cmd

    def make_session_name(self, project_name: str) -> str:
        suffix = hex(int(time.time() * 1000))[-6:]
        safe_name = project_name.replace("/", "-").replace(" ", "-")
        return f"{self.prefix}{safe_name}-{suffix}"

    def list_sessions(self) -> list[dict]:
        result = subprocess.run(
            self._cmd("list-sessions"),
            capture_output=True, text=True,
        )
        if result.returncode != 0:
            return []
        sessions = []
        for line in result.stdout.strip().splitlines():
            name = line.split(":")[0].strip()
            if name.startswith(self.prefix):
                sessions.append({"name": name, "raw": line})
        return sessions

    def spawn_session(
        self,
        project_path: str,
        project_name: str,
        initial_prompt: str | None = None,
    ) -> str:
        session_name = self.make_session_name(project_name)
        cmd = self._cmd(
            "new-session", "-d", "-s", session_name, "-c", project_path,
        )
        subprocess.run(cmd, check=True)

        # Launch claude in the session
        claude_cmd = "claude"
        if initial_prompt:
            # Use --prompt flag for non-interactive prompt
            claude_cmd = f"claude --prompt {_shell_quote(initial_prompt)}"
        self.send_keys(session_name, claude_cmd)

        return session_name

    def send_keys(self, session_name: str, text: str) -> None:
        subprocess.run(
            self._cmd("send-keys", "-t", session_name, text, "Enter"),
            check=True,
        )

    def kill_session(self, session_name: str) -> None:
        subprocess.run(
            self._cmd("kill-session", "-t", session_name),
            check=True,
        )

    def capture_pane(self, session_name: str, lines: int = 50) -> str:
        result = subprocess.run(
            self._cmd("capture-pane", "-t", session_name, "-p", "-S", f"-{lines}"),
            capture_output=True, text=True,
        )
        return result.stdout if result.returncode == 0 else ""

    def is_session_alive(self, session_name: str) -> bool:
        result = subprocess.run(
            self._cmd("has-session", "-t", session_name),
            capture_output=True,
        )
        return result.returncode == 0


def _shell_quote(s: str) -> str:
    """Simple shell quoting."""
    return "'" + s.replace("'", "'\\''") + "'"
```

**Step 4: Run tests to verify they pass**

Run: `pytest tests/test_tmux_manager.py -v`
Expected: 6 passed

**Step 5: Commit**

```bash
git add cardcode/tmux_manager.py tests/test_tmux_manager.py
git commit -m "feat: tmux session manager for spawn/send/kill/capture"
```

---

## Task 9: Session Watcher (JSONL Metrics Parsing)

**Files:**
- Create: `cardcode/session_watcher.py`
- Create: `tests/test_session_watcher.py`

**Step 1: Write the failing tests**

```python
# tests/test_session_watcher.py
import json
import pytest
from pathlib import Path

from cardcode.session_watcher import parse_jsonl_metrics, detect_session_status


@pytest.fixture
def jsonl_file(tmp_path):
    path = tmp_path / "session.jsonl"
    lines = [
        {"type": "cost", "costUsd": 0.05, "inputTokens": 1000, "outputTokens": 500},
        {"type": "cost", "costUsd": 0.12, "inputTokens": 2500, "outputTokens": 1200},
    ]
    path.write_text("\n".join(json.dumps(l) for l in lines))
    return path


def test_parse_jsonl_metrics(jsonl_file):
    metrics = parse_jsonl_metrics(jsonl_file)
    assert metrics["cost_usd"] == pytest.approx(0.12)
    assert metrics["input_tokens"] == 2500
    assert metrics["output_tokens"] == 1200


def test_parse_jsonl_metrics_empty(tmp_path):
    path = tmp_path / "empty.jsonl"
    path.write_text("")
    metrics = parse_jsonl_metrics(path)
    assert metrics["cost_usd"] == 0.0
    assert metrics["input_tokens"] == 0
    assert metrics["output_tokens"] == 0


def test_parse_jsonl_metrics_missing_file(tmp_path):
    path = tmp_path / "nope.jsonl"
    metrics = parse_jsonl_metrics(path)
    assert metrics["cost_usd"] == 0.0


def test_detect_session_status_alive():
    pane_text = "Some output from claude\nProcessing files...\n█"
    status = detect_session_status(pane_text, session_alive=True)
    assert status == "alive"


def test_detect_session_status_idle():
    pane_text = "Task completed.\n\n> "
    status = detect_session_status(pane_text, session_alive=True)
    assert status == "idle"


def test_detect_session_status_waiting():
    pane_text = "Do you want to proceed? (y/n)"
    status = detect_session_status(pane_text, session_alive=True)
    assert status == "waiting"


def test_detect_session_status_dead():
    status = detect_session_status("", session_alive=False)
    assert status == "dead"
```

**Step 2: Run tests to verify they fail**

Run: `pytest tests/test_session_watcher.py -v`
Expected: FAIL

**Step 3: Write minimal implementation**

```python
# cardcode/session_watcher.py
from __future__ import annotations

import json
import re
from pathlib import Path


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


# Patterns for detecting Claude Code status from tmux pane output
_WAITING_PATTERNS = [
    r"\(y/n\)",
    r"\(Y/n\)",
    r"Do you want to",
    r"Allow\?",
    r"Approve\?",
    r"Permission",
]

_IDLE_PATTERNS = [
    r"^>\s*$",           # bare prompt
    r"^\$\s*$",          # shell prompt
    r"completed",
    r"Task completed",
]


def detect_session_status(pane_text: str, session_alive: bool) -> str:
    """Detect the status of a Claude Code session from pane output.

    Returns: 'alive', 'idle', 'waiting', or 'dead'
    """
    if not session_alive:
        return "dead"

    # Check last few lines for status indicators
    lines = pane_text.strip().splitlines()
    tail = "\n".join(lines[-5:]) if lines else ""

    for pattern in _WAITING_PATTERNS:
        if re.search(pattern, tail, re.IGNORECASE):
            return "waiting"

    for pattern in _IDLE_PATTERNS:
        if re.search(pattern, tail, re.MULTILINE):
            return "idle"

    return "alive"
```

**Step 4: Run tests to verify they pass**

Run: `pytest tests/test_session_watcher.py -v`
Expected: 7 passed

**Step 5: Commit**

```bash
git add cardcode/session_watcher.py tests/test_session_watcher.py
git commit -m "feat: JSONL metrics parser and session status detection"
```

---

## Task 10: Session Spawn + Prompt API Routes

**Files:**
- Modify: `cardcode/routes.py` — add spawn, prompt, queue-prompt, stop endpoints
- Modify: `tests/test_routes.py` — add tests for session endpoints

**Step 1: Write the failing tests**

Add to `tests/test_routes.py`:

```python
from unittest.mock import patch, MagicMock


@pytest.mark.asyncio
@patch("cardcode.routes.TmuxManager")
async def test_spawn_session(mock_tmux_cls, client):
    mock_tmux = MagicMock()
    mock_tmux.spawn_session.return_value = "cc-myapp-abc123"
    mock_tmux_cls.return_value = mock_tmux

    create = await client.post(
        "/api/cards",
        json={"title": "Task", "project": "myapp", "project_path": "/tmp/myapp"},
    )
    card_id = create.json()["id"]

    resp = await client.post(f"/api/cards/{card_id}/spawn")
    assert resp.status_code == 200
    data = resp.json()
    assert data["tmux_session"] == "cc-myapp-abc123"
    assert data["column_name"] == "active"


@pytest.mark.asyncio
@patch("cardcode.routes.TmuxManager")
async def test_send_prompt(mock_tmux_cls, client):
    mock_tmux = MagicMock()
    mock_tmux.spawn_session.return_value = "cc-proj-abc"
    mock_tmux_cls.return_value = mock_tmux

    create = await client.post(
        "/api/cards",
        json={"title": "Task", "project_path": "/tmp/proj"},
    )
    card_id = create.json()["id"]
    await client.post(f"/api/cards/{card_id}/spawn")

    resp = await client.post(
        f"/api/cards/{card_id}/prompt",
        json={"text": "Fix the tests"},
    )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_queue_prompt(client):
    create = await client.post("/api/cards", json={"title": "Task"})
    card_id = create.json()["id"]

    resp = await client.post(
        f"/api/cards/{card_id}/queue-prompt",
        json={"text": "Run the linter"},
    )
    assert resp.status_code == 201
    assert resp.json()["prompt_text"] == "Run the linter"
    assert resp.json()["status"] == "pending"


@pytest.mark.asyncio
@patch("cardcode.routes.TmuxManager")
async def test_stop_session(mock_tmux_cls, client):
    mock_tmux = MagicMock()
    mock_tmux.spawn_session.return_value = "cc-proj-abc"
    mock_tmux_cls.return_value = mock_tmux

    create = await client.post(
        "/api/cards",
        json={"title": "Task", "project_path": "/tmp/proj"},
    )
    card_id = create.json()["id"]
    await client.post(f"/api/cards/{card_id}/spawn")

    resp = await client.post(f"/api/cards/{card_id}/stop")
    assert resp.status_code == 200
    assert resp.json()["session_status"] == "dead"
```

**Step 2: Run tests to verify they fail**

Run: `pytest tests/test_routes.py -v -k "spawn or prompt or stop"`
Expected: FAIL

**Step 3: Add session endpoints to routes.py**

Add to `cardcode/routes.py`:

```python
from cardcode.tmux_manager import TmuxManager
from cardcode.models import QueuedPrompt

# --- Session endpoints ---

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
                pass  # session may already be dead

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
```

Add the import at the top of `routes.py`:
```python
from pydantic import BaseModel as PydanticBaseModel
```

Note: `PromptBody` is defined inline above using existing `BaseModel` import.

**Step 4: Run tests to verify they pass**

Run: `pytest tests/test_routes.py -v`
Expected: 11 passed

**Step 5: Commit**

```bash
git add cardcode/routes.py tests/test_routes.py
git commit -m "feat: session spawn, prompt, queue-prompt, and stop endpoints"
```

---

## Task 11: Project Scanner

**Files:**
- Create: `cardcode/project_scanner.py`
- Create: `tests/test_project_scanner.py`

**Step 1: Write the failing tests**

```python
# tests/test_project_scanner.py
import pytest
from pathlib import Path

from cardcode.project_scanner import scan_projects


def test_scan_finds_git_repos(tmp_path):
    # Create fake git repos
    (tmp_path / "project-a" / ".git").mkdir(parents=True)
    (tmp_path / "project-b" / ".git").mkdir(parents=True)
    (tmp_path / "not-a-project").mkdir()

    projects = scan_projects(tmp_path)
    names = {p["name"] for p in projects}
    assert "project-a" in names
    assert "project-b" in names
    assert "not-a-project" not in names


def test_scan_returns_paths(tmp_path):
    (tmp_path / "myapp" / ".git").mkdir(parents=True)
    projects = scan_projects(tmp_path)
    assert projects[0]["path"] == str(tmp_path / "myapp")


def test_scan_empty_dir(tmp_path):
    projects = scan_projects(tmp_path)
    assert projects == []


def test_scan_nonexistent_dir(tmp_path):
    projects = scan_projects(tmp_path / "nope")
    assert projects == []
```

**Step 2: Run tests to verify they fail**

Run: `pytest tests/test_project_scanner.py -v`
Expected: FAIL

**Step 3: Write minimal implementation**

```python
# cardcode/project_scanner.py
from __future__ import annotations

from pathlib import Path


def scan_projects(base_dir: Path) -> list[dict]:
    """Scan a directory for git repositories (one level deep)."""
    if not base_dir.exists():
        return []

    projects = []
    try:
        for entry in sorted(base_dir.iterdir()):
            if entry.is_dir() and (entry / ".git").exists():
                projects.append({
                    "name": entry.name,
                    "path": str(entry),
                })
    except PermissionError:
        pass

    return projects
```

**Step 4: Run tests to verify they pass**

Run: `pytest tests/test_project_scanner.py -v`
Expected: 4 passed

**Step 5: Commit**

```bash
git add cardcode/project_scanner.py tests/test_project_scanner.py
git commit -m "feat: project scanner discovers git repos"
```

---

## Task 12: Projects + Config + Export API Routes

**Files:**
- Modify: `cardcode/routes.py` — add projects, config, export/import endpoints
- Create: `cardcode/export.py`
- Create: `tests/test_export.py`

**Step 1: Write the failing tests**

```python
# tests/test_export.py
import json
import pytest
from httpx import AsyncClient, ASGITransport

from cardcode.app import create_app


@pytest.fixture
def app(tmp_path):
    projects_dir = tmp_path / "projects"
    projects_dir.mkdir()
    (projects_dir / "myapp" / ".git").mkdir(parents=True)
    return create_app(overrides={
        "data_dir": str(tmp_path / "data"),
        "projects_dir": str(projects_dir),
    })


@pytest.fixture
async def client(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.mark.asyncio
async def test_list_projects(client):
    resp = await client.get("/api/projects")
    assert resp.status_code == 200
    names = [p["name"] for p in resp.json()]
    assert "myapp" in names


@pytest.mark.asyncio
async def test_get_config(client):
    resp = await client.get("/api/config")
    assert resp.status_code == 200
    assert "port" in resp.json()


@pytest.mark.asyncio
async def test_export_import_roundtrip(client):
    # Create cards
    await client.post("/api/cards", json={"title": "Card A"})
    await client.post("/api/cards", json={"title": "Card B"})

    # Export
    resp = await client.post("/api/export")
    assert resp.status_code == 200
    export_data = resp.json()
    assert len(export_data["cards"]) == 2

    # Delete all
    cards = (await client.get("/api/cards")).json()
    for card in cards:
        await client.delete(f"/api/cards/{card['id']}")

    # Verify empty
    assert len((await client.get("/api/cards")).json()) == 0

    # Import
    resp = await client.post("/api/import", json=export_data)
    assert resp.status_code == 200
    assert resp.json()["imported"] == 2

    # Verify restored
    assert len((await client.get("/api/cards")).json()) == 2
```

**Step 2: Run tests to verify they fail**

Run: `pytest tests/test_export.py -v`
Expected: FAIL

**Step 3: Write export.py**

```python
# cardcode/export.py
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
```

**Step 4: Add project/config/export routes to routes.py**

Add to `cardcode/routes.py`:

```python
from cardcode.project_scanner import scan_projects
from cardcode.export import export_board, import_board

@router.get("/projects")
async def list_projects(request: Request) -> list[dict]:
    config = request.app.state.config
    if config.projects_dir:
        return scan_projects(config.projects_dir)
    return []


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
async def import_data(request: Request, data: dict) -> dict:
    count = await import_board(request.app.state.config.db_path, data)
    return {"imported": count}
```

**Step 5: Run tests to verify they pass**

Run: `pytest tests/test_export.py -v`
Expected: 3 passed

**Step 6: Commit**

```bash
git add cardcode/export.py cardcode/routes.py tests/test_export.py
git commit -m "feat: projects, config, and export/import API endpoints"
```

---

## Task 13: Card Reconciler

**Files:**
- Create: `cardcode/card_reconciler.py`
- Create: `tests/test_card_reconciler.py`

**Step 1: Write the failing tests**

```python
# tests/test_card_reconciler.py
import pytest
from unittest.mock import MagicMock, AsyncMock

from cardcode.card_reconciler import match_session_to_card, reconcile_sessions


def test_match_by_tmux_session_name():
    cards = [
        {"id": "1", "tmux_session": "cc-myapp-abc", "project_path": "/p/a", "manual_overrides": "{}"},
        {"id": "2", "tmux_session": None, "project_path": "/p/b", "manual_overrides": "{}"},
    ]
    sessions = [{"name": "cc-myapp-abc"}]
    match = match_session_to_card(sessions[0], cards)
    assert match is not None
    assert match["id"] == "1"


def test_match_by_project_path():
    cards = [
        {"id": "1", "tmux_session": None, "project_path": "/projects/myapp", "manual_overrides": "{}",
         "column_name": "queue", "session_status": None},
    ]
    sessions = [{"name": "cc-myapp-abc"}]
    # No tmux match, would need project path matching
    match = match_session_to_card(sessions[0], cards)
    # Returns None since no tmux_session match and name matching is best-effort
    assert match is None  # name heuristic not strong enough alone


def test_no_match_returns_none():
    cards = [
        {"id": "1", "tmux_session": "cc-other-xyz", "project_path": "/p/other", "manual_overrides": "{}"},
    ]
    sessions = [{"name": "cc-newproject-abc"}]
    match = match_session_to_card(sessions[0], cards)
    assert match is None


def test_match_skips_launching_cards():
    cards = [
        {"id": "1", "tmux_session": "cc-myapp-abc", "project_path": "/p/a",
         "manual_overrides": "{}", "is_launching": 1},
    ]
    sessions = [{"name": "cc-myapp-abc"}]
    match = match_session_to_card(sessions[0], cards, skip_launching=True)
    assert match is None
```

**Step 2: Run tests to verify they fail**

Run: `pytest tests/test_card_reconciler.py -v`
Expected: FAIL

**Step 3: Write minimal implementation**

```python
# cardcode/card_reconciler.py
from __future__ import annotations

import json


def match_session_to_card(
    session: dict,
    cards: list[dict],
    skip_launching: bool = True,
) -> dict | None:
    """Match a tmux session to a card using cascade matching.

    Cascade: session_id -> tmux_name -> (future: branch -> project_path)
    """
    session_name = session["name"]

    for card in cards:
        if skip_launching and card.get("is_launching"):
            continue

        # Match by tmux session name (strongest signal)
        if card.get("tmux_session") == session_name:
            return card

    return None


def find_unmatched_sessions(
    sessions: list[dict],
    cards: list[dict],
) -> list[dict]:
    """Find tmux sessions that don't match any existing card."""
    matched_names = {
        card["tmux_session"] for card in cards
        if card.get("tmux_session")
    }
    return [s for s in sessions if s["name"] not in matched_names]
```

**Step 4: Run tests to verify they pass**

Run: `pytest tests/test_card_reconciler.py -v`
Expected: 4 passed

**Step 5: Commit**

```bash
git add cardcode/card_reconciler.py tests/test_card_reconciler.py
git commit -m "feat: card reconciler with cascade session matching"
```

---

## Task 14: Prompt Queue Manager

**Files:**
- Create: `cardcode/prompt_queue.py`
- Create: `tests/test_prompt_queue.py`

**Step 1: Write the failing tests**

```python
# tests/test_prompt_queue.py
import pytest
from pathlib import Path

from cardcode.database import init_db, get_db
from cardcode.models import generate_ksuid
from cardcode.prompt_queue import get_next_pending, mark_sent, mark_failed


@pytest.fixture
async def db(tmp_path):
    db_path = tmp_path / "test.db"
    await init_db(db_path)
    conn = await get_db(db_path)
    yield conn
    await conn.close()


@pytest.fixture
async def card_id(db):
    cid = generate_ksuid()
    await db.execute(
        """INSERT INTO cards (id, title, column_name, position, created_at, updated_at)
           VALUES (?, 'Test', 'active', 0, '2026-01-01', '2026-01-01')""",
        (cid,),
    )
    await db.commit()
    return cid


@pytest.mark.asyncio
async def test_get_next_pending_returns_oldest(db, card_id):
    for i, text in enumerate(["first", "second", "third"]):
        await db.execute(
            """INSERT INTO queued_prompts (id, card_id, prompt_text, status, created_at)
               VALUES (?, ?, ?, 'pending', ?)""",
            (generate_ksuid(), card_id, text, f"2026-01-01T00:00:0{i}Z"),
        )
    await db.commit()

    prompt = await get_next_pending(db, card_id)
    assert prompt is not None
    assert prompt["prompt_text"] == "first"


@pytest.mark.asyncio
async def test_get_next_pending_returns_none_when_empty(db, card_id):
    prompt = await get_next_pending(db, card_id)
    assert prompt is None


@pytest.mark.asyncio
async def test_mark_sent(db, card_id):
    pid = generate_ksuid()
    await db.execute(
        """INSERT INTO queued_prompts (id, card_id, prompt_text, status, created_at)
           VALUES (?, ?, 'do stuff', 'pending', '2026-01-01')""",
        (pid, card_id),
    )
    await db.commit()

    await mark_sent(db, pid)
    cursor = await db.execute("SELECT status FROM queued_prompts WHERE id = ?", (pid,))
    row = await cursor.fetchone()
    assert row[0] == "sent"


@pytest.mark.asyncio
async def test_mark_failed(db, card_id):
    pid = generate_ksuid()
    await db.execute(
        """INSERT INTO queued_prompts (id, card_id, prompt_text, status, created_at)
           VALUES (?, ?, 'do stuff', 'pending', '2026-01-01')""",
        (pid, card_id),
    )
    await db.commit()

    await mark_failed(db, pid)
    cursor = await db.execute("SELECT status FROM queued_prompts WHERE id = ?", (pid,))
    row = await cursor.fetchone()
    assert row[0] == "failed"
```

**Step 2: Run tests to verify they fail**

Run: `pytest tests/test_prompt_queue.py -v`
Expected: FAIL

**Step 3: Write minimal implementation**

```python
# cardcode/prompt_queue.py
from __future__ import annotations

import aiosqlite


async def get_next_pending(db: aiosqlite.Connection, card_id: str) -> dict | None:
    """Get the oldest pending prompt for a card."""
    cursor = await db.execute(
        """SELECT * FROM queued_prompts
           WHERE card_id = ? AND status = 'pending'
           ORDER BY created_at ASC LIMIT 1""",
        (card_id,),
    )
    row = await cursor.fetchone()
    return dict(row) if row else None


async def mark_sent(db: aiosqlite.Connection, prompt_id: str) -> None:
    await db.execute(
        "UPDATE queued_prompts SET status = 'sent' WHERE id = ?",
        (prompt_id,),
    )
    await db.commit()


async def mark_failed(db: aiosqlite.Connection, prompt_id: str) -> None:
    await db.execute(
        "UPDATE queued_prompts SET status = 'failed' WHERE id = ?",
        (prompt_id,),
    )
    await db.commit()
```

**Step 4: Run tests to verify they pass**

Run: `pytest tests/test_prompt_queue.py -v`
Expected: 4 passed

**Step 5: Commit**

```bash
git add cardcode/prompt_queue.py tests/test_prompt_queue.py
git commit -m "feat: prompt queue manager for auto-send on idle"
```

---

## Task 15: Background Watcher Loop

**Files:**
- Modify: `cardcode/session_watcher.py` — add the async background loop
- Modify: `cardcode/app.py` — start background watcher on lifespan

**Step 1: Add the background loop to session_watcher.py**

Add to `cardcode/session_watcher.py`:

```python
import asyncio
import logging
from cardcode.config import CardCodeConfig
from cardcode.database import get_db
from cardcode.tmux_manager import TmuxManager
from cardcode.card_reconciler import match_session_to_card, find_unmatched_sessions
from cardcode.prompt_queue import get_next_pending, mark_sent, mark_failed
from cardcode.models import Card, generate_ksuid
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


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
        # Get all active cards
        cursor = await db.execute(
            "SELECT * FROM cards WHERE column_name = 'active' AND tmux_session IS NOT NULL"
        )
        active_cards = [dict(row) for row in await cursor.fetchall()]

        # Get tmux sessions
        sessions = tmux.list_sessions()

        for card in active_cards:
            session_name = card["tmux_session"]
            is_alive = tmux.is_session_alive(session_name)
            pane_text = tmux.capture_pane(session_name) if is_alive else ""

            # Detect status
            new_status = detect_session_status(pane_text, session_alive=is_alive)
            old_status = card.get("session_status")

            # Parse metrics from JSONL if path exists
            metrics = {}
            if card.get("jsonl_path"):
                from pathlib import Path
                metrics = parse_jsonl_metrics(Path(card["jsonl_path"]))

            # Build update
            updates = {"session_status": new_status}
            updates.update(metrics)
            updates["updated_at"] = datetime.now(timezone.utc).isoformat()

            set_clause = ", ".join(f"{k} = ?" for k in updates)
            values = list(updates.values()) + [card["id"]]
            await db.execute(f"UPDATE cards SET {set_clause} WHERE id = ?", values)

            # Broadcast status change
            if new_status != old_status:
                await ws_manager.broadcast({
                    "type": "status_changed",
                    "id": card["id"],
                    "session_status": new_status,
                })

            # Broadcast metrics
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

        # Auto-discover unmatched sessions
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
            logger.info(f"Auto-created card for unmatched session: {session['name']}")

        await db.commit()
    finally:
        await db.close()
```

**Step 2: Wire up the watcher in app.py lifespan**

Update the lifespan in `cardcode/app.py`:

```python
import asyncio
from cardcode.session_watcher import watcher_loop

@asynccontextmanager
async def lifespan(app: FastAPI):
    config: CardCodeConfig = app.state.config
    await init_db(config.db_path)

    # Start background watcher
    watcher_task = asyncio.create_task(
        watcher_loop(config, app.state.ws_manager)
    )

    yield

    watcher_task.cancel()
    try:
        await watcher_task
    except asyncio.CancelledError:
        pass
```

**Step 3: Run all tests to verify nothing breaks**

Run: `pytest -v`
Expected: All tests pass

**Step 4: Commit**

```bash
git add cardcode/session_watcher.py cardcode/app.py
git commit -m "feat: background watcher loop with metrics polling and auto-discovery"
```

---

## Task 16: WebSocket Endpoint

**Files:**
- Modify: `cardcode/app.py` — add WebSocket route

**Step 1: Add WebSocket endpoint**

Add to `create_app()` in `cardcode/app.py`, before the static mount:

```python
from fastapi import WebSocket, WebSocketDisconnect

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    manager = app.state.ws_manager
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()  # keep connection alive
    except WebSocketDisconnect:
        manager.disconnect(websocket)
```

**Step 2: Run all tests**

Run: `pytest -v`
Expected: All pass

**Step 3: Commit**

```bash
git add cardcode/app.py
git commit -m "feat: WebSocket endpoint at /ws for live updates"
```

---

## Task 17: Frontend — HTML Shell + CSS

**Files:**
- Create: `static/index.html`
- Create: `static/css/style.css`

**Step 1: Create the HTML shell**

```html
<!-- static/index.html -->
<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CardCode</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/css/style.css">
    <script>
        // FOUC prevention: apply theme before render
        (function() {
            const theme = localStorage.getItem('cardcode-theme') || 'dark';
            document.documentElement.setAttribute('data-theme', theme);
        })();
    </script>
</head>
<body>
    <header class="toolbar">
        <div class="toolbar-left">
            <h1 class="logo">CardCode</h1>
            <select id="project-filter" class="filter-select">
                <option value="">All Projects</option>
            </select>
        </div>
        <div class="toolbar-right">
            <button id="new-card-btn" class="btn btn-primary">+ New Card</button>
            <button id="theme-toggle" class="btn btn-icon" title="Toggle theme"></button>
            <button id="keyboard-help" class="btn btn-icon" title="Keyboard shortcuts (?)"></button>
        </div>
    </header>

    <main class="board" id="board">
        <div class="column" data-column="backlog">
            <div class="column-header"><h2>Backlog</h2><span class="column-count">0</span></div>
            <div class="column-cards" id="col-backlog"></div>
        </div>
        <div class="column" data-column="queue">
            <div class="column-header"><h2>Queue</h2><span class="column-count">0</span></div>
            <div class="column-cards" id="col-queue"></div>
        </div>
        <div class="column" data-column="active">
            <div class="column-header"><h2>Active</h2><span class="column-count">0</span></div>
            <div class="column-cards" id="col-active"></div>
        </div>
        <div class="column" data-column="review">
            <div class="column-header"><h2>Review</h2><span class="column-count">0</span></div>
            <div class="column-cards" id="col-review"></div>
        </div>
        <div class="column" data-column="done">
            <div class="column-header">
                <h2>Done</h2><span class="column-count">0</span>
                <button class="btn btn-small btn-ghost" id="clear-done">Clear</button>
            </div>
            <div class="column-cards" id="col-done"></div>
        </div>
    </main>

    <!-- Dialogs -->
    <dialog id="card-dialog">
        <form id="card-form">
            <h3 id="card-dialog-title">New Card</h3>
            <label>Title <input type="text" name="title" required></label>
            <label>Description <textarea name="description" rows="3"></textarea></label>
            <label>Project
                <select name="project" id="card-project-select">
                    <option value="">None</option>
                </select>
            </label>
            <label>Initial Prompt <textarea name="initial_prompt" rows="3"></textarea></label>
            <label>Handoff Notes <textarea name="handoff_notes" rows="3"></textarea></label>
            <div class="dialog-actions">
                <button type="button" class="btn" id="card-dialog-cancel">Cancel</button>
                <button type="submit" class="btn btn-primary">Save</button>
            </div>
        </form>
    </dialog>

    <dialog id="spawn-dialog">
        <h3>Spawn Session</h3>
        <p id="spawn-card-title"></p>
        <label>Project Path <input type="text" id="spawn-project-path"></label>
        <label>Initial Prompt <textarea id="spawn-prompt" rows="3"></textarea></label>
        <div class="dialog-actions">
            <button class="btn" id="spawn-cancel">Cancel</button>
            <button class="btn btn-primary" id="spawn-confirm">Spawn</button>
        </div>
    </dialog>

    <dialog id="keyboard-dialog">
        <h3>Keyboard Shortcuts</h3>
        <dl class="shortcuts-list">
            <dt>n</dt><dd>New card</dd>
            <dt>j / k</dt><dd>Move selection down / up</dd>
            <dt>h / l</dt><dd>Move between columns</dd>
            <dt>Enter</dt><dd>Edit selected card</dd>
            <dt>Shift+Right / Left</dt><dd>Move card to next / prev column</dd>
            <dt>/</dt><dd>Focus project filter</dd>
            <dt>?</dt><dd>Show this help</dd>
            <dt>Escape</dt><dd>Close dialog / deselect</dd>
        </dl>
        <button class="btn" id="keyboard-dialog-close">Close</button>
    </dialog>

    <!-- Scripts -->
    <script src="https://cdn.jsdelivr.net/npm/sortablejs@1.15.6/Sortable.min.js"></script>
    <script type="module" src="/js/app.js"></script>
</body>
</html>
```

**Step 2: Create the CSS**

Create `static/css/style.css` with the full theme system, column layout, card styles, dialog styles, status dots, animations, and dark/light mode. This is a large file — see the design doc's "Design Direction" section for color palette and typography guidance.

Key CSS requirements:
- CSS custom properties for theming (`[data-theme="dark"]` / `[data-theme="light"]`)
- Six-column flex layout with horizontal scroll
- Card styles with status dot, metrics display, context gauge
- Smooth transitions (300ms ease-out)
- Pulse animation for "waiting" status dot
- Dialog styling with backdrop
- Space Grotesk for headings, JetBrains Mono for metrics/code

The CSS should be comprehensive (~300-400 lines). The implementing agent should reference `~/.claude/web-design.md` for design preferences.

**Step 3: Run the app and verify visually**

Run: `python -m cardcode`
Expected: Server starts, browser shows the board at localhost:8420

**Step 4: Commit**

```bash
git add static/
git commit -m "feat: frontend HTML shell with Kanban board layout and CSS theme system"
```

---

## Task 18: Frontend — Core JavaScript (API Client + Board Rendering)

**Files:**
- Create: `static/js/app.js`
- Create: `static/js/board.js`
- Create: `static/js/cards.js`

**Step 1: Create the API client and app initialization**

`static/js/app.js` — main entry point:
- Fetch initial cards from `GET /api/cards`
- Fetch projects from `GET /api/projects`
- Render cards into columns
- Set up event listeners for new card button, theme toggle, keyboard help
- Initialize SortableJS on each column
- Connect WebSocket

`static/js/board.js` — board rendering:
- `renderBoard(cards)` — clear all columns, render each card into its column
- `updateColumnCounts()` — update the count badge in each column header
- `setupSortable()` — initialize SortableJS on each `.column-cards` with `onEnd` callback that calls `PATCH /api/cards/:id/move`

`static/js/cards.js` — card component:
- `createCardElement(card)` — return a DOM element for a card
- Card renders differently based on `column_name`:
  - Backlog/Queue: title, project badge, description preview
  - Active: title, project, status dot (colored by session_status), cost, context gauge bar, inline prompt input
  - Done: title, project, final cost, token count
- Status dot: `.status-dot` with class `.alive` / `.idle` / `.waiting` / `.dead`
- Provider badge: small label showing `card.provider`
- Context gauge: horizontal bar, width = `context_pct * 100%`, changes color at 60%+

Each file should be a module (import/export). `app.js` is the entry point with `type="module"`.

**Step 2: Test by running the app**

Run: `python -m cardcode`
Expected: Board renders, can create cards via the new card button, cards appear in backlog

**Step 3: Commit**

```bash
git add static/js/
git commit -m "feat: frontend JS - API client, board rendering, and card components"
```

---

## Task 19: Frontend — Dialogs + Interactions

**Files:**
- Create: `static/js/dialogs.js`

**Step 1: Implement dialog management**

`static/js/dialogs.js`:
- **Card dialog:** Open on "New Card" button or card edit. Populate project dropdown from `/api/projects`. On submit, `POST /api/cards` (create) or `PATCH /api/cards/:id` (update).
- **Spawn dialog:** Open when card is dragged to Active column (or via spawn button). Pre-fill project path and initial prompt from card. On confirm, `POST /api/cards/:id/spawn`.
- **Inline prompt:** On active cards, an input field sends `POST /api/cards/:id/prompt` on Enter.
- **Stop button:** On active cards, calls `POST /api/cards/:id/stop` with confirmation.
- **Clear done:** Bulk-move Done cards to Archive via `PATCH /api/cards/:id/move` for each.

**Step 2: Test dialogs manually**

Run: `python -m cardcode`
Expected: All dialogs open/close, forms submit correctly

**Step 3: Commit**

```bash
git add static/js/dialogs.js
git commit -m "feat: frontend dialogs for card CRUD, spawn, and prompt injection"
```

---

## Task 20: Frontend — WebSocket + Live Updates

**Files:**
- Create: `static/js/websocket.js`

**Step 1: Implement WebSocket client**

`static/js/websocket.js`:
- Connect to `ws://${location.host}/ws`
- Auto-reconnect with exponential backoff (1s, 2s, 4s, max 30s)
- Handle message types:
  - `card_created` — add card to board
  - `card_updated` — re-render card in place
  - `card_deleted` — remove card from DOM
  - `card_moved` — move card to new column
  - `metrics_updated` — update cost/context display on card
  - `status_changed` — update status dot on card
  - `projects_refreshed` — update project filter dropdown
  - `prompt_sent` — flash indicator on card
- Export a `connectWebSocket(onMessage)` function

**Step 2: Test by opening two browser tabs**

Run: `python -m cardcode`
Expected: Create a card in one tab, it appears in the other tab instantly

**Step 3: Commit**

```bash
git add static/js/websocket.js
git commit -m "feat: WebSocket client with auto-reconnect and live board updates"
```

---

## Task 21: Frontend — Keyboard Navigation + Notifications

**Files:**
- Create: `static/js/keyboard.js`
- Create: `static/js/notifications.js`

**Step 1: Implement keyboard navigation**

`static/js/keyboard.js`:
- Track selected card (`.card.selected` class)
- `j` / `k` — move selection down/up within column
- `h` / `l` — move selection between columns
- `n` — open new card dialog
- `Enter` — edit selected card
- `Shift+ArrowRight` / `Shift+ArrowLeft` — move selected card to next/prev column
- `/` — focus project filter
- `?` — toggle keyboard help dialog
- `Escape` — close dialog or deselect

**Step 2: Implement browser notifications**

`static/js/notifications.js`:
- Request notification permission on first interaction
- Fire notification when:
  - `status_changed` to `waiting` — "Card X needs attention"
  - `status_changed` to `dead` — "Card X session ended"
  - `metrics_updated` with `context_pct > 0.6` — "Card X context at N%"

**Step 3: Test keyboard and notifications**

Run: `python -m cardcode`
Expected: Keyboard shortcuts work, notifications fire on status changes

**Step 4: Commit**

```bash
git add static/js/keyboard.js static/js/notifications.js
git commit -m "feat: vim-style keyboard navigation and browser notifications"
```

---

## Task 22: Docker

**Files:**
- Create: `Dockerfile`
- Create: `compose.yaml`

**Step 1: Create Dockerfile**

```dockerfile
FROM python:3.13-slim

WORKDIR /app

# Install tmux
RUN apt-get update && apt-get install -y --no-install-recommends tmux && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml .
RUN pip install --no-cache-dir .

COPY . .

EXPOSE 8420

HEALTHCHECK --interval=30s --timeout=5s CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8420/health')"

CMD ["python", "-m", "cardcode"]
```

**Step 2: Create compose.yaml**

```yaml
services:
  cardcode:
    build: .
    ports:
      - "8420:8420"
    environment:
      TZ: America/New_York
      CARDCODE_CLAUDE_DIR: /claude
      CARDCODE_PROJECTS_DIR: /projects
    volumes:
      - ${HOME}/.claude:/claude:ro
      - ${PROJECTS_DIR:-/mnt/data/projects}:/projects:ro
      - cardcode_data:/data
      - /tmp/tmux-1000:/tmp/tmux-1000  # tmux socket
    restart: unless-stopped

volumes:
  cardcode_data:
```

**Step 3: Verify Docker build**

Run: `docker build -t cardcode .`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add Dockerfile compose.yaml
git commit -m "feat: Dockerfile and compose.yaml for containerized deployment"
```

---

## Task 23: Integration Test + Final Verification

**Files:**
- Create: `tests/test_integration.py`

**Step 1: Write integration test**

```python
# tests/test_integration.py
import pytest
from httpx import AsyncClient, ASGITransport

from cardcode.app import create_app


@pytest.fixture
def app(tmp_path):
    projects_dir = tmp_path / "projects"
    projects_dir.mkdir()
    (projects_dir / "testapp" / ".git").mkdir(parents=True)
    return create_app(overrides={
        "data_dir": str(tmp_path / "data"),
        "projects_dir": str(projects_dir),
    })


@pytest.fixture
async def client(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.mark.asyncio
async def test_full_card_lifecycle(client):
    """Test creating, moving, updating, and deleting a card."""
    # Create
    resp = await client.post("/api/cards", json={
        "title": "Implement auth",
        "project": "testapp",
        "initial_prompt": "Add JWT auth to the API",
    })
    assert resp.status_code == 201
    card = resp.json()
    card_id = card["id"]
    assert card["column_name"] == "backlog"

    # Move to queue
    resp = await client.patch(f"/api/cards/{card_id}/move", json={
        "column_name": "queue",
        "position": 1.0,
    })
    assert resp.status_code == 200
    assert resp.json()["column_name"] == "queue"

    # Update description
    resp = await client.patch(f"/api/cards/{card_id}", json={
        "description": "JWT auth with refresh tokens",
    })
    assert resp.status_code == 200
    assert resp.json()["description"] == "JWT auth with refresh tokens"

    # Queue a prompt
    resp = await client.post(f"/api/cards/{card_id}/queue-prompt", json={
        "text": "Also add rate limiting",
    })
    assert resp.status_code == 201

    # Move to done
    resp = await client.patch(f"/api/cards/{card_id}/move", json={
        "column_name": "done",
        "position": 1.0,
    })
    assert resp.json()["column_name"] == "done"

    # Delete
    resp = await client.delete(f"/api/cards/{card_id}")
    assert resp.status_code == 204


@pytest.mark.asyncio
async def test_projects_and_config(client):
    resp = await client.get("/api/projects")
    assert resp.status_code == 200
    assert any(p["name"] == "testapp" for p in resp.json())

    resp = await client.get("/api/config")
    assert resp.status_code == 200
    assert resp.json()["port"] == 8420
```

**Step 2: Run all tests**

Run: `pytest -v --tb=short`
Expected: All tests pass

**Step 3: Run the app and test manually**

Run: `python -m cardcode`
Expected: Full board works — create cards, drag between columns, see live updates

**Step 4: Final commit**

```bash
git add tests/test_integration.py
git commit -m "feat: integration tests for full card lifecycle"
```

---

## Summary

| Task | Component | Files | Tests |
|------|-----------|-------|-------|
| 1 | Project scaffolding | pyproject.toml, __init__, __main__, conftest | - |
| 2 | Configuration | config.py | 3 |
| 3 | Database + schema | database.py | 3 |
| 4 | Pydantic models + KSUID | models.py | 6 |
| 5 | WebSocket manager | websocket.py | 3 |
| 6 | App factory + health | app.py | 2 |
| 7 | Card CRUD routes | routes.py | 7 |
| 8 | Tmux manager | tmux_manager.py | 6 |
| 9 | Session watcher (parsing) | session_watcher.py | 7 |
| 10 | Session API routes | routes.py (extend) | 4 |
| 11 | Project scanner | project_scanner.py | 4 |
| 12 | Projects/config/export routes | routes.py, export.py | 3 |
| 13 | Card reconciler | card_reconciler.py | 4 |
| 14 | Prompt queue | prompt_queue.py | 4 |
| 15 | Background watcher loop | session_watcher.py, app.py | - |
| 16 | WebSocket endpoint | app.py | - |
| 17 | Frontend HTML + CSS | index.html, style.css | - |
| 18 | Frontend JS core | app.js, board.js, cards.js | - |
| 19 | Frontend dialogs | dialogs.js | - |
| 20 | Frontend WebSocket | websocket.js | - |
| 21 | Frontend keyboard + notifications | keyboard.js, notifications.js | - |
| 22 | Docker | Dockerfile, compose.yaml | - |
| 23 | Integration tests | test_integration.py | 2 |

**Total: 23 tasks, ~58 backend tests, 23 commits**

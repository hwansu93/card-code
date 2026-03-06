# CardCode — Design Document

## Overview

CardCode is a self-hosted web dashboard for managing Claude Code sessions through a Kanban interface. It runs on a remote Linux machine, served over Tailscale, and provides visual project management with live session monitoring, cost tracking, and prompt injection — all without replacing the existing orchestrator workflow, auto-memory, or agent team system.

**The core idea:** Cards on a Kanban board represent Claude Code sessions. Drag a card to Active, a Claude session spawns in the right project folder. See its status, cost, and context usage at a glance. Send prompts from the browser. Move to Done when finished.

## Problem Statement

The user (Danny) runs Claude Code on a remote machine via Termius/tmux over Tailscale. He has evaluated multiple tools (CodeFire, Bosun, Vibe Kanban) and keeps coming back for the same reason: he wants a visual Kanban board for managing work, but every existing tool bundles it with memory systems, agent orchestration, and other features that conflict with his existing sophisticated setup (strict orchestrator pattern, auto-memory, skills, context handoff documents, agent teams).

CardCode fills the gap: a visual layer on top of his existing workflow, not a replacement for it.

## Key Decisions

| Decision | Choice | Reasoning |
|----------|--------|-----------|
| Card model | One card = one session | Simplest data model. Cards don't accumulate sessions. New work = new card. |
| Session spawn | Spawn on confirm (dialog) | Dialog with pre-filled project path and prompt. Lets user tweak before launching. |
| Auto-discovery | Auto-create card in Active | Board always reflects reality. Every running Claude session gets a card. |
| Deployment | Docker Compose | Consistent with existing infrastructure. Isolated from system Python. |
| Project discovery | Auto-scan /mnt/data/projects/ | Each subdirectory becomes a filterable project tag. No manual config. |
| Authentication | None — Tailscale trust boundary | If you can reach it on Tailscale, you're in. |
| Frontend | Single-page, WebSocket-driven | One HTML page, all updates via WebSocket. Most responsive. No page reloads. |
| Tech stack | FastAPI + vanilla JS + SortableJS + SQLite | No React, no build step. Python backend, vanilla frontend. |

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Mac (Browser)                                      │
│  Browser → https://nexus:8420  ←── Tailscale ──┐   │
└─────────────────────────────────────────────────┤───┘
                                                  │
┌─────────────────────────────────────────────────┤───┐
│  Remote Machine (Docker)                        │   │
│                                                 │   │
│  ┌─────────────────────────────────────────┐    │   │
│  │  cardcode container                 │    │   │
│  │                                         │    │   │
│  │  FastAPI (uvicorn :8420)                │    │   │
│  │  ├── REST API (card CRUD)               │    │   │
│  │  ├── WebSocket (live state push)        │    │   │
│  │  ├── SessionWatcher (poll tmux + JSONL) │    │   │
│  │  └── Static files (HTML/CSS/JS)         │    │   │
│  │                                         │    │   │
│  │  SQLite (./data/cardcode.db)        │    │   │
│  └──────────┬──────────┬───────────────────┘    │   │
│             │          │                        │   │
│    mounted volumes:                             │   │
│    /home/danny/.claude (ro) ← session JSONL     │   │
│    /tmp/tmux-1000      ← tmux socket            │   │
│    /mnt/data/projects  (ro) ← project discovery │   │
│                                                 │   │
│  tmux server (host) ← controlled via socket     │   │
│  ├── cb-1 (managed session)                     │   │
│  ├── cb-2 (managed session)                     │   │
│  └── ...                                        │   │
└─────────────────────────────────────────────────────┘
```

- Single container runs the entire app
- Reads Claude data and projects as read-only mounts
- Controls tmux on the host via the mounted socket
- tmux sessions named with `cb-` prefix for identification
- Browser connects over Tailscale, no auth

## Data Model

```sql
CREATE TABLE cards (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    title         TEXT NOT NULL,
    description   TEXT DEFAULT '',
    project       TEXT DEFAULT '',
    project_path  TEXT DEFAULT '',
    column_name   TEXT NOT NULL DEFAULT 'backlog',
    position      INTEGER NOT NULL DEFAULT 0,

    -- Session fields (populated when active)
    tmux_session  TEXT,
    jsonl_path    TEXT,
    initial_prompt TEXT DEFAULT '',
    handoff_notes TEXT DEFAULT '',

    -- Metrics (updated by SessionWatcher)
    session_status TEXT DEFAULT 'none',
    cost_usd      REAL DEFAULT 0.0,
    input_tokens  INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    context_pct   REAL DEFAULT 0.0,
    tool_calls    INTEGER DEFAULT 0,

    -- Timestamps
    created_at    TEXT DEFAULT (datetime('now')),
    started_at    TEXT,
    completed_at  TEXT,
    updated_at    TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_cards_column ON cards(column_name, position);
CREATE INDEX idx_cards_project ON cards(project);

CREATE TABLE projects (
    name          TEXT PRIMARY KEY,
    path          TEXT NOT NULL,
    last_seen     TEXT DEFAULT (datetime('now'))
);
```

Design notes:
- Flat card table, no joins needed
- Metrics live on the card (1:1 with session)
- Column as string, position as integer for ordering
- Archive cards stay in the table, just filtered from main view

## Backend Services

### REST API

```
POST   /api/cards              — create a card
PATCH  /api/cards/:id          — update card fields
PATCH  /api/cards/:id/move     — move card to column at position
DELETE /api/cards/:id          — delete a card
GET    /api/cards              — list all cards (optional ?project= filter)
GET    /api/cards/:id          — single card with full details

POST   /api/cards/:id/spawn   — spawn Claude session
POST   /api/cards/:id/prompt  — send prompt to running session
POST   /api/cards/:id/stop    — kill the tmux session

GET    /api/projects           — list discovered projects
```

### WebSocket Protocol

Single WebSocket at `ws://host:8420/ws`. Server pushes all state changes:

```json
{"type": "card_updated",    "card": {...}}
{"type": "card_created",    "card": {...}}
{"type": "card_deleted",    "id": 7}
{"type": "card_moved",      "id": 7, "column": "active", "position": 2}
{"type": "metrics_updated", "id": 7, "cost_usd": 1.23, "context_pct": 0.45}
{"type": "status_changed",  "id": 7, "session_status": "waiting"}
{"type": "projects_refreshed", "projects": [...]}
```

Client sends nothing over WebSocket. All actions go through REST, which triggers WebSocket broadcasts.

### TmuxManager

```python
class TmuxManager:
    PREFIX = "cb-"

    def spawn(card_id, project_path, initial_prompt) -> str:
        # tmux new-session -d -s cb-{id} -c {project_path}
        # tmux send-keys -t cb-{id} "claude" Enter
        # wait 2s, then: tmux send-keys -t cb-{id} "{prompt}" Enter

    def send_prompt(card_id, text) -> bool:
        # tmux send-keys -t cb-{id} "{text}" Enter

    def kill(card_id) -> bool:
        # tmux kill-session -t cb-{id}

    def list_sessions() -> list[str]:
        # tmux list-sessions -F "#{session_name}"
        # filter to cb-* prefix

    def capture_pane(card_id, lines=50) -> str:
        # tmux capture-pane -t cb-{id} -p -l 50

    def detect_status(pane_output) -> str:
        # Pattern match: permission prompt → "waiting"
        # Streaming text → "alive"
        # Claude prompt, no activity → "idle"
        # Session doesn't exist → "dead"
```

### SessionWatcher (background loop)

Fast loop (every 5-10 seconds):
1. List all tmux sessions with `cb-*` prefix
2. For each: capture pane, detect status, update card
3. Scan for non-`cb-*` tmux sessions running claude — auto-create cards
4. For active cards: parse JSONL file for latest metrics
5. Broadcast changes via WebSocket

Slow loop (every 60 seconds):
1. Scan /mnt/data/projects/ for project directories
2. Update projects table

## Frontend

### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  ┌─ Header ────────────────────────────────────────────────────┐ │
│  │  CardCode          [Project: All ▾]  [+ New Card]  [?] │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌─Backlog─┐ ┌─Queue──┐ ┌─Active──┐ ┌─Review─┐ ┌─Done───┐     │
│  │ ┌─────┐ │ │ ┌─────┐│ │ ┌─────┐ │ │ ┌─────┐│ │ ┌─────┐│     │
│  │ │card │ │ │ │card ││ │ │card │ │ │ │card ││ │ │card ││     │
│  │ │     │ │ │ │     ││ │ │ ●   │ │ │ │     ││ │ │     ││     │
│  │ └─────┘ │ │ └─────┘│ │ │$1.2 │ │ │ └─────┘│ │ └─────┘│     │
│  │ ┌─────┐ │ │        │ │ │62%  │ │ │        │ │        │     │
│  │ │card │ │ │        │ │ └─────┘ │ │        │ │ [clear]│     │
│  │ └─────┘ │ │        │ │         │ │        │ │        │     │
│  └─────────┘ └────────┘ └─────────┘ └────────┘ └────────┘     │
│                                                                  │
│  ┌─ Status Bar ────────────────────────────────────────────────┐ │
│  │  3 active · $4.82 today · 2 waiting for input              │ │
│  └─────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

### Card Variants

**Backlog/Queue (no session):**
```
┌──────────────────────┐
│ Fix auth redirect    │  ← title
│ rankready        P2  │  ← project + priority
└──────────────────────┘
```

**Active (live session):**
```
┌──────────────────────┐
│ Fix auth redirect    │
│ rankready        P2  │
│──────────────────────│
│ ● alive    $1.23     │  ← status dot + cost
│ ██████░░░░ 62%       │  ← context window gauge
│ [Send prompt...]     │  ← inline prompt input
└──────────────────────┘
```

**Done:**
```
┌──────────────────────┐
│ Fix auth redirect    │
│ rankready   $3.40    │  ← final cost
│ 145k tokens · 12min  │  ← summary stats
└──────────────────────┘
```

### Status Dot Colors

| Status | Color | Meaning |
|--------|-------|---------|
| alive | Green | Claude actively generating output |
| idle | Blue | At prompt, waiting for user input |
| waiting | Orange (pulsing) | Permission prompt or tool approval needed |
| dead | Gray | Session ended or crashed |

### Spawn Dialog

Shown when dragging a card to Active:

```
┌─── Start Session ──────────────────────┐
│                                        │
│  Project:  /mnt/data/projects/rankready│
│  Prompt:   ┌──────────────────────┐    │
│            │ Fix the auth redirect│    │
│            │ loop in the login... │    │
│            └──────────────────────┘    │
│                                        │
│  Handoff:  (empty — or paste notes)    │
│                                        │
│          [Cancel]  [Start Session]     │
└────────────────────────────────────────┘
```

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| n | New card (inline form in Backlog) |
| j / k | Navigate cards up/down |
| h / l | Navigate columns left/right |
| Enter | Open card detail |
| Escape | Close dialog/detail |
| Shift+→ | Move selected card to next column |
| Shift+← | Move selected card to previous column |
| / | Focus project filter |
| ? | Show keyboard shortcuts help |

### Browser Notifications

Fire when:
- Session status changes to `waiting` (needs attention)
- Session status changes to `dead` (completed or crashed)
- Context window exceeds 60% (warning threshold)

## Session Lifecycle

```
                ┌──────────┐
    Manual ───→ │ BACKLOG  │ ←─── User creates card
    create      └────┬─────┘
                     │ drag
                     ▼
                ┌──────────┐
                │  QUEUE   │     Prioritized, ready to work on
                └────┬─────┘
                     │ drag → spawn dialog → confirm
                     ▼
                ┌──────────┐
  Auto-discover │  ACTIVE  │ ←─── SessionWatcher detects unmanaged
  creates here  │          │      claude sessions in tmux
                │  ● alive │
                │  polling  │ ←── SessionWatcher every 5-10s
                └────┬─────┘
                     │ drag (or auto when session dies)
                     ▼
                ┌──────────┐
                │  REVIEW  │     Session done, review outcome
                └────┬─────┘
                     │ drag
                     ▼
                ┌──────────┐
                │   DONE   │     Verified complete, metrics frozen
                └────┬─────┘
                     │ "Clear completed" button
                     ▼
                ┌──────────┐
                │ ARCHIVE  │     Hidden from main view, queryable
                └──────────┘
```

Transition rules:
- Any → Any via drag-and-drop (no hard restrictions)
- Queue → Active triggers spawn dialog
- Active → Review/Done kills tmux session if alive (with confirmation)
- Auto-discovery creates cards directly in Active
- Session dies naturally → status dot goes gray, card stays in Active until moved
- "Clear completed" on Done column bulk-moves to Archive

Handoff notes:
- Moving out of Active prompts "Save handoff notes?" with last ~50 lines pre-filled
- New cards can include handoff notes from previous work
- Spawn dialog sends handoff notes as part of the initial prompt

## File Structure

```
cardcode/
├── docker-compose.yml
├── Dockerfile
├── requirements.txt
├── app/
│   ├── main.py
│   ├── config.py
│   ├── database.py
│   ├── models.py
│   ├── routes.py
│   ├── websocket.py
│   ├── tmux_manager.py
│   ├── session_watcher.py
│   └── project_scanner.py
├── static/
│   ├── index.html
│   ├── css/
│   │   └── style.css
│   └── js/
│       ├── app.js
│       ├── board.js
│       ├── cards.js
│       ├── dialogs.js
│       ├── keyboard.js
│       └── notifications.js
├── data/
│   └── cardcode.db
└── README.md
```

## Deployment

```yaml
# docker-compose.yml
services:
  cardcode:
    build: .
    ports:
      - "8420:8420"
    volumes:
      - /home/danny/.claude:/data/claude:ro
      - /mnt/data/projects:/data/projects:ro
      - /tmp/tmux-1000:/tmp/tmux-1000
      - ./data:/app/data
    environment:
      TZ: America/New_York
      TMUX_SOCKET: /tmp/tmux-1000/default
      PROJECTS_DIR: /data/projects
      CLAUDE_DIR: /data/claude
    restart: unless-stopped
```

```dockerfile
# Dockerfile
FROM python:3.12-slim
RUN apt-get update && apt-get install -y tmux && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8420
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8420"]
```

Notes:
- tmux installed in container to use client binary against host's socket
- Claude data and projects mounted read-only
- SQLite in Docker volume for persistence across rebuilds
- Port 8420 accessible via Tailscale

## V1 Feature Summary

**In scope:**
1. Kanban board — Backlog / Queue / Active / Review / Done / Archive
2. Session spawning — confirm dialog, tmux new-session, send initial prompt
3. Session status detection — alive/idle/waiting/dead via tmux pane capture
4. Prompt injection — text input on Active cards, tmux send-keys
5. Cost & token metrics — parsed from session JSONL
6. Context window gauge — percentage with color coding
7. WebSocket live updates — all state changes pushed to browser
8. Auto-discovery — detect existing Claude sessions, create cards
9. Project filtering — auto-scanned from /mnt/data/projects/
10. Browser notifications — waiting, dead, context threshold
11. Keyboard navigation — vim-style j/k/h/l navigation
12. Dark theme — developer-focused, matches terminal aesthetic
13. Context handoff field — save notes when session ends, pre-load on spawn

**Explicitly not v1:**
- Embedded terminal viewer (use Termius)
- Auto-respawn / autonomous loops
- Multi-machine sync
- Full-text search across sessions
- Rich reporting / charts
- Mobile responsive layout
- Prompt template library

## Estimated Build Effort

| Component | Effort |
|-----------|--------|
| SQLite schema + FastAPI skeleton | 2-3h |
| Kanban board with drag-and-drop | 4-6h |
| WebSocket real-time updates | 2-3h |
| Session spawning via tmux | 2-3h |
| Session status detection | 2-3h |
| Prompt injection | 1-2h |
| Cost/token metrics from JSONL | 3-4h |
| Context window gauge | 1h |
| Project scanning + filtering | 1-2h |
| Browser notifications | 1h |
| Keyboard navigation | 1-2h |
| Dark theme + styling | 2-3h |
| Context handoff field | 1-2h |
| Docker setup + deployment | 1-2h |
| **Total** | **~24-36h** |

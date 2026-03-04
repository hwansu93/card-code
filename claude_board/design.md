# Claude Board -- Design Document

## Revision History

| Date | Notes |
|------|-------|
| 2026-03-03 | Initial design document |
| 2026-03-04 | Refresh: local-first deployment (any combination of bare metal / Docker / local / remote), card reconciler with smart session-to-card matching, queued prompts with auto-send, Kanban Code inspiration, updated data model (KSUID, float positions, manual overrides), JSON export/import, light + dark mode |

---

## Overview

Claude Board is a self-hosted web dashboard for managing Claude Code sessions through a Kanban interface. Cards represent Claude Code sessions. Drag a card to Active to spawn a tmux session. Live metrics (cost, tokens, context%) update via WebSocket. Inspired by [Kanban Code](https://github.com/langwatch/kanban-code) but built as a web app for cross-device access.

The core idea: a visual layer on top of the existing Claude Code workflow, not a replacement for orchestration, auto-memory, or agent teams.

## Deployment

The app is identical in all deployment modes. Docker is optional packaging, not a requirement.

| Mode | How | Access |
|------|-----|--------|
| Local bare metal | `pip install claude-board` / `python -m claude_board` | localhost:8420 |
| Local Docker | `docker compose up` | localhost:8420 |
| Remote bare metal | Same as local, behind reverse proxy or Tailscale | https://your-host:8420 |
| Remote Docker | Containerized + Tailscale | https://nexus:8420 |

## Architecture

Single FastAPI process with background tasks. No microservices.

```
Browser --> FastAPI (uvicorn :8420)
              |-- REST API (card CRUD, projects, config)
              |-- WebSocket (live state push to all clients)
              |-- SessionWatcher (background task, 5-10s loop)
              |     |-- tmux session discovery
              |     |-- JSONL metrics parsing (cost, tokens, context%)
              |     +-- status detection (alive/idle/waiting/dead)
              |-- CardReconciler (matches sessions -> cards)
              |     +-- cascade: session_id -> tmux_name -> branch -> project_path
              +-- ProjectScanner (60s loop, discovers projects)

SQLite: ~/.claude-board/board.db
Config: ~/.claude-board/config.toml (or env vars)
```

## Configuration

Single `config.toml` (or env vars) with:

| Key | Default | Purpose |
|-----|---------|---------|
| `claude_dir` | `~/.claude` | Where Claude data lives |
| `projects_dir` | auto-detect from git repos | Where projects live |
| `tmux_socket` | auto-detect | tmux socket path |
| `data_dir` | `~/.claude-board/` | SQLite + exports location |
| `port` | `8420` | Server port |

## Authentication

None. Users secure access via Tailscale, reverse proxy, or firewall. The security model is documented but not enforced by the application.

## Data Model

### Persistence

SQLite as primary store. JSON export/import for portability and backup.

### Schema

```sql
CREATE TABLE cards (
    id TEXT PRIMARY KEY,  -- KSUID (time-sortable)
    title TEXT NOT NULL,
    description TEXT,
    project TEXT,
    project_path TEXT,
    column_name TEXT NOT NULL DEFAULT 'backlog',  -- backlog|queue|active|review|done|archive
    position REAL NOT NULL DEFAULT 0,  -- float for ordering within column

    -- session link (optional)
    session_id TEXT,
    tmux_session TEXT,
    jsonl_path TEXT,

    -- metrics (updated by watcher)
    session_status TEXT,  -- alive|idle|waiting|dead|null
    cost_usd REAL DEFAULT 0,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    context_pct REAL DEFAULT 0,

    -- prompts
    initial_prompt TEXT,
    handoff_notes TEXT,

    -- reconciler
    manual_overrides TEXT DEFAULT '{}',  -- JSON: tracks which fields user set manually
    is_launching INTEGER DEFAULT 0,  -- prevents reconciler from overriding mid-launch

    -- timestamps
    created_at TEXT NOT NULL,
    started_at TEXT,
    completed_at TEXT,
    updated_at TEXT NOT NULL
);

CREATE TABLE queued_prompts (
    id TEXT PRIMARY KEY,
    card_id TEXT NOT NULL REFERENCES cards(id),
    prompt_text TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',  -- pending|sent|failed
    created_at TEXT NOT NULL
);

CREATE TABLE projects (
    name TEXT PRIMARY KEY,
    path TEXT NOT NULL,
    last_seen TEXT NOT NULL
);
```

Design notes:
- KSUID primary keys are time-sortable and globally unique
- Float positions allow insertion between cards without reindexing
- `manual_overrides` as JSON tracks which fields the user set manually so the reconciler never overwrites them
- `is_launching` flag prevents the reconciler from interfering during session spawn
- Queued prompts table enables auto-send when a session goes idle

## REST API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/cards` | List all (optional `?project=` filter) |
| POST | `/api/cards` | Create card |
| PATCH | `/api/cards/:id` | Update fields |
| PATCH | `/api/cards/:id/move` | Move to column at position |
| DELETE | `/api/cards/:id` | Delete card |
| POST | `/api/cards/:id/spawn` | Spawn Claude session |
| POST | `/api/cards/:id/prompt` | Send prompt to active session |
| POST | `/api/cards/:id/queue-prompt` | Queue prompt for idle session |
| POST | `/api/cards/:id/stop` | Kill tmux session |
| GET | `/api/projects` | List discovered projects |
| GET | `/api/config` | Get current config |
| POST | `/api/export` | Export board as JSON |
| POST | `/api/import` | Import board from JSON |

## WebSocket Protocol

Single WebSocket at `ws://host:8420/ws`. Server pushes all state changes:

```json
{"type": "card_updated",      "card": {...}}
{"type": "card_created",      "card": {...}}
{"type": "card_deleted",      "id": "..."}
{"type": "card_moved",        "id": "...", "column": "active", "position": 1.5}
{"type": "metrics_updated",   "id": "...", "cost_usd": 1.23, "context_pct": 0.45}
{"type": "status_changed",    "id": "...", "session_status": "waiting"}
{"type": "projects_refreshed","projects": [...]}
{"type": "prompt_sent",       "id": "...", "prompt_id": "..."}
```

Client sends nothing over WebSocket. All actions go through REST, which triggers WebSocket broadcasts.

## Card Reconciler

Inspired by Kanban Code's reconciler pattern. Runs every 5-10 seconds:

1. Build snapshot of all tmux sessions + Claude JSONL files
2. Match to existing cards via cascade: `session_id` -> `tmux_name` -> `branch` -> `project_path`
3. Unmatched sessions -> auto-create card in Active column
4. Respect `manual_overrides` -- never overwrite fields the user set manually
5. Skip cards with `is_launching = true`
6. When a session goes idle, auto-send the next queued prompt from `queued_prompts`

## Session Lifecycle

```
BACKLOG (manual create)
  | drag
QUEUE (prioritized, ready to work)
  | drag -> spawn dialog -> confirm
ACTIVE (live session running)
  | SessionWatcher detects unmanaged sessions -> auto-create here
  | polling every 5-10s for metrics
REVIEW (review outcome)
  | drag
DONE (complete, metrics frozen)
  | "Clear completed" button
ARCHIVE (hidden, queryable)
```

Transition rules:
- Any -> Any via drag-and-drop (no hard restrictions)
- Queue -> Active triggers spawn dialog
- Active -> Review/Done kills tmux session if alive (with confirmation)
- Auto-discovery creates cards directly in Active
- Session dies naturally -> gray dot, card stays in Active until moved
- "Clear completed" bulk-moves Done -> Archive

## Frontend

### Design Direction

Single HTML page, vanilla JS + CSS custom properties, SortableJS for drag-drop.

- **Light + dark mode** with toggle (localStorage, FOUC prevention)
- **Typography:** Space Grotesk (headers) + JetBrains Mono (metrics/code)
- **Color:** Dark-first, cool palette (slate/blue), bright accents for status dots
- **Icons:** Lucide (no emoji anywhere)
- **Animations:** Smooth card transitions (300ms ease-out), status dot pulse for "waiting", entrance animations on card creation

### Layout

```
+------------------------------------------------------------------+
|  +- Header -------------------------------------------------------+
|  |  Claude Board          [Project: All v]  [+ New Card]  [?]    |
|  +----------------------------------------------------------------+
|                                                                    |
|  +-Backlog-+ +-Queue--+ +-Active--+ +-Review-+ +-Done---+        |
|  | +-----+ | | +-----+| | +-----+ | | +-----+| | +-----+|        |
|  | |card | | | |card || | |card | | | |card || | |card ||        |
|  | |     | | | |     || | | .   | | | |     || | |     ||        |
|  | +-----+ | | +-----+| | |$1.2 | | | +-----+| | +-----+|        |
|  | +-----+ | |        | | |62%  | | |        | |        |        |
|  | |card | | |        | | +-----+ | |        | | [clear]|        |
|  | +-----+ | |        | |         | |        | |        |        |
|  +---------+ +--------+ +---------+ +--------+ +--------+        |
|                                                                    |
|  +- Status Bar ---------------------------------------------------+
|  |  3 active . $4.82 today . 2 waiting for input                 |
|  +----------------------------------------------------------------+
+------------------------------------------------------------------+
```

### Card Variants

**Backlog / Queue (no session):**
- Title + project + priority indicator

**Active (live session):**
- Title, project, status dot (green=alive, blue=idle, orange-pulse=waiting, gray=dead)
- Cost, context gauge, inline prompt input

**Done:**
- Title, project, final cost, token count, duration

### Status Dot Colors

| Status | Color | Meaning |
|--------|-------|---------|
| alive | Green | Claude actively generating output |
| idle | Blue | At prompt, waiting for user input |
| waiting | Orange (pulsing) | Permission prompt or tool approval needed |
| dead | Gray | Session ended or crashed |

### Spawn Dialog

Shown when dragging a card to Active. Pre-filled project path, prompt textarea, handoff notes field.

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `n` | New card |
| `j` / `k` | Navigate cards up/down |
| `h` / `l` | Navigate columns left/right |
| `Enter` | Open card detail |
| `Escape` | Close dialog/detail |
| `Shift+Right` | Move selected card to next column |
| `Shift+Left` | Move selected card to previous column |
| `/` | Focus project filter |
| `?` | Show keyboard shortcuts help |

### Browser Notifications

Fire when:
- Session status changes to `waiting` (needs attention)
- Session status changes to `dead` (completed or crashed)
- Context window exceeds 60% (warning threshold)

## V1 Features

1. Kanban board with 6 columns + drag-drop (SortableJS)
2. Session spawning via dialog (pre-filled project, prompt, handoff notes)
3. Session status detection (alive/idle/waiting/dead) via tmux + JSONL
4. Prompt injection -- send prompt to active session
5. Queued prompts -- queue prompts for idle sessions, auto-send
6. Cost and token metrics from JSONL parsing
7. Context window gauge
8. WebSocket live updates
9. Card reconciler -- smart session-to-card matching, respects manual overrides
10. Auto-discovery of unmanaged Claude sessions
11. Project filtering
12. Browser notifications (waiting, dead, context warning)
13. Keyboard navigation (vim-style)
14. Light + dark mode
15. Context handoff notes field
16. JSON export/import

## Not V1 (Future Backlog)

Kanban Code inspiration and other ideas for later:

- PR tracking + auto-move to Review when PR opens
- Fork/checkpoint sessions (snapshot and resume)
- BM25 full-text search across session history
- Embedded terminal viewer
- Session conversation history view
- Remote machine monitoring (multi-host dashboard)
- Mobile responsiveness
- Prompt templates
- Charts/reporting
- Auto-respawn loops

## File Structure

```
claude_board/
|-- pyproject.toml
|-- Dockerfile
|-- compose.yaml
|-- config.example.toml
|-- claude_board/
|   |-- __init__.py
|   |-- __main__.py          # python -m claude_board
|   |-- app.py               # FastAPI app factory
|   |-- config.py            # Config loading (toml + env vars)
|   |-- database.py          # SQLite + migrations
|   |-- models.py            # Pydantic models
|   |-- routes.py            # REST API endpoints
|   |-- websocket.py         # WebSocket manager
|   |-- tmux_manager.py      # Tmux spawn/control
|   |-- session_watcher.py   # Background metrics loop
|   |-- card_reconciler.py   # Session-to-card matching
|   |-- project_scanner.py   # Project auto-discovery
|   |-- prompt_queue.py      # Queued prompt management
|   +-- export.py            # JSON export/import
|-- static/
|   |-- index.html
|   |-- css/
|   |   +-- style.css
|   +-- js/
|       |-- app.js
|       |-- board.js
|       |-- cards.js
|       |-- dialogs.js
|       |-- keyboard.js
|       |-- websocket.js
|       +-- notifications.js
|-- tests/
|   +-- ...
+-- data/                    # Default data dir (gitignored)
    +-- board.db
```

## Docker Compose

```yaml
services:
  claude-board:
    build: .
    ports: ["8420:8420"]
    volumes:
      - ${CLAUDE_DIR:-~/.claude}:/data/claude:ro
      - ${PROJECTS_DIR:-/mnt/data/projects}:/data/projects:ro
      - /tmp/tmux-1000:/tmp/tmux-1000
      - claude_board_data:/app/data
    environment:
      TZ: America/New_York
      CLAUDE_DIR: /data/claude
      PROJECTS_DIR: /data/projects
      TMUX_SOCKET: /tmp/tmux-1000/default
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8420/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s

volumes:
  claude_board_data:
    driver: local
```

## Tech Stack

| Layer | Choice |
|-------|--------|
| Backend | Python 3.13, FastAPI, uvicorn, aiosqlite, Pydantic v2 |
| Frontend | Vanilla HTML/CSS/JS, SortableJS, Lucide icons, Space Grotesk + JetBrains Mono |
| Persistence | SQLite + JSON export |
| Session control | tmux via subprocess |
| Packaging | pyproject.toml, pip-installable, Docker optional |

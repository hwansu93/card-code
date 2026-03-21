# CardCode

Kanban dashboard for managing Claude Code sessions. Track tasks across columns, monitor tmux sessions in real time, and organize work across multiple projects — all from a single browser tab.

## Features

- **Kanban board** with Backlog, In Progress, Review, and Done columns
- **Drag-and-drop** cards between columns
- **Tmux session viewer** with live terminal output per card
- **WebSocket live updates** — board syncs instantly across tabs
- **Project filtering** — scope the board to a single project
- **Dark / light theme** with persistent preference
- **Vim-style keyboard navigation** (`j`/`k` to move, `e` to edit, `a` to archive)
- **Export / import** board data as JSON
- **Archive drawer** with search and restore
- **Settings panel** with integration health checks
- **Docker support** with health checks and volume persistence

## Installation

**Requirements:** Python 3.13+, tmux

### pip (editable)

```bash
git clone <repo-url> && cd cardcode
pip install -e ".[dev]"
```

### Docker

```bash
docker compose up -d
```

The compose file mounts `~/.claude` (read-only) and your projects directory. Edit `compose.yaml` to adjust the `PROJECTS_DIR` path.

## Configuration

CardCode reads `~/.cardcode/config.toml` on startup. Copy the example to get started:

```bash
mkdir -p ~/.cardcode
cp config.example.toml ~/.cardcode/config.toml
```

### Options

| Key            | Default            | Description                        |
|----------------|--------------------|------------------------------------|
| `claude_dir`   | `~/.claude`        | Path to Claude config directory    |
| `projects_dir` | (auto-detect)      | Root directory of your projects    |
| `tmux_socket`  | (auto-detect)      | Tmux socket path                   |
| `data_dir`     | `~/.cardcode`      | SQLite database and data storage   |
| `port`         | `8420`             | Server port                        |

### Environment variable overrides

Any option can be set via environment variable with the `CARDCODE_` prefix:

```bash
CARDCODE_PORT=9000 cardcode
CARDCODE_PROJECTS_DIR=/home/user/code cardcode
```

## Quick Start

```bash
# Start the server
cardcode

# Or with Python module
python -m cardcode

# Open in browser
open http://localhost:8420
```

Press `?` in the UI to see all keyboard shortcuts.

## Architecture

```
cardcode/
  app.py              # FastAPI application factory
  routes.py           # REST API endpoints
  database.py         # SQLite via aiosqlite
  models.py           # Pydantic models
  session_watcher.py  # Background task polling tmux sessions
  tmux_manager.py     # Tmux session interaction
  card_reconciler.py  # Syncs cards with active sessions
  project_scanner.py  # Discovers projects from git repos
  prompt_queue.py     # Prompt queue management
  export.py           # JSON export/import
  config.py           # TOML config + env var loading
  websocket.py        # WebSocket connection manager
static/
  index.html          # Single-page UI
  css/style.css       # Styles with dark/light theme
  js/app.js           # Vanilla JS frontend
```

**Stack:** FastAPI, vanilla JavaScript, SQLite (aiosqlite), WebSockets, tmux.

## Development

```bash
# Install with dev dependencies
pip install -e ".[dev]"

# Run tests
pytest

# Run with coverage
pytest --cov=cardcode
```

## License

MIT

# CardCode Roadmap

**Vision:** The web-based command center for AI coding sessions — combining kanban workflow management, live terminal access, and deep session inspection in a single tool served over Docker/Tailscale.

**Inspiration:** Merges the best of [langwatch/kanban-code](https://github.com/langwatch/kanban-code) (workflow management, git/PR integration, hook-based activity) and [matt1398/claude-devtools](https://github.com/matt1398/claude-devtools) (deep JSONL inspection, token attribution, tool call visualization) into a web-first platform.

**Tech Stack:** Python/FastAPI backend, vanilla JS frontend, aiosqlite, xterm.js, Docker, Tailscale.

---

## Phase 1: Foundation — COMPLETE

- Kanban board with drag-and-drop columns
- Auto-detect tmux sessions
- Terminal viewer (xterm.js)
- WebSocket real-time updates
- Docker + Tailscale deployment
- Card CRUD, column management, project filtering
- Command center (multi-terminal tile view)

## Phase 2: UI Polish — COMPLETE

- Persistent split panel (CSS Grid, always-visible inspector)
- Terminal cache with LRU eviction (5 max)
- Badge capsule system (status, model, duration, cost, context, project)
- Column accent dots with palette + user color picker
- Floating column headers (sticky + backdrop-filter)
- Card hover micro-interactions (brightness + scale)
- Resizable inspector panel (drag handle, 300-700px, localStorage)
- Terminal font size +/− controls (10-20px, localStorage)
- Quick-add double-click (inline card creation in any column)
- Backend metrics fixes (started_at, project_path, JSONL discovery, parser)
- Hotkey removal, drag/click fixes, focus rings, a11y, reduced-motion

## Phase 3: Deep Session Inspection — NEXT

Port Claude DevTools' JSONL parsing to the Python backend. Biggest value unlock.

### 3A — Rich JSONL Parser

- Parse full conversation from JSONL (user turns, assistant responses, tool calls, tool results)
- Classify messages: user input vs tool results (isMeta) vs system vs assistant
- Extract tool call details (Read, Edit, Write, Bash, Grep, Glob — with file paths, diffs, commands)
- Detect subagent/team agent spawns and link parent ↔ child sessions
- Token usage per message (input, output, cache_read, cache_creation)
- Compaction boundary detection (where Claude auto-compressed context)

### 3B — Conversation History View

- New tab in inspector panel: "History" alongside "Terminal"
- Render conversation as chat layout (user right, assistant left)
- Collapsible tool call cards with specialized renderers:
  - **Read** → syntax-highlighted code with line numbers
  - **Edit** → inline diff viewer (red/green added/removed lines)
  - **Write** → file content with syntax highlighting
  - **Bash** → command + stdout/stderr + exit code
  - **Grep/Glob** → file list results
- Thinking blocks collapsible (show/hide extended thinking)
- Subagent calls expandable as nested conversation trees

### 3C — Token & Context Analytics

- Per-session metrics: total tokens, cost estimate, context consumption
- Per-turn token attribution (what's eating the context window):
  - CLAUDE.md files, @-mentioned files, tool output, thinking, user messages, team coordination
- Context gauge on cards driven by real JSONL data (not polling)
- Compaction boundary markers in history view with token delta before/after
- Cost calculation from token counts (pricing table for Claude models)
- Phase breakdown (tokens consumed per phase of work)

### 3D — Real-Time Session Tailing

- FileWatcher on active JSONL files (watchdog/inotify)
- Stream new entries via WebSocket as they're written
- Live-updating conversation history (not just terminal output)
- Activity state derived from JSONL writes (supplement tmux polling)

## Phase 4: Workflow Intelligence

Port Kanban Code's workflow features.

### 4A — Hook-Based Activity Detection

- Install hook script into Claude Code's `settings.json`
- Hook events: UserPromptSubmit, Stop, SessionStart, SessionEnd, Notification
- Accurate activity states: activelyWorking, needsAttention, idleWaiting, ended
- Replace tmux polling as primary activity source (polling as fallback)
- Ctrl+C detection via JSONL content matching

### 4B — Prompt Queue

- Queue prompts to send when a session goes idle
- UI: text input per card with "Queue" button
- Auto-send when hook reports Stop event (session waiting for input)
- Visual badge on cards with queued prompts
- Edit/delete/reorder queued prompts

### 4C — Session Launch & Resume

- Launch new Claude Code sessions from the UI (tmux + claude command)
- Resume existing sessions by ID (`claude --resume <id>`)
- Fork sessions (start new session in same project)
- Configurable: skip-permissions, worktree name, preamble commands
- Launch confirmation dialog

### 4D — Card Merging

- Drag one card onto another to merge (combines sessions under one card)
- Merged card keeps both terminal sessions accessible
- Useful when multiple sessions work on the same feature

### 4E — Multi-Terminal Per Card

- "Add Extra Terminal" button spawns additional shells attached to a card
- Run tests in one terminal while Claude works in another
- Terminal tabs within the inspector panel
- Each terminal independently cached

### 4F — Onboarding Wizard

- Step-by-step guided setup on first launch
- Check dependencies: claude, git, gh CLI availability
- Install hooks into Claude Code settings
- Configure project roots
- Replace static onboarding cards with interactive flow

### 4G — Manual Overrides

- Track which card fields the user has manually set (column, title, session link)
- Auto-reconciler respects manual overrides (doesn't overwrite user choices)
- Bitmask per card: prevents background sync from reverting manual moves/renames

## Phase 5: Git & PR Integration

### 5A — Branch Discovery

- Scan JSONL for git push/checkout/switch/worktree commands (regex matching)
- Auto-link discovered branches to cards
- Incremental scanning via byte offset watermark (don't re-scan entire file)

### 5B — PR Linking

- Use `gh` CLI to fetch PR status for discovered branches
- PR badge on cards: open, merged, review requested, checks passing/failing
- PR detail view in inspector (review status, unresolved threads, check runs)
- One-click merge button (squash/rebase/merge via `gh pr merge`)
- Configurable poll interval for PR status refresh

### 5C — Issue Integration

- Link GitHub issues to cards
- Create cards from GitHub issues
- Issue body rendered as markdown in inspector
- Issue prompt template (auto-generate initial prompt from issue body)

## Phase 6: Advanced Features

### 6A — Multi-Assistant Support

- Gemini CLI session discovery (`~/.gemini/projects.json`)
- Normalize Gemini events to shared activity model
- Assistant badge on cards (Claude vs Gemini)

### 6B — Notification Triggers

- Built-in triggers: .env file access, tool errors, high token usage
- User-defined triggers: regex content match, error status, token threshold
- Notification inbox in the UI
- Optional external notifications (Pushover, webhooks)

### 6C — Command Palette

- Cmd+K search across sessions and transcripts
- Full-text search within JSONL conversation content
- Navigate directly to specific messages
- Search across projects

### 6D — SSH Remote Sessions

- Connect to remote hosts via SSH
- Stream session logs from remote `~/.claude/` via SFTP
- Isolated workspace state per connection
- Monitor remote Claude sessions from local browser

### 6E — Session Search

- Full-text search across all JSONL transcripts
- BM25 scoring for relevance ranking
- Search results with context snippets and keyword highlighting
- Deep search: scan transcript content (not just metadata)

### 6F — Waterfall/Timeline Visualization

- Gantt-style view of a session's execution
- Tool calls, subagents, and thinking as horizontal bars on a timeline
- Parallel work visualized side-by-side
- Duration and token cost per step
- Drill into any step for full details

### 6G — Workspace Switching

- Switch between project scopes (different machines, environments)
- Each workspace gets isolated state (cards, sessions, settings)
- Quick-switch UI in toolbar

---

## Architecture Notes

### Why Web-Based

- Runs on headless NUC, accessed via Tailscale from any device
- No native app installation required
- Docker deployment = reproducible, portable
- Single source of truth (server-side state, not local storage)

### JSONL Parsing Strategy

Port the parsing logic from Claude DevTools (TypeScript) to Python:
- Stream-parse JSONL files (don't load entire file into memory)
- LRU cache parsed results keyed by file path + mtime
- Incremental parsing for live sessions (track byte offset)
- Background thread/asyncio task for file watching

### Data Flow

```
JSONL files (on disk)
  → FileWatcher detects changes
  → JSONL Parser extracts messages, tool calls, metrics
  → Database stores parsed session data
  → WebSocket pushes updates to frontend
  → Inspector panel renders conversation/analytics
```

### Key Design Decisions

- **Read-only JSONL access** — never modify Claude Code's session files
- **tmux as terminal proxy** — attach to tmux sessions for live terminal, don't spawn our own PTY
- **Hooks supplement, don't replace** — hooks provide real-time activity, JSONL polling is the fallback
- **Progressive enhancement** — each phase adds value independently, no big-bang rewrite

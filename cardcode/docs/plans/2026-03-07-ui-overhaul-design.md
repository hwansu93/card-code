# CardCode UI Overhaul Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deep visual overhaul of the CardCode dashboard — fix broken terminal rendering, redesign the interface to be clean/professional/memorable, add customizable columns, improve settings, and add onboarding.

**Aesthetic direction:** Refined utility. Like a well-made instrument panel — every element earns its place. Warm, confident, not trying to look "techy." Think Linear's density + Notion's warmth + Raycast's precision.

**Key principle:** No AI slop — no cyan-on-dark, no gradient text, no glassmorphism, no glow effects, no dot-grids, no neon accents. Clean, warm, intentional.

---

## 1. Design System

### Color Palette

**Dark theme (default):**
- Background base: warm dark slate (#13141a range), neutrals tinted slightly warm
- Surfaces: layered with opacity and subtle elevation, not hard borders
- Cards: distinguished by slight background lift, not outlines
- Primary accent: warm amber/orange (#e5853d range) — used sparingly for active states and CTAs only
- Status colors: muted until they matter. Alive = warm green, waiting = amber, dead = desaturated
- No glowing, no pulsing — just confident color

**Light theme:**
- Warm cream/off-white surfaces
- Same amber accent works beautifully inverted
- Not an afterthought — equal quality to dark

### Typography

- **Display font:** Geist (Vercel's typeface) — loaded via CDN, replaces Space Grotesk
- **Mono font:** JetBrains Mono (keep)
- Larger card titles, tighter letter-spacing on headers, more size contrast between hierarchy levels
- Modular type scale with fluid sizing (clamp)

### Visual Language

- Surfaces layered with subtle box-shadows and border opacity rather than hard borders
- Transitions fast and purposeful (150-200ms), not decorative
- Exponential easing (ease-out-quart) for natural deceleration
- No bounce or elastic easing

---

## 2. Terminal Panel — xterm.js

### Problem
Currently ANSI escape codes are stripped entirely on the backend (routes.py:291) and terminal output renders as plain monochrome text via `textContent` (dialogs.js:382).

### Solution
- **Replace `<pre>` element** with full xterm.js terminal emulator
- **Dependencies (CDN):** xterm.js + xterm-addon-fit + xterm-addon-web-links + xterm-addon-search
- **Backend change:** Remove ANSI stripping from routes.py — send raw terminal output
- **Features:** Proper ANSI color rendering, scrollback buffer, text selection, copy, clickable URLs
- **Search:** Ctrl+F within terminal via xterm-addon-search
- **Resize:** xterm-addon-fit handles panel resize. Draggable left edge to widen/narrow panel.
- **Responsive:** On narrow screens (<768px), terminal becomes a bottom sheet, not squished sidebar

### Card ↔ Terminal Interaction
- **Single selection model** — clicking a card selects it AND opens its terminal. One card, one terminal, always in sync.
- **No tabs** — keep it simple. One session at a time.
- Keep session name header, auto-refresh toggle, and input field
- Input field sends commands via existing prompt API

---

## 3. Card Design

### Layout
- Project label top-left as small colored tag
- Title prominent below it
- Metrics in a tight row at the bottom

### Status Indication
- Left edge gets a 3px solid accent bar (amber for active, muted for others)
- No glow — just confident color signal

### Metrics Row
- Cost · tokens · context % — all inline, monospace, small but legible
- Context percentage changes color only when it matters (60%+ amber, 80%+ red)
- Context gauge: thin 2px bar below metrics. No animation — just fills. Color shifts instant.

### Interactions
- **Hover:** Card lifts 1px via translateY, shadow deepens slightly. Fast (150ms). No border change.
- **Selection:** Solid amber left border + very subtle warm tint on background.
- **Quick actions on hover:** Small icon row appears — archive, move to next column, open terminal. Avoids menus, speeds up workflow.
- **Entrance animation:** New cards slide in from top with fast ease-out. Cards moving between columns animate position smoothly.

---

## 4. Customizable Columns

### User-Facing
- Default 5 columns: Backlog, Queue, Active, Review, Done
- **Add column:** "+" button at end of column row → inline text input to name it
- **Rename:** Double-click column header for inline edit
- **Delete:** "..." menu on column header → delete with confirmation if cards exist (moves cards to first column)
- **Reorder:** Drag column headers to rearrange
- **Collapse:** Click column header count to collapse to thin vertical strip (rotated header). Expands horizontal space.

### Backend
- New DB table: `columns` (id, name, position, created_at)
- Migration: seed default columns on first run
- New endpoints:
  - `GET /api/columns` — ordered list
  - `POST /api/columns` — create
  - `PATCH /api/columns/{id}` — rename/reorder
  - `DELETE /api/columns/{id}` — delete (moves cards to first column)
- WebSocket events: `column_created`, `column_updated`, `column_deleted`
- Card `column_name` validated against existing columns

---

## 5. Settings Overhaul

### Organized Sections

**Connection** — What CardCode connects to
- Tmux socket path (auto-detected with override)
- Claude config directory (auto-detected with override)
- Each with "test connection" button showing live status inline
- Auto-detect works out of the box — manual fields hidden behind "Advanced" disclosure

**Board** — How your workspace looks
- Column management (add/rename/reorder/delete) — also accessible inline on board
- Default column for new cards
- Card display preferences (show/hide metrics, show/hide description preview)

**Server** — Instance configuration
- Host/port
- Data directory
- Poll interval for session metrics

**About** — Version, links, health check summary

### Design Principles
- Auto-detection first — zero configuration for common setups
- Progressive disclosure — simple view default, "Advanced" expandable for power users
- Inline validation — test buttons and status next to each field
- No "Save" button — changes apply on blur/change with subtle "Saved" confirmation

---

## 6. Onboarding

### Empty Board Welcome State
Instead of blank columns with "Drag cards here", show a single centered panel:
- CardCode logo + one-line description
- Three action cards laid out horizontally:
  - **"Scan for sessions"** — discovers running Claude sessions, auto-creates cards
  - **"Create your first card"** — opens new card dialog
  - **"Customize your columns"** — highlights column management
- Each action card has an icon and 1-2 lines of description

### First Card Guidance
After the first card appears, subtle inline hints appear once:
- "Click a card to open its terminal →" (near terminal panel)
- "Drag cards between columns to organize" (on the board)
- Dismiss on interaction, never show again (localStorage flag)

### No Walkthrough
No modal tours, no step-by-step wizards. Contextual hints that teach by doing.

---

## 7. Polish Items

### Loading States
- Skeleton shimmer on cards while board loads
- Terminal shows subtle spinner while connecting to session

### Empty Column State
- Dashed border zone that highlights when dragging over it
- No text clutter

### Card Quick Actions on Hover
- Small icon row: archive, move to next column, open terminal
- Appears on hover, fast fade-in

### Column Collapse
- Each column header shows card count
- Click to collapse to thin vertical strip (header rotated 90°)
- Useful for focusing on specific workflow stages

### Connection Status
- Small dot in toolbar showing WebSocket state (connected/reconnecting/disconnected)

### Toast Notifications
- Replace browser Notifications API with in-app toasts
- Bottom-right corner, small, dismissible
- For status changes and context warnings
- Less intrusive, no browser permission needed

### Responsive Terminal
- On narrow screens (<768px), terminal becomes bottom sheet you pull up
- Not a squished sidebar

### Drag-over Column Highlight
- Columns highlight with accent border when card is dragged over them

---

## 8. Icon Cleanup

- Remove unused `clawd.png` — all UI uses `cardcode-icon.svg`
- Ensure `basePath` variable resolves correctly for icon references in cards.js

---

## 9. Technical Summary

### New Dependencies (CDN)
- xterm.js + xterm-addon-fit + xterm-addon-web-links + xterm-addon-search
- Geist font

### Backend Changes
- Remove ANSI stripping from routes.py
- New `columns` DB table + migration
- New column CRUD API endpoints
- New WebSocket event types for columns
- Settings API updates for new sections

### Frontend Changes (Full Reskin)
- index.html — restructure for xterm.js, column management, onboarding, settings sections
- style.css — full rewrite: color system, cards, layout, typography, responsive
- cards.js — new card rendering with quick actions, revised hierarchy
- board.js — dynamic columns from API, column CRUD, collapse, drag reorder
- dialogs.js — replace pre terminal with xterm.js, new settings UI
- app.js — load columns on init, connection status
- websocket.js — column event handlers, connection status indicator
- notifications.js — replace with toast system
- New: onboarding.js — welcome state + contextual hints

### NOT Changing
- Backend architecture (FastAPI, SQLite, WebSocket)
- Drag-drop library (SortableJS)
- Keyboard shortcuts system (except removing terminal focus shortcut)
- Export/import functionality

### Testing
- Unit tests for column CRUD endpoints
- Update existing tests referencing hardcoded column names
- Manual verification of xterm.js with real tmux sessions

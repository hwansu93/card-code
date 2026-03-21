# Design: Kanban Code-Inspired UI Overhaul

**Date:** 2026-03-09
**Status:** Approved
**Branch:** feat/v1-implementation

## Overview

Overhaul the CardCode web UI to incorporate design patterns from langwatch/kanban-code (a SwiftUI native Kanban app). The goal is a more polished, information-dense, and responsive interface while keeping the existing Copper & Slate OKLCH color system.

## Changes

### 1. Persistent Split Panel (replaces overlay inspector)

Replace the current fixed-position overlay inspector with a CSS Grid two-panel layout.

```css
.app-layout {
  display: grid;
  grid-template-columns: 1fr var(--panel-width, 420px);
}
```

- Panel is always visible — empty state shows a muted "Select a card" placeholder
- Clicking a card swaps panel content instantly (no open/close animation between cards)
- Smooth transition only when toggling panel visibility via a toolbar button
- **Responsive breakpoint:** Below 1024px, panel reverts to overlay mode
- Remove scrim for desktop; keep for overlay mode on narrow screens
- Panel width: `420px` default, `min-width: 380px`, `max-width: 600px`
- Stretch goal: drag-to-resize handle on panel border

### 2. Terminal Cache

- Maintain a `Map<cardId, Terminal>` of xterm instances
- When switching cards: hide current terminal, show/reparent target card's terminal
- `FitAddon.fit()` on: card switch, panel resize, window resize (via ResizeObserver)
- Cap cache at ~5 terminals (LRU eviction) to avoid memory bloat
- Disposed terminals recreated on next access

### 3. Badge Capsule System

Replace current `.card-meta-row` and `.card-bottom` with a unified `.card-badges` flex-wrap row.

**Capsule base style:**
```css
.badge-capsule {
  font-size: 11px;
  font-weight: 500;
  padding: 2px 8px;
  border-radius: 999px;
  background: oklch(var(--capsule-color) / 0.15);
  color: oklch(var(--capsule-color));
}
```

**Badge types:**

| Badge | Color | Source |
|-------|-------|--------|
| Model (claude/gemini) | Copper / Blue | `card.provider` |
| Duration | Neutral slate | `card.started_at` |
| Cost | Green | `card.cost_usd` |
| Context % | Amber→Red | `card.context_pct` |
| Project | Purple | `card.project_path` / project filter |
| Status | Status color | `card.session_status` (replaces dot) |

**Card layout:**
```
.card
  .card-title           — title, 2-line clamp
  .card-badges          — flex-wrap row of capsules
  .context-gauge        — 2px bar at bottom (kept)
```

Status left-border stays.

### 4. Column Accent Dots

**Default palette** (6 colors, cycling by column order):
1. Blue `oklch(65% 0.15 250)`
2. Amber `oklch(68% 0.14 55)`
3. Green `oklch(65% 0.12 165)`
4. Purple `oklch(62% 0.15 310)`
5. Red `oklch(62% 0.14 25)`
6. Teal `oklch(65% 0.12 195)`

**Column header update:**
```
.column-header
  .column-dot           — 8px circle, colored
  h2                    — column name
  .column-count         — count badge
  .column-actions ⋮     — add "Change color" with swatch picker
```

User override stored in new `color` column on the columns table (nullable, NULL = use palette). Swatch picker: row of 8-10 preset colors in the existing "⋮" dropdown.

**Backend:** Add `color VARCHAR(7)` to columns table.

### 5. Hover Micro-interactions

```css
.card {
  transition: filter var(--transition-fast), transform var(--transition-fast);
}
.card:hover {
  filter: brightness(1.06);
}
.card:active {
  filter: brightness(0.92);
  transform: scale(0.97);
}
```

Replaces current bg/border hover. Respects `prefers-reduced-motion`.

### 6. Floating Column Headers

```css
.column-header {
  position: sticky;
  top: 0;
  z-index: var(--z-sticky);
  backdrop-filter: blur(12px);
  background: oklch(from var(--bg-secondary) l c h / 0.8);
}
```

Headers stay visible when scrolling long card lists.

### 7. Disable Hotkeys

- Remove `keyboard.js` dynamic import from `app.js`
- Remove keyboard help button from toolbar
- Move Escape key handling to relevant modules (drawers, dialogs)

## Files Affected

**Frontend:**
- `static/css/style.css` — grid layout, capsules, column dots, hover, sticky headers, responsive breakpoint
- `static/index.html` — restructure inspector, panel placeholder, column header template
- `static/js/board.js` — column dot rendering, color picker, sticky header markup
- `static/js/cards.js` — badge capsule rendering, new card template
- `static/js/command-center.js` — terminal cache, reparenting
- `static/js/dialogs.js` — persistent panel, FitAddon/ResizeObserver
- `static/js/app.js` — remove keyboard.js import, init panel layout
- `static/js/websocket.js` — no structural changes

**Backend:**
- `cardcode/models.py` or migration — add `color` column
- `cardcode/routes.py` — accept `color` in column create/update

## Gotchas

- Branch base is `master` locally but PR targets `main` on GitHub
- Server runs with `CARDCODE_BASE_PATH=/cardcode`
- Lucide icons replace `<i>` with `<svg>` — use innerHTML before createIcons()
- FitAddon, SearchAddon, Sortable, lucide are CDN globals
- No frontend test suite; 114 backend Python tests
- User prefers light theme
- `prefers-reduced-motion` support already exists from polish pass

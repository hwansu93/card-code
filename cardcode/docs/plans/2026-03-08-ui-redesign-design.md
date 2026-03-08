# UI Redesign Design — Copper & Slate

**Date:** 2026-03-08
**Branch:** `feat/v1-implementation`
**Status:** Approved

## Overview

Holistic UI redesign addressing three problem areas: sparse cards, broken inspector panel, and clunky overall feel. Introduces new Copper & Slate color identity, full-height inspector overlay, and multi-terminal command center view.

## 1. Card Design

Compact tiles, ~200-220px wide (column width), ~100-120px tall.

**Content hierarchy (top to bottom):**

1. **Title** — bold, truncated with ellipsis at 2 lines
2. **Metadata row** — inline badges, small text:
   - Model chip with provider icon (Claude logo, Gemini logo, generic fallback) + model name (e.g. "Opus 4.6")
   - Duration since `started_at` (e.g. "12m", "2h")
3. **Bottom bar:**
   - Context % as thin progress bar (full card width) — patina green when healthy, copper when warning 60-80%, rust when critical 80%+
   - Cost in corner (e.g. "$0.42")
   - Status dot — patina green = alive, copper = idle, gray = dead

**Removed from cards:** Project name moves to column headers or filter only. Relative time ("2h ago") replaced by actual duration from `started_at`.

**Interaction:** Single click → inspector overlay opens. Right-click → context menu (move, archive, etc.)

## 2. Inspector Panel (Overlay)

Slides in from right, overlays the board. Board stays full width underneath.

**Behavior:**
- Full viewport height (minus toolbar)
- ~500px wide, fixed (not resizable — keeps it simple)
- Backdrop: subtle dark scrim on the board to shift focus
- Close: X button, Escape key, or clicking the scrim

**Layout (top to bottom, full height):**

1. **Header bar** (~48px): Card title, status dot, model chip with provider icon, close button
2. **Terminal** (fills remaining height): xterm.js, full width, full remaining height — no tabs, no split
3. **Input bar** (bottom, ~44px): Prompt input + send button, visible when session alive, hidden when dead

**Key decision:** No tabs. Terminal IS the inspector. Detail info (cost, tokens, context %) lives on the card and in the header bar.

**Terminal reliability fixes baked in:**
- xterm initializes only after panel animation completes (guarantees correct dimensions)
- Single visibility control path (remove mixed class/style toggling)
- Loading spinner while fetching output
- AbortError filtered from error toasts
- Proper cleanup on close (dispose terminal, abort fetches, clear intervals)

## 3. Command Center View

Toggle in toolbar switches between "Board" and "Command Center" views. Board is default.

**Layout:**
- Full screen (replaces board, not overlaid)
- CSS Grid based, flexible — user drags terminals to arrange
- Each tile: header (card title, model chip, status dot) + xterm instance + optional input bar
- Default: auto-fill grid (cards snap to equal-sized cells)

**Interactions:**
- **Add:** Drag from collapsible sidebar card list, or click "+" and pick active sessions
- **Resize:** Drag edges/corners to span multiple grid cells
- **Reorder:** Drag tile headers to swap positions
- **Remove:** X button or right-click → remove
- **Maximize:** Double-click header for full-panel, double-click again to return

**Grid behavior:**
- Minimum tile size: 300x200px
- Auto-adjusts columns by viewport width (3 wide, 2 medium, 1 mobile)
- Layout persists in localStorage per project
- Soft limit ~6-8 tiles (xterm performance), warning beyond that

**Integration:** Clicking a tile's title opens single-card inspector overlay. Command center = monitoring, inspector = focused interaction.

## 4. Color Palette — Copper & Slate

Material metaphor: slate workbench, copper tools, patina on healthy things, rust on broken things.

### Neutrals (blue-gray slate, hue 250)

```css
--bg-base:     oklch(12% 0.015 250);  /* deep slate */
--bg-surface:  oklch(16% 0.012 250);  /* cards, panels */
--bg-elevated: oklch(20% 0.010 250);  /* hover, dropdowns */
--bg-overlay:  oklch(22% 0.010 250);  /* inspector, command center */
--border:      oklch(30% 0.012 250);  /* subtle cool borders */
--border-focus: oklch(38% 0.012 250); /* active borders */
```

### Text

```css
--text-primary:   oklch(90% 0.008 250);  /* cool off-white */
--text-secondary: oklch(62% 0.008 250);  /* slate mid-tone */
--text-muted:     oklch(42% 0.008 250);  /* quiet */
```

### Primary Accent — Copper (hue 55)

```css
--accent:       oklch(68% 0.14 55);   /* copper — buttons, selected states */
--accent-hover: oklch(74% 0.14 55);   /* brighter on hover */
--accent-muted: oklch(22% 0.04 55);   /* subtle copper tint backgrounds */
--accent-text:  oklch(78% 0.10 55);   /* copper text on dark */
```

### Secondary — Patina Green (hue 165)

```css
--secondary:       oklch(65% 0.08 165);  /* oxidized copper green */
--secondary-muted: oklch(22% 0.03 165);  /* subtle backgrounds */
```

### Status Colors

```css
--status-alive:    var(--secondary);         /* patina green */
--status-idle:     var(--accent);            /* copper */
--status-dead:     oklch(50% 0.008 250);     /* cold gray */
--status-error:    oklch(62% 0.16 25);       /* rust red */
--status-warning:  var(--accent);            /* copper */
--status-critical: oklch(62% 0.16 25);       /* rust red */
```

### Color Application Map

| Element | Color | Purpose |
|---------|-------|---------|
| Selected card left border (3px) | Copper | "You're looking at this" |
| Status dot on card | Green/Copper/Gray | Session health |
| Context bar on card | Green → Copper → Rust | Threshold warning |
| Model chip background | `--accent-muted` | Subtle categorization |
| Inspector header accent | Copper underline | Panel identity |
| Terminal cursor | Patina green | Alive feeling |
| Active toolbar button | Copper | Navigation state |
| Toast borders | Semantic color | Message type |

### Typography

- Geist (already in place)
- Card titles: 13px semibold
- Metadata/badges: 11px medium
- Terminal: system monospace, 13px

### Surfaces

- No translucency/blur — solid surfaces with subtle 1px borders
- Cards: `--bg-surface` with `--border`, on hover `--bg-elevated`
- Selected card: copper left border (3px)

## 5. Bug Fixes (baked into implementation)

### Terminal Reliability
- Single visibility control path (remove mixed class/style toggling)
- xterm init deferred until container is visible and sized
- AbortError filtered from error toasts
- Proper cleanup on close (dispose terminal, abort fetches, clear intervals)
- Loading state while fetching output

### State Management
- Auto-refresh state persisted to localStorage
- WebSocket updates refresh inspector if the viewed card changes
- Detail metrics update live via WebSocket

### Error Handling
- Card/spawn dialog errors surface as toasts (not silent)
- Settings form blocks submission on validation failure
- Archive count failure shows fallback gracefully

### Cards
- Duration calculated from `started_at` (live-updating)
- Provider icon resolved from card's `provider` field
- Context bar color transitions at thresholds

## Architecture Notes

- Branch base is `master` (not `main`)
- `cardcode/` is the Python package; `static/` is at repo root
- No frontend test suite — 114 backend Python tests
- CDN dependencies: xterm.js, Sortable, Lucide icons
- Design docs: `docs/plans/2026-03-07-ui-overhaul-design.md` (previous iteration)

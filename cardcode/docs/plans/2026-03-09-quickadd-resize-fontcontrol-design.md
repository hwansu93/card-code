# Design: Quick-Add, Resizable Panel, Terminal Font Control

**Date:** 2026-03-09
**Status:** Approved
**Branch:** feat/v1-implementation

## Overview

Three UX improvements: double-click quick-add for cards, resizable inspector panel, and terminal font size control.

## Changes

### 1. Double-Click Quick-Add (Any Column)

- Double-click empty space in any column → inline text input appears at bottom of card list
- Type title → Enter creates a title-only card (no session, no dialog) in that column
- Input stays open after creation for rapid multi-entry
- Escape or click-away dismisses the input
- Existing "+" toolbar button remains for full card creation with session/spawn options

Implementation: `dblclick` listener on column card area. On fire, append `<input>`. On Enter, POST `/cards` with `title` and `column_name`. On Escape/blur, remove input.

### 2. Resizable Inspector Panel

- Drag handle on left border of inspector panel (4-6px invisible hit area)
- Default width: 500px (up from 420px)
- Min: 300px, Max: 700px
- Width persists in `localStorage`
- CSS custom property `--panel-width` updated on drag
- Cursor: `col-resize` on hover

Implementation: `mousedown` starts tracking, `mousemove` updates `--panel-width`, `mouseup` saves to localStorage. On load, read localStorage and set initial width.

### 3. Terminal Font Size Control

- Small +/− buttons in inspector panel header
- Adjusts xterm.js `fontSize` (default 14px, min 10, max 20, step 1)
- Persists in `localStorage`
- Calls `fitAddon.fit()` after change
- Applied to all cached terminals

Implementation: Two `btn-icon-sm` buttons in header. On click, update `term.options.fontSize` for all cached terminals, fit visible one, save to localStorage.

## Files Affected

- `static/css/style.css` — resize handle, quick-add input styles
- `static/js/board.js` — dblclick listener, inline input
- `static/js/dialogs.js` — resize handle, font controls, localStorage
- `static/index.html` — font control buttons in inspector header

# Kanban Code-Inspired UI Overhaul — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Overhaul CardCode's web UI with patterns from Kanban Code — persistent split panel, terminal cache, badge capsules, column accent dots, hover micro-interactions, floating headers, and hotkey removal.

**Architecture:** CSS Grid split layout replaces the overlay inspector. xterm instances are cached in a Map and reparented on card switch. Cards use a badge capsule system instead of separate meta rows. Column colors are palette-defaulted with user-override stored in the DB.

**Tech Stack:** Vanilla JS (ES modules), CSS (OKLCH custom properties), xterm.js + FitAddon, SortableJS, aiosqlite (raw SQL), FastAPI/Pydantic.

**Important context:**
- Server runs with `CARDCODE_BASE_PATH=/cardcode` — all API calls use this prefix
- Lucide icons replace `<i>` with `<svg>` — use innerHTML replacement before `createIcons()`
- FitAddon, SearchAddon, Sortable, lucide are CDN globals (not npm imports)
- No frontend test suite — only 114 backend Python tests
- `prefers-reduced-motion` support already exists from polish pass
- There are 4 uncommitted drag/click fix files — commit those first

---

## Task 0: Commit Pending Drag/Click Fixes

**Files:**
- Modified: `static/js/board.js`
- Modified: `static/js/cards.js`
- Modified: `static/js/app.js`
- Modified: `static/js/websocket.js`

**Step 1: Stage and commit**

```bash
git add static/js/board.js static/js/cards.js static/js/app.js static/js/websocket.js
git commit -m "fix: Sortable drag/click — remove broken handle, add isDragging guard, re-init on renderBoard

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

**Step 2: Verify clean working tree**

Run: `git status`
Expected: nothing to commit, working tree clean (except untracked files outside project)

---

## Task 1: Disable Hotkeys

Smallest change, no dependencies, clears the deck.

**Files:**
- Modify: `static/js/app.js:110` (remove keyboard.js import)
- Modify: `static/index.html:55-57` (remove keyboard help button)
- Reference: `static/js/dialogs.js:508-511` (Escape handler — already independent, keep as-is)

**Step 1: Remove keyboard.js dynamic import from app.js**

In `static/js/app.js`, line 110, delete:
```js
import('./keyboard.js').then(m => m.setupKeyboard()).catch(err => debugError('Failed to load keyboard:', err));
```

**Step 2: Remove keyboard help button from toolbar**

In `static/index.html`, lines 55-57, delete:
```html
<button class="btn-icon-sm" id="keyboard-help" title="Keyboard shortcuts">
    <i data-lucide="keyboard"></i>
</button>
```

**Step 3: Verify dialogs.js Escape handler is intact**

Read `static/js/dialogs.js:508-511` and confirm the Escape listener for inspector close is still there (it's independent of keyboard.js).

**Step 4: Test in browser**

Load the app. Verify:
- No console errors about keyboard.js
- Escape still closes the inspector
- No keyboard help button in toolbar

**Step 5: Commit**

```bash
git add static/js/app.js static/index.html
git commit -m "feat: disable hotkeys — remove keyboard.js init and toolbar button

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Column Color Backend

Add `color` column to the database and expose it through the API.

**Files:**
- Modify: `cardcode/database.py:54-59` (add `color` to CREATE TABLE schema)
- Modify: `cardcode/database.py:~85-89` (add ALTER TABLE migration block in `init_db`)
- Modify: `cardcode/models.py:93-98` (add `color` to `Column` model)
- Modify: `cardcode/models.py:105-107` (add `color` to `ColumnUpdate` model)
- Modify: `cardcode/routes.py:362-387` (accept `color` in create)
- Modify: `cardcode/routes.py:390-413` (accept `color` in update)
- Test: `tests/` (find existing column tests, add color tests)

**Step 1: Find existing column tests**

Run: `grep -r "column" tests/ --include="*.py" -l`
Identify which test file covers column CRUD.

**Step 2: Write failing tests for column color**

Add tests to the appropriate test file:

```python
async def test_create_column_with_color(client):
    """Creating a column with a color should store and return it."""
    resp = await client.post("/api/columns", json={"name": "Colored", "color": "#ff5733"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["color"] == "#ff5733"

async def test_create_column_without_color(client):
    """Creating a column without color should return null."""
    resp = await client.post("/api/columns", json={"name": "NoColor"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["color"] is None

async def test_update_column_color(client):
    """Updating a column's color should persist."""
    # Create column first
    resp = await client.post("/api/columns", json={"name": "ToColor"})
    col_id = resp.json()["id"]
    # Update color
    resp = await client.patch(f"/api/columns/{col_id}", json={"color": "#00ff00"})
    assert resp.status_code == 200
    assert resp.json()["color"] == "#00ff00"
    # Verify on list
    resp = await client.get("/api/columns")
    col = next(c for c in resp.json() if c["id"] == col_id)
    assert col["color"] == "#00ff00"
```

**Step 3: Run tests to verify they fail**

Run: `python -m pytest tests/ -k "column_color" -v`
Expected: FAIL (color field doesn't exist yet)

**Step 4: Add `color` to database schema**

In `cardcode/database.py`, update the `columns` CREATE TABLE (line ~54-59) to add `color TEXT` after `created_at`:

```sql
CREATE TABLE IF NOT EXISTS columns (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    position REAL NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    color TEXT
);
```

In `init_db()`, add a migration block after the existing ALTER TABLE blocks (~line 85-89):

```python
try:
    await db.execute("ALTER TABLE columns ADD COLUMN color TEXT")
except Exception:
    pass  # Column already exists
```

**Step 5: Update Pydantic models**

In `cardcode/models.py`:

Add to `Column` (line ~93-98):
```python
color: str | None = None
```

Add to `ColumnCreate` (line ~101-102):
```python
color: str | None = None
```

Add to `ColumnUpdate` (line ~105-107):
```python
color: str | None = None
```

**Step 6: Update routes to handle color**

In `cardcode/routes.py`:

In `create_column_endpoint` (~line 362-387): Pass `color` from `ColumnCreate` into the INSERT query. Update the SQL INSERT to include `color`:
```sql
INSERT INTO columns (id, name, position, color) VALUES (?, ?, ?, ?)
```
And pass `data.color` as the 4th parameter.

In `update_column_endpoint` (~line 390-413): Add `color` to the SET clause when `data.color is not None`. Follow the existing pattern for building dynamic SET clauses.

Ensure the SELECT query that returns the column after create/update includes `color` in its column list.

**Step 7: Run tests**

Run: `python -m pytest tests/ -k "column" -v`
Expected: All column tests PASS (both new and existing)

**Step 8: Run full test suite**

Run: `python -m pytest tests/ -v`
Expected: All 114+ tests PASS

**Step 9: Commit**

```bash
git add cardcode/database.py cardcode/models.py cardcode/routes.py tests/
git commit -m "feat: add color field to columns — schema, model, API

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Column Accent Dots + Color Picker (Frontend)

**Files:**
- Modify: `static/css/style.css` (column dot styles, swatch picker styles)
- Modify: `static/js/board.js` (dot rendering, color picker in actions menu)

**Step 1: Add CSS for column dots and swatch picker**

In `static/css/style.css`, add after existing `.column-header` styles:

```css
/* Column accent dots */
.column-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

/* Swatch color picker in column actions menu */
.swatch-picker {
  display: flex;
  gap: 4px;
  padding: 6px 8px;
  flex-wrap: wrap;
  max-width: 160px;
}

.swatch-picker button {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  padding: 0;
  transition: border-color var(--transition-fast);
}

.swatch-picker button:hover {
  border-color: var(--border-focus);
}

.swatch-picker button.active {
  border-color: var(--text-primary);
}
```

**Step 2: Define palette constants in board.js**

At the top of `static/js/board.js`, add:

```js
const COLUMN_PALETTE = [
  'oklch(65% 0.15 250)',   // Blue
  'oklch(68% 0.14 55)',    // Amber
  'oklch(65% 0.12 165)',   // Green
  'oklch(62% 0.15 310)',   // Purple
  'oklch(62% 0.14 25)',    // Red
  'oklch(65% 0.12 195)',   // Teal
];

function getColumnColor(column, index) {
  return column.color || COLUMN_PALETTE[index % COLUMN_PALETTE.length];
}
```

**Step 3: Add dot to column header rendering**

Find the column header rendering in `board.js` (where `.column-header` is created). Add a `.column-dot` element before the `<h2>`:

```js
const dot = document.createElement('span');
dot.className = 'column-dot';
dot.style.backgroundColor = getColumnColor(column, colIndex);
header.insertBefore(dot, header.querySelector('h2'));
```

**Step 4: Add "Change color" option to column actions menu**

Find the column actions dropdown in `board.js`. Add a "Change color" menu item that reveals a swatch picker with the 6 palette colors plus 4 extras (pink, orange, indigo, lime). When a swatch is clicked, PATCH `/api/columns/{id}` with the new `color` value and re-render.

The swatch picker colors:
```js
const SWATCH_COLORS = [
  'oklch(65% 0.15 250)',   // Blue
  'oklch(68% 0.14 55)',    // Amber
  'oklch(65% 0.12 165)',   // Green
  'oklch(62% 0.15 310)',   // Purple
  'oklch(62% 0.14 25)',    // Red
  'oklch(65% 0.12 195)',   // Teal
  'oklch(65% 0.15 340)',   // Pink
  'oklch(68% 0.14 70)',    // Orange
  'oklch(55% 0.18 280)',   // Indigo
  'oklch(70% 0.15 140)',   // Lime
];
```

On swatch click:
```js
await apiPatch(`/columns/${columnId}`, { color: selectedColor });
renderBoard(state.cards);
```

**Step 5: Test in browser**

- Verify each column has a colored dot in its header
- Verify default palette colors cycle correctly
- Click column "⋮" → "Change color" → verify swatch picker appears
- Select a color → verify dot updates and persists on page reload

**Step 6: Commit**

```bash
git add static/css/style.css static/js/board.js
git commit -m "feat: column accent dots with palette + user color picker

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 4: Floating Column Headers

**Files:**
- Modify: `static/css/style.css` (sticky positioning, backdrop-filter)

**Step 1: Update column header CSS**

Find the `.column-header` styles in `static/css/style.css`. Update to:

```css
.column-header {
  position: sticky;
  top: 0;
  z-index: var(--z-sticky, 10);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  background: oklch(from var(--bg-secondary) l c h / 0.8);
}
```

For light theme, update the `[data-theme="light"]` section's column header background similarly:
```css
[data-theme="light"] .column-header {
  background: oklch(from var(--bg-secondary) l c h / 0.85);
}
```

Ensure the column body (`.column` or equivalent) has `overflow-y: auto` so headers stick while cards scroll.

**Step 2: Test in browser**

- Add 10+ cards to a column
- Scroll within the column
- Verify header stays pinned at top with blur effect
- Verify it works in both light and dark themes

**Step 3: Commit**

```bash
git add static/css/style.css
git commit -m "feat: floating column headers with sticky + backdrop-filter

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 5: Hover Micro-interactions

**Files:**
- Modify: `static/css/style.css` (card hover/active states)

**Step 1: Replace current card hover styles**

Find the existing `.card:hover` styles in `static/css/style.css`. Replace with brightness-based interactions:

```css
.card {
  transition: filter var(--transition-fast) var(--ease-out-quart),
              transform var(--transition-fast) var(--ease-out-quart);
}

.card:hover {
  filter: brightness(1.06);
}

.card:active {
  filter: brightness(0.92);
  transform: scale(0.97);
}
```

Remove the old hover rules that change `background` and `border-color` (keep the existing `background` and `border-color` as the base state, just remove the `:hover` overrides for those properties).

**Step 2: Add reduced-motion guard**

Ensure the existing `@media (prefers-reduced-motion: reduce)` block includes:
```css
.card {
  transition: none;
}
.card:active {
  transform: none;
}
```

**Step 3: Test in browser**

- Hover over cards — should brighten subtly
- Click and hold — should darken + scale down slightly
- Toggle reduced-motion — verify no transitions
- Test in both light and dark themes

**Step 4: Commit**

```bash
git add static/css/style.css
git commit -m "feat: card hover micro-interactions — brightness + scale

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 6: Badge Capsule System

**Files:**
- Modify: `static/css/style.css` (capsule styles, remove old card-meta styles)
- Modify: `static/js/cards.js` (rewrite card template to use capsules)

**Step 1: Add capsule CSS**

In `static/css/style.css`, add badge capsule styles:

```css
/* Badge capsules */
.card-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
}

.badge-capsule {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 10px;
  font-weight: 600;
  font-family: var(--font-mono);
  padding: 1px 7px;
  border-radius: 999px;
  line-height: 1.4;
  white-space: nowrap;
}

/* Capsule color variants */
.badge-capsule.badge-model {
  background: oklch(from var(--accent) l c h / 0.15);
  color: var(--accent-text);
}

.badge-capsule.badge-duration {
  background: oklch(from var(--text-secondary) l c h / 0.12);
  color: var(--text-secondary);
}

.badge-capsule.badge-cost {
  background: oklch(65% 0.12 165 / 0.15);
  color: oklch(65% 0.12 165);
}

.badge-capsule.badge-context {
  background: oklch(68% 0.14 55 / 0.15);
  color: oklch(68% 0.14 55);
}

.badge-capsule.badge-context.high {
  background: oklch(62% 0.16 25 / 0.15);
  color: oklch(62% 0.16 25);
}

.badge-capsule.badge-project {
  background: oklch(62% 0.15 310 / 0.15);
  color: oklch(62% 0.15 310);
}

.badge-capsule.badge-status {
  background: oklch(from var(--status-color) l c h / 0.15);
  color: var(--status-color);
}
```

Also add light-theme overrides for capsule legibility.

**Step 2: Rewrite card rendering in cards.js**

In `static/js/cards.js`, find the `createCardElement` function (or equivalent). Replace the `.card-meta-row` and `.card-bottom` sections with a `.card-badges` container:

```js
function buildBadges(card) {
  const badges = [];

  // Status badge
  const statusLabels = { alive: 'Live', waiting: 'Waiting', idle: 'Idle', dead: 'Stopped' };
  if (card.session_status && card.session_status !== 'dead') {
    badges.push(`<span class="badge-capsule badge-status" style="--status-color: var(--status-${card.session_status})">${statusLabels[card.session_status] || card.session_status}</span>`);
  }

  // Model badge
  if (card.provider) {
    const label = card.provider === 'claude-code' ? 'Claude' : 'Gemini';
    badges.push(`<span class="badge-capsule badge-model">${label}</span>`);
  }

  // Duration badge
  if (card.started_at) {
    const dur = formatDuration(card.started_at);
    if (dur !== '—') {
      badges.push(`<span class="badge-capsule badge-duration">${dur}</span>`);
    }
  }

  // Cost badge
  if (card.cost_usd && card.cost_usd > 0) {
    badges.push(`<span class="badge-capsule badge-cost">$${card.cost_usd.toFixed(2)}</span>`);
  }

  // Context badge
  if (card.context_pct && card.context_pct > 0) {
    const pct = Math.round(card.context_pct * 100);
    const highClass = pct > 70 ? ' high' : '';
    badges.push(`<span class="badge-capsule badge-context${highClass}">${pct}%</span>`);
  }

  // Project badge
  if (card.project_path) {
    const projectName = card.project_path.split('/').pop();
    badges.push(`<span class="badge-capsule badge-project">${projectName}</span>`);
  }

  return badges.join('');
}
```

Update the card template to use:
```html
<div class="card-title">${card.title}</div>
<div class="card-badges">${buildBadges(card)}</div>
```

Keep the `.context-gauge` at the bottom. Remove `.card-meta-row`, `.card-bottom`, `.card-duration`, `.card-cost`, `.card-context-text`, `.card-status-dot`, `.model-chip`.

**Step 3: Clean up unused CSS**

Remove or comment out the old `.card-meta-row`, `.card-bottom`, `.model-chip`, `.card-duration`, `.card-cost`, `.card-context-text`, `.card-status-dot` styles from `style.css`.

**Step 4: Update card-in-place update function**

Find `updateCardInPlace` or equivalent in `cards.js`. Update it to rebuild the `.card-badges` container when card data changes (metrics_updated, status_changed events).

**Step 5: Test in browser**

- Verify cards show capsule badges instead of old meta rows
- Verify each badge type displays correctly with appropriate colors
- Verify badges update in real-time (cost, context, status changes via WebSocket)
- Verify context badge turns red above 70%
- Test in both light and dark themes

**Step 6: Commit**

```bash
git add static/css/style.css static/js/cards.js
git commit -m "feat: badge capsule system replaces card meta rows

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 7: Persistent Split Panel

The biggest structural change. Replaces the overlay inspector with a CSS Grid side-by-side layout.

**Files:**
- Modify: `static/css/style.css` (grid layout, panel styles, responsive breakpoint)
- Modify: `static/index.html:112-149` (restructure inspector panel HTML)
- Modify: `static/js/dialogs.js:463-714` (rewrite inspector as persistent panel)
- Modify: `static/js/app.js` (init panel visibility)

**Step 1: Update CSS layout to CSS Grid**

In `static/css/style.css`, find `.app-layout` and update:

```css
.app-layout {
  display: grid;
  grid-template-columns: 1fr var(--panel-width, 420px);
  height: calc(100vh - 44px); /* below toolbar */
}
```

Update `.inspector-panel` — remove `position: fixed`, `width: 500px`, `transform` transitions. Make it a grid child:

```css
.inspector-panel {
  grid-column: 2;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--border);
  background: var(--bg-secondary);
  overflow: hidden;
}
```

Remove the `.inspector-panel.collapsed` translateX rule. Remove the `.inspector-scrim` styles entirely (or keep only for mobile overlay mode).

Add empty state styling:
```css
.inspector-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-muted);
  font-size: 14px;
}
```

Add responsive breakpoint:
```css
@media (max-width: 1024px) {
  .app-layout {
    grid-template-columns: 1fr;
  }
  .inspector-panel {
    position: fixed;
    right: 0;
    top: 44px;
    bottom: 0;
    width: min(420px, 85vw);
    transform: translateX(100%);
    transition: transform var(--transition-slow) var(--ease-out-quart);
    z-index: var(--z-overlay);
  }
  .inspector-panel.open {
    transform: translateX(0);
  }
  .inspector-scrim.visible {
    /* keep scrim for mobile only */
  }
}
```

**Step 2: Update inspector HTML**

In `static/index.html`, update the inspector panel (lines 112-149):

- Remove `collapsed` class from the `<aside>` (panel starts visible)
- Add an empty state div inside the panel:
```html
<div class="inspector-empty" id="inspector-empty">
  <span>Select a card to inspect</span>
</div>
```
- Keep all existing inspector content (header, terminal, input) but wrap in a container that can be shown/hidden:
```html
<div class="inspector-content" id="inspector-content" style="display:none">
  <!-- existing header, terminal, input -->
</div>
```

**Step 3: Rewrite inspector logic in dialogs.js**

In `static/js/dialogs.js`, update:

- `openInspector()`: Instead of adding/removing `open`/`collapsed` classes, show `#inspector-content` and hide `#inspector-empty`. No scrim manipulation on desktop. On narrow viewports (check `window.innerWidth <= 1024`), add `open` class and show scrim.
- `closeInspector()`: Show `#inspector-empty`, hide `#inspector-content`. On narrow, remove `open` class and hide scrim.
- Remove the 280ms delayed `disposeXterm()` from close — terminal stays alive (prep for Task 8).
- Card switching: When a new card is clicked while panel already shows content, just swap the content — no close/open animation.
- Add ResizeObserver on the terminal container to call `fitAddon.fit()` when panel resizes.

**Step 4: Update app.js panel initialization**

In `static/js/app.js`, after `renderBoard()`:
- Panel starts visible with empty state (no special init needed if HTML is correct)
- Add window resize listener to toggle between grid and overlay modes

**Step 5: Remove or conditionalize scrim**

- Remove the `#inspector-scrim` click handler for desktop (or gate it behind width check)
- On mobile: scrim click still closes the inspector

**Step 6: Test in browser**

- Page load: board on left, empty panel on right with "Select a card to inspect"
- Click a card: panel shows card's inspector content, no animation
- Click a different card: content swaps instantly
- Resize window below 1024px: panel should hide and switch to overlay mode
- On mobile: clicking a card opens panel as overlay with scrim
- Terminal should render correctly in the panel with proper sizing
- Board columns should have consistent widths regardless of panel content

**Step 7: Commit**

```bash
git add static/css/style.css static/index.html static/js/dialogs.js static/js/app.js
git commit -m "feat: persistent split panel replaces overlay inspector

CSS Grid layout with always-visible inspector panel. Desktop: side-by-side.
Below 1024px: falls back to overlay mode with scrim.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 8: Terminal Cache

**Files:**
- Modify: `static/js/dialogs.js` (terminal Map cache, reparenting, LRU eviction)

**Step 1: Add terminal cache data structure**

At the top of `dialogs.js` (near existing module state ~line 414-420), add:

```js
const terminalCache = new Map(); // cardId -> { term, fitAddon, container }
const TERMINAL_CACHE_MAX = 5;
```

**Step 2: Create cache management functions**

```js
function getOrCreateTerminal(cardId) {
  if (terminalCache.has(cardId)) {
    const cached = terminalCache.get(cardId);
    // Move to end (most recently used)
    terminalCache.delete(cardId);
    terminalCache.set(cardId, cached);
    return cached;
  }

  // Evict LRU if at capacity
  if (terminalCache.size >= TERMINAL_CACHE_MAX) {
    const [oldestId, oldest] = terminalCache.entries().next().value;
    oldest.term.dispose();
    oldest.container.remove();
    terminalCache.delete(oldestId);
  }

  // Create new terminal
  const container = document.createElement('div');
  container.style.cssText = 'width:100%;height:100%;display:none';
  const term = new Terminal({ /* existing terminal options */ });
  const fitAddon = new FitAddon.FitAddon();
  term.loadAddon(fitAddon);
  // Load optional addons (WebLinksAddon, SearchAddon) same as existing initXterm()
  term.open(container);

  const entry = { term, fitAddon, container };
  terminalCache.set(cardId, entry);
  return entry;
}

function showTerminal(cardId, parentElement) {
  // Hide all terminals
  for (const [id, entry] of terminalCache) {
    entry.container.style.display = 'none';
  }
  const entry = getOrCreateTerminal(cardId);
  if (!entry.container.parentElement || entry.container.parentElement !== parentElement) {
    parentElement.appendChild(entry.container);
  }
  entry.container.style.display = '';
  // Fit after showing
  requestAnimationFrame(() => entry.fitAddon.fit());
  return entry;
}
```

**Step 3: Update openInspector to use cache**

Replace the existing `initXterm()` / `disposeXterm()` calls in `openInspector()` with `showTerminal()`:

- Instead of `initXterm()`, call `showTerminal(cardId, xtermContainer)`
- Instead of `disposeXterm()` on close, just hide all terminal containers
- `loadTerminalOutput()` should write to the cached terminal for the current card

**Step 4: Add ResizeObserver for FitAddon**

```js
const xtermContainer = document.getElementById('terminal-xterm-container');
const resizeObserver = new ResizeObserver(() => {
  if (currentInspectorCardId && terminalCache.has(currentInspectorCardId)) {
    terminalCache.get(currentInspectorCardId).fitAddon.fit();
  }
});
resizeObserver.observe(xtermContainer);
```

Also call `fitAddon.fit()` on `window.resize` event.

**Step 5: Test in browser**

- Open card A → terminal loads
- Switch to card B → card B terminal loads, card A terminal preserved
- Switch back to card A → terminal content still there (no refetch)
- Open 6+ cards → oldest terminal should be evicted (verify no memory leak)
- Resize window → terminal should refit correctly

**Step 6: Commit**

```bash
git add static/js/dialogs.js
git commit -m "feat: terminal cache — Map<cardId, Terminal> with LRU eviction

Terminals persist across card switches via reparenting. FitAddon responds
to ResizeObserver for dynamic sizing. Cache capped at 5 instances.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 9: Final Integration Test

**Step 1: Run backend tests**

Run: `python -m pytest tests/ -v`
Expected: All tests PASS

**Step 2: Manual browser test checklist**

- [ ] Page loads with split panel layout (board left, empty panel right)
- [ ] Column headers have colored dots
- [ ] Column dots use palette colors by default
- [ ] Column color picker works via "⋮" menu
- [ ] Custom column color persists on reload
- [ ] Cards show badge capsules (model, duration, cost, context, project, status)
- [ ] Badge colors are correct and legible in both themes
- [ ] Clicking a card fills the inspector panel instantly
- [ ] Switching cards swaps content without animation
- [ ] Terminal stays alive when switching between cards
- [ ] Column headers float/stick when scrolling
- [ ] Card hover brightens, card press scales down
- [ ] No keyboard shortcuts fire (hotkeys removed)
- [ ] Escape still closes inspector on mobile
- [ ] Resize below 1024px → panel becomes overlay
- [ ] Resize above 1024px → panel returns to grid
- [ ] No console errors

**Step 3: Push to remote**

```bash
git push origin feat/v1-implementation
```

**Step 4: Update PR**

The PR (https://github.com/hwansu93/card-code/pull/1) should auto-update with the new commits.

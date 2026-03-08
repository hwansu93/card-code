# UI Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign CardCode UI with Copper &amp; Slate palette, dense info-rich cards, full-height inspector overlay, and multi-terminal command center.

**Architecture:** CSS-first redesign replacing color system, card layout, and inspector panel behavior. Inspector becomes a full-height overlay (no tabs). New command center view adds multi-terminal grid. All changes are frontend-only except no backend changes needed.

**Tech Stack:** Vanilla JS (ES modules), CSS custom properties (OKLCH), xterm.js 5.5, Sortable.js, Lucide icons

**Design doc:** `docs/plans/2026-03-08-ui-redesign-design.md`

---

## Task 1: Color System — Copper &amp; Slate

Replace the entire CSS custom property system with the new OKLCH Copper &amp; Slate palette.

**Files:**
- Modify: `static/css/style.css:77-159` (dark theme variables)
- Modify: `static/css/style.css:161-224` (light theme variables)

**Step 1: Replace dark theme custom properties**

Replace lines 77-159 in `static/css/style.css` with the Copper &amp; Slate palette:

```css
:root, [data-theme="dark"] {
    /* === Copper & Slate Palette === */
    /* Neutrals — blue-gray slate (hue 250) */
    --bg-base:     oklch(12% 0.015 250);
    --bg-primary:  oklch(12% 0.015 250);
    --bg-secondary: oklch(16% 0.012 250);
    --bg-tertiary: oklch(20% 0.010 250);
    --bg-card:     oklch(16% 0.012 250);
    --bg-elevated: oklch(20% 0.010 250);
    --bg-overlay:  oklch(22% 0.010 250);
    --bg-input:    oklch(14% 0.012 250);
    --bg-hover:    oklch(20% 0.010 250);

    /* Borders */
    --border:       oklch(30% 0.012 250);
    --border-focus: oklch(38% 0.012 250);
    --border-subtle: oklch(25% 0.010 250);

    /* Text */
    --text-primary:   oklch(90% 0.008 250);
    --text-secondary: oklch(62% 0.008 250);
    --text-muted:     oklch(42% 0.008 250);
    --text-on-accent: oklch(12% 0.015 250);

    /* Primary Accent — Copper (hue 55) */
    --accent:        oklch(68% 0.14 55);
    --accent-hover:  oklch(74% 0.14 55);
    --accent-muted:  oklch(22% 0.04 55);
    --accent-text:   oklch(78% 0.10 55);
    --accent-bold:   oklch(72% 0.16 55);
    --accent-selection: oklch(20% 0.04 55);

    /* Secondary — Patina Green (hue 165) */
    --secondary:       oklch(65% 0.08 165);
    --secondary-muted: oklch(22% 0.03 165);

    /* Status */
    --status-alive:   oklch(65% 0.08 165);
    --status-waiting: oklch(68% 0.14 55);
    --status-idle:    oklch(55% 0.06 55);
    --status-dead:    oklch(50% 0.008 250);
    --status-error:   oklch(62% 0.16 25);
    --status-warning: oklch(68% 0.14 55);
    --status-critical: oklch(62% 0.16 25);

    /* Terminal */
    --terminal-bg: oklch(10% 0.012 250);
    --terminal-fg: oklch(90% 0.008 250);
    --terminal-cursor: oklch(65% 0.08 165);

    /* Surfaces */
    --surface-translucent: oklch(16% 0.012 250 / 0.95);
    --scrim: oklch(5% 0.01 250 / 0.6);

    /* Misc */
    --shadow: 0 2px 8px oklch(5% 0.01 250 / 0.4);
    --radius: 6px;
    --radius-sm: 4px;
    --radius-lg: 8px;
}
```

**Step 2: Replace light theme custom properties**

Replace lines 161-224 with a light variant of Copper &amp; Slate:

```css
[data-theme="light"] {
    --bg-base:     oklch(96% 0.008 250);
    --bg-primary:  oklch(96% 0.008 250);
    --bg-secondary: oklch(94% 0.006 250);
    --bg-tertiary: oklch(91% 0.005 250);
    --bg-card:     oklch(98% 0.004 250);
    --bg-elevated: oklch(99% 0.003 250);
    --bg-overlay:  oklch(97% 0.005 250);
    --bg-input:    oklch(97% 0.005 250);
    --bg-hover:    oklch(93% 0.005 250);

    --border:       oklch(82% 0.008 250);
    --border-focus: oklch(72% 0.010 250);
    --border-subtle: oklch(88% 0.006 250);

    --text-primary:   oklch(20% 0.012 250);
    --text-secondary: oklch(42% 0.010 250);
    --text-muted:     oklch(60% 0.008 250);
    --text-on-accent: oklch(98% 0.004 250);

    --accent:        oklch(58% 0.14 55);
    --accent-hover:  oklch(52% 0.14 55);
    --accent-muted:  oklch(92% 0.04 55);
    --accent-text:   oklch(48% 0.12 55);
    --accent-bold:   oklch(55% 0.16 55);
    --accent-selection: oklch(94% 0.03 55);

    --secondary:       oklch(48% 0.08 165);
    --secondary-muted: oklch(92% 0.03 165);

    --status-alive:   oklch(48% 0.08 165);
    --status-waiting: oklch(58% 0.14 55);
    --status-idle:    oklch(50% 0.06 55);
    --status-dead:    oklch(62% 0.008 250);
    --status-error:   oklch(52% 0.16 25);
    --status-warning: oklch(58% 0.14 55);
    --status-critical: oklch(52% 0.16 25);

    --terminal-bg: oklch(16% 0.012 250);
    --terminal-fg: oklch(90% 0.008 250);
    --terminal-cursor: oklch(48% 0.08 165);

    --surface-translucent: oklch(97% 0.005 250 / 0.95);
    --scrim: oklch(30% 0.01 250 / 0.3);

    --shadow: 0 2px 8px oklch(70% 0.01 250 / 0.15);
}
```

**Step 3: Verify no broken variable references**

Search all CSS and JS files for any old variable names that were removed (e.g., `--bg-card-hover`, `--toast-*`, etc.) and map them to new equivalents or remove them.

**Step 4: Commit**

```bash
git add static/css/style.css
git commit -m "feat: copper & slate color system (OKLCH)"
```

---

## Task 2: Card Redesign — Dense Info Tiles

Redesign card rendering to show title, model chip with provider icon, duration, context bar, cost, and status dot.

**Files:**
- Modify: `static/js/cards.js:6-93` (createCardElement function)
- Modify: `static/css/style.css:737-1004` (card styles)

**Step 1: Rewrite createCardElement**

Replace the `createCardElement` function (lines 6-93) with the new dense card layout:

```javascript
export function createCardElement(card) {
    const el = document.createElement('div');
    el.className = 'card';
    el.dataset.id = card.id;
    el.dataset.position = card.position;

    if (card.session_status) {
        el.classList.add(`card-status-${card.session_status}`);
    }
    if (card.column_name === 'done' || card.column_name === 'archive') {
        el.classList.add('card-done');
    }

    // Provider icon mapping
    const providerIcons = {
        'claude-code': `<svg class="provider-icon" viewBox="0 0 24 24" width="12" height="12"><path fill="currentColor" d="M4.709 15.955l4.397-10.985c.2-.5.349-.873.874-.873s.674.373.874.873l4.397 10.985c.175.437.35.874-.175 1.136-.524.262-.874 0-1.049-.437L10.63 8.406l-3.397 8.248c-.175.437-.524.699-1.049.437-.524-.262-.35-.699-.175-1.136zm8.795 0l4.397-10.985c.2-.5.349-.873.874-.873s.674.373.874.873l4.397 10.985c.175.437.35.874-.175 1.136-.524.262-.874 0-1.049-.437l-3.397-8.248-3.397 8.248c-.175.437-.524.699-1.049.437-.524-.262-.35-.699-.175-1.136z"/></svg>`,
        'gemini': `<svg class="provider-icon" viewBox="0 0 24 24" width="12" height="12"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/><circle fill="currentColor" cx="12" cy="12" r="5"/></svg>`,
    };
    const providerIcon = providerIcons[card.provider] || `<svg class="provider-icon" viewBox="0 0 24 24" width="12" height="12"><circle fill="currentColor" cx="12" cy="12" r="8"/></svg>`;

    // Model name from provider
    const modelName = card.provider === 'claude-code' ? 'Claude' : card.provider === 'gemini' ? 'Gemini' : card.provider || 'Unknown';

    // Duration calculation
    const duration = card.started_at ? formatDuration(card.started_at) : null;

    // Context percentage
    const ctxPct = Math.min((card.context_pct || 0) * 100, 100);
    const ctxClass = ctxPct >= 80 ? 'critical' : ctxPct >= 60 ? 'warning' : '';

    // Cost formatting
    const cost = card.cost_usd > 0 ? `$${card.cost_usd.toFixed(2)}` : null;

    el.innerHTML = `
        <div class="card-title">${escapeHtml(card.title)}</div>
        <div class="card-meta-row">
            <span class="model-chip">${providerIcon}<span class="model-name">${escapeHtml(modelName)}</span></span>
            ${duration ? `<span class="card-duration">${duration}</span>` : ''}
        </div>
        <div class="card-bottom">
            ${cost ? `<span class="card-cost">${cost}</span>` : ''}
            <span class="card-status-dot status-${card.session_status || 'dead'}"></span>
        </div>
        <div class="context-gauge"><div class="context-fill ${ctxClass}" style="width:${ctxPct}%"></div></div>
    `;

    // Overflow menu button
    const overflowBtn = document.createElement('button');
    overflowBtn.className = 'card-overflow-btn';
    overflowBtn.setAttribute('aria-label', 'Card actions');
    overflowBtn.innerHTML = '<i data-lucide="more-vertical"></i>';
    overflowBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showCardContextMenu(e, card);
    });
    el.appendChild(overflowBtn);

    // Click handler — open inspector
    el.addEventListener('click', (e) => {
        if (e.target.closest('.card-overflow-btn') || e.target.closest('.card-context-menu')) return;
        CardCode.openTerminalViewer(card.id, card.title);
    });

    // Context menu
    el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showCardContextMenu(e, card);
    });

    return el;
}
```

**Step 2: Add formatDuration helper**

Add after the `timeAgo` function (after line 283):

```javascript
export function formatDuration(isoString) {
    const start = new Date(isoString);
    const now = new Date();
    const diffMs = now - start;
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return '<1m';
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ${mins % 60}m`;
    const days = Math.floor(hrs / 24);
    return `${days}d ${hrs % 24}h`;
}
```

**Step 3: Add escapeHtml import**

Ensure `escapeHtml` is imported from utils.js at the top of cards.js:
```javascript
import { escapeHtml } from './utils.js';
```

**Step 4: Rewrite card CSS styles**

Replace the card styles section (lines 737-1004) with dense tile styling:

```css
/* ── Cards ── */
.card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 10px 12px 6px;
    cursor: pointer;
    position: relative;
    transition: background 0.15s ease, border-color 0.15s ease;
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.card:hover {
    background: var(--bg-elevated);
    border-color: var(--border-focus);
}

.card.selected {
    border-left: 3px solid var(--accent);
    padding-left: 9px;
}

.card-entrance {
    animation: cardSlideIn 0.2s ease-out;
}

@keyframes cardSlideIn {
    from { opacity: 0; transform: translateY(-8px); }
    to { opacity: 1; transform: translateY(0); }
}

/* Status left-border accents */
.card-status-alive { border-left: 3px solid var(--status-alive); padding-left: 9px; }
.card-status-waiting { border-left: 3px solid var(--status-waiting); padding-left: 9px; }
.card-status-idle { border-left: 3px solid var(--status-idle); padding-left: 9px; }
.card-status-dead { border-left: 3px solid var(--status-dead); padding-left: 9px; }

.card.selected.card-status-alive { border-left-color: var(--accent); }
.card.selected.card-status-waiting { border-left-color: var(--accent); }
.card.selected.card-status-idle { border-left-color: var(--accent); }
.card.selected.card-status-dead { border-left-color: var(--accent); }

/* Title */
.card-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
    line-height: 1.35;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

/* Metadata row — model chip + duration */
.card-meta-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    color: var(--text-secondary);
}

.model-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 1px 6px;
    background: var(--accent-muted);
    border-radius: var(--radius-sm);
    color: var(--accent-text);
    font-weight: 500;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
}

.provider-icon {
    flex-shrink: 0;
    opacity: 0.8;
}

.card-duration {
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
}

/* Bottom bar — cost + status dot */
.card-bottom {
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.card-cost {
    font-size: 11px;
    font-weight: 500;
    color: var(--text-secondary);
    font-variant-numeric: tabular-nums;
}

.card-status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
}

.card-status-dot.status-alive { background: var(--status-alive); box-shadow: 0 0 4px var(--status-alive); }
.card-status-dot.status-waiting { background: var(--status-waiting); }
.card-status-dot.status-idle { background: var(--status-idle); }
.card-status-dot.status-dead { background: var(--status-dead); }

/* Context gauge at bottom */
.context-gauge {
    height: 2px;
    background: var(--border-subtle);
    border-radius: 1px;
    overflow: hidden;
    margin-top: auto;
}

.context-fill {
    height: 100%;
    background: var(--secondary);
    border-radius: 1px;
    transition: width 0.3s ease;
}

.context-fill.warning { background: var(--status-warning); }
.context-fill.critical { background: var(--status-critical); }

/* Overflow button */
.card-overflow-btn {
    position: absolute;
    top: 6px;
    right: 6px;
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    padding: 2px;
    border-radius: var(--radius-sm);
    opacity: 0;
    transition: opacity 0.15s ease, background 0.15s ease;
    display: flex;
    align-items: center;
    justify-content: center;
}

.card:hover .card-overflow-btn { opacity: 1; }
.card-overflow-btn:hover { background: var(--bg-hover); color: var(--text-primary); }

/* Context menu */
.card-context-menu {
    position: fixed;
    z-index: var(--z-dropdown, 100);
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 4px;
    min-width: 180px;
    box-shadow: var(--shadow);
}

.card-context-menu button {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 6px 10px;
    background: none;
    border: none;
    color: var(--text-primary);
    font-size: 12px;
    cursor: pointer;
    border-radius: var(--radius-sm);
    text-align: left;
}

.card-context-menu button:hover,
.card-context-menu button.focused {
    background: var(--bg-hover);
}

.card-context-menu .menu-separator {
    height: 1px;
    background: var(--border);
    margin: 4px 0;
}

.card-context-menu .submenu-item {
    padding-left: 28px;
    color: var(--text-secondary);
    font-size: 11px;
}
```

**Step 5: Update card flash animation**

Find `@keyframes cardFadeIn` around line 1133 and replace with:

```css
@keyframes cardFadeIn {
    0% { box-shadow: 0 0 0 2px var(--accent); }
    100% { box-shadow: 0 0 0 2px transparent; }
}
.card-flash {
    animation: cardFadeIn 1s ease-out;
}
```

**Step 6: Commit**

```bash
git add static/js/cards.js static/css/style.css
git commit -m "feat: dense card tiles with model chip, duration, status dot"
```

---

## Task 3: Inspector Panel — Full-Height Overlay

Replace the tabbed inspector with a full-height overlay panel. Terminal fills the entire panel. No tabs.

**Files:**
- Modify: `static/index.html:200-280` (inspector panel HTML)
- Modify: `static/css/style.css:1598-1900` (inspector styles)
- Modify: `static/js/dialogs.js:420-775` (inspector JS logic)

**Step 1: Replace inspector HTML in index.html**

Find the `<aside class="inspector-panel">` block and replace with:

```html
<aside class="inspector-panel collapsed" id="inspector-panel">
    <div class="inspector-header">
        <div class="inspector-header-left">
            <span class="inspector-title" id="inspector-title">No card selected</span>
            <span class="inspector-meta" id="inspector-meta"></span>
        </div>
        <div class="inspector-header-right">
            <button class="inspector-btn" id="inspector-refresh" aria-label="Refresh" title="Refresh">
                <i data-lucide="refresh-cw"></i>
            </button>
            <label class="auto-refresh-toggle" title="Auto-refresh">
                <input type="checkbox" id="inspector-auto-refresh" checked>
                <i data-lucide="radio"></i>
            </label>
            <button class="inspector-btn inspector-close" id="inspector-close" aria-label="Close" title="Close">
                <i data-lucide="x"></i>
            </button>
        </div>
    </div>
    <div class="inspector-terminal" id="inspector-terminal">
        <div id="terminal-xterm-container"></div>
        <div class="terminal-loading" id="terminal-loading">
            <i data-lucide="loader-2" class="spin"></i>
            <span>Loading terminal output...</span>
        </div>
        <div class="terminal-empty" id="terminal-empty">
            <i data-lucide="terminal"></i>
            <span>No active session</span>
        </div>
    </div>
    <div class="inspector-input" id="inspector-input">
        <input type="text" id="terminal-prompt-input" placeholder="Send a message to the session..." autocomplete="off">
        <button id="terminal-prompt-send" aria-label="Send">
            <i data-lucide="send"></i>
        </button>
    </div>
</aside>
<div class="inspector-scrim" id="inspector-scrim"></div>
```

**Step 2: Replace inspector CSS**

Replace the inspector panel section (lines 1598-1900 approx) with:

```css
/* ── Inspector Panel (Overlay) ── */
.inspector-panel {
    position: fixed;
    top: 44px; /* toolbar height */
    right: 0;
    bottom: 0;
    width: 500px;
    background: var(--bg-secondary);
    border-left: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    z-index: var(--z-drawer, 200);
    transform: translateX(100%);
    transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

.inspector-panel.open {
    transform: translateX(0);
}

.inspector-scrim {
    position: fixed;
    inset: 0;
    top: 44px;
    background: var(--scrim);
    z-index: calc(var(--z-drawer, 200) - 1);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.25s ease;
}

.inspector-scrim.visible {
    opacity: 1;
    pointer-events: auto;
}

/* Header */
.inspector-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px;
    border-bottom: 1px solid var(--border);
    min-height: 48px;
    gap: 12px;
    flex-shrink: 0;
}

.inspector-header-left {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    flex: 1;
}

.inspector-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.inspector-meta {
    font-size: 11px;
    color: var(--text-secondary);
    display: flex;
    align-items: center;
    gap: 8px;
}

.inspector-meta .model-chip {
    font-size: 9px;
}

.inspector-header-right {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
}

.inspector-btn {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    padding: 6px;
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    transition: color 0.15s ease, background 0.15s ease;
}

.inspector-btn:hover {
    color: var(--text-primary);
    background: var(--bg-hover);
}

.auto-refresh-toggle {
    display: flex;
    align-items: center;
    cursor: pointer;
    padding: 6px;
    border-radius: var(--radius-sm);
    color: var(--text-muted);
    transition: color 0.15s ease;
}

.auto-refresh-toggle:has(input:checked) {
    color: var(--secondary);
}

.auto-refresh-toggle input {
    display: none;
}

/* Terminal area — fills remaining height */
.inspector-terminal {
    flex: 1;
    position: relative;
    overflow: hidden;
    background: var(--terminal-bg);
}

#terminal-xterm-container {
    position: absolute;
    inset: 0;
}

.terminal-loading,
.terminal-empty {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: var(--text-muted);
    font-size: 13px;
}

.terminal-loading { display: none; }
.terminal-empty { display: none; }

.inspector-terminal.loading .terminal-loading { display: flex; }
.inspector-terminal.empty .terminal-empty { display: flex; }

@keyframes spin {
    to { transform: rotate(360deg); }
}
.spin { animation: spin 1s linear infinite; }

/* Input bar */
.inspector-input {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-top: 1px solid var(--border);
    background: var(--bg-secondary);
    flex-shrink: 0;
}

.inspector-input.hidden { display: none; }

.inspector-input input {
    flex: 1;
    background: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 8px 12px;
    color: var(--text-primary);
    font-size: 13px;
    outline: none;
    transition: border-color 0.15s ease;
}

.inspector-input input:focus {
    border-color: var(--accent);
}

.inspector-input input::placeholder {
    color: var(--text-muted);
}

.inspector-input button {
    background: var(--accent);
    border: none;
    color: var(--text-on-accent);
    padding: 8px 10px;
    border-radius: var(--radius-sm);
    cursor: pointer;
    display: flex;
    align-items: center;
    transition: background 0.15s ease;
}

.inspector-input button:hover {
    background: var(--accent-hover);
}

/* Mobile */
@media (max-width: 768px) {
    .inspector-panel {
        width: 100%;
        top: auto;
        bottom: 0;
        height: 70vh;
        transform: translateY(100%);
        border-left: none;
        border-top: 1px solid var(--border);
        border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    }
    .inspector-panel.open {
        transform: translateY(0);
    }
}
```

**Step 3: Rewrite inspector JS in dialogs.js**

Replace the terminal viewer section (setupTerminalViewer through end of terminal logic, roughly lines 420-775) with the new overlay inspector:

```javascript
// ── Inspector Panel (Overlay) ──

let term = null;
let fitAddon = null;
let searchAddon = null;
let fetchController = null;
let autoRefreshInterval = null;
let currentInspectorCardId = null;

function setupInspector() {
    const panel = document.getElementById('inspector-panel');
    const scrim = document.getElementById('inspector-scrim');
    const closeBtn = document.getElementById('inspector-close');
    const refreshBtn = document.getElementById('inspector-refresh');
    const autoRefreshCheckbox = document.getElementById('inspector-auto-refresh');
    const promptInput = document.getElementById('terminal-prompt-input');
    const promptSend = document.getElementById('terminal-prompt-send');

    // Restore auto-refresh preference
    const savedAutoRefresh = localStorage.getItem('cardcode-auto-refresh');
    if (savedAutoRefresh !== null) {
        autoRefreshCheckbox.checked = savedAutoRefresh === 'true';
    }

    closeBtn.addEventListener('click', closeInspector);
    scrim.addEventListener('click', closeInspector);

    refreshBtn.addEventListener('click', () => {
        if (currentInspectorCardId) loadTerminalOutput(currentInspectorCardId);
    });

    autoRefreshCheckbox.addEventListener('change', () => {
        localStorage.setItem('cardcode-auto-refresh', autoRefreshCheckbox.checked);
        if (autoRefreshCheckbox.checked && currentInspectorCardId) {
            startAutoRefresh(currentInspectorCardId);
        } else {
            stopAutoRefresh();
        }
    });

    // Prompt input
    promptInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && promptInput.value.trim()) {
            sendPrompt(promptInput.value.trim());
        }
    });
    promptSend.addEventListener('click', () => {
        if (promptInput.value.trim()) {
            sendPrompt(promptInput.value.trim());
        }
    });

    // Escape to close
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && panel.classList.contains('open')) {
            closeInspector();
        }
    });
}

function openInspector(cardId, cardTitle) {
    const panel = document.getElementById('inspector-panel');
    const scrim = document.getElementById('inspector-scrim');
    const terminalArea = document.getElementById('inspector-terminal');
    const inputArea = document.getElementById('inspector-input');

    currentInspectorCardId = cardId;

    // Update header
    document.getElementById('inspector-title').textContent = cardTitle;

    // Find card data
    const card = CardCode.state?.cards?.find(c => c.id === cardId) || state.cards?.find(c => c.id === cardId);

    if (card) {
        // Build meta with model chip and status
        const providerIcons = {
            'claude-code': '⟡',
            'gemini': '◆',
        };
        const icon = providerIcons[card.provider] || '●';
        const modelName = card.provider === 'claude-code' ? 'Claude' : card.provider === 'gemini' ? 'Gemini' : card.provider || '';
        const meta = document.getElementById('inspector-meta');
        const parts = [];
        if (modelName) parts.push(`<span class="model-chip">${icon} ${escapeHtml(modelName)}</span>`);
        if (card.session_status) parts.push(`<span class="status-${card.session_status}">${card.session_status}</span>`);
        if (card.cost_usd > 0) parts.push(`$${card.cost_usd.toFixed(2)}`);
        meta.innerHTML = parts.join('<span class="meta-sep">·</span>');
    }

    // Highlight selected card
    document.querySelectorAll('.card.selected').forEach(c => c.classList.remove('selected'));
    const cardEl = document.querySelector(`.card[data-id="${cardId}"]`);
    if (cardEl) cardEl.classList.add('selected');

    // Show panel
    panel.classList.remove('collapsed');
    panel.classList.add('open');
    scrim.classList.add('visible');

    // Determine if card has a session
    const hasSession = card && (card.tmux_session || card.session_status === 'alive' || card.session_status === 'waiting');

    if (hasSession) {
        inputArea.classList.remove('hidden');
        terminalArea.classList.remove('empty');
        terminalArea.classList.add('loading');

        // Init xterm after transition completes
        setTimeout(() => {
            initXterm();
            loadTerminalOutput(cardId);
        }, 280); // slightly longer than CSS transition (250ms)
    } else {
        inputArea.classList.add('hidden');
        terminalArea.classList.remove('loading');
        terminalArea.classList.add('empty');

        // Still try to load last_output if available
        if (card && card.last_output) {
            terminalArea.classList.remove('empty');
            setTimeout(() => {
                initXterm();
                term.reset();
                if (fitAddon) fitAddon.fit();
                term.write(card.last_output.replace(/\n/g, '\r\n'));
                term.write('\r\n\r\n--- Session has ended ---');
            }, 280);
        }
    }

    // Auto-refresh
    const autoRefresh = document.getElementById('inspector-auto-refresh');
    if (autoRefresh.checked && hasSession) {
        startAutoRefresh(cardId);
    }
}

function closeInspector() {
    const panel = document.getElementById('inspector-panel');
    const scrim = document.getElementById('inspector-scrim');

    panel.classList.remove('open');
    scrim.classList.remove('visible');

    // Clean up
    stopAutoRefresh();
    if (fetchController) {
        fetchController.abort();
        fetchController = null;
    }
    currentInspectorCardId = null;

    // Deselect card
    document.querySelectorAll('.card.selected').forEach(c => c.classList.remove('selected'));

    // Dispose terminal after transition
    setTimeout(() => {
        if (term) {
            term.dispose();
            term = null;
            fitAddon = null;
            searchAddon = null;
        }
        panel.classList.add('collapsed');
    }, 280);
}

function initXterm() {
    if (term) return;

    const container = document.getElementById('terminal-xterm-container');
    container.innerHTML = '';

    term = new Terminal({
        cursorBlink: false,
        cursorStyle: 'bar',
        fontSize: 13,
        fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
        theme: {
            background: getComputedStyle(document.documentElement).getPropertyValue('--terminal-bg').trim() || '#0e0f12',
            foreground: getComputedStyle(document.documentElement).getPropertyValue('--terminal-fg').trim() || '#ece9e4',
            cursor: getComputedStyle(document.documentElement).getPropertyValue('--terminal-cursor').trim() || '#3db89a',
        },
        scrollback: 5000,
        convertEol: false,
        allowTransparency: true,
    });

    fitAddon = new FitAddon.FitAddon();
    term.loadAddon(fitAddon);

    if (typeof WebLinksAddon !== 'undefined') {
        term.loadAddon(new WebLinksAddon.WebLinksAddon());
    }
    if (typeof SearchAddon !== 'undefined') {
        searchAddon = new SearchAddon.SearchAddon();
        term.loadAddon(searchAddon);
    }

    term.open(container);
    fitAddon.fit();
}

async function loadTerminalOutput(cardId) {
    if (fetchController) fetchController.abort();
    fetchController = new AbortController();

    const terminalArea = document.getElementById('inspector-terminal');

    try {
        const basePath = document.querySelector('meta[name="base-path"]')?.content || '';
        const resp = await fetch(`${basePath}/api/cards/${cardId}/terminal`, {
            signal: fetchController.signal,
        });
        const data = await resp.json();

        terminalArea.classList.remove('loading');
        terminalArea.classList.remove('empty');

        if (!term) initXterm();

        term.reset();
        if (fitAddon) fitAddon.fit();

        if (data.output) {
            term.write(data.output.replace(/\n/g, '\r\n'));
        } else {
            terminalArea.classList.add('empty');
        }

        if (!data.alive) {
            if (data.output) {
                term.write('\r\n\r\n--- Session has ended ---');
            }
            stopAutoRefresh();
            document.getElementById('inspector-input').classList.add('hidden');
        }
    } catch (err) {
        if (err.name === 'AbortError') return; // Expected, don't toast
        console.error('Terminal fetch error:', err);
        terminalArea.classList.remove('loading');
        terminalArea.classList.add('empty');
    }
}

async function sendPrompt(text) {
    const input = document.getElementById('terminal-prompt-input');
    const sendBtn = document.getElementById('terminal-prompt-send');

    input.disabled = true;
    sendBtn.disabled = true;

    try {
        const basePath = document.querySelector('meta[name="base-path"]')?.content || '';
        await fetch(`${basePath}/api/cards/${currentInspectorCardId}/prompt`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text }),
        });
        input.value = '';
        // Reload terminal after a short delay
        setTimeout(() => loadTerminalOutput(currentInspectorCardId), 500);
    } catch (err) {
        console.error('Send prompt error:', err);
        if (typeof showToast === 'function') {
            showToast({ title: 'Error', message: 'Failed to send prompt', type: 'error' });
        }
    } finally {
        input.disabled = false;
        sendBtn.disabled = false;
        input.focus();
    }
}

function startAutoRefresh(cardId) {
    stopAutoRefresh();
    autoRefreshInterval = setInterval(() => {
        if (currentInspectorCardId === cardId) {
            loadTerminalOutput(cardId);
        } else {
            stopAutoRefresh();
        }
    }, 3000);
}

function stopAutoRefresh() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = null;
    }
}
```

**Step 4: Update setupDialogs to call setupInspector**

In the `setupDialogs()` function (line 6-12), replace `setupTerminalViewer()` call with `setupInspector()`.

**Step 5: Export openInspector as CardCode.openTerminalViewer**

In the setup, assign: `CardCode.openTerminalViewer = openInspector;`

**Step 6: Remove old tab-related HTML and CSS**

Remove the inspector tabs HTML (`<div class="inspector-tabs">`) and associated CSS (`.inspector-tabs`, `.inspector-tab`, `.inspector-tab-content`, `.detail-content`, etc.) since we no longer have tabs.

**Step 7: Commit**

```bash
git add static/index.html static/css/style.css static/js/dialogs.js
git commit -m "feat: full-height inspector overlay with scrim, no tabs"
```

---

## Task 4: Command Center View

Add a multi-terminal command center view, toggled from the toolbar.

**Files:**
- Modify: `static/index.html` (add command center HTML + toolbar toggle)
- Create: `static/js/command-center.js` (new module)
- Modify: `static/css/style.css` (command center styles)
- Modify: `static/js/app.js` (import and init)

**Step 1: Add toolbar toggle button**

In `static/index.html`, after the theme toggle button in the toolbar, add:

```html
<button class="toolbar-btn" id="view-toggle" title="Command Center" aria-label="Toggle Command Center">
    <i data-lucide="layout-grid"></i>
</button>
```

**Step 2: Add command center HTML**

After `<main class="board">` closing tag, add:

```html
<main class="command-center hidden" id="command-center">
    <div class="cc-sidebar" id="cc-sidebar">
        <div class="cc-sidebar-header">
            <span>Sessions</span>
            <button class="cc-sidebar-toggle" id="cc-sidebar-toggle" aria-label="Toggle sidebar">
                <i data-lucide="panel-left-close"></i>
            </button>
        </div>
        <div class="cc-card-list" id="cc-card-list"></div>
    </div>
    <div class="cc-grid" id="cc-grid"></div>
    <div class="cc-empty" id="cc-empty">
        <i data-lucide="layout-grid"></i>
        <h3>Command Center</h3>
        <p>Drag cards from the sidebar or click + to add terminal tiles</p>
    </div>
</main>
```

**Step 3: Create command-center.js**

Create `static/js/command-center.js`:

```javascript
import { state, apiGet } from './app.js';
import { escapeHtml } from './utils.js';

let tiles = []; // { id, cardId, term, fitAddon, fetchController, refreshInterval }
let gridLayout = null;

export function setupCommandCenter() {
    const toggle = document.getElementById('view-toggle');
    const board = document.querySelector('.board');
    const cc = document.getElementById('command-center');
    const sidebarToggle = document.getElementById('cc-sidebar-toggle');

    toggle.addEventListener('click', () => {
        const isCC = !cc.classList.contains('hidden');
        if (isCC) {
            // Switch to board
            cc.classList.add('hidden');
            board.classList.remove('hidden');
            toggle.querySelector('i').setAttribute('data-lucide', 'layout-grid');
            toggle.title = 'Command Center';
            disposeAllTiles();
        } else {
            // Switch to command center
            board.classList.add('hidden');
            cc.classList.remove('hidden');
            toggle.querySelector('i').setAttribute('data-lucide', 'kanban');
            toggle.title = 'Board View';
            populateSidebar();
            restoreLayout();
        }
        lucide.createIcons();
    });

    sidebarToggle.addEventListener('click', () => {
        document.getElementById('cc-sidebar').classList.toggle('collapsed');
    });

    // Make sidebar cards draggable into grid
    setupSidebarDrag();
}

function populateSidebar() {
    const list = document.getElementById('cc-card-list');
    const activeSessions = state.cards.filter(c =>
        c.tmux_session && (c.session_status === 'alive' || c.session_status === 'waiting' || c.session_status === 'idle')
    );

    if (activeSessions.length === 0) {
        list.innerHTML = '<div class="cc-sidebar-empty">No active sessions</div>';
        return;
    }

    list.innerHTML = activeSessions.map(card => `
        <div class="cc-sidebar-card" data-card-id="${card.id}" draggable="true">
            <span class="card-status-dot status-${card.session_status || 'dead'}"></span>
            <span class="cc-sidebar-card-title">${escapeHtml(card.title)}</span>
            <button class="cc-add-btn" data-card-id="${card.id}" title="Add to grid">
                <i data-lucide="plus"></i>
            </button>
        </div>
    `).join('');

    // Add button click handlers
    list.querySelectorAll('.cc-add-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const cardId = btn.dataset.cardId;
            const card = state.cards.find(c => c.id === cardId);
            if (card && !tiles.find(t => t.cardId === cardId)) {
                addTile(card);
            }
        });
    });

    lucide.createIcons({ nodes: [list] });
}

function setupSidebarDrag() {
    const grid = document.getElementById('cc-grid');

    document.addEventListener('dragstart', (e) => {
        const sidebarCard = e.target.closest('.cc-sidebar-card');
        if (sidebarCard) {
            e.dataTransfer.setData('text/plain', sidebarCard.dataset.cardId);
            e.dataTransfer.effectAllowed = 'copy';
        }
    });

    grid.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        grid.classList.add('drag-over');
    });

    grid.addEventListener('dragleave', () => {
        grid.classList.remove('drag-over');
    });

    grid.addEventListener('drop', (e) => {
        e.preventDefault();
        grid.classList.remove('drag-over');
        const cardId = e.dataTransfer.getData('text/plain');
        const card = state.cards.find(c => c.id === cardId);
        if (card && !tiles.find(t => t.cardId === cardId)) {
            addTile(card);
        }
    });
}

function addTile(card) {
    if (tiles.length >= 8) {
        if (typeof showToast === 'function') {
            showToast({ title: 'Limit reached', message: 'Maximum 8 terminals for performance', type: 'warning' });
        }
        return;
    }

    const grid = document.getElementById('cc-grid');
    const empty = document.getElementById('cc-empty');
    empty.classList.add('hidden');

    const tileEl = document.createElement('div');
    tileEl.className = 'cc-tile';
    tileEl.dataset.cardId = card.id;

    const providerName = card.provider === 'claude-code' ? 'Claude' : card.provider === 'gemini' ? 'Gemini' : card.provider || '';

    tileEl.innerHTML = `
        <div class="cc-tile-header">
            <span class="card-status-dot status-${card.session_status || 'dead'}"></span>
            <span class="cc-tile-title">${escapeHtml(card.title)}</span>
            <span class="cc-tile-model">${escapeHtml(providerName)}</span>
            <div class="cc-tile-actions">
                <button class="cc-tile-maximize" title="Maximize" aria-label="Maximize">
                    <i data-lucide="maximize-2"></i>
                </button>
                <button class="cc-tile-close" title="Remove" aria-label="Remove">
                    <i data-lucide="x"></i>
                </button>
            </div>
        </div>
        <div class="cc-tile-terminal" id="cc-term-${card.id}"></div>
    `;

    grid.appendChild(tileEl);

    // Set up terminal for this tile
    const termContainer = tileEl.querySelector('.cc-tile-terminal');
    const tileTerm = new Terminal({
        cursorBlink: false,
        cursorStyle: 'bar',
        fontSize: 12,
        fontFamily: '"JetBrains Mono", "Fira Code", monospace',
        theme: {
            background: getComputedStyle(document.documentElement).getPropertyValue('--terminal-bg').trim() || '#0e0f12',
            foreground: getComputedStyle(document.documentElement).getPropertyValue('--terminal-fg').trim() || '#ece9e4',
            cursor: getComputedStyle(document.documentElement).getPropertyValue('--terminal-cursor').trim() || '#3db89a',
        },
        scrollback: 2000,
        convertEol: false,
    });

    const tileFit = new FitAddon.FitAddon();
    tileTerm.loadAddon(tileFit);
    tileTerm.open(termContainer);

    // Delay fit to next frame for correct sizing
    requestAnimationFrame(() => tileFit.fit());

    const tileData = {
        id: `tile-${card.id}`,
        cardId: card.id,
        term: tileTerm,
        fitAddon: tileFit,
        element: tileEl,
        fetchController: null,
        refreshInterval: null,
    };

    tiles.push(tileData);

    // Load terminal output
    loadTileOutput(tileData);

    // Start auto-refresh
    tileData.refreshInterval = setInterval(() => loadTileOutput(tileData), 3000);

    // Close button
    tileEl.querySelector('.cc-tile-close').addEventListener('click', () => removeTile(tileData));

    // Maximize / restore on double-click header
    const header = tileEl.querySelector('.cc-tile-header');
    const maxBtn = tileEl.querySelector('.cc-tile-maximize');

    function toggleMaximize() {
        tileEl.classList.toggle('maximized');
        requestAnimationFrame(() => tileFit.fit());
    }

    maxBtn.addEventListener('click', toggleMaximize);
    header.addEventListener('dblclick', toggleMaximize);

    // Resize observer for fit
    const resizeObserver = new ResizeObserver(() => {
        requestAnimationFrame(() => tileFit.fit());
    });
    resizeObserver.observe(termContainer);
    tileData.resizeObserver = resizeObserver;

    lucide.createIcons({ nodes: [tileEl] });
    saveLayout();
}

async function loadTileOutput(tileData) {
    if (tileData.fetchController) tileData.fetchController.abort();
    tileData.fetchController = new AbortController();

    try {
        const basePath = document.querySelector('meta[name="base-path"]')?.content || '';
        const resp = await fetch(`${basePath}/api/cards/${tileData.cardId}/terminal`, {
            signal: tileData.fetchController.signal,
        });
        const data = await resp.json();

        tileData.term.reset();
        if (tileData.fitAddon) tileData.fitAddon.fit();

        if (data.output) {
            tileData.term.write(data.output.replace(/\n/g, '\r\n'));
        }

        if (!data.alive) {
            tileData.term.write('\r\n\r\n--- Session has ended ---');
            if (tileData.refreshInterval) {
                clearInterval(tileData.refreshInterval);
                tileData.refreshInterval = null;
            }
            // Update status dot
            const dot = tileData.element.querySelector('.card-status-dot');
            if (dot) {
                dot.className = 'card-status-dot status-dead';
            }
        }
    } catch (err) {
        if (err.name === 'AbortError') return;
        console.error('Tile fetch error:', err);
    }
}

function removeTile(tileData) {
    // Clean up
    if (tileData.refreshInterval) clearInterval(tileData.refreshInterval);
    if (tileData.fetchController) tileData.fetchController.abort();
    if (tileData.resizeObserver) tileData.resizeObserver.disconnect();
    tileData.term.dispose();
    tileData.element.remove();

    tiles = tiles.filter(t => t !== tileData);

    if (tiles.length === 0) {
        document.getElementById('cc-empty').classList.remove('hidden');
    }

    saveLayout();
}

function disposeAllTiles() {
    tiles.forEach(t => {
        if (t.refreshInterval) clearInterval(t.refreshInterval);
        if (t.fetchController) t.fetchController.abort();
        if (t.resizeObserver) t.resizeObserver.disconnect();
        t.term.dispose();
        t.element.remove();
    });
    tiles = [];
}

function saveLayout() {
    const layout = tiles.map(t => t.cardId);
    localStorage.setItem('cardcode-cc-layout', JSON.stringify(layout));
}

function restoreLayout() {
    try {
        const saved = JSON.parse(localStorage.getItem('cardcode-cc-layout') || '[]');
        saved.forEach(cardId => {
            const card = state.cards.find(c => c.id === cardId);
            if (card && card.tmux_session && !tiles.find(t => t.cardId === cardId)) {
                addTile(card);
            }
        });
    } catch (e) {
        // Ignore corrupt localStorage
    }

    if (tiles.length === 0) {
        document.getElementById('cc-empty').classList.remove('hidden');
    }
}

export default { setupCommandCenter };
```

**Step 4: Add command center CSS**

Append to `static/css/style.css`:

```css
/* ── Command Center ── */
.command-center {
    display: flex;
    height: calc(100vh - 44px);
    background: var(--bg-base);
}

.command-center.hidden { display: none; }

/* Sidebar */
.cc-sidebar {
    width: 240px;
    background: var(--bg-secondary);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    transition: width 0.2s ease;
}

.cc-sidebar.collapsed {
    width: 0;
    overflow: hidden;
    border-right: none;
}

.cc-sidebar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    border-bottom: 1px solid var(--border);
    font-size: 12px;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.cc-sidebar-toggle {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    padding: 4px;
    border-radius: var(--radius-sm);
    display: flex;
}

.cc-sidebar-toggle:hover {
    color: var(--text-primary);
    background: var(--bg-hover);
}

.cc-card-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.cc-sidebar-card {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-radius: var(--radius-sm);
    cursor: grab;
    font-size: 12px;
    color: var(--text-primary);
    transition: background 0.15s ease;
}

.cc-sidebar-card:hover {
    background: var(--bg-hover);
}

.cc-sidebar-card-title {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.cc-add-btn {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    padding: 2px;
    border-radius: var(--radius-sm);
    display: flex;
    opacity: 0;
    transition: opacity 0.15s ease;
}

.cc-sidebar-card:hover .cc-add-btn { opacity: 1; }
.cc-add-btn:hover { color: var(--accent); }

.cc-sidebar-empty {
    padding: 16px;
    text-align: center;
    color: var(--text-muted);
    font-size: 12px;
}

/* Grid */
.cc-grid {
    flex: 1;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
    grid-auto-rows: minmax(250px, 1fr);
    gap: 1px;
    background: var(--border);
    overflow: auto;
}

.cc-grid.drag-over {
    outline: 2px dashed var(--accent);
    outline-offset: -2px;
}

/* Tile */
.cc-tile {
    display: flex;
    flex-direction: column;
    background: var(--bg-base);
    position: relative;
}

.cc-tile.maximized {
    position: fixed;
    inset: 44px 0 0 0;
    z-index: var(--z-modal, 300);
    grid-column: unset;
    grid-row: unset;
}

.cc-tile-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    min-height: 32px;
}

.cc-tile-title {
    font-size: 12px;
    font-weight: 500;
    color: var(--text-primary);
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.cc-tile-model {
    font-size: 10px;
    color: var(--text-muted);
    text-transform: uppercase;
}

.cc-tile-actions {
    display: flex;
    gap: 2px;
    opacity: 0;
    transition: opacity 0.15s ease;
}

.cc-tile-header:hover .cc-tile-actions { opacity: 1; }

.cc-tile-actions button {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    padding: 4px;
    border-radius: var(--radius-sm);
    display: flex;
}

.cc-tile-actions button:hover {
    color: var(--text-primary);
    background: var(--bg-hover);
}

.cc-tile-terminal {
    flex: 1;
    background: var(--terminal-bg);
    overflow: hidden;
}

/* Empty state */
.cc-empty {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: var(--text-muted);
    pointer-events: none;
}

.cc-empty.hidden { display: none; }

.cc-empty h3 {
    font-size: 16px;
    font-weight: 600;
    color: var(--text-secondary);
    margin: 0;
}

.cc-empty p {
    font-size: 13px;
    margin: 0;
}

/* Responsive */
@media (max-width: 768px) {
    .cc-sidebar { width: 100%; max-height: 30vh; border-right: none; border-bottom: 1px solid var(--border); }
    .command-center { flex-direction: column; }
    .cc-grid { grid-template-columns: 1fr; }
}
```

**Step 5: Import in app.js**

Add to the dynamic imports section in app.js init:

```javascript
import('./command-center.js').then(m => m.setupCommandCenter()).catch(() => {});
```

**Step 6: Commit**

```bash
git add static/js/command-center.js static/index.html static/css/style.css static/js/app.js
git commit -m "feat: command center multi-terminal grid view"
```

---

## Task 5: Bug Fixes &amp; Quality

Fix terminal reliability, state management, and error handling issues.

**Files:**
- Modify: `static/js/dialogs.js` (error handling, settings validation)
- Modify: `static/js/websocket.js` (live updates for inspector)
- Modify: `static/js/notifications.js` (debounce, copy fixes)
- Modify: `static/js/app.js` (error handling on dynamic imports)

**Step 1: Fix settings form validation**

In `static/js/dialogs.js`, find the settings save handler. Add `return;` after showing validation error toasts so the form doesn't submit:

```javascript
// After validation checks for port and poll_interval
if (isNaN(port) || port < 1 || port > 65535) {
    showToast({ title: 'Invalid port', message: 'Port must be 1-65535', type: 'error' });
    return; // Block submission
}
if (isNaN(pollInterval) || pollInterval < 1) {
    showToast({ title: 'Invalid interval', message: 'Poll interval must be at least 1 second', type: 'error' });
    return; // Block submission
}
```

**Step 2: Fix dynamic import error handling in app.js**

Replace silent `.catch(() => {})` with error logging:

```javascript
import('./dialogs.js').then(m => { /* ... */ }).catch(err => {
    console.error('Failed to load dialogs:', err);
    showToast({ title: 'Load error', message: 'Some features may not work. Reload the page.', type: 'error' });
});
```

**Step 3: Add WebSocket inspector refresh**

In `static/js/websocket.js`, for `metrics_updated` and `status_changed` events, dispatch a custom event that the inspector can listen for:

```javascript
// After updating card data in metrics_updated handler:
window.dispatchEvent(new CustomEvent('cardcode:card-updated', { detail: { cardId: msg.card_id } }));
```

In the inspector setup (dialogs.js), listen for this event:

```javascript
window.addEventListener('cardcode:card-updated', (e) => {
    if (currentInspectorCardId === e.detail.cardId) {
        // Refresh header meta
        const card = state.cards.find(c => c.id === e.detail.cardId);
        if (card) updateInspectorMeta(card);
    }
});
```

**Step 4: Commit**

```bash
git add static/js/dialogs.js static/js/websocket.js static/js/app.js static/js/notifications.js
git commit -m "fix: settings validation, error handling, live inspector updates"
```

---

## Task 6: Cleanup &amp; Integration Testing

Final pass to ensure everything works together.

**Step 1: Remove dead CSS**

Search for and remove any CSS that references old classes no longer used:
- `.inspector-tabs`, `.inspector-tab`, `.inspector-tab-content`
- `.detail-content`, `.detail-section`, `.metric-item`
- `.inspector-resize-handle`
- Any old card classes like `.card-status-bar`, `.status-capsule`, `.card-meta` (replaced by `.card-meta-row`)

**Step 2: Remove dead JS**

Remove from dialogs.js:
- `switchTab()` function
- `populateDetailTab()` function
- `setupResizeHandle()` function
- Tab-related event listeners

**Step 3: Verify all Lucide icons render**

Check that `lucide.createIcons()` is called after:
- Board render
- Inspector open
- Command center populate sidebar
- Command center add tile

**Step 4: Test keyboard shortcuts still work**

Verify in keyboard.js:
- `Escape` closes inspector (handled in inspector setup, not keyboard.js — verify no conflict)
- Card selection with j/k still works with new card structure
- Enter to edit still works

**Step 5: Run backend tests**

```bash
cd /mnt/data/projects/cardcode && python -m pytest tests/ -v
```

All 114 tests should pass (no backend changes made).

**Step 6: Commit**

```bash
git add -A
git commit -m "chore: remove dead CSS/JS, cleanup integration"
```

---

## Summary

| Task | Description | Files | Est. Complexity |
|------|------------|-------|----------------|
| 1 | Copper &amp; Slate color system | style.css | Low |
| 2 | Dense card tiles | cards.js, style.css | Medium |
| 3 | Full-height inspector overlay | index.html, style.css, dialogs.js | High |
| 4 | Command center grid | command-center.js (new), index.html, style.css, app.js | High |
| 5 | Bug fixes &amp; quality | dialogs.js, websocket.js, app.js, notifications.js | Medium |
| 6 | Cleanup &amp; integration | All frontend files | Low |

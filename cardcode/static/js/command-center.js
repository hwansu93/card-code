import { state, apiGet } from './app.js';
import { escapeHtml } from './utils.js';
import { showToast } from './notifications.js';

const basePath = document.querySelector('meta[name="base-path"]')?.content || '';
let tiles = []; // Array of { id, cardId, term, fitAddon, element, fetchController, refreshInterval, resizeObserver }
let tileIdCounter = 0;

export function setupCommandCenter() {
    const toggle = document.getElementById('view-toggle');
    const board = document.querySelector('.board');
    const cc = document.getElementById('command-center');
    const sidebarToggle = document.getElementById('cc-sidebar-toggle');

    if (!toggle || !board || !cc) return;

    toggle.addEventListener('click', () => {
        const isCC = !cc.classList.contains('hidden');
        if (isCC) {
            cc.classList.add('hidden');
            board.classList.remove('hidden');
            toggle.querySelector('i').setAttribute('data-lucide', 'layout-grid');
            toggle.title = 'Command Center';
            disposeAllTiles();
        } else {
            board.classList.add('hidden');
            cc.classList.remove('hidden');
            toggle.querySelector('i').setAttribute('data-lucide', 'kanban');
            toggle.title = 'Board View';
            populateSidebar();
            restoreLayout();
        }
        lucide.createIcons();
    });

    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', () => {
            document.getElementById('cc-sidebar').classList.toggle('collapsed');
        });
    }

    setupSidebarDrag();
}

function getTerminalTheme() {
    const style = getComputedStyle(document.documentElement);
    return {
        background: style.getPropertyValue('--terminal-bg').trim() || '#0f1014',
        foreground: style.getPropertyValue('--terminal-fg').trim() || '#e8e6e3',
        cursor: style.getPropertyValue('--terminal-cursor').trim() || '#4daa90',
        selectionBackground: style.getPropertyValue('--terminal-selection').trim() || 'rgba(77, 170, 144, 0.3)',
        black: '#1a1c24',
        red: '#ef4444',
        green: '#4ade80',
        yellow: '#fbbf24',
        blue: '#60a5fa',
        magenta: '#c084fc',
        cyan: '#22d3ee',
        white: '#e8e6e3',
        brightBlack: '#5c5955',
        brightRed: '#f87171',
        brightGreen: '#86efac',
        brightYellow: '#fde68a',
        brightBlue: '#93c5fd',
        brightMagenta: '#d8b4fe',
        brightCyan: '#67e8f9',
        brightWhite: '#f5f5f4',
    };
}

function populateSidebar() {
    const list = document.getElementById('cc-card-list');
    if (!list) return;

    const activeCards = state.cards.filter(c =>
        c.tmux_session && ['alive', 'waiting', 'idle'].includes(c.status)
    );

    if (activeCards.length === 0) {
        list.innerHTML = '<div class="cc-sidebar-empty">No active sessions</div>';
        return;
    }

    list.innerHTML = activeCards.map(card => `
        <div class="cc-sidebar-card" draggable="true" data-card-id="${card.id}">
            <span class="card-status-dot status-${card.status}"></span>
            <span class="cc-sidebar-card-title">${escapeHtml(card.title)}</span>
            <button class="cc-add-btn" data-card-id="${card.id}" aria-label="Add to grid">
                <i data-lucide="plus"></i>
            </button>
        </div>
    `).join('');

    list.querySelectorAll('.cc-add-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const cardId = btn.dataset.cardId;
            const card = state.cards.find(c => c.id === cardId);
            if (card) addTile(card);
        });
    });

    lucide.createIcons({ root: list });
}

function setupSidebarDrag() {
    const grid = document.getElementById('cc-grid');
    if (!grid) return;

    document.addEventListener('dragstart', (e) => {
        const sidebarCard = e.target.closest('.cc-sidebar-card');
        if (!sidebarCard) return;
        e.dataTransfer.setData('text/plain', sidebarCard.dataset.cardId);
        e.dataTransfer.effectAllowed = 'copy';
    });

    grid.addEventListener('dragover', (e) => {
        e.preventDefault();
        grid.classList.add('drag-over');
    });

    grid.addEventListener('dragleave', () => {
        grid.classList.remove('drag-over');
    });

    grid.addEventListener('drop', (e) => {
        e.preventDefault();
        grid.classList.remove('drag-over');
        const cardId = e.dataTransfer.getData('text/plain');
        if (!cardId) return;
        const card = state.cards.find(c => c.id === cardId);
        if (card) addTile(card);
    });
}

function addTile(card) {
    if (tiles.find(t => t.cardId === card.id)) return;

    if (tiles.length >= 8) {
        showToast({ title: 'Tile limit reached', message: 'Maximum 8 terminals in the grid', type: 'warning' });
        return;
    }

    const emptyState = document.getElementById('cc-empty');
    if (emptyState) emptyState.classList.add('hidden');

    const grid = document.getElementById('cc-grid');
    const tileEl = document.createElement('div');
    tileEl.className = 'cc-tile';

    const status = card.status || 'dead';
    const model = card.model || '';

    tileEl.innerHTML = `
        <div class="cc-tile-header">
            <span class="card-status-dot status-${status}" data-tile-status></span>
            <span class="cc-tile-title">${escapeHtml(card.title)}</span>
            ${model ? `<span class="cc-tile-model">${escapeHtml(model)}</span>` : ''}
            <div class="cc-tile-actions">
                <button class="cc-tile-maximize" aria-label="Maximize" title="Maximize">
                    <i data-lucide="maximize-2"></i>
                </button>
                <button class="cc-tile-close" aria-label="Close" title="Close tile">
                    <i data-lucide="x"></i>
                </button>
            </div>
        </div>
        <div class="cc-tile-terminal"></div>
    `;

    grid.appendChild(tileEl);

    const termContainer = tileEl.querySelector('.cc-tile-terminal');
    const term = new Terminal({
        cursorBlink: false,
        cursorStyle: 'bar',
        disableStdin: true,
        fontSize: 12,
        fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
        lineHeight: 1.4,
        scrollback: 2000,
        theme: getTerminalTheme(),
    });

    const fitAddon = new FitAddon.FitAddon();
    term.loadAddon(fitAddon);

    if (typeof WebLinksAddon !== 'undefined') {
        term.loadAddon(new WebLinksAddon.WebLinksAddon());
    }

    term.open(termContainer);
    requestAnimationFrame(() => {
        fitAddon.fit();
    });

    const tileData = {
        id: ++tileIdCounter,
        cardId: card.id,
        term,
        fitAddon,
        element: tileEl,
        fetchController: null,
        refreshInterval: null,
        resizeObserver: null,
    };

    tiles.push(tileData);

    loadTileOutput(tileData);

    tileData.refreshInterval = setInterval(() => {
        loadTileOutput(tileData);
    }, 3000);

    tileEl.querySelector('.cc-tile-close').addEventListener('click', () => {
        removeTile(tileData);
    });

    const maximizeBtn = tileEl.querySelector('.cc-tile-maximize');
    maximizeBtn.addEventListener('click', () => {
        tileEl.classList.toggle('maximized');
        requestAnimationFrame(() => fitAddon.fit());
    });

    tileEl.querySelector('.cc-tile-header').addEventListener('dblclick', () => {
        tileEl.classList.toggle('maximized');
        requestAnimationFrame(() => fitAddon.fit());
    });

    const resizeObserver = new ResizeObserver(() => {
        try { fitAddon.fit(); } catch { /* ignore */ }
    });
    resizeObserver.observe(termContainer);
    tileData.resizeObserver = resizeObserver;

    lucide.createIcons({ root: tileEl });
    saveLayout();
}

async function loadTileOutput(tileData) {
    if (tileData.fetchController) tileData.fetchController.abort();
    tileData.fetchController = new AbortController();

    try {
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
            if (data.output) {
                tileData.term.write('\r\n\r\n--- Session has ended ---');
            }
            if (tileData.refreshInterval) {
                clearInterval(tileData.refreshInterval);
                tileData.refreshInterval = null;
            }
            const dot = tileData.element.querySelector('[data-tile-status]');
            if (dot) {
                dot.className = 'card-status-dot status-dead';
            }
        }
    } catch (err) {
        if (err.name === 'AbortError') return;
        console.error('Failed to load tile output:', err);
    }
}

function removeTile(tileData) {
    if (tileData.refreshInterval) clearInterval(tileData.refreshInterval);
    if (tileData.fetchController) tileData.fetchController.abort();
    if (tileData.resizeObserver) tileData.resizeObserver.disconnect();
    if (tileData.term) tileData.term.dispose();
    if (tileData.element) tileData.element.remove();

    tiles = tiles.filter(t => t.id !== tileData.id);

    if (tiles.length === 0) {
        const emptyState = document.getElementById('cc-empty');
        if (emptyState) emptyState.classList.remove('hidden');
    }

    saveLayout();
}

function disposeAllTiles() {
    for (const tile of tiles) {
        if (tile.refreshInterval) clearInterval(tile.refreshInterval);
        if (tile.fetchController) tile.fetchController.abort();
        if (tile.resizeObserver) tile.resizeObserver.disconnect();
        if (tile.term) tile.term.dispose();
        if (tile.element) tile.element.remove();
    }
    tiles = [];
}

function saveLayout() {
    const layout = tiles.map(t => t.cardId);
    localStorage.setItem('cardcode-cc-layout', JSON.stringify(layout));
}

function restoreLayout() {
    try {
        const saved = JSON.parse(localStorage.getItem('cardcode-cc-layout') || '[]');
        for (const cardId of saved) {
            const card = state.cards.find(c => c.id === cardId);
            if (card && card.tmux_session) {
                addTile(card);
            }
        }
    } catch { /* ignore parse errors */ }

    if (tiles.length === 0) {
        const emptyState = document.getElementById('cc-empty');
        if (emptyState) emptyState.classList.remove('hidden');
    }
}

export default setupCommandCenter;

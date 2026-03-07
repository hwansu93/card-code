import { state, apiPost, apiPatch } from './app.js';
import { renderBoard, updateColumnCounts, updateEmptyState } from './board.js';
import { escapeHtml, showConfirmDialog } from './utils.js';
import { showToast } from './notifications.js';

export function setupDialogs() {
    setupCardDialog();
    setupSpawnDialog();
    setupArchiveDrawer();
    setupSettingsDrawer();
    setupTerminalViewer();
}

function setupCardDialog() {
    const dialog = document.getElementById('card-dialog');
    const form = document.getElementById('card-form');
    const cancelBtn = document.getElementById('card-dialog-cancel');
    const titleEl = document.getElementById('card-dialog-title');
    let editingCardId = null;

    // New card button
    document.getElementById('new-card-btn').addEventListener('click', () => {
        editingCardId = null;
        titleEl.textContent = 'New Card';
        form.reset();
        populateProjectSelect();
        dialog.showModal();
    });

    cancelBtn.addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (e) => {
        if (e.target === dialog) dialog.close();
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(form));
        // Clean empty strings to null
        Object.keys(data).forEach(k => { if (data[k] === '') delete data[k]; });

        try {
            if (editingCardId) {
                await apiPatch(`/cards/${editingCardId}`, data);
            } else {
                await apiPost('/cards', data);
            }
            dialog.close();
            // Refresh board
            const { apiGet } = await import('./app.js');
            state.cards = await apiGet('/cards');
            renderBoard(state.cards);
            updateColumnCounts();
            updateEmptyState();
        } catch (err) {
            console.error('Save failed:', err);
        }
    });

    // Expose for external use (edit existing card)
    window.__openCardDialog = (cardId) => {
        const card = state.cards.find(c => c.id === cardId);
        if (!card) return;
        editingCardId = cardId;
        titleEl.textContent = 'Edit Card';
        populateProjectSelect();
        form.elements.title.value = card.title || '';
        form.elements.description.value = card.description || '';
        form.elements.project.value = card.project || '';
        form.elements.initial_prompt.value = card.initial_prompt || '';
        form.elements.handoff_notes.value = card.handoff_notes || '';
        dialog.showModal();
    };
}

function populateProjectSelect() {
    const select = document.getElementById('card-project-select');
    // Keep first option (None), remove rest
    while (select.options.length > 1) select.remove(1);
    state.projects.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.name;
        opt.textContent = p.name;
        select.appendChild(opt);
    });
}

function setupSpawnDialog() {
    const dialog = document.getElementById('spawn-dialog');
    const cancelBtn = document.getElementById('spawn-cancel');
    const confirmBtn = document.getElementById('spawn-confirm');
    let spawnCardId = null;

    cancelBtn.addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (e) => {
        if (e.target === dialog) dialog.close();
    });

    confirmBtn.addEventListener('click', async () => {
        if (!spawnCardId) return;
        try {
            await apiPost(`/cards/${spawnCardId}/spawn`);
            dialog.close();
            const { apiGet } = await import('./app.js');
            state.cards = await apiGet('/cards');
            renderBoard(state.cards);
            updateColumnCounts();
            updateEmptyState();
        } catch (err) {
            console.error('Spawn failed:', err);
        }
    });

    window.__openSpawnDialog = (cardId) => {
        const card = state.cards.find(c => c.id === cardId);
        if (!card) return;
        spawnCardId = cardId;
        document.getElementById('spawn-card-title').textContent = card.title;
        document.getElementById('spawn-project-path').value = card.project_path || '';
        document.getElementById('spawn-prompt').value = card.initial_prompt || '';
        dialog.showModal();
    };
}

// ── Archive Drawer ──────────────────────────────────────────────

function setupArchiveDrawer() {
    const drawer = document.getElementById('archive-drawer');
    const overlay = document.getElementById('drawer-overlay');
    const archiveBtn = document.getElementById('archive-btn');
    const closeBtn = document.getElementById('archive-close');
    const searchInput = document.getElementById('archive-search');

    let archivedCards = [];

    archiveBtn.addEventListener('click', async () => {
        // Close settings if open
        document.getElementById('settings-drawer').classList.remove('open');

        await loadArchive();
        drawer.classList.add('open');
        overlay.classList.add('active');
        if (typeof lucide !== 'undefined') lucide.createIcons();
    });

    closeBtn.addEventListener('click', closeAllDrawers);
    overlay.addEventListener('click', closeAllDrawers);

    searchInput.addEventListener('input', () => {
        const query = searchInput.value.toLowerCase();
        renderArchiveList(archivedCards.filter(c =>
            c.title.toLowerCase().includes(query) ||
            (c.project || '').toLowerCase().includes(query) ||
            (c.description || '').toLowerCase().includes(query)
        ));
    });

    async function loadArchive() {
        const basePath = document.querySelector('meta[name="base-path"]')?.content || '';
        const resp = await fetch(`${basePath}/api/cards/archived`);
        archivedCards = await resp.json();
        renderArchiveList(archivedCards);
        updateArchiveCount(archivedCards.length);
    }

    function renderArchiveList(cards) {
        const list = document.getElementById('archive-list');
        if (cards.length === 0) {
            list.innerHTML = '<div class="drawer-empty">No archived cards</div>';
            return;
        }
        list.innerHTML = cards.map(card => `
            <div class="archive-card" data-card-id="${card.id}">
                <div class="archive-card-title">${escapeHtml(card.title)}</div>
                <div class="archive-card-meta">
                    ${card.project ? `<span>${escapeHtml(card.project)}</span>` : ''}
                    <span>$${(card.cost_usd || 0).toFixed(2)}</span>
                </div>
                <div class="archive-card-actions">
                    <button class="btn btn-small btn-ghost restore-btn" data-card-id="${card.id}">
                        <i data-lucide="undo-2"></i> Restore
                    </button>
                    <button class="btn btn-small btn-ghost delete-archive-btn" data-card-id="${card.id}">
                        <i data-lucide="trash-2"></i>
                    </button>
                </div>
            </div>
        `).join('');

        // Restore handlers
        list.querySelectorAll('.restore-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const cardId = btn.dataset.cardId;
                const basePath = document.querySelector('meta[name="base-path"]')?.content || '';
                await fetch(`${basePath}/api/cards/${cardId}/move`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ column_name: 'backlog', position: Date.now() }),
                });
                await loadArchive();
                // Refresh main board
                const { apiGet } = await import('./app.js');
                state.cards = await apiGet('/cards');
                renderBoard(state.cards);
                updateColumnCounts();
            });
        });

        // Delete handlers
        list.querySelectorAll('.delete-archive-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (!confirm('Permanently delete this card?')) return;
                const cardId = btn.dataset.cardId;
                const basePath = document.querySelector('meta[name="base-path"]')?.content || '';
                await fetch(`${basePath}/api/cards/${cardId}`, { method: 'DELETE' });
                await loadArchive();
            });
        });

        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    // Load archive count on init
    loadArchiveCount();

    async function loadArchiveCount() {
        const basePath = document.querySelector('meta[name="base-path"]')?.content || '';
        try {
            const resp = await fetch(`${basePath}/api/cards/archived`);
            const cards = await resp.json();
            updateArchiveCount(cards.length);
        } catch(e) {}
    }
}

function updateArchiveCount(count) {
    const badge = document.getElementById('archive-count');
    if (!badge) return;
    if (count > 0) {
        badge.textContent = count;
        badge.style.display = 'flex';
    } else {
        badge.style.display = 'none';
    }
}

// ── Settings Drawer ─────────────────────────────────────────────

function setupSettingsDrawer() {
    const drawer = document.getElementById('settings-drawer');
    const overlay = document.getElementById('drawer-overlay');
    const settingsBtn = document.getElementById('settings-btn');
    const closeBtn = document.getElementById('settings-close');
    const form = document.getElementById('settings-form');
    const basePath = document.querySelector('meta[name="base-path"]')?.content || '';

    settingsBtn.addEventListener('click', async () => {
        // Close archive if open
        document.getElementById('archive-drawer').classList.remove('open');

        await loadSettings();
        await loadIntegrations();
        drawer.classList.add('open');
        overlay.classList.add('active');
        if (typeof lucide !== 'undefined') lucide.createIcons();
    });

    closeBtn.addEventListener('click', closeAllDrawers);
    overlay.addEventListener('click', closeAllDrawers);

    async function loadSettings() {
        const resp = await fetch(`${basePath}/api/settings`);
        const settings = await resp.json();
        Object.entries(settings).forEach(([key, value]) => {
            const input = form.elements[key];
            if (input) input.value = value || '';
        });
    }

    async function loadIntegrations() {
        const resp = await fetch(`${basePath}/api/settings/integrations`);
        const integrations = await resp.json();
        const container = document.getElementById('integrations-status');
        container.innerHTML = Object.entries(integrations).map(([name, available]) => `
            <div class="integration-item">
                <span class="integration-status ${available ? 'ok' : 'missing'}"></span>
                <span class="integration-name">${name}</span>
                <span class="integration-label">${available ? 'Detected' : 'Not found'}</span>
            </div>
        `).join('');
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = Object.fromEntries(new FormData(form));

        const port = parseInt(formData.port);
        if (formData.port && (isNaN(port) || port < 1 || port > 65535)) {
            showToast({ title: 'Invalid port number', message: 'Must be between 1 and 65535', type: 'error' });
            return;
        }
        const poll = parseInt(formData.poll_interval);
        if (formData.poll_interval && (isNaN(poll) || poll < 500 || poll > 30000)) {
            showToast({ title: 'Invalid poll interval', message: 'Must be between 500 and 30000ms', type: 'error' });
            return;
        }

        const data = formData;
        if (data.port) data.port = parseInt(data.port, 10);

        await fetch(`${basePath}/api/settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });

        const msg = document.getElementById('settings-saved-msg');
        msg.style.display = 'inline';
        setTimeout(() => { msg.style.display = 'none'; }, 3000);
    });
}

// ── Terminal Panel (persistent right panel) ─────────────────────

let term = null;
let fitAddon = null;
let searchAddon = null;

function getTerminalTheme() {
    const style = getComputedStyle(document.documentElement);
    return {
        background: style.getPropertyValue('--terminal-bg').trim() || '#0f1014',
        foreground: style.getPropertyValue('--terminal-fg').trim() || '#e8e6e3',
        cursor: style.getPropertyValue('--terminal-cursor').trim() || '#e5853d',
        selectionBackground: style.getPropertyValue('--terminal-selection').trim() || 'rgba(229, 133, 61, 0.3)',
        // Standard ANSI colors (these stay constant across themes)
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

function initXterm() {
    const container = document.getElementById('terminal-xterm-container');
    if (!container || term) return;

    term = new Terminal({
        cursorBlink: false,
        cursorStyle: 'bar',
        disableStdin: true,
        fontSize: 13,
        fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
        lineHeight: 1.4,
        scrollback: 5000,
        theme: getTerminalTheme(),
    });

    fitAddon = new FitAddon.FitAddon();
    searchAddon = new SearchAddon.SearchAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon.WebLinksAddon());
    term.loadAddon(searchAddon);

    term.open(container);
    fitAddon.fit();
}

function setupTerminalViewer() {
    const panel = document.getElementById('terminal-panel');
    const emptyState = document.getElementById('terminal-panel-empty');
    const refreshBtn = document.getElementById('terminal-refresh');
    const autoRefreshCheck = document.getElementById('terminal-auto-refresh');
    const titleEl = document.getElementById('terminal-card-title');
    const sessionNameEl = document.getElementById('terminal-session-name');
    const basePath = document.querySelector('meta[name="base-path"]')?.content || '';

    let currentCardId = null;
    let autoRefreshInterval = null;

    refreshBtn.addEventListener('click', () => {
        if (currentCardId) loadTerminalOutput(currentCardId);
    });

    autoRefreshCheck.addEventListener('change', () => {
        if (autoRefreshCheck.checked && currentCardId) {
            startAutoRefresh();
        } else {
            stopAutoRefresh();
        }
    });

    function stopAutoRefresh() {
        if (autoRefreshInterval) {
            clearInterval(autoRefreshInterval);
            autoRefreshInterval = null;
        }
    }

    function startAutoRefresh() {
        stopAutoRefresh();
        autoRefreshInterval = setInterval(() => {
            if (currentCardId) loadTerminalOutput(currentCardId);
        }, 3000);
    }

    function hideEmptyState() {
        emptyState.classList.add('hidden');
    }

    async function loadTerminalOutput(cardId) {
        try {
            const resp = await fetch(`${basePath}/api/cards/${cardId}/terminal`);
            const data = await resp.json();

            if (!term) initXterm();

            term.clear();
            if (data.output) {
                term.write(data.output.replace(/\n/g, '\r\n'));
            } else {
                term.write('(no output)');
            }
            sessionNameEl.textContent = data.session || '';

            if (!data.alive) {
                term.write('\r\n\r\n--- Session ended ---');
                stopAutoRefresh();
            }
        } catch (err) {
            if (term) {
                term.clear();
                term.write('Failed to load terminal output');
            }
            showToast({ title: 'Terminal load failed', type: 'error' });
        }
    }

    // Terminal input handler
    const terminalInput = document.getElementById('terminal-input');
    const terminalInputArea = document.getElementById('terminal-input-area');

    terminalInput.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter' && terminalInput.value.trim()) {
            e.preventDefault();
            const text = terminalInput.value.trim();
            terminalInput.value = '';
            terminalInput.disabled = true;
            try {
                await fetch(`${basePath}/api/cards/${currentCardId}/prompt`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text }),
                });
                setTimeout(() => {
                    if (currentCardId) loadTerminalOutput(currentCardId);
                }, 500);
            } catch (err) {
                console.error('Prompt send failed:', err);
            } finally {
                terminalInput.disabled = false;
                terminalInput.focus();
            }
        }
    });

    // Resize handle for terminal panel
    setupResizeHandle();

    // Ctrl+F search in terminal
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'f' && term && panel.offsetWidth > 0) {
            e.preventDefault();
            const query = prompt('Search terminal:');
            if (query && searchAddon) {
                searchAddon.findNext(query);
            }
        }
    });

    // Refit terminal on window resize
    window.addEventListener('resize', () => {
        if (fitAddon && term) fitAddon.fit();
    });

    // Update terminal theme when data-theme attribute changes
    const themeObserver = new MutationObserver(() => {
        if (term) term.options.theme = getTerminalTheme();
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    // Expose globally for card click handler
    window.__openTerminalViewer = async (cardId, cardTitle) => {
        // Deselect previous card
        if (currentCardId) {
            const prev = document.querySelector(`[data-card-id="${currentCardId}"]`);
            if (prev) prev.classList.remove('selected');
        }

        currentCardId = cardId;
        state.selectedCardId = cardId;
        titleEl.textContent = cardTitle || 'Session';

        // Highlight selected card
        const cardEl = document.querySelector(`[data-card-id="${cardId}"]`);
        if (cardEl) cardEl.classList.add('selected');

        // Mobile bottom sheet
        if (window.innerWidth < 768) {
            panel.classList.add('mobile-open');
        }

        hideEmptyState();
        await loadTerminalOutput(cardId);

        // Refit after panel becomes visible
        if (fitAddon && term) {
            requestAnimationFrame(() => fitAddon.fit());
        }

        // Show/hide input based on whether it's an external session
        const card = (await import('./app.js')).state.cards.find(c => c.id === cardId);
        if (card && card.is_external) {
            terminalInputArea.classList.add('hidden');
        } else {
            terminalInputArea.classList.remove('hidden');
        }

        if (autoRefreshCheck.checked) startAutoRefresh();
        if (typeof lucide !== 'undefined') lucide.createIcons();
    };
}

function setupResizeHandle() {
    const handle = document.getElementById('terminal-resize-handle');
    const panel = document.getElementById('terminal-panel');
    if (!handle || !panel) return;

    let startX, startWidth;

    handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        startX = e.clientX;
        startWidth = panel.offsetWidth;
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    });

    function onMouseMove(e) {
        const delta = startX - e.clientX;
        const newWidth = Math.max(280, Math.min(800, startWidth + delta));
        panel.style.width = newWidth + 'px';
        if (fitAddon) fitAddon.fit();
    }

    function onMouseUp() {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    }
}

// ── Shared Drawer Helpers ───────────────────────────────────────

function closeAllDrawers() {
    document.getElementById('archive-drawer').classList.remove('open');
    document.getElementById('settings-drawer').classList.remove('open');
    document.getElementById('drawer-overlay').classList.remove('active');
}

// Export for keyboard.js
export { closeAllDrawers };

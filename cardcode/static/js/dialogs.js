import { state, apiPost, apiPatch, CardCode } from './app.js';
import { renderBoard, updateColumnCounts, updateEmptyState } from './board.js';
import { escapeHtml, showConfirmDialog } from './utils.js';
import { showToast } from './notifications.js';

export function setupDialogs() {
    setupCardDialog();
    setupSpawnDialog();
    setupArchiveDrawer();
    setupSettingsDrawer();
    setupInspector();
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
    CardCode.openCardDialog = (cardId) => {
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

    CardCode.openSpawnDialog = (cardId) => {
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
            list.innerHTML = '<div class="drawer-empty">No archived cards. Archived cards will appear here.</div>';
            return;
        }
        list.innerHTML = cards.map(card => {
            const safeId = escapeHtml(String(card.id));
            return `
            <div class="archive-card" data-card-id="${safeId}">
                <div class="archive-card-title">${escapeHtml(card.title)}</div>
                <div class="archive-card-meta">
                    ${card.project ? `<span>${escapeHtml(card.project)}</span>` : ''}
                    <span>$${(card.cost_usd || 0).toFixed(2)}</span>
                </div>
                <div class="archive-card-actions">
                    <button class="btn btn-small btn-ghost restore-btn" data-card-id="${safeId}">
                        <i data-lucide="undo-2"></i> Restore
                    </button>
                    <button class="btn btn-small btn-ghost delete-archive-btn" data-card-id="${safeId}">
                        <i data-lucide="trash-2"></i>
                    </button>
                </div>
            </div>
        `; }).join('');

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
                const confirmed = await showConfirmDialog({
                    title: 'Permanently delete this card?',
                    message: 'The card and all its data will be removed. This cannot be undone.',
                    confirmText: 'Delete Permanently',
                    danger: true,
                });
                if (!confirmed) return;
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
            showToast({ title: 'Invalid port number', message: 'Port must be between 1 and 65535', type: 'error' });
            return;
        }
        const poll = parseInt(formData.poll_interval);
        if (formData.poll_interval && (isNaN(poll) || poll < 500 || poll > 30000)) {
            showToast({ title: 'Invalid poll interval', message: 'Poll interval must be between 500ms and 30000ms', type: 'error' });
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

    // Test Tmux Connection
    document.getElementById('test-tmux-connection')?.addEventListener('click', async () => {
        const btn = document.getElementById('test-tmux-connection');
        btn.disabled = true;
        try {
            const resp = await fetch(`${basePath}/api/settings/integrations`);
            const data = await resp.json();
            if (data.tmux) {
                showToast({ title: 'Tmux connection verified', type: 'success' });
            } else {
                showToast({ title: 'Tmux not detected', message: 'Check that tmux is installed and running', type: 'error' });
            }
        } catch {
            showToast({ title: 'Could not reach server', message: 'Verify the server is running and try again', type: 'error' });
        } finally {
            btn.disabled = false;
        }
    });

    // Test Claude Dir
    document.getElementById('test-claude-dir')?.addEventListener('click', async () => {
        const btn = document.getElementById('test-claude-dir');
        btn.disabled = true;
        try {
            const resp = await fetch(`${basePath}/api/settings/integrations`);
            const data = await resp.json();
            if (data.claude) {
                showToast({ title: 'Claude CLI found', type: 'success' });
            } else {
                showToast({ title: 'Claude CLI not found', message: 'Ensure claude is installed and available in your PATH', type: 'error' });
            }
        } catch {
            showToast({ title: 'Could not reach server', message: 'Verify the server is running and try again', type: 'error' });
        } finally {
            btn.disabled = false;
        }
    });

    // Health Check
    document.getElementById('health-check-btn')?.addEventListener('click', async () => {
        const btn = document.getElementById('health-check-btn');
        const healthEl = document.getElementById('settings-health');
        btn.disabled = true;
        try {
            const resp = await fetch(`${basePath}/health`);
            const data = await resp.json();
            healthEl.textContent = data.status === 'ok' ? 'Healthy' : 'Unhealthy';
            healthEl.style.color = data.status === 'ok' ? 'var(--success)' : 'var(--danger)';
        } catch {
            healthEl.textContent = 'Unreachable';
            healthEl.style.color = 'var(--danger)';
        } finally {
            btn.disabled = false;
        }
    });
}

// ── Inspector Panel (full-height overlay) ──────────────────────

let term = null;
let fitAddon = null;
let searchAddon = null;
let fetchController = null;
let autoRefreshInterval = null;
let currentInspectorCardId = null;
let closeTimeout = null;

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

function initXterm() {
    if (term) return;
    const container = document.getElementById('terminal-xterm-container');
    if (!container) return;
    container.innerHTML = '';

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

function disposeXterm() {
    if (term) {
        term.dispose();
        term = null;
        fitAddon = null;
        searchAddon = null;
    }
}

function setupInspector() {
    const panel = document.getElementById('inspector-panel');
    const scrim = document.getElementById('inspector-scrim');
    const closeBtn = document.getElementById('inspector-close');
    const refreshBtn = document.getElementById('inspector-refresh');
    const autoRefreshCheckbox = document.getElementById('inspector-auto-refresh');
    const promptInput = document.getElementById('terminal-prompt-input');
    const promptSend = document.getElementById('terminal-prompt-send');
    const basePath = document.querySelector('meta[name="base-path"]')?.content || '';

    // Restore auto-refresh preference
    const savedAutoRefresh = localStorage.getItem('cardcode-auto-refresh');
    if (savedAutoRefresh !== null) {
        autoRefreshCheckbox.checked = savedAutoRefresh === 'true';
    }

    closeBtn.addEventListener('click', () => closeInspector());
    scrim.addEventListener('click', () => closeInspector());

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

    promptInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && promptInput.value.trim()) {
            e.preventDefault();
            sendPrompt(promptInput.value.trim());
        }
    });

    promptSend.addEventListener('click', () => {
        if (promptInput.value.trim()) {
            sendPrompt(promptInput.value.trim());
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && panel.classList.contains('open')) {
            closeInspector();
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

    // --- Inner functions ---

    async function loadTerminalOutput(cardId) {
        if (fetchController) fetchController.abort();
        fetchController = new AbortController();

        const terminalArea = document.getElementById('inspector-terminal');
        const inputBar = document.getElementById('inspector-input');

        try {
            const resp = await fetch(`${basePath}/api/cards/${cardId}/terminal`, { signal: fetchController.signal });
            const data = await resp.json();

            terminalArea.classList.remove('loading', 'empty');

            if (!term) initXterm();
            term.reset();
            if (fitAddon) fitAddon.fit();

            if (data.output) {
                term.write(data.output.replace(/\r?\n/g, '\r\n'));
            } else {
                terminalArea.classList.add('empty');
            }

            if (!data.alive) {
                if (data.output) {
                    term.write('\r\n\r\n--- Session has ended ---');
                }
                stopAutoRefresh();
                inputBar.classList.add('hidden');
            }
        } catch (err) {
            if (err.name === 'AbortError') return;
            console.error('Failed to load terminal output:', err);
            terminalArea.classList.remove('loading');
            terminalArea.classList.add('empty');
        }
    }

    async function sendPrompt(text) {
        promptInput.disabled = true;
        promptSend.disabled = true;
        try {
            await fetch(`${basePath}/api/cards/${currentInspectorCardId}/prompt`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text }),
            });
            promptInput.value = '';
            setTimeout(() => {
                if (currentInspectorCardId) loadTerminalOutput(currentInspectorCardId);
            }, 500);
        } catch (err) {
            console.error('Prompt send failed:', err);
            showToast({ title: 'Failed to send prompt', type: 'error' });
        } finally {
            promptInput.disabled = false;
            promptSend.disabled = false;
            promptInput.focus();
        }
    }

    function startAutoRefresh(cardId) {
        stopAutoRefresh();
        autoRefreshInterval = setInterval(() => {
            if (currentInspectorCardId === cardId) {
                loadTerminalOutput(cardId);
            }
        }, 3000);
    }

    function stopAutoRefresh() {
        if (autoRefreshInterval) {
            clearInterval(autoRefreshInterval);
            autoRefreshInterval = null;
        }
    }

    function closeInspector() {
        panel.classList.remove('open');
        scrim.classList.remove('visible');
        stopAutoRefresh();
        if (fetchController) fetchController.abort();

        // Deselect card on board
        if (currentInspectorCardId) {
            const prev = document.querySelector(`[data-card-id="${currentInspectorCardId}"]`);
            if (prev) prev.classList.remove('selected');
        }
        currentInspectorCardId = null;

        closeTimeout = setTimeout(() => {
            disposeXterm();
            panel.classList.add('collapsed');
            closeTimeout = null;
        }, 280);
    }

    // Expose globally for card click handler
    CardCode.openTerminalViewer = (cardId, cardTitle) => {
        openInspector(cardId, cardTitle, { loadTerminalOutput, startAutoRefresh, stopAutoRefresh });
    };

    function openInspector(cardId, cardTitle, helpers) {
        // Cancel any pending close timeout to prevent race condition
        if (closeTimeout) {
            clearTimeout(closeTimeout);
            closeTimeout = null;
        }

        // Dispose xterm if close didn't finish its cleanup
        if (term) {
            term.dispose();
            term = null;
            fitAddon = null;
            searchAddon = null;
        }

        // Deselect previous card
        if (currentInspectorCardId) {
            const prev = document.querySelector(`[data-card-id="${currentInspectorCardId}"]`);
            if (prev) prev.classList.remove('selected');
        }

        currentInspectorCardId = cardId;
        state.selectedCardId = cardId;

        // Update header
        const titleEl = document.getElementById('inspector-title');
        titleEl.textContent = cardTitle || 'Session';

        // Find card data
        const card = state.cards.find(c => c.id === cardId);

        // Build meta HTML
        const metaEl = document.getElementById('inspector-meta');
        if (metaEl && card) {
            const parts = [];
            if (card.model) {
                parts.push(`<span class="model-chip">${escapeHtml(card.model)}</span>`);
            }
            if (card.session_status) {
                if (parts.length) parts.push('<span class="meta-sep">&middot;</span>');
                parts.push(`<span>${escapeHtml(card.session_status)}</span>`);
            }
            if (card.cost_usd > 0) {
                if (parts.length) parts.push('<span class="meta-sep">&middot;</span>');
                parts.push(`<span>$${card.cost_usd.toFixed(2)}</span>`);
            }
            metaEl.innerHTML = parts.join(' ');
        }

        // Highlight selected card on board
        const cardEl = document.querySelector(`[data-card-id="${cardId}"]`);
        if (cardEl) cardEl.classList.add('selected');

        // Show panel and scrim
        panel.classList.remove('collapsed');
        panel.classList.add('open');
        scrim.classList.add('visible');

        const terminalArea = document.getElementById('inspector-terminal');
        const inputBar = document.getElementById('inspector-input');
        const hasSession = card && (card.tmux_session || card.session_status === 'alive' || card.session_status === 'waiting');

        if (hasSession) {
            inputBar.classList.remove('hidden');
            terminalArea.classList.remove('empty');
            terminalArea.classList.add('loading');

            setTimeout(() => {
                initXterm();
                helpers.loadTerminalOutput(cardId);
            }, 280);

            if (autoRefreshCheckbox.checked) {
                helpers.startAutoRefresh(cardId);
            }
        } else if (card && card.last_output) {
            inputBar.classList.add('hidden');
            terminalArea.classList.remove('loading', 'empty');
            setTimeout(() => {
                initXterm();
                if (term) {
                    term.write(card.last_output.replace(/\r?\n/g, '\r\n'));
                    term.write('\r\n\r\n--- Session has ended ---');
                }
            }, 280);
        } else {
            inputBar.classList.add('hidden');
            terminalArea.classList.remove('loading');
            terminalArea.classList.add('empty');
        }

        if (typeof lucide !== 'undefined') lucide.createIcons();
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

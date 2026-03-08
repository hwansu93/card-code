import { state, apiPost, apiPatch, CardCode } from './app.js';
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

// ── Inspector Panel (persistent right panel with tabs) ──────────

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

function switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.inspector-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    // Update tab content
    document.querySelectorAll('.inspector-tab-content').forEach(pane => {
        pane.classList.toggle('active', pane.id === `tab-${tabName}`);
    });
    // Show/hide terminal input area based on tab
    const inputArea = document.getElementById('terminal-input-area');
    if (inputArea && !inputArea.classList.contains('hidden')) {
        inputArea.style.display = tabName === 'terminal' ? '' : 'none';
    }
    // Refit terminal when switching to terminal tab
    if (tabName === 'terminal' && fitAddon && term) {
        requestAnimationFrame(() => fitAddon.fit());
    }
}

function populateDetailTab(card) {
    const detailContent = document.getElementById('detail-content');
    if (!detailContent || !card) return;

    let html = '';

    // Metrics grid
    const costUsd = (card.cost_usd || 0).toFixed(2);
    const ctxPct = Math.min((card.context_pct || 0) * 100, 100).toFixed(0);
    const inputTokens = card.input_tokens || 0;
    const outputTokens = card.output_tokens || 0;

    html += '<div class="detail-metrics">';
    html += `<div class="metric-item"><div class="metric-value">$${escapeHtml(costUsd)}</div><div class="metric-label">Cost</div></div>`;
    html += `<div class="metric-item"><div class="metric-value">${escapeHtml(ctxPct)}%</div><div class="metric-label">Context</div></div>`;
    html += `<div class="metric-item"><div class="metric-value">${formatTokens(inputTokens)}</div><div class="metric-label">Input Tokens</div></div>`;
    html += `<div class="metric-item"><div class="metric-value">${formatTokens(outputTokens)}</div><div class="metric-label">Output Tokens</div></div>`;
    html += '</div>';

    // Description
    if (card.description) {
        html += '<div class="detail-section"><h4>Description</h4>';
        html += `<p>${escapeHtml(card.description)}</p></div>`;
    }

    // Initial Prompt
    if (card.initial_prompt) {
        html += '<div class="detail-section"><h4>Initial Prompt</h4>';
        html += `<p>${escapeHtml(card.initial_prompt)}</p></div>`;
    }

    // Handoff Notes
    if (card.handoff_notes) {
        html += '<div class="detail-section"><h4>Handoff Notes</h4>';
        html += `<p>${escapeHtml(card.handoff_notes)}</p></div>`;
    }

    // Metadata
    const metaParts = [];
    if (card.project_path || card.project) metaParts.push(`<strong>Project:</strong> ${escapeHtml(card.project_path || card.project)}`);
    if (card.session_status) metaParts.push(`<strong>Status:</strong> ${escapeHtml(card.session_status)}`);
    if (card.column_name) metaParts.push(`<strong>Column:</strong> ${escapeHtml(card.column_name)}`);
    if (card.created_at) metaParts.push(`<strong>Created:</strong> ${new Date(card.created_at).toLocaleString()}`);

    if (metaParts.length > 0) {
        html += '<div class="detail-section"><h4>Info</h4>';
        html += metaParts.map(p => `<p>${p}</p>`).join('');
        html += '</div>';
    }

    if (!html) {
        html = '<p>No details available for this card.</p>';
    }

    detailContent.innerHTML = html;
}

function formatTokens(count) {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
    return String(count);
}

function setupTerminalViewer() {
    const panel = document.getElementById('inspector-panel');
    const emptyState = document.getElementById('inspector-empty');
    const refreshBtn = document.getElementById('terminal-refresh');
    const autoRefreshCheck = document.getElementById('terminal-auto-refresh');
    const titleEl = document.getElementById('inspector-card-title');
    const basePath = document.querySelector('meta[name="base-path"]')?.content || '';

    let currentCardId = null;
    let autoRefreshInterval = null;
    let fetchController = null;

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

    // Tab switching
    document.querySelectorAll('.inspector-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            switchTab(btn.dataset.tab);
        });
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
        if (fetchController) fetchController.abort();
        fetchController = new AbortController();
        try {
            const resp = await fetch(`${basePath}/api/cards/${cardId}/terminal`, { signal: fetchController.signal });
            const data = await resp.json();

            if (!term) initXterm();

            term.reset();
            if (fitAddon) fitAddon.fit();
            if (data.output) {
                term.write(data.output.replace(/\n/g, '\r\n'));
            } else {
                term.write('No output yet. The session may still be starting.');
            }

            if (!data.alive) {
                term.write('\r\n\r\n--- Session has ended ---');
                stopAutoRefresh();
            }
        } catch (err) {
            if (err.name === 'AbortError') return;
            if (term) {
                term.reset();
                if (fitAddon) fitAddon.fit();
                term.write('Could not load terminal output. The session may no longer exist.');
            }
            showToast({ title: 'Could not load terminal output', message: 'The session may have ended or the server is unreachable', type: 'error' });
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

    // Resize handle
    setupResizeHandle();

    // Close button
    document.getElementById('inspector-close')?.addEventListener('click', () => {
        panel.classList.add('collapsed');
    });

    // Ctrl+F search in terminal
    let searchVisible = false;
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'terminal-search-input';
    searchInput.placeholder = 'Search terminal output...';
    searchInput.style.display = 'none';
    document.querySelector('.inspector-header-actions')?.appendChild(searchInput);

    searchInput.addEventListener('input', () => {
        if (searchAddon && searchInput.value) searchAddon.findNext(searchInput.value);
    });
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') searchAddon?.findNext(searchInput.value);
        if (e.key === 'Escape') {
            searchInput.style.display = 'none';
            searchVisible = false;
        }
    });

    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'f' && term && panel.offsetWidth > 0) {
            e.preventDefault();
            searchVisible = !searchVisible;
            searchInput.style.display = searchVisible ? 'block' : 'none';
            if (searchVisible) searchInput.focus();
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
    const cardMetaEl = document.getElementById('inspector-card-meta');
    const terminalOutput = document.getElementById('terminal-output');

    CardCode.openTerminalViewer = async (cardId, cardTitle) => {
        // Deselect previous card
        if (currentCardId) {
            const prev = document.querySelector(`[data-card-id="${currentCardId}"]`);
            if (prev) prev.classList.remove('selected');
        }

        currentCardId = cardId;
        state.selectedCardId = cardId;
        titleEl.textContent = cardTitle || 'Session';

        // Show the inspector panel
        panel.classList.remove('collapsed');

        // Highlight selected card
        const cardEl = document.querySelector(`[data-card-id="${cardId}"]`);
        if (cardEl) cardEl.classList.add('selected');

        // Mobile bottom sheet
        if (window.innerWidth < 768) {
            panel.classList.add('mobile-open');
        }

        hideEmptyState();

        // Get card data for metadata
        const card = state.cards.find(c => c.id === cardId);
        const hasSession = card && (card.tmux_session || card.is_external);

        // Populate metadata line
        if (cardMetaEl && card) {
            const parts = [];
            if (card.project_path || card.project) parts.push(card.project_path || card.project);
            if (card.session_status) parts.push(card.session_status);
            if (card.column_name) parts.push(card.column_name);
            const ctxPct = Math.min((card.context_pct || 0) * 100, 100);
            if (ctxPct > 0) parts.push(`${ctxPct.toFixed(0)}% ctx`);
            if (card.cost_usd > 0) parts.push(`$${card.cost_usd.toFixed(2)}`);
            const totalTokens = (card.input_tokens || 0) + (card.output_tokens || 0);
            if (totalTokens > 0) {
                const tokenLabel = totalTokens >= 1000
                    ? `${(totalTokens / 1000).toFixed(1)}k tokens`
                    : `${totalTokens} tokens`;
                parts.push(tokenLabel);
            }
            cardMetaEl.textContent = parts.join(' \u00b7 ');
        }

        // Populate the detail tab
        if (card) populateDetailTab(card);

        if (hasSession) {
            // Auto-switch to terminal tab for cards with sessions
            switchTab('terminal');
            terminalOutput.querySelectorAll('.terminal-no-session').forEach(el => el.remove());
            await loadTerminalOutput(cardId);
            if (card && card.is_external) {
                terminalInputArea.classList.add('hidden');
            } else {
                terminalInputArea.classList.remove('hidden');
            }
            terminalInputArea.style.display = '';
            if (autoRefreshCheck.checked) startAutoRefresh();
        } else {
            // No session — auto-switch to detail tab
            switchTab('detail');
            stopAutoRefresh();
            terminalInputArea.classList.add('hidden');
            terminalOutput.querySelectorAll('.terminal-no-session').forEach(el => el.remove());
            if (term) { term.reset(); if (fitAddon) fitAddon.fit(); }
            const infoDiv = document.createElement('div');
            infoDiv.className = 'terminal-no-session';
            if (!card?.description && !card?.initial_prompt) {
                infoDiv.innerHTML = '<p>No active session. Click "Spawn session" from the card menu to start one.</p>';
            }
            terminalOutput.appendChild(infoDiv);
        }

        // Refit after panel becomes visible
        if (fitAddon && term) {
            requestAnimationFrame(() => fitAddon.fit());
        }

        if (typeof lucide !== 'undefined') lucide.createIcons();
    };
}

function setupResizeHandle() {
    const handle = document.getElementById('inspector-resize-handle');
    const panel = document.getElementById('inspector-panel');
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
        const newWidth = Math.max(400, Math.min(900, startWidth + delta));
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

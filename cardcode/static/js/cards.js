import { state, apiPatch, CardCode } from './app.js';
import { renderBoard, updateColumnCounts, updateEmptyState } from './board.js';
import { escapeHtml, showConfirmDialog } from './utils.js';
import { showToast } from './notifications.js';

export function createCardElement(card) {
    const el = document.createElement('div');
    el.className = 'card';
    el.dataset.cardId = card.id;
    el.dataset.position = card.position;
    el.setAttribute('role', 'article');
    el.setAttribute('aria-label', card.title);
    if (card.id === state.selectedCardId) el.classList.add('selected');
    const status = card.session_status || 'dead';
    el.classList.add(`card-status-${status}`);
    if (card.column_name === 'done' || card.column_name === 'archive') el.classList.add('card-done');

    // Provider icon SVGs
    const providerIcons = {
        'claude-code': '<svg class="provider-icon" width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 10L6 2l4 8H2z" fill="currentColor" opacity="0.9"/></svg>',
        'gemini': '<svg class="provider-icon" width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="currentColor" stroke-width="1.5" fill="none"/><circle cx="6" cy="6" r="2" fill="currentColor"/></svg>',
    };
    const providerNames = { 'claude-code': 'Claude', 'gemini': 'Gemini' };
    const providerKey = card.provider || '';
    const providerIcon = providerIcons[providerKey] || '<svg class="provider-icon" width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="4" fill="currentColor" opacity="0.5"/></svg>';
    const modelName = providerNames[providerKey] || (providerKey ? escapeHtml(providerKey) : '');

    // Duration
    const duration = card.started_at ? formatDuration(card.started_at) : '';

    // Context percentage
    const pct = Math.min((card.context_pct || 0) * 100, 100);
    const fillClass = pct >= 80 ? 'critical' : pct >= 60 ? 'warning' : '';

    // Cost
    const costStr = card.cost_usd > 0 ? `$${card.cost_usd.toFixed(2)}` : '';

    let html = '';

    // Title
    html += `<div class="card-title">${escapeHtml(card.title)}</div>`;

    // Meta row: model chip + duration
    if (modelName || duration) {
        html += '<div class="card-meta-row">';
        if (modelName) {
            html += `<span class="model-chip">${providerIcon}<span class="model-name">${modelName}</span></span>`;
        }
        if (duration) {
            html += `<span class="card-duration">${duration}</span>`;
        }
        html += '</div>';
    }

    // Bottom bar: cost + status dot
    html += '<div class="card-bottom">';
    html += `<span class="card-cost">${costStr}</span>`;
    html += `<span class="card-status-dot status-${status}"></span>`;
    html += '</div>';

    // Context gauge
    html += `<div class="context-gauge"><div class="context-fill ${fillClass}" style="width:${pct}%"></div></div>`;

    el.innerHTML = html;

    // Card click handler — open inspector panel for all cards
    el.addEventListener('click', (e) => {
        if (e.defaultPrevented) return;
        CardCode.openTerminalViewer?.(card.id, card.title);
    });

    // Right-click context menu
    el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showCardContextMenu(e, card);
    });

    // Overflow button for discoverability (visible on hover)
    const overflowBtn = document.createElement('button');
    overflowBtn.className = 'card-overflow-btn';
    overflowBtn.setAttribute('aria-label', `Actions for ${card.title}`);
    overflowBtn.innerHTML = '<i data-lucide="more-horizontal"></i>';
    overflowBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showCardContextMenu(e, card);
    });
    el.appendChild(overflowBtn);

    return el;
}

function showCardContextMenu(e, card) {
    // Remove any existing context menu
    dismissContextMenu();

    const menu = document.createElement('div');
    menu.className = 'card-context-menu';
    menu.setAttribute('role', 'menu');
    menu.style.left = `${e.clientX}px`;
    menu.style.top = `${e.clientY}px`;

    const hasTerminal = card.tmux_session || card.is_external;
    const hasSession = !!card.tmux_session;

    const items = [
        { label: 'Edit card', icon: 'pencil', action: 'edit' },
        ...(!hasSession ? [{ label: 'Spawn session', icon: 'play', action: 'spawn' }] : []),
        ...(hasTerminal ? [{ label: 'View terminal output', icon: 'terminal', action: 'open-terminal' }] : []),
        { label: 'Archive card', icon: 'archive', action: 'archive' },
    ];

    // Static items
    items.forEach(item => {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'card-context-menu-item';
        el.setAttribute('role', 'menuitem');
        el.innerHTML = `<i data-lucide="${item.icon}"></i> ${escapeHtml(item.label)}`;
        el.addEventListener('click', (ev) => {
            ev.stopPropagation();
            dismissContextMenu();
            handleQuickAction(item.action, card);
        });
        menu.appendChild(el);
    });

    // "Move to..." submenu
    const colNames = (state.columns || []).map(c => c.name);
    if (colNames.length > 1) {
        const separator = document.createElement('div');
        separator.className = 'card-context-menu-separator';
        menu.appendChild(separator);

        colNames.forEach(colName => {
            if (colName === card.column_name) return;
            const el = document.createElement('button');
            el.type = 'button';
            el.className = 'card-context-menu-item card-context-menu-move';
            el.setAttribute('role', 'menuitem');
            const displayName = colName.charAt(0).toUpperCase() + colName.slice(1);
            el.innerHTML = `<i data-lucide="arrow-right"></i> ${escapeHtml(displayName)}`;
            el.addEventListener('click', (ev) => {
                ev.stopPropagation();
                dismissContextMenu();
                handleQuickAction('move-to', card, colName);
            });
            menu.appendChild(el);
        });
    }

    document.body.appendChild(menu);

    // Render lucide icons in the menu
    if (typeof lucide !== 'undefined') lucide.createIcons({ root: menu });

    // Reposition if overflowing viewport
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
        menu.style.left = `${window.innerWidth - rect.width - 4}px`;
    }
    if (rect.bottom > window.innerHeight) {
        menu.style.top = `${window.innerHeight - rect.height - 4}px`;
    }

    // Arrow key navigation and Escape
    menu.addEventListener('keydown', (ev) => {
        const menuItems = [...menu.querySelectorAll('[role="menuitem"]')];
        const idx = menuItems.indexOf(document.activeElement);
        if (ev.key === 'ArrowDown') {
            ev.preventDefault();
            menuItems[(idx + 1) % menuItems.length]?.focus();
        } else if (ev.key === 'ArrowUp') {
            ev.preventDefault();
            menuItems[(idx - 1 + menuItems.length) % menuItems.length]?.focus();
        } else if (ev.key === 'Escape') {
            ev.preventDefault();
            dismissContextMenu();
        }
    });

    // Auto-focus first item
    const firstItem = menu.querySelector('[role="menuitem"]');
    if (firstItem) firstItem.focus();

    // Dismiss on click outside
    setTimeout(() => {
        document.addEventListener('click', dismissContextMenu, { once: true });
    }, 0);
}

function dismissContextMenu() {
    const existing = document.querySelector('.card-context-menu');
    if (existing) existing.remove();
}

async function handleQuickAction(action, card, targetColumn) {
    try {
        if (action === 'edit') {
            CardCode.openCardDialog?.(card.id);
            return;
        } else if (action === 'spawn') {
            CardCode.openSpawnDialog?.(card.id);
            return;
        } else if (action === 'archive') {
            await apiPatch(`/cards/${card.id}/move`, {
                column_name: 'archive',
                position: Date.now(),
            });
            state.cards = state.cards.filter(c => c.id !== card.id);
            renderBoard(state.cards);
            updateColumnCounts();
            updateEmptyState();
        } else if (action === 'move-to') {
            const response = await apiPatch(`/cards/${card.id}/move`, {
                column_name: targetColumn,
                position: Date.now(),
            });
            card.column_name = targetColumn;
            renderBoard(state.cards);
            updateColumnCounts();
            updateEmptyState();
            await handleMoveSuggestion(response, card);
        } else if (action === 'open-terminal') {
            CardCode.openTerminalViewer?.(card.id, card.title);
        }
    } catch (err) {
        console.error(`Quick action "${action}" failed:`, err);
        if (action === 'archive') {
            showToast({ title: `Failed to archive "${card.title}"`, message: 'Check your connection and try again', type: 'error' });
        } else if (action === 'move-to') {
            showToast({ title: `Failed to move "${card.title}"`, message: 'Check your connection and try again', type: 'error' });
        }
    }
}

export async function handleMoveSuggestion(response, card) {
    if (!response?.suggestion) return;

    if (response.suggestion === 'spawn') {
        const confirmed = await showConfirmDialog({
            title: 'Spawn a session?',
            message: 'This card has no active session. Spawn one now?',
            confirmText: 'Spawn Session',
        });
        if (confirmed) {
            CardCode.openSpawnDialog?.(card.id);
        }
    } else if (response.suggestion === 'stop_session') {
        const confirmed = await showConfirmDialog({
            title: 'Stop session?',
            message: 'Stop the active session for this card?',
            confirmText: 'Stop Session',
            danger: true,
        });
        if (confirmed) {
            try {
                await apiPost(`/cards/${card.id}/stop`);
                const { apiGet } = await import('./app.js');
                state.cards = await apiGet('/cards');
                renderBoard(state.cards);
                updateColumnCounts();
            } catch (err) {
                console.error('Stop session failed:', err);
                showToast({ title: 'Failed to stop session', message: 'Check your connection and try again', type: 'error' });
            }
        }
    }
}

function timeAgo(isoString) {
    if (!isoString) return '';
    const seconds = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
    if (seconds < 60) return 'now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}

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

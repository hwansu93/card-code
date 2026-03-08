import { state, apiPatch, CardCode } from './app.js';
import { renderBoard, updateColumnCounts, updateEmptyState } from './board.js';
import { escapeHtml } from './utils.js';
import { showToast } from './notifications.js';

export function createCardElement(card) {
    const el = document.createElement('div');
    el.className = 'card';
    el.dataset.cardId = card.id;
    el.dataset.position = card.position;
    el.setAttribute('role', 'article');
    el.setAttribute('aria-label', card.title);
    if (card.id === state.selectedCardId) el.classList.add('selected');
    if (card.session_status) el.classList.add(`card-status-${card.session_status}`);
    if (card.column_name === 'done') el.classList.add('card-done');

    let html = '';

    // Tier 1 — Title (dominant)
    html += `<div class="card-title">${escapeHtml(card.title)}</div>`;

    // Tier 2 — Metadata (project + relative time)
    const project = card.project ? escapeHtml(card.project) : '';
    const ago = timeAgo(card.updated_at);
    if (project || ago) {
        html += `<div class="card-meta">
            <span class="card-meta-project">${project}</span>
            <span class="card-meta-time">${ago}</span>
        </div>`;
    }

    // Tier 3 — Status bar (compact inline capsule badges)
    const statusParts = [];
    if (card.session_status) {
        statusParts.push(`<span class="status-capsule"><span class="card-status-dot card-status-dot-${card.session_status}"></span>${card.session_status}</span>`);
    }
    if (card.cost_usd > 0) {
        statusParts.push(`<span class="status-capsule">$${card.cost_usd.toFixed(2)}</span>`);
    }
    const pct = Math.min((card.context_pct || 0) * 100, 100);
    if (pct > 0) {
        const contextClass = pct >= 80 ? 'context-danger' : pct >= 60 ? 'context-warning' : '';
        statusParts.push(`<span class="status-capsule ${contextClass}">${pct.toFixed(0)}%</span>`);
    }
    if (statusParts.length > 0) {
        html += `<div class="card-status-bar">${statusParts.join('')}</div>`;
    }

    // Context gauge — thin 2px bar at very bottom
    if (pct > 0) {
        const gaugeClass = pct >= 80 ? 'gauge-danger' : pct >= 60 ? 'gauge-warning' : '';
        html += `<div class="context-gauge">
            <div class="context-gauge-bar">
                <div class="context-gauge-fill ${gaugeClass}" style="width: ${pct}%"></div>
            </div>
        </div>`;
    }

    el.innerHTML = html;

    // Card click handler — open terminal for session cards
    const hasTerminal = card.tmux_session || card.is_external;
    if (hasTerminal) {
        el.addEventListener('click', (e) => {
            if (e.defaultPrevented) return;
            CardCode.openTerminalViewer?.(card.id, card.title);
        });
    }

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

    const items = [
        { label: 'Edit card', action: 'edit' },
        { label: 'Move to next column', action: 'move-next' },
        ...(hasTerminal ? [{ label: 'View terminal output', action: 'open-terminal' }] : []),
        { label: 'Archive card', action: 'archive' },
    ];

    items.forEach(item => {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'card-context-menu-item';
        el.setAttribute('role', 'menuitem');
        el.textContent = item.label;
        el.addEventListener('click', (ev) => {
            ev.stopPropagation();
            dismissContextMenu();
            handleQuickAction(item.action, card);
        });
        menu.appendChild(el);
    });

    document.body.appendChild(menu);

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

async function handleQuickAction(action, card) {
    try {
        if (action === 'edit') {
            CardCode.openCardDialog?.(card.id);
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
        } else if (action === 'move-next') {
            const colNames = (state.columns || []).map(c => c.name);
            const curIdx = colNames.indexOf(card.column_name);
            if (curIdx === -1 || curIdx >= colNames.length - 1) return;
            const nextCol = colNames[curIdx + 1];
            await apiPatch(`/cards/${card.id}/move`, {
                column_name: nextCol,
                position: Date.now(),
            });
            card.column_name = nextCol;
            renderBoard(state.cards);
            updateColumnCounts();
            updateEmptyState();
        } else if (action === 'open-terminal') {
            CardCode.openTerminalViewer?.(card.id, card.title);
        }
    } catch (err) {
        console.error(`Quick action "${action}" failed:`, err);
        if (action === 'archive') {
            showToast({ title: `Failed to archive "${card.title}"`, message: 'Check your connection and try again', type: 'error' });
        } else if (action === 'move-next') {
            showToast({ title: `Failed to move "${card.title}"`, message: 'Check your connection and try again', type: 'error' });
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

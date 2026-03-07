import { state, apiPatch } from './app.js';
import { renderBoard, updateColumnCounts, updateEmptyState } from './board.js';

const basePath = document.querySelector('meta[name="base-path"]')?.content || '';

export function createCardElement(card) {
    const el = document.createElement('div');
    el.className = 'card';
    el.dataset.cardId = card.id;
    el.dataset.position = card.position;
    if (card.id === window.__selectedCardId) el.classList.add('selected');
    if (card.session_status) el.classList.add(`card-status-${card.session_status}`);
    if (card.column_name === 'done') el.classList.add('card-done');

    let html = '';

    // 1. Project tag — colored pill at top-left
    if (card.project) {
        html += `<div class="card-project-tag">${escapeHtml(card.project)}</div>`;
    }

    // 2. Title row — icon + title
    const cardIcon = (card.provider === 'claude-code' || card.tmux_session || card.is_external)
        ? `<img src="${basePath}/img/cardcode-icon.svg" class="card-icon" alt="">`
        : '';
    html += `<div class="card-header">
        ${cardIcon}
        <span class="card-title">${escapeHtml(card.title)}</span>
    </div>`;

    // 3. Description preview — backlog/queue only, 2-line clamp
    if (['backlog', 'queue'].includes(card.column_name) && card.description) {
        const preview = card.description.length > 80
            ? card.description.slice(0, 80) + '...'
            : card.description;
        html += `<div class="card-description">${escapeHtml(preview)}</div>`;
    }

    // 4. Metrics row — active/review cards with non-zero metrics
    const hasMetrics = card.cost_usd > 0 || card.input_tokens > 0 || card.output_tokens > 0 || card.context_pct > 0;

    if (['active', 'review'].includes(card.column_name) && hasMetrics) {
        const pct = Math.min((card.context_pct || 0) * 100, 100);
        const contextClass = pct >= 80 ? 'context-danger' : pct >= 60 ? 'context-warning' : '';

        html += `<div class="card-metrics">
            <span class="metric">$${(card.cost_usd || 0).toFixed(2)}</span>
            <span class="metric">${formatTokens(card.input_tokens || 0)}/${formatTokens(card.output_tokens || 0)}</span>
            ${pct > 0 ? `<span class="metric ${contextClass}">${pct.toFixed(0)}%</span>` : ''}
        </div>`;

        // 5. Context gauge — thin 2px bar
        if (pct > 0) {
            const gaugeClass = pct >= 80 ? 'gauge-danger' : pct >= 60 ? 'gauge-warning' : '';
            html += `<div class="context-gauge">
                <div class="context-gauge-bar">
                    <div class="context-gauge-fill ${gaugeClass}" style="width: ${pct}%"></div>
                </div>
            </div>`;
        }
    }

    // Done card metrics
    if (card.column_name === 'done' && hasMetrics) {
        html += `<div class="card-metrics card-metrics-final">
            <span class="metric">$${(card.cost_usd || 0).toFixed(2)}</span>
            <span class="metric">${formatTokens((card.input_tokens || 0) + (card.output_tokens || 0))} tok</span>
        </div>`;
    }

    // 6. Quick actions — visible on hover
    const hasTerminal = card.tmux_session || card.is_external;
    html += `<div class="card-quick-actions">
        <button class="quick-action-btn" data-action="archive" title="Archive"><i data-lucide="archive"></i></button>
        <button class="quick-action-btn" data-action="move-next" title="Move to next column"><i data-lucide="arrow-right"></i></button>
        ${hasTerminal ? `<button class="quick-action-btn" data-action="open-terminal" title="Open terminal"><i data-lucide="terminal"></i></button>` : ''}
    </div>`;

    el.innerHTML = html;

    // Render Lucide icons within this card
    if (typeof lucide !== 'undefined') {
        lucide.createIcons({ root: el });
    }

    // Quick action handlers
    el.querySelectorAll('.quick-action-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            handleQuickAction(btn.dataset.action, card);
        });
    });

    // Card click handler — open terminal for session cards
    if (hasTerminal) {
        el.addEventListener('click', (e) => {
            if (e.defaultPrevented) return;
            window.__openTerminalViewer?.(card.id, card.title);
        });
    }

    return el;
}

async function handleQuickAction(action, card) {
    try {
        if (action === 'archive') {
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
            window.__openTerminalViewer?.(card.id, card.title);
        }
    } catch (err) {
        console.error(`Quick action "${action}" failed:`, err);
    }
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function formatTokens(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return n.toString();
}

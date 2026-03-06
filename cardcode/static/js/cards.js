export function createCardElement(card) {
    const el = document.createElement('div');
    el.className = 'card';
    el.dataset.cardId = card.id;
    el.dataset.position = card.position;
    if (card.id === window.__selectedCardId) el.classList.add('selected');
    if (card.session_status) el.classList.add(`card-status-${card.session_status}`);
    if (card.column_name === 'done') el.classList.add('card-done');

    // Status dot for active cards
    const statusDot = card.session_status
        ? `<span class="status-dot status-${card.session_status}"></span>`
        : '';

    // Provider badge
    const providerBadge = card.provider
        ? `<span class="provider-badge">${card.provider}</span>`
        : '';

    // Title row
    let html = `<div class="card-header">
        ${statusDot}
        <span class="card-title">${escapeHtml(card.title)}</span>
        ${providerBadge}
    </div>`;

    // Project label
    if (card.project) {
        html += `<div class="card-project">${escapeHtml(card.project)}</div>`;
    }

    // Description preview (backlog/queue only)
    if (['backlog', 'queue'].includes(card.column_name) && card.description) {
        const preview = card.description.length > 80
            ? card.description.slice(0, 80) + '...'
            : card.description;
        html += `<div class="card-description">${escapeHtml(preview)}</div>`;
    }

    // Metrics for active cards
    if (card.column_name === 'active' && card.session_status) {
        html += `<div class="card-metrics">
            <span class="metric">$${(card.cost_usd || 0).toFixed(2)}</span>
            <span class="metric">${formatTokens(card.input_tokens || 0)}/${formatTokens(card.output_tokens || 0)}</span>
        </div>`;

        // Context gauge
        const pct = Math.min((card.context_pct || 0) * 100, 100);
        const gaugeClass = pct > 60 ? (pct > 80 ? 'gauge-danger' : 'gauge-warning') : '';
        html += `<div class="context-gauge">
            <div class="context-gauge-bar">
                <div class="context-gauge-fill ${gaugeClass}" style="width: ${pct}%"></div>
            </div>
            <span class="context-gauge-label">${pct.toFixed(0)}%</span>
        </div>`;

        // Inline prompt input
        html += `<div class="card-prompt-input">
            <input type="text" placeholder="Send prompt..." class="prompt-input" data-card-id="${card.id}">
        </div>`;
    }

    // Done card metrics
    if (card.column_name === 'done') {
        html += `<div class="card-metrics card-metrics-final">
            <span class="metric">$${(card.cost_usd || 0).toFixed(2)}</span>
            <span class="metric">${formatTokens((card.input_tokens || 0) + (card.output_tokens || 0))} tok</span>
        </div>`;
    }

    el.innerHTML = html;

    // Inline prompt handler
    const promptInput = el.querySelector('.prompt-input');
    if (promptInput) {
        promptInput.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter' && promptInput.value.trim()) {
                e.preventDefault();
                e.stopPropagation();
                const text = promptInput.value.trim();
                promptInput.value = '';
                promptInput.disabled = true;
                try {
                    const basePath = document.querySelector('meta[name="base-path"]')?.content || '';
                    await fetch(`${basePath}/api/cards/${card.id}/prompt`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ text }),
                    });
                } catch (err) {
                    console.error('Prompt send failed:', err);
                } finally {
                    promptInput.disabled = false;
                    promptInput.focus();
                }
            }
        });
    }

    return el;
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

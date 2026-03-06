import { createCardElement } from './cards.js';
import { apiPatch } from './app.js';
import { state } from './app.js';

const COLUMNS = ['backlog', 'queue', 'active', 'review', 'done'];

export function renderBoard(cards) {
    // Clear all columns
    COLUMNS.forEach(col => {
        document.getElementById(`col-${col}`).innerHTML = '';
    });

    // Sort cards by position within each column, then render
    const grouped = {};
    COLUMNS.forEach(col => grouped[col] = []);

    cards.forEach(card => {
        if (grouped[card.column_name]) {
            grouped[card.column_name].push(card);
        }
    });

    Object.entries(grouped).forEach(([col, colCards]) => {
        colCards.sort((a, b) => a.position - b.position);
        const container = document.getElementById(`col-${col}`);
        if (colCards.length === 0) {
            const placeholder = document.createElement('div');
            placeholder.className = 'column-empty';
            placeholder.textContent = 'Drag cards here';
            container.appendChild(placeholder);
        } else {
            colCards.forEach(card => {
                container.appendChild(createCardElement(card));
            });
        }
    });

    // Re-render Lucide icons for any new card content
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

export function updateEmptyState() {
    const emptyEl = document.getElementById('empty-state');
    if (!emptyEl) return;
    const totalCards = state.cards.length;
    if (totalCards === 0) {
        emptyEl.classList.remove('hidden');
        if (typeof lucide !== 'undefined') lucide.createIcons();
    } else {
        emptyEl.classList.add('hidden');
    }
}

export function updateColumnCounts() {
    COLUMNS.forEach(col => {
        const container = document.getElementById(`col-${col}`);
        const count = container.querySelectorAll('.card').length;
        const header = container.closest('.column').querySelector('.column-count');
        if (header) header.textContent = count;
    });
}

export function setupSortable() {
    COLUMNS.forEach(col => {
        const el = document.getElementById(`col-${col}`);
        new Sortable(el, {
            group: 'cards',
            animation: 200,
            ghostClass: 'card-ghost',
            dragClass: 'card-drag',
            handle: '.card',
            onEnd: async (evt) => {
                const cardId = evt.item.dataset.cardId;
                const newColumn = evt.to.id.replace('col-', '');
                // Calculate position: midpoint between neighbors
                const children = [...evt.to.children];
                const idx = children.indexOf(evt.item);
                let position;
                if (children.length === 1) {
                    position = 1.0;
                } else if (idx === 0) {
                    const next = children[1]?.dataset.position || 1;
                    position = parseFloat(next) / 2;
                } else if (idx === children.length - 1) {
                    const prev = children[idx - 1]?.dataset.position || 0;
                    position = parseFloat(prev) + 1;
                } else {
                    const prev = parseFloat(children[idx - 1].dataset.position || 0);
                    const next = parseFloat(children[idx + 1].dataset.position || prev + 2);
                    position = (prev + next) / 2;
                }

                try {
                    const updated = await apiPatch(`/cards/${cardId}/move`, {
                        column_name: newColumn,
                        position: position,
                    });
                    // Update local state
                    const card = state.cards.find(c => c.id === cardId);
                    if (card) {
                        card.column_name = newColumn;
                        card.position = position;
                    }
                    updateColumnCounts();
                } catch (err) {
                    console.error('Move failed:', err);
                    // Re-render to restore original positions
                    renderBoard(state.cards);
                }
            },
        });
    });
}

// Helper to update a single card in place
export function updateCardInPlace(cardData) {
    const existing = document.querySelector(`[data-card-id="${cardData.id}"]`);
    if (existing) {
        const newEl = createCardElement(cardData);
        existing.replaceWith(newEl);
    }
    // Update state
    const idx = state.cards.findIndex(c => c.id === cardData.id);
    if (idx >= 0) {
        state.cards[idx] = cardData;
    } else {
        state.cards.push(cardData);
    }
}

export function addCardToBoard(cardData) {
    state.cards.push(cardData);
    const container = document.getElementById(`col-${cardData.column_name}`);
    if (container) {
        // Remove empty placeholder if present
        const placeholder = container.querySelector('.column-empty');
        if (placeholder) placeholder.remove();
        container.appendChild(createCardElement(cardData));
        updateColumnCounts();
        updateEmptyState();
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
}

export function removeCardFromBoard(cardId) {
    const el = document.querySelector(`[data-card-id="${cardId}"]`);
    if (el) el.remove();
    state.cards = state.cards.filter(c => c.id !== cardId);
    updateColumnCounts();
    updateEmptyState();
}

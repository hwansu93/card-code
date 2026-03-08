import { state, apiPatch, apiGet, CardCode } from './app.js';
import { renderBoard, updateColumnCounts } from './board.js';
import { closeAllDrawers } from './dialogs.js';

function getColumnNames() {
    return (state.columns || []).map(c => c.name);
}

function isDrawerOpen() {
    return document.querySelector('.drawer.open') !== null;
}

export function setupKeyboard() {
    document.addEventListener('keydown', (e) => {
        // Don't handle if typing in an input/textarea/select
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;

        // Close drawers on Escape before checking dialogs
        if (e.key === 'Escape' && isDrawerOpen()) {
            e.preventDefault();
            closeAllDrawers();
            return;
        }

        // Don't handle if a dialog is open
        if (document.querySelector('dialog[open]')) {
            if (e.key === 'Escape') {
                document.querySelector('dialog[open]').close();
            }
            return;
        }

        switch (e.key) {
            case 'n':
                e.preventDefault();
                document.getElementById('new-card-btn').click();
                break;
            case 'j':
                e.preventDefault();
                moveSelection(1);
                break;
            case 'k':
                e.preventDefault();
                moveSelection(-1);
                break;
            case 'h':
                e.preventDefault();
                moveColumn(-1);
                break;
            case 'l':
                e.preventDefault();
                moveColumn(1);
                break;
            case 'Enter':
                e.preventDefault();
                if (state.selectedCardId) {
                    CardCode.openCardDialog?.(state.selectedCardId);
                }
                break;
            case 'ArrowRight':
                if (e.shiftKey && state.selectedCardId) {
                    e.preventDefault();
                    moveCardToColumn(1);
                }
                break;
            case 'ArrowLeft':
                if (e.shiftKey && state.selectedCardId) {
                    e.preventDefault();
                    moveCardToColumn(-1);
                }
                break;
            case 's':
                e.preventDefault();
                document.getElementById('settings-btn')?.click();
                break;
            case '/':
                e.preventDefault();
                document.getElementById('project-filter').focus();
                break;
            case '?':
                e.preventDefault();
                document.getElementById('keyboard-dialog').showModal();
                break;
            case 'Escape':
                e.preventDefault();
                deselectAll();
                break;
        }
    });

    document.getElementById('keyboard-help').addEventListener('click', () => {
        document.getElementById('keyboard-dialog').showModal();
    });
    document.getElementById('keyboard-dialog-close').addEventListener('click', () => {
        document.getElementById('keyboard-dialog').close();
    });

    // Click to select cards
    document.getElementById('board').addEventListener('click', (e) => {
        const card = e.target.closest('.card');
        if (card) {
            selectCard(card.dataset.cardId);
        }
    });

    // Double-click to edit
    document.getElementById('board').addEventListener('dblclick', (e) => {
        const card = e.target.closest('.card');
        if (card && !e.target.closest('.prompt-input')) {
            CardCode.openCardDialog?.(card.dataset.cardId);
        }
    });
}

function selectCard(cardId) {
    deselectAll();
    state.selectedCardId = cardId;
    const el = document.querySelector(`[data-card-id="${cardId}"]`);
    if (el) {
        el.classList.add('selected');
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
}

function deselectAll() {
    state.selectedCardId = null;
    document.querySelectorAll('.card.selected').forEach(el => el.classList.remove('selected'));
}

function moveSelection(dir) {
    const columns = getColumnNames();
    const currentEl = document.querySelector('.card.selected');
    if (!currentEl) {
        // Select first card in first non-empty column
        for (const col of columns) {
            const first = document.querySelector(`#col-${col} .card`);
            if (first) { selectCard(first.dataset.cardId); return; }
        }
        return;
    }

    const siblings = [...currentEl.parentElement.children];
    const idx = siblings.indexOf(currentEl);
    const nextIdx = idx + dir;
    if (nextIdx >= 0 && nextIdx < siblings.length) {
        selectCard(siblings[nextIdx].dataset.cardId);
    }
}

function moveColumn(dir) {
    const columns = getColumnNames();
    const currentEl = document.querySelector('.card.selected');
    if (!currentEl) return;

    const currentCol = currentEl.closest('.column').dataset.column;
    const colIdx = columns.indexOf(currentCol);
    const newIdx = colIdx + dir;
    if (newIdx < 0 || newIdx >= columns.length) return;

    const newCol = columns[newIdx];
    const firstInCol = document.querySelector(`#col-${newCol} .card`);
    if (firstInCol) {
        selectCard(firstInCol.dataset.cardId);
    }
}

async function moveCardToColumn(dir) {
    const columns = getColumnNames();
    const card = state.cards.find(c => c.id === state.selectedCardId);
    if (!card) return;

    const colIdx = columns.indexOf(card.column_name);
    const newIdx = colIdx + dir;
    if (newIdx < 0 || newIdx >= columns.length) return;

    const newCol = columns[newIdx];
    try {
        await apiPatch(`/cards/${card.id}/move`, { column_name: newCol, position: Date.now() });
        state.cards = await apiGet('/cards');
        renderBoard(state.cards);
        updateColumnCounts();
        selectCard(card.id);
    } catch (err) {
        console.error('Move failed:', err);
    }
}

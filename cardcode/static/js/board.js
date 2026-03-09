import { createCardElement, handleMoveSuggestion } from './cards.js';
import { apiPatch, apiPost, apiDelete, apiGet } from './app.js';
import { state } from './app.js';
import { showToast } from './notifications.js';
import { showConfirmDialog, debugError } from './utils.js';

const COLLAPSE_KEY = 'cardcode-collapsed-columns';

const COLUMN_PALETTE = [
    'oklch(65% 0.15 250)',   // Blue
    'oklch(68% 0.14 55)',    // Amber
    'oklch(65% 0.12 165)',   // Green
    'oklch(62% 0.15 310)',   // Purple
    'oklch(62% 0.14 25)',    // Red
    'oklch(65% 0.12 195)',   // Teal
];

const SWATCH_COLORS = [
    ...COLUMN_PALETTE,
    'oklch(65% 0.15 340)',   // Pink
    'oklch(68% 0.14 70)',    // Orange
    'oklch(55% 0.18 280)',   // Indigo
    'oklch(70% 0.15 140)',   // Lime
];

function getColumnColor(column, index) {
    return column.color || COLUMN_PALETTE[index % COLUMN_PALETTE.length];
}

let _dragInProgress = false;
export function isDragging() { return _dragInProgress; }
let sortableInstances = [];

function getCollapsedColumns() {
    try {
        return JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '{}');
    } catch { return {}; }
}

function setCollapsed(colName, collapsed) {
    const map = getCollapsedColumns();
    map[colName] = collapsed;
    localStorage.setItem(COLLAPSE_KEY, JSON.stringify(map));
}

export function renderBoard(cards) {
    const board = document.getElementById('board');
    if (!board) return;

    // Track existing card IDs so we only animate genuinely new cards
    const existingCardIds = new Set([...document.querySelectorAll('.card')].map(c => c.dataset.cardId));

    // Remove loading/error states if present
    board.querySelectorAll('.board-loading, .board-error').forEach(el => el.remove());

    // Preserve the empty-state element (or recreate if missing)
    let emptyState = document.getElementById('empty-state');
    if (!emptyState) {
        emptyState = document.createElement('div');
        emptyState.className = 'empty-state hidden';
        emptyState.id = 'empty-state';
        emptyState.innerHTML = `
            <div class="empty-state-content">
                <div class="empty-state-icon">
                    <img src="/img/cardcode-icon.svg" alt="" class="empty-state-icon-img" width="64" height="64">
                </div>
                <h2>Welcome to CardCode</h2>
                <p>Your Kanban dashboard for Claude Code sessions.</p>
                <div class="onboarding-actions">
                    <div class="onboarding-card onboarding-card-info">
                        <i data-lucide="radar"></i>
                        <h3>Sessions auto-detected</h3>
                        <p>Running Claude sessions are automatically discovered and appear as cards.</p>
                    </div>
                    <div class="onboarding-card" id="onboarding-new-card">
                        <i data-lucide="plus-circle"></i>
                        <h3>Create your first card</h3>
                        <p>Add a task card and spawn a Claude session for it.</p>
                    </div>
                    <div class="onboarding-card" id="onboarding-settings">
                        <i data-lucide="columns-3"></i>
                        <h3>Customize your columns</h3>
                        <p>Configure workflow columns to match your process.</p>
                    </div>
                </div>
            </div>
        `;
        board.appendChild(emptyState);
    }

    // Remove all existing columns and the add-column button
    board.querySelectorAll('.column, .add-column-btn, .add-column-form').forEach(el => el.remove());

    const columns = state.columns || [];
    const collapsedMap = getCollapsedColumns();

    // Group cards by column_name
    const grouped = {};
    columns.forEach(col => grouped[col.name] = []);
    cards.forEach(card => {
        if (grouped[card.column_name]) {
            grouped[card.column_name].push(card);
        }
    });

    // Render each column
    columns.forEach((col, colIndex) => {
        const colCards = (grouped[col.name] || []).sort((a, b) => a.position - b.position);
        const isCollapsed = collapsedMap[col.name] || false;

        const colEl = document.createElement('div');
        colEl.className = 'column' + (isCollapsed ? ' collapsed' : '');
        colEl.dataset.column = col.name;
        colEl.dataset.columnId = col.id;
        colEl.setAttribute('role', 'region');
        colEl.setAttribute('aria-label', `${col.name} column`);

        // Header
        const header = document.createElement('div');
        header.className = 'column-header';

        // Collapse toggle
        const collapseBtn = document.createElement('button');
        collapseBtn.className = 'btn btn-icon-sm collapse-toggle';
        collapseBtn.title = isCollapsed ? 'Expand' : 'Collapse';
        collapseBtn.setAttribute('aria-expanded', String(!isCollapsed));
        collapseBtn.setAttribute('aria-label', isCollapsed ? `Expand ${col.name} column` : `Collapse ${col.name} column`);
        collapseBtn.innerHTML = `<i data-lucide="${isCollapsed ? 'chevron-right' : 'chevron-left'}"></i>`;
        collapseBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const nowCollapsed = !colEl.classList.contains('collapsed');
            colEl.classList.toggle('collapsed');
            setCollapsed(col.name, nowCollapsed);
            collapseBtn.setAttribute('aria-expanded', String(!nowCollapsed));
            const icon = collapseBtn.querySelector('i');
            icon.setAttribute('data-lucide', nowCollapsed ? 'chevron-right' : 'chevron-left');
            collapseBtn.title = nowCollapsed ? 'Expand' : 'Collapse';
            if (typeof lucide !== 'undefined') lucide.createIcons({ root: collapseBtn });
        });

        // Accent dot
        const dot = document.createElement('span');
        dot.className = 'column-dot';
        dot.style.backgroundColor = getColumnColor(col, colIndex);

        // Column name (double-click to rename)
        const nameEl = document.createElement('h2');
        nameEl.textContent = col.name.charAt(0).toUpperCase() + col.name.slice(1);
        nameEl.addEventListener('dblclick', () => startRename(col, nameEl));

        // Count badge
        const countEl = document.createElement('span');
        countEl.className = 'column-count';
        countEl.textContent = colCards.length;

        // Actions menu
        const actionsBtn = document.createElement('button');
        actionsBtn.className = 'btn btn-icon-sm column-actions-btn';
        actionsBtn.title = 'Column actions';
        actionsBtn.innerHTML = '<i data-lucide="more-vertical"></i>';
        actionsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            showColumnMenu(col, actionsBtn, colCards.length);
        });

        header.appendChild(collapseBtn);
        header.appendChild(dot);
        header.appendChild(nameEl);
        header.appendChild(countEl);
        header.appendChild(actionsBtn);

        // Card body
        const body = document.createElement('div');
        body.className = 'column-cards';
        body.id = `col-${col.name}`;
        body.setAttribute('role', 'list');

        if (colCards.length === 0) {
            const placeholder = document.createElement('div');
            placeholder.className = 'column-empty';
            placeholder.textContent = 'No cards — drag or create one';
            body.appendChild(placeholder);
        } else {
            colCards.forEach(card => {
                const cardEl = createCardElement(card);
                if (!existingCardIds.has(card.id)) {
                    cardEl.classList.add('card-entrance');
                }
                body.appendChild(cardEl);
            });
        }

        // Double-click on empty space in the column body → inline quick-add
        body.addEventListener('dblclick', (e) => {
            if (e.target.closest('.card')) return;
            if (body.querySelector('.quick-add-input')) return;
            showQuickAddInput(body, col.name);
        });

        colEl.appendChild(header);
        colEl.appendChild(body);

        // Insert before the empty-state element if it exists
        if (emptyState) {
            board.insertBefore(colEl, emptyState);
        } else {
            board.appendChild(colEl);
        }
    });

    // Add "+" button after last column
    const addBtn = document.createElement('button');
    addBtn.className = 'add-column-btn';
    addBtn.title = 'Add column';
    addBtn.innerHTML = '<i data-lucide="plus"></i>';
    addBtn.addEventListener('click', () => showAddColumnInput(addBtn));
    if (emptyState) {
        board.insertBefore(addBtn, emptyState);
    } else {
        board.appendChild(addBtn);
    }

    // Re-render Lucide icons scoped to board
    if (typeof lucide !== 'undefined') lucide.createIcons({ root: board });

    setupSortable();
}

function startRename(col, nameEl) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'column-rename-input';
    input.value = col.name;
    input.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const newName = input.value.trim();
            if (newName && newName !== col.name) {
                try {
                    const updated = await apiPatch(`/columns/${col.id}`, { name: newName });
                    col.name = updated.name;
                    // Re-fetch columns to stay in sync
                    state.columns = await apiGet('/columns');
                    renderBoard(state.cards);
                } catch (err) {
                    debugError('Rename failed:', err);
                    showToast({ title: 'Failed to rename column', message: 'Check your connection and try again', type: 'error' });
                    nameEl.textContent = col.name.charAt(0).toUpperCase() + col.name.slice(1);
                }
            } else {
                nameEl.textContent = col.name.charAt(0).toUpperCase() + col.name.slice(1);
            }
            input.replaceWith(nameEl);
        } else if (e.key === 'Escape') {
            input.replaceWith(nameEl);
        }
    });
    input.addEventListener('blur', () => {
        if (input.parentNode) {
            input.replaceWith(nameEl);
        }
    });
    nameEl.replaceWith(input);
    input.focus();
    input.select();
}

function buildSwatchPicker(col, menu) {
    const picker = document.createElement('div');
    picker.className = 'swatch-picker';
    SWATCH_COLORS.forEach(color => {
        const btn = document.createElement('button');
        btn.style.backgroundColor = color;
        if (col.color === color) btn.classList.add('active');
        btn.title = color;
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            try {
                await apiPatch(`/columns/${col.id}`, { color });
                const stateCol = state.columns.find(c => c.id === col.id);
                if (stateCol) stateCol.color = color;
                col.color = color;
                menu.remove();
                renderBoard(state.cards);
            } catch (err) {
                debugError('Color change failed:', err);
                showToast({ title: 'Failed to change color', message: 'Check your connection and try again', type: 'error' });
            }
        });
        picker.appendChild(btn);
    });
    return picker;
}

function showColumnMenu(col, anchorEl, cardCount) {
    // Remove any existing menu
    document.querySelectorAll('.column-context-menu').forEach(el => el.remove());

    const menu = document.createElement('div');
    menu.className = 'column-context-menu';
    menu.setAttribute('role', 'menu');

    // Rename option
    const renameItem = document.createElement('button');
    renameItem.className = 'column-menu-item';
    renameItem.setAttribute('role', 'menuitem');
    renameItem.innerHTML = '<i data-lucide="pencil"></i> Rename column';
    renameItem.addEventListener('click', () => {
        menu.remove();
        const headerEl = anchorEl.closest('.column-header');
        const nameEl = headerEl?.querySelector('h2');
        if (nameEl) startRename(col, nameEl);
    });
    menu.appendChild(renameItem);

    // Change color option
    const colorItem = document.createElement('button');
    colorItem.className = 'column-menu-item';
    colorItem.setAttribute('role', 'menuitem');
    colorItem.innerHTML = '<i data-lucide="palette"></i> Change color';
    colorItem.addEventListener('click', (e) => {
        e.stopPropagation();
        colorItem.replaceWith(buildSwatchPicker(col, menu));
        if (typeof lucide !== 'undefined') lucide.createIcons({ root: menu });
    });
    menu.appendChild(colorItem);

    const deleteItem = document.createElement('button');
    deleteItem.className = 'column-menu-item column-menu-item-danger';
    deleteItem.setAttribute('role', 'menuitem');
    deleteItem.innerHTML = '<i data-lucide="trash-2"></i> Delete column';
    deleteItem.addEventListener('click', async () => {
        menu.remove();
        if (cardCount > 0) {
            const confirmed = await showConfirmDialog({
                title: `Delete "${col.name}" column?`,
                message: `${cardCount} card${cardCount === 1 ? '' : 's'} in this column will be moved to the first column.`,
                confirmText: 'Delete Column',
                danger: true,
            });
            if (!confirmed) return;
        }
        try {
            await apiDelete(`/columns/${col.id}`);
            state.columns = await apiGet('/columns');
            state.cards = await apiGet('/cards');
            renderBoard(state.cards);
        } catch (err) {
            debugError('Delete column failed:', err);
            showToast({ title: 'Failed to delete column', message: 'Check your connection and try again', type: 'error' });
        }
    });

    menu.appendChild(deleteItem);
    anchorEl.parentNode.appendChild(menu);

    if (typeof lucide !== 'undefined') lucide.createIcons({ root: menu });

    // Close on click outside
    const closeHandler = (e) => {
        if (!menu.contains(e.target) && e.target !== anchorEl) {
            menu.remove();
            document.removeEventListener('click', closeHandler);
        }
    };
    setTimeout(() => document.addEventListener('click', closeHandler), 0);
}

function showAddColumnInput(addBtn) {
    // Replace the button with an inline form
    const form = document.createElement('div');
    form.className = 'add-column-form';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'add-column-input';
    input.placeholder = 'New column name';

    const confirm = async () => {
        const name = input.value.trim();
        if (!name) {
            form.replaceWith(addBtn);
            return;
        }
        try {
            await apiPost('/columns', { name });
            state.columns = await apiGet('/columns');
            renderBoard(state.cards);
        } catch (err) {
            debugError('Add column failed:', err);
            showToast({ title: 'Failed to create column', message: 'Check your connection and try again', type: 'error' });
            form.replaceWith(addBtn);
        }
    };

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            confirm();
        } else if (e.key === 'Escape') {
            form.replaceWith(addBtn);
        }
    });
    input.addEventListener('blur', () => {
        // Small delay to allow click events to fire
        setTimeout(() => {
            if (form.parentNode) form.replaceWith(addBtn);
        }, 150);
    });

    form.appendChild(input);
    addBtn.replaceWith(form);
    input.focus();
}

function showQuickAddInput(container, columnName) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'quick-add-input';
    input.placeholder = 'Add a card\u2026';
    container.appendChild(input);
    input.focus();

    const createCard = async () => {
        const title = input.value.trim();
        if (!title) return;
        input.value = '';
        try {
            await apiPost('/cards', { title, column_name: columnName });
            // WebSocket card_created event will call addCardToBoard — input stays open for multi-entry
        } catch (err) {
            debugError('Quick-add failed:', err);
        }
    };

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            createCard();
        } else if (e.key === 'Escape') {
            input.remove();
        }
    });

    input.addEventListener('blur', () => {
        setTimeout(() => {
            if (document.activeElement !== input) {
                input.remove();
            }
        }, 150);
    });
}

export function updateEmptyState() {
    const emptyEl = document.getElementById('empty-state');
    if (!emptyEl) return;
    const totalCards = state.cards.length;
    if (totalCards === 0) {
        emptyEl.classList.remove('hidden');
        if (typeof lucide !== 'undefined') lucide.createIcons({ root: emptyEl });
    } else {
        emptyEl.classList.add('hidden');
    }
}

export function updateColumnCounts() {
    const columns = state.columns || [];
    columns.forEach(col => {
        const container = document.getElementById(`col-${col.name}`);
        if (!container) return;
        const count = container.querySelectorAll('.card').length;
        const header = container.closest('.column')?.querySelector('.column-count');
        if (header) header.textContent = count;
    });
}

export function setupSortable() {
    sortableInstances.forEach(s => s.destroy());
    sortableInstances.length = 0;

    const columns = state.columns || [];

    // Card sorting within/between columns
    columns.forEach(col => {
        const el = document.getElementById(`col-${col.name}`);
        if (!el) return;
        sortableInstances.push(new Sortable(el, {
            group: 'cards',
            animation: 200,
            ghostClass: 'card-ghost',
            dragClass: 'card-drag',
            delay: 80,
            delayOnTouchOnly: true,
            onStart: () => {
                _dragInProgress = true;
            },
            onEnd: async (evt) => {
                setTimeout(() => { _dragInProgress = false; }, 50);
                const cardId = evt.item.dataset.cardId;
                const newColumn = evt.to.id.replace('col-', '');
                // Remove empty placeholder if present in target
                const placeholder = evt.to.querySelector('.column-empty');
                if (placeholder) placeholder.remove();

                // Calculate position: midpoint between neighbors
                const children = [...evt.to.children].filter(c => c.classList.contains('card'));
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
                    const response = await apiPatch(`/cards/${cardId}/move`, {
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
                    // Re-add empty placeholder if source column is now empty
                    const srcCards = evt.from.querySelectorAll('.card');
                    if (srcCards.length === 0 && !evt.from.querySelector('.column-empty')) {
                        const ph = document.createElement('div');
                        ph.className = 'column-empty';
                        ph.textContent = 'No cards — drag or create one';
                        evt.from.appendChild(ph);
                    }
                    // Handle move suggestion (spawn/stop)
                    if (card) {
                        await handleMoveSuggestion(response, card);
                    }
                } catch (err) {
                    debugError('Move failed:', err);
                    renderBoard(state.cards);
                }
            },
        }));
    });

    // Column reorder via header drag
    const board = document.getElementById('board');
    if (board) {
        sortableInstances.push(new Sortable(board, {
            animation: 200,
            handle: '.column-header',
            draggable: '.column',
            ghostClass: 'column-ghost',
            onEnd: async (evt) => {
                // Collect new column order and patch positions
                const columnEls = board.querySelectorAll('.column');
                const updates = [];
                columnEls.forEach((el, idx) => {
                    const colId = el.dataset.columnId;
                    if (colId) {
                        updates.push(apiPatch(`/columns/${colId}`, { position: idx + 1 }));
                    }
                });
                try {
                    await Promise.all(updates);
                    state.columns = await apiGet('/columns');
                } catch (err) {
                    debugError('Column reorder failed:', err);
                    showToast({ title: 'Failed to reorder columns', message: 'The board will refresh to show the current order', type: 'error' });
                    renderBoard(state.cards);
                }
            },
        }));
    }
}

// Helper to update a single card in place
export function updateCardInPlace(cardData) {
    const existing = document.querySelector(`[data-card-id="${cardData.id}"]`);
    if (existing) {
        const newEl = createCardElement(cardData);
        existing.replaceWith(newEl);
        if (typeof lucide !== 'undefined') lucide.createIcons({ root: newEl });
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
        const cardEl = createCardElement(cardData);
        cardEl.classList.add('card-entrance');
        container.appendChild(cardEl);
        updateColumnCounts();
        updateEmptyState();
        if (typeof lucide !== 'undefined') lucide.createIcons({ root: container });
    }
}

export function removeCardFromBoard(cardId) {
    const el = document.querySelector(`[data-card-id="${cardId}"]`);
    if (el) {
        const container = el.closest('.column-cards');
        el.remove();
        // Add empty placeholder if column is now empty
        if (container && container.querySelectorAll('.card').length === 0 && !container.querySelector('.column-empty')) {
            const ph = document.createElement('div');
            ph.className = 'column-empty';
            ph.textContent = 'No cards — drag or create one';
            container.appendChild(ph);
        }
    }
    state.cards = state.cards.filter(c => c.id !== cardId);
    updateColumnCounts();
    updateEmptyState();
}

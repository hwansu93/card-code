import { state, apiPost, apiPatch, apiDelete } from './app.js';
import { renderBoard, updateColumnCounts, addCardToBoard } from './board.js';

export function setupDialogs() {
    setupCardDialog();
    setupSpawnDialog();
    setupClearDone();
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
        form.elements.title.value = card.title || '';
        form.elements.description.value = card.description || '';
        form.elements.project.value = card.project || '';
        form.elements.initial_prompt.value = card.initial_prompt || '';
        form.elements.handoff_notes.value = card.handoff_notes || '';
        populateProjectSelect();
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

function setupClearDone() {
    document.getElementById('clear-done').addEventListener('click', async () => {
        const doneCards = state.cards.filter(c => c.column_name === 'done');
        for (const card of doneCards) {
            await apiPatch(`/cards/${card.id}/move`, { column_name: 'archive', position: 0 });
        }
        state.cards = state.cards.filter(c => c.column_name !== 'done');
        renderBoard(state.cards);
        updateColumnCounts();
    });
}

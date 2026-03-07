import { renderBoard, setupSortable, updateColumnCounts, updateEmptyState } from './board.js';

// State
export const state = {
    cards: [],
    columns: [],
    projects: [],
    selectedCardId: null,
};

// API helpers
const BASE_PATH = document.querySelector('meta[name="base-path"]')?.content || '';
const API = `${BASE_PATH}/api`;

export async function apiGet(path) {
    const resp = await fetch(`${API}${path}`);
    if (!resp.ok) throw new Error(`GET ${path}: ${resp.status}`);
    return resp.json();
}

export async function apiPost(path, body) {
    const resp = await fetch(`${API}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
    });
    if (!resp.ok) throw new Error(`POST ${path}: ${resp.status}`);
    if (resp.status === 204) return null;
    return resp.json();
}

export async function apiPatch(path, body) {
    const resp = await fetch(`${API}${path}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!resp.ok) throw new Error(`PATCH ${path}: ${resp.status}`);
    return resp.json();
}

export async function apiDelete(path) {
    const resp = await fetch(`${API}${path}`, { method: 'DELETE' });
    if (!resp.ok) throw new Error(`DELETE ${path}: ${resp.status}`);
}

// Initialize
async function init() {
    // Load initial data — columns first so renderBoard can use them
    state.columns = await apiGet('/columns');
    state.cards = await apiGet('/cards');
    state.projects = await apiGet('/projects');

    // Render
    renderBoard(state.cards);
    updateColumnCounts();
    updateEmptyState();
    setupSortable();

    // Render Lucide icons
    if (typeof lucide !== 'undefined') lucide.createIcons();

    // Populate project filter
    const filter = document.getElementById('project-filter');
    state.projects.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.name;
        opt.textContent = p.name;
        filter.appendChild(opt);
    });

    filter.addEventListener('change', async () => {
        const project = filter.value;
        state.cards = await apiGet(project ? `/cards?project=${encodeURIComponent(project)}` : '/cards');
        renderBoard(state.cards);
        updateColumnCounts();
        updateEmptyState();
    });

    // Theme toggle
    document.getElementById('theme-toggle').addEventListener('click', () => {
        const html = document.documentElement;
        const current = html.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        html.setAttribute('data-theme', next);
        localStorage.setItem('cardcode-theme', next);
    });

    // These modules are created in later tasks — use dynamic import so app works without them
    import('./dialogs.js').then(m => m.setupDialogs()).catch(() => {});
    import('./websocket.js').then(m => m.connectWebSocket()).catch(() => {});
    import('./keyboard.js').then(m => m.setupKeyboard()).catch(() => {});
    import('./notifications.js').then(m => m.setupNotifications()).catch(() => {});
}

init().catch(console.error);

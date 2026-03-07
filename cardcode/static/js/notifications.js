import { state } from './app.js';

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function dismissToast(toast) {
    toast.classList.add('toast-exit');
    toast.addEventListener('animationend', () => toast.remove());
}

export function showToast({ title, message, type = 'info', duration = 5000 }) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const iconName = { warning: 'alert-triangle', error: 'alert-circle', success: 'check-circle', info: 'info' }[type] || 'info';

    toast.innerHTML = `
        <span class="toast-icon"><i data-lucide="${iconName}"></i></span>
        <div class="toast-body">
            <div class="toast-title">${escapeHtml(title)}</div>
            ${message ? `<div class="toast-message">${escapeHtml(message)}</div>` : ''}
        </div>
        <button class="toast-close"><i data-lucide="x"></i></button>
    `;

    toast.querySelector('.toast-close').addEventListener('click', () => dismissToast(toast));
    container.appendChild(toast);
    if (typeof lucide !== 'undefined') lucide.createIcons({ root: toast });

    if (duration > 0) {
        setTimeout(() => dismissToast(toast), duration);
    }
}

export function setupNotifications() {
    // Status changes
    window.addEventListener('cardcode:status', (e) => {
        const { id, session_status } = e.detail;
        const card = state.cards.find(c => c.id === id);
        const title = card?.title || 'Session';

        if (session_status === 'waiting') {
            showToast({ title, message: 'Needs attention — waiting for input', type: 'warning' });
        } else if (session_status === 'dead') {
            showToast({ title, message: 'Session ended', type: 'info' });
        }
    });

    // Context warnings
    window.addEventListener('cardcode:metrics', (e) => {
        const { id, context_pct } = e.detail;
        if (context_pct && context_pct > 0.6) {
            const card = state.cards.find(c => c.id === id);
            const title = card?.title || 'Session';
            const pct = (context_pct * 100).toFixed(0);
            showToast({
                title: `${title} — context at ${pct}%`,
                message: 'Consider starting a new session',
                type: context_pct > 0.8 ? 'error' : 'warning',
            });
        }
    });
}

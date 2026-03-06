import { state } from './app.js';

let permissionGranted = false;

export function setupNotifications() {
    // Request permission on first user interaction
    document.addEventListener('click', requestPermission, { once: true });

    // Listen for status changes
    window.addEventListener('cardcode:status', (e) => {
        const { id, session_status } = e.detail;
        const card = state.cards.find(c => c.id === id);
        const title = card?.title || 'Unknown card';

        if (session_status === 'waiting') {
            notify(`${title} needs attention`, 'Session is waiting for input');
        } else if (session_status === 'dead') {
            notify(`${title} session ended`, 'Session has completed or crashed');
        }
    });

    // Listen for context warnings
    window.addEventListener('cardcode:metrics', (e) => {
        const { id, context_pct } = e.detail;
        if (context_pct && context_pct > 0.6) {
            const card = state.cards.find(c => c.id === id);
            const title = card?.title || 'Unknown card';
            notify(`${title} context at ${(context_pct * 100).toFixed(0)}%`, 'Consider starting a new session');
        }
    });
}

function requestPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().then(p => {
            permissionGranted = p === 'granted';
        });
    } else {
        permissionGranted = Notification.permission === 'granted';
    }
}

function notify(title, body) {
    if (!permissionGranted) return;
    try {
        new Notification(title, { body, icon: '/favicon.ico' });
    } catch (e) {
        // Notifications not supported
    }
}

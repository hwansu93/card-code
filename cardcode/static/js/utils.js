export function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

export function getTerminalTheme() {
    const style = getComputedStyle(document.documentElement);
    return {
        background: style.getPropertyValue('--terminal-bg').trim() || '#141418',
        foreground: style.getPropertyValue('--terminal-fg').trim() || '#e0e0e8',
        cursor: style.getPropertyValue('--terminal-cursor').trim() || '#4daa90',
        selectionBackground: style.getPropertyValue('--terminal-selection').trim() || 'rgba(77, 170, 144, 0.3)',
        black: '#1a1c24',
        red: '#ef4444',
        green: '#4ade80',
        yellow: '#fbbf24',
        blue: '#60a5fa',
        magenta: '#c084fc',
        cyan: '#22d3ee',
        white: '#e8e6e3',
        brightBlack: '#5c5955',
        brightRed: '#f87171',
        brightGreen: '#86efac',
        brightYellow: '#fde68a',
        brightBlue: '#93c5fd',
        brightMagenta: '#d8b4fe',
        brightCyan: '#67e8f9',
        brightWhite: '#f5f5f4',
    };
}

export function showConfirmDialog({ title, message, confirmText = 'Confirm', cancelText = 'Cancel', danger = false }) {
    return new Promise((resolve) => {
        let resolved = false;
        function resolveOnce(value) {
            if (resolved) return;
            resolved = true;
            resolve(value);
        }
        const dialog = document.createElement('dialog');
        dialog.className = 'dialog confirm-dialog';
        dialog.innerHTML = `
            <h3>${escapeHtml(title)}</h3>
            <p>${escapeHtml(message)}</p>
            <div class="dialog-actions">
                <button class="btn cancel-btn">${escapeHtml(cancelText)}</button>
                <button class="btn ${danger ? 'btn-danger' : 'btn-primary'} confirm-btn">${escapeHtml(confirmText)}</button>
            </div>
        `;
        dialog.querySelector('.cancel-btn').addEventListener('click', () => { dialog.close(); resolveOnce(false); });
        dialog.querySelector('.confirm-btn').addEventListener('click', () => { dialog.close(); resolveOnce(true); });
        dialog.addEventListener('close', () => { dialog.remove(); resolveOnce(false); });
        document.body.appendChild(dialog);
        dialog.showModal();
    });
}

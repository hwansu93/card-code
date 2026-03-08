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
        // ANSI colors harmonized with Copper & Slate
        black: '#1c1c22',
        red: '#c7726a',
        green: '#7aad8c',
        yellow: '#c9a65a',
        blue: '#6d8fad',
        magenta: '#a07aad',
        cyan: '#6aadab',
        white: '#c8c5be',
        brightBlack: '#45454f',
        brightRed: '#d9897f',
        brightGreen: '#92c5a3',
        brightYellow: '#dbbe72',
        brightBlue: '#85a7c5',
        brightMagenta: '#b892c5',
        brightCyan: '#82c5c3',
        brightWhite: '#e5e2db',
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

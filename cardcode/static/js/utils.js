export function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
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

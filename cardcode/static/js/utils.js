export function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

export function showConfirmDialog({ title, message, confirmText = 'Confirm', cancelText = 'Cancel', danger = false }) {
    return new Promise((resolve) => {
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
        dialog.querySelector('.cancel-btn').addEventListener('click', () => { dialog.close(); resolve(false); });
        dialog.querySelector('.confirm-btn').addEventListener('click', () => { dialog.close(); resolve(true); });
        dialog.addEventListener('close', () => { dialog.remove(); resolve(false); });
        document.body.appendChild(dialog);
        dialog.showModal();
    });
}

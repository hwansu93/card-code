import { state, apiGet } from './app.js';
import { updateCardInPlace, addCardToBoard, removeCardFromBoard, renderBoard, updateColumnCounts, setupSortable } from './board.js';

export function connectWebSocket() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const basePath = document.querySelector('meta[name="base-path"]')?.content || '';
    const url = `${protocol}//${location.host}${basePath}/ws`;
    let ws;
    let reconnectDelay = 1000;
    const maxDelay = 30000;

    const statusDot = document.getElementById('connection-status');

    function setStatus(status) {
        if (!statusDot) return;
        statusDot.className = `connection-dot ${status}`;
    }

    function connect() {
        setStatus('reconnecting');
        ws = new WebSocket(url);

        ws.onopen = () => {
            console.log('WebSocket connected');
            reconnectDelay = 1000;
            setStatus('connected');
        };

        ws.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            handleMessage(msg);
        };

        ws.onclose = () => {
            setStatus('disconnected');
            console.log(`WebSocket closed, reconnecting in ${reconnectDelay}ms`);
            setTimeout(() => {
                reconnectDelay = Math.min(reconnectDelay * 2, maxDelay);
                connect();
            }, reconnectDelay);
        };

        ws.onerror = (err) => {
            console.error('WebSocket error:', err);
            ws.close();
        };
    }

    async function handleMessage(msg) {
        switch (msg.type) {
            case 'card_created':
                addCardToBoard(msg.card);
                break;

            case 'card_updated':
                updateCardInPlace(msg.card);
                updateColumnCounts();
                break;

            case 'card_deleted':
                removeCardFromBoard(msg.id);
                break;

            case 'card_moved': {
                const card = state.cards.find(c => c.id === msg.id);
                if (card) {
                    card.column_name = msg.column;
                    card.position = msg.position;
                    renderBoard(state.cards);
                    updateColumnCounts();
                }
                break;
            }

            case 'metrics_updated': {
                const card = state.cards.find(c => c.id === msg.id);
                if (card) {
                    if (msg.cost_usd !== undefined) card.cost_usd = msg.cost_usd;
                    if (msg.context_pct !== undefined) card.context_pct = msg.context_pct;
                    if (msg.input_tokens !== undefined) card.input_tokens = msg.input_tokens;
                    if (msg.output_tokens !== undefined) card.output_tokens = msg.output_tokens;
                    updateCardInPlace(card);
                }
                // Fire notification event for notifications.js
                window.dispatchEvent(new CustomEvent('cardcode:metrics', { detail: msg }));
                break;
            }

            case 'status_changed': {
                const card = state.cards.find(c => c.id === msg.id);
                if (card) {
                    card.session_status = msg.session_status;
                    updateCardInPlace(card);
                }
                window.dispatchEvent(new CustomEvent('cardcode:status', { detail: msg }));
                break;
            }

            case 'column_created':
            case 'column_updated':
            case 'column_deleted':
                state.columns = await apiGet('/columns');
                state.cards = await apiGet('/cards');
                renderBoard(state.cards);
                updateColumnCounts();
                setupSortable();
                break;

            case 'projects_refreshed':
                state.projects = msg.projects;
                break;

            case 'prompt_sent': {
                const el = document.querySelector(`[data-card-id="${msg.id}"]`);
                if (el) {
                    el.classList.add('card-flash');
                    setTimeout(() => el.classList.remove('card-flash'), 500);
                }
                break;
            }
        }
    }

    connect();
}

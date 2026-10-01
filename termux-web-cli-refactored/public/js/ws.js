/**
 * Resilient WebSocket Client for Termux Web CLI v2
 */
import { state } from './state.js';

class WSClient {
    constructor() {
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectDelay = 5000;
        this.handlers = new Map();
        this.isConnected = false;
        this.pendingMessages = [];
    }

    connect() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;

        this.updateStatus('connecting', 'Conectando...');

        try {
            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                this.isConnected = true;
                this.reconnectAttempts = 0;
                this.updateStatus('connected', 'Conectado');
                console.log('[WS] Conexão estabelecida com sucesso');

                // Flush pending messages if any
                while (this.pendingMessages.length > 0) {
                    const msg = this.pendingMessages.shift();
                    this.send(msg);
                }

                // Sync current active tab
                this.send({ action: 'sync_tab', tabId: state.activeTabId });
            };

            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.dispatch(data);
                } catch (e) {
                    console.error('[WS] Erro ao parsear JSON recebido:', e);
                }
            };

            this.ws.onclose = () => {
                this.isConnected = false;
                this.updateStatus('disconnected', 'Reconectando...');
                this.scheduleReconnect();
            };

            this.ws.onerror = (err) => {
                console.warn('[WS] Erro no socket:', err);
                this.ws.close();
            };
        } catch (e) {
            console.error('[WS] Falha ao instanciar WebSocket:', e);
            this.scheduleReconnect();
        }
    }

    scheduleReconnect() {
        this.reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), this.maxReconnectDelay);
        setTimeout(() => this.connect(), delay);
    }

    send(payload) {
        const msg = typeof payload === 'string' ? payload : JSON.stringify(payload);
        if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(msg);
        } else {
            this.pendingMessages.push(payload);
        }
    }

    on(type, handler) {
        if (!this.handlers.has(type)) {
            this.handlers.set(type, new Set());
        }
        this.handlers.get(type).add(handler);
        return () => this.handlers.get(type).delete(handler);
    }

    dispatch(msg) {
        const type = msg.type;
        if (this.handlers.has(type)) {
            this.handlers.get(type).forEach(handler => handler(msg));
        }
        // Wildcard handler
        if (this.handlers.has('*')) {
            this.handlers.get('*').forEach(handler => handler(msg));
        }
    }

    updateStatus(status, label) {
        const dot = document.getElementById('status-dot');
        const text = document.getElementById('status-text');
        if (!dot || !text) return;

        dot.className = 'w-2 h-2 rounded-full mr-1.5 transition-colors duration-200 ';
        if (status === 'connected') {
            dot.className += 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]';
            text.textContent = 'Pronto';
            text.className = 'text-emerald-400/90 text-[11px] font-medium hidden sm:inline';
        } else if (status === 'connecting') {
            dot.className += 'bg-amber-400 animate-pulse';
            text.textContent = label;
            text.className = 'text-amber-400/90 text-[11px] font-medium hidden sm:inline';
        } else {
            dot.className += 'bg-rose-500 animate-pulse';
            text.textContent = label;
            text.className = 'text-rose-400/90 text-[11px] font-medium hidden sm:inline';
        }
    }
}

export const wsClient = new WSClient();

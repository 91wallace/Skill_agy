/**
 * Main Application Bootstrapper for Termux Web CLI v2
 */
import { state } from './state.js';
import { wsClient } from './ws.js';
import { tabManager } from './tabs.js';
import { modalManager } from './modals.js';
import { quickBarManager } from './quick-bar.js';
import { dirTreeManager } from './dir-tree.js';
import { terminalRenderer } from './terminal-renderer.js';

document.addEventListener('DOMContentLoaded', () => {
    console.log('[Termux Web CLI v2] Inicializando subsistemas...');

    // 1. Initialize State & Custom Colors
    state.applyColors();

    // 2. Initialize UI Components
    tabManager.init();
    modalManager.init();
    quickBarManager.init();
    dirTreeManager.init();
    terminalRenderer.init();

    // 3. Connect WebSocket
    wsClient.connect();

    // 4. Register Service Worker for PWA
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js')
            .then(() => console.log('[PWA] Service Worker registrado com sucesso.'))
            .catch((err) => console.warn('[PWA] Falha ao registrar Service Worker:', err));
    }
});

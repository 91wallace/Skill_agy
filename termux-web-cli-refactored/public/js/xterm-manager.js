/**
 * XTerm.js Integration Manager for Full Interactive TUI and SSH
 */
import { wsClient } from './ws.js';
import { state } from './state.js';

class XTermManager {
    constructor() {
        this.term = null;
        this.fitAddon = null;
        this.container = null;
        this.isOpen = false;
        this.activeTabId = null;
    }

    init() {
        this.container = document.getElementById('xterm-overlay');
        if (!this.container) {
            this.container = document.createElement('div');
            this.container.id = 'xterm-overlay';
            this.container.className = 'fixed inset-0 bg-gray-950 z-40 hidden flex-col';
            this.container.innerHTML = `
                <div class="flex items-center justify-between px-3 py-1.5 bg-gray-900 border-b border-gray-800 shrink-0">
                    <span id="xterm-title" class="text-xs font-mono text-gray-300 truncate">Terminal PTY</span>
                    <button id="btn-close-xterm" class="text-xs bg-red-900 hover:bg-red-800 text-red-200 px-2 py-1 rounded transition-colors">Fechar (Ctrl+C)</button>
                </div>
                <div id="xterm-terminal-mount" class="flex-1 p-1 overflow-hidden"></div>
            `;
            document.body.appendChild(this.container);

            document.getElementById('btn-close-xterm').addEventListener('click', () => {
                wsClient.send({ action: 'kill', tabId: state.activeTabId });
                this.close();
            });
        }
    }

    open(title = 'Terminal Interativo') {
        this.init();
        const mount = document.getElementById('xterm-terminal-mount');
        const titleEl = document.getElementById('xterm-title');
        if (titleEl) titleEl.textContent = title;

        this.container.classList.remove('hidden');
        this.isOpen = true;

        if (!this.term && window.Terminal) {
            this.term = new window.Terminal({
                theme: {
                    background: '#0b0f19',
                    foreground: '#f3f4f6',
                    cursor: '#10b981',
                    selectionBackground: 'rgba(16, 185, 129, 0.3)'
                },
                fontSize: 13,
                fontFamily: 'ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, Consolas, monospace',
                cursorBlink: true,
                convertEol: true
            });

            if (window.FitAddon && window.FitAddon.FitAddon) {
                this.fitAddon = new window.FitAddon.FitAddon();
                this.term.loadAddon(this.fitAddon);
            }

            this.term.open(mount);

            this.term.onData((data) => {
                wsClient.send({
                    action: 'pty_input',
                    tabId: state.activeTabId,
                    data: data
                });
            });

            window.addEventListener('resize', () => this.resize());
        }

        setTimeout(() => this.resize(), 100);
    }

    resize() {
        if (!this.isOpen || !this.term || !this.fitAddon) return;
        try {
            this.fitAddon.fit();
            const cols = this.term.cols;
            const rows = this.term.rows;
            wsClient.send({
                action: 'pty_resize',
                tabId: state.activeTabId,
                cols: cols,
                rows: rows
            });
        } catch (e) {
            console.warn('[XTerm] Erro ao redimensionar:', e);
        }
    }

    write(data) {
        if (this.term && this.isOpen) {
            this.term.write(data);
        }
    }

    close() {
        if (this.container) {
            this.container.classList.add('hidden');
        }
        this.isOpen = false;
        if (this.term) {
            this.term.clear();
        }
    }
}

export const xtermManager = new XTermManager();

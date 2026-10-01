/**
 * Command Bar & Quick Actions Controller
 */
import { state } from './state.js';
import { wsClient } from './ws.js';
import { dirTreeManager } from './dir-tree.js';
import { terminalRenderer } from './terminal-renderer.js';

class QuickBarManager {
    constructor() {
        this.inputEl = null;
        this.runBtn = null;
        this.cancelBtn = null;
        this.promptCwdEl = null;
        this.promptContainer = null;
        this.pastBar = null;
        this.pastLatestText = null;
        this.pastList = null;
        this.pastToggleBtn = null;
        this.isLoading = false;
    }

    init() {
        this.inputEl = document.getElementById('command-input');
        this.runBtn = document.getElementById('btn-run');
        this.cancelBtn = document.getElementById('btn-cancel');
        this.promptCwdEl = document.getElementById('prompt-cwd-text');
        this.promptContainer = document.getElementById('command-container');

        this.pastBar = document.getElementById('past-commands-bar');
        this.pastLatestText = document.getElementById('past-commands-latest-text');
        this.pastList = document.getElementById('past-commands-list');
        this.pastToggleBtn = document.getElementById('btn-toggle-past-commands');

        // Command submission
        if (this.runBtn) {
            this.runBtn.addEventListener('click', () => this.submit());
        }

        if (this.inputEl) {
            this.inputEl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.submit();
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    this.navigateHistory(-1);
                } else if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    this.navigateHistory(1);
                }
            });
        }

        // Cancel button (Ctrl+C)
        if (this.cancelBtn) {
            this.cancelBtn.addEventListener('click', () => {
                wsClient.send({ action: 'kill', tabId: state.activeTabId });
                this.setLoading(false);
            });
        }

        // Shortcut buttons
        document.querySelectorAll('.shortcut-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const cmd = btn.getAttribute('data-cmd');
                if (cmd) {
                    this.executeDirect(cmd);
                }
            });
        });

        // Prompt CWD click -> open Directory Tree Explorer
        if (this.promptCwdEl) {
            this.promptCwdEl.addEventListener('click', () => {
                dirTreeManager.toggle();
            });
        }

        // Past commands drawer
        if (this.pastToggleBtn && this.pastList) {
            this.pastToggleBtn.addEventListener('click', () => {
                this.pastList.classList.toggle('hidden');
                const chevron = this.pastToggleBtn.querySelector('.past-chevron');
                if (chevron) chevron.classList.toggle('rotate-180');
            });
        }

        state.subscribe((event, data) => {
            if (event === 'history_updated') {
                this.renderPastCommands();
            } else if (event === 'tab_switched') {
                this.updatePromptUI();
            }
        });

        // WebSocket status events
        wsClient.on('status_idle', () => this.setLoading(false));
        wsClient.on('agy_turn_done', () => this.setLoading(false));
        wsClient.on('pty_closed', () => this.setLoading(false));
        wsClient.on('error', () => this.setLoading(false));

        wsClient.on('output', () => this.setReceivingState());
        wsClient.on('agy_stream', () => this.setReceivingState());
        wsClient.on('agy_tool_start', () => this.setReceivingState());

        this.updatePromptUI();
        this.renderPastCommands();
    }

    isCurrentTabAgy() {
        const session = state.sessionsData.get(state.activeTabId);
        if (session && session.isAgyMode) return true;
        const currentTab = state.tabs.find(t => t.id === state.activeTabId);
        return currentTab ? !!currentTab.isAgyMode : false;
    }

    updatePromptUI() {
        const isAgy = this.isCurrentTabAgy();
        const symbolEl = this.promptContainer ? this.promptContainer.querySelector('.text-emerald-400') : null;

        if (isAgy) {
            if (this.promptCwdEl) {
                this.promptCwdEl.textContent = '✨ agy';
                this.promptCwdEl.className = 'text-indigo-400 font-bold prompt-line';
            }
            if (symbolEl) {
                symbolEl.textContent = '>';
                symbolEl.className = 'text-indigo-400 font-bold';
            }
            if (this.inputEl) {
                this.inputEl.placeholder = 'Pergunte ao Antigravity IA... (ou envie comandos)';
            }
            if (this.runBtn && !this.isLoading) {
                this.runBtn.className = 'bg-indigo-600 hover:bg-indigo-500 text-white px-3.5 py-1.5 rounded-lg text-xs font-bold active:scale-95 transition-all shrink-0 shadow-md flex items-center gap-1.5';
                this.runBtn.innerHTML = '<span>Enviar</span>';
            }
        } else {
            const session = state.sessionsData.get(state.activeTabId);
            this.updatePromptCwd(session ? session.cwd : '~');
            if (symbolEl) {
                symbolEl.textContent = '$';
                symbolEl.className = 'text-emerald-400 font-bold';
            }
            if (this.inputEl) {
                this.inputEl.placeholder = 'digite um comando...';
            }
            if (this.runBtn && !this.isLoading) {
                this.runBtn.className = 'bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-1.5 rounded-lg text-xs font-bold active:scale-95 transition-all shrink-0 shadow-md flex items-center gap-1.5';
                this.runBtn.innerHTML = '<span>Executar</span>';
            }
        }
    }

    setLoading(loading, customLabel = null) {
        this.isLoading = loading;
        if (!this.runBtn) return;

        const isAgy = this.isCurrentTabAgy();

        if (loading) {
            this.runBtn.disabled = true;
            this.runBtn.classList.add('opacity-90', 'cursor-wait');
            const label = customLabel || (isAgy ? 'Enviando...' : 'Executando...');
            this.runBtn.innerHTML = `
                <span class="loading-spinner"></span>
                <span>${label}</span>
            `;
            wsClient.updateStatus('connecting', 'Comando enviado...');
        } else {
            this.runBtn.disabled = false;
            this.runBtn.classList.remove('opacity-90', 'cursor-wait');
            const defaultLabel = isAgy ? 'Enviar' : 'Executar';
            this.runBtn.innerHTML = `<span>${defaultLabel}</span>`;
            wsClient.updateStatus('connected', 'Pronto');
        }
    }

    setReceivingState() {
        if (!this.isLoading) return;
        const isAgy = this.isCurrentTabAgy();
        if (this.runBtn) {
            const label = isAgy ? 'Gerando IA...' : 'Recebendo...';
            this.runBtn.innerHTML = `
                <span class="loading-spinner"></span>
                <span>${label}</span>
            `;
        }
        wsClient.updateStatus('connecting', isAgy ? 'IA Gerando resposta...' : 'Recebendo saída...');
    }

    executeDirect(cmd) {
        if (!cmd || !cmd.trim()) return;
        const trimmed = cmd.trim();
        state.addCommandToHistory(trimmed);
        
        const isAgy = this.isCurrentTabAgy() || trimmed === 'agy' || /^agy\s+/i.test(trimmed);
        terminalRenderer.notifyCommandSent(state.activeTabId, trimmed, isAgy);
        this.setLoading(true);

        wsClient.send({
            action: 'command',
            tabId: state.activeTabId,
            data: trimmed
        });
    }

    submit() {
        if (!this.inputEl) return;
        const cmd = this.inputEl.value.trim();
        if (!cmd) return;

        this.executeDirect(cmd);

        this.inputEl.value = '';
        state.commandHistoryIndex = -1;
    }

    navigateHistory(direction) {
        if (state.commandHistory.length === 0 || !this.inputEl) return;

        if (direction === -1) {
            // Up
            if (state.commandHistoryIndex === -1) {
                state.commandHistoryIndex = state.commandHistory.length - 1;
            } else if (state.commandHistoryIndex > 0) {
                state.commandHistoryIndex--;
            }
        } else if (direction === 1) {
            // Down
            if (state.commandHistoryIndex !== -1) {
                if (state.commandHistoryIndex < state.commandHistory.length - 1) {
                    state.commandHistoryIndex++;
                } else {
                    state.commandHistoryIndex = -1;
                    this.inputEl.value = '';
                    return;
                }
            }
        }

        if (state.commandHistoryIndex >= 0 && state.commandHistoryIndex < state.commandHistory.length) {
            this.inputEl.value = state.commandHistory[state.commandHistoryIndex];
            this.inputEl.setSelectionRange(this.inputEl.value.length, this.inputEl.value.length);
        }
    }

    renderPastCommands() {
        if (!this.pastBar || !this.pastList) return;
        if (state.commandHistory.length === 0) {
            this.pastBar.classList.add('hidden');
            return;
        }

        this.pastBar.classList.remove('hidden');
        const latest = state.commandHistory[state.commandHistory.length - 1];
        if (this.pastLatestText) this.pastLatestText.textContent = latest;

        this.pastList.innerHTML = '';
        const reversed = [...state.commandHistory].reverse().slice(0, 15);
        reversed.forEach(cmd => {
            const item = document.createElement('div');
            item.className = 'px-2 py-1 hover:bg-gray-800 rounded cursor-pointer text-gray-300 font-mono truncate flex items-center justify-between group';
            item.innerHTML = `
                <span class="truncate">${cmd}</span>
                <span class="text-[10px] text-gray-500 group-hover:text-emerald-400 font-sans">Executar</span>
            `;
            item.addEventListener('click', () => {
                this.executeDirect(cmd);
                if (this.pastList) this.pastList.classList.add('hidden');
            });
            this.pastList.appendChild(item);
        });
    }

    updatePromptCwd(fullCwd) {
        if (!this.promptCwdEl) return;
        if (this.isCurrentTabAgy()) {
            this.promptCwdEl.textContent = '✨ agy';
            this.promptCwdEl.className = 'text-indigo-400 font-bold prompt-line';
            return;
        }
        this.promptCwdEl.className = 'text-amber-400 group-hover:underline font-semibold prompt-line';
        if (!fullCwd || fullCwd === '/' || fullCwd === process.env.HOME) {
            this.promptCwdEl.textContent = '~';
            return;
        }
        const parts = fullCwd.replace(/[\\/]+$/, '').split(/[\\/]/).filter(Boolean);
        const short = parts.length <= 2 ? parts.join('/') : parts.slice(-2).join('/');
        this.promptCwdEl.textContent = short;
    }
}

export const quickBarManager = new QuickBarManager();

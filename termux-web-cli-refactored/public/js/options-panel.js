/**
 * Interactive Options & Multiple Choice Panel
 */
import { wsClient } from './ws.js';
import { state } from './state.js';

class OptionsPanel {
    constructor() {
        this.panel = null;
        this.titleEl = null;
        this.listEl = null;
        this.timerBg = null;
        this.timerBar = null;
        this.timerInterval = null;
    }

    init() {
        this.panel = document.getElementById('interactive-options-panel');
        this.titleEl = document.getElementById('options-panel-title');
        this.listEl = document.getElementById('interactive-options-list');
        this.timerBg = document.getElementById('options-timer-progress-bg');
        this.timerBar = document.getElementById('options-timer-progress-bar');
    }

    show(options, title = 'Selecione uma opção:', timeoutMs = 0) {
        this.init();
        if (!this.panel || !this.listEl) return;

        this.titleEl.textContent = title;
        this.listEl.innerHTML = '';

        options.forEach((opt, idx) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'w-full text-left px-3 py-2 bg-gray-800/80 hover:bg-gray-700/80 border border-gray-700/60 rounded-lg text-xs font-mono text-gray-200 active:scale-[0.98] transition-all flex items-center justify-between group';
            btn.innerHTML = `
                <span class="truncate">${opt.label || opt}</span>
                <span class="text-[10px] text-gray-400 group-hover:text-emerald-400 font-sans">#${idx + 1}</span>
            `;
            btn.addEventListener('click', () => {
                const value = opt.value !== undefined ? opt.value : (opt.label || opt);
                wsClient.send({
                    action: 'input',
                    tabId: state.activeTabId,
                    data: String(value)
                });
                this.hide();
            });
            this.listEl.appendChild(btn);
        });

        this.panel.classList.remove('hidden');

        if (timeoutMs > 0 && this.timerBg && this.timerBar) {
            this.timerBg.classList.remove('hidden');
            this.timerBar.style.width = '100%';
            const startTime = Date.now();

            clearInterval(this.timerInterval);
            this.timerInterval = setInterval(() => {
                const elapsed = Date.now() - startTime;
                const remaining = Math.max(0, 100 - (elapsed / timeoutMs) * 100);
                this.timerBar.style.width = `${remaining}%`;

                if (remaining <= 0) {
                    clearInterval(this.timerInterval);
                    this.hide();
                }
            }, 100);
        } else if (this.timerBg) {
            this.timerBg.classList.add('hidden');
        }
    }

    hide() {
        if (this.panel) this.panel.classList.add('hidden');
        clearInterval(this.timerInterval);
    }
}

export const optionsPanel = new OptionsPanel();

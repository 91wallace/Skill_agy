/**
 * Tab Bar & Session Switcher Manager
 */
import { state } from './state.js';
import { wsClient } from './ws.js';
import { xtermManager } from './xterm-manager.js';

class TabManager {
    constructor() {
        this.tabsListEl = null;
        this.addTabBtn = null;
        this.addAgyTabBtn = null;
    }

    init() {
        this.tabsListEl = document.getElementById('tabs-list');
        this.addTabBtn = document.getElementById('btn-add-tab');
        this.addAgyTabBtn = document.getElementById('btn-add-agy-tab');

        if (this.addTabBtn) {
            this.addTabBtn.addEventListener('click', () => {
                const newId = 'tab-' + Date.now().toString(36);
                wsClient.send({ action: 'create_tab', newTabId: newId });
            });
        }

        if (this.addAgyTabBtn) {
            this.addAgyTabBtn.addEventListener('click', () => {
                const newId = 'agy-' + Date.now().toString(36);
                wsClient.send({
                    action: 'create_tab',
                    newTabId: newId,
                    title: 'AGY Assistente',
                    isAgyMode: true
                });
            });
        }

        wsClient.on('tabs_list', (msg) => {
            state.tabs = msg.tabs || [];
            this.renderTabs();
        });

        wsClient.on('tab_created', (msg) => {
            state.activeTabId = msg.tabId;
            wsClient.send({ action: 'sync_tab', tabId: msg.tabId });
            this.renderTabs();
            state.notify('tab_switched', msg.tabId);
        });

        wsClient.on('tab_closed', (msg) => {
            state.sessionsData.delete(msg.tabId);
            if (state.activeTabId === msg.tabId && state.tabs.length > 0) {
                const remaining = state.tabs.filter(t => t.id !== msg.tabId);
                if (remaining.length > 0) {
                    state.activeTabId = remaining[remaining.length - 1].id;
                    wsClient.send({ action: 'sync_tab', tabId: state.activeTabId });
                    state.notify('tab_switched', state.activeTabId);
                }
            }
            this.renderTabs();
        });
    }

    renderTabs() {
        if (!this.tabsListEl) return;
        this.tabsListEl.innerHTML = '';

        state.tabs.forEach(tab => {
            const isActive = tab.id === state.activeTabId;
            const tabEl = document.createElement('div');
            tabEl.className = `tab-item ${isActive ? 'tab-active' : ''} ${tab.isAgyMode ? 'tab-agy-mode' : ''}`;
            tabEl.setAttribute('data-tab-id', tab.id);

            // Icon by environment
            let iconSvg = '';
            if (tab.isSsh) {
                iconSvg = `<span class="w-2 h-2 rounded-full bg-emerald-400 shrink-0"></span>`;
            } else if (tab.isAgyMode) {
                iconSvg = `<span class="w-2 h-2 rounded-full bg-indigo-400 shadow-[0_0_6px_rgba(129,140,248,0.8)] shrink-0"></span>`;
            } else {
                iconSvg = `<span class="w-2 h-2 rounded-full bg-blue-400 shrink-0"></span>`;
            }

            tabEl.innerHTML = `
                ${iconSvg}
                <span class="tab-title-text truncate max-w-[110px] ${tab.isAgyMode ? 'text-indigo-200' : ''}">${tab.title || 'Terminal'}</span>
                <button type="button" class="tab-close-btn" title="Fechar aba">&times;</button>
            `;

            tabEl.addEventListener('click', (e) => {
                if (e.target.classList.contains('tab-close-btn')) {
                    e.stopPropagation();
                    wsClient.send({ action: 'close_tab', targetTabId: tab.id });
                    return;
                }
                if (state.activeTabId !== tab.id) {
                    state.activeTabId = tab.id;
                    wsClient.send({ action: 'sync_tab', tabId: tab.id });
                    this.renderTabs();
                    state.notify('tab_switched', tab.id);
                }
            });

            this.tabsListEl.appendChild(tabEl);
        });
    }
}

export const tabManager = new TabManager();

/**
 * Directory Tree & File Explorer Manager
 */
import { wsClient } from './ws.js';
import { state } from './state.js';

class DirectoryTreeManager {
    constructor() {
        this.panel = null;
        this.cwdLabel = null;
        this.contentEl = null;
        this.isOpen = false;
        this.currentBrowsingPath = null;
    }

    init() {
        this.panel = document.getElementById('directory-tree-panel');
        this.cwdLabel = document.getElementById('tree-current-cwd');
        this.contentEl = document.getElementById('directory-tree-content');

        const btnClose = document.getElementById('btn-close-dir-tree');
        if (btnClose) {
            btnClose.addEventListener('click', () => this.hide());
        }

        const btnUp = document.getElementById('btn-tree-up');
        if (btnUp) {
            btnUp.addEventListener('click', () => {
                if (this.currentBrowsingPath) {
                    const parentPath = this.currentBrowsingPath.split('/').slice(0, -1).join('/') || '/';
                    this.browse(parentPath);
                }
            });
        }

        wsClient.on('dir_list_result', (msg) => {
            if (msg.tabId === state.activeTabId) {
                this.render(msg.path, msg.items || [], msg.error);
            }
        });
    }

    toggle(targetPath = null) {
        if (this.isOpen) {
            this.hide();
        } else {
            this.show(targetPath);
        }
    }

    show(targetPath = null) {
        this.init();
        if (!this.panel) return;
        this.panel.classList.remove('hidden');
        this.isOpen = true;
        const currentSession = state.sessionsData.get(state.activeTabId);
        const initialPath = targetPath || (currentSession ? currentSession.cwd : '~');
        this.browse(initialPath);
    }

    hide() {
        if (this.panel) this.panel.classList.add('hidden');
        this.isOpen = false;
    }

    browse(dirPath) {
        this.currentBrowsingPath = dirPath;
        if (this.cwdLabel) this.cwdLabel.textContent = dirPath;
        if (this.contentEl) this.contentEl.innerHTML = '<div class="text-gray-400 p-2 text-center text-xs">Carregando...</div>';

        wsClient.send({
            action: 'list_dir',
            tabId: state.activeTabId,
            path: dirPath,
            showHidden: state.showHiddenFiles
        });
    }

    render(dirPath, items, error) {
        if (!this.contentEl) return;
        this.currentBrowsingPath = dirPath;
        if (this.cwdLabel) this.cwdLabel.textContent = dirPath;

        if (error) {
            this.contentEl.innerHTML = `<div class="text-rose-400 p-2 text-xs">Erro: ${error}</div>`;
            return;
        }

        if (items.length === 0) {
            this.contentEl.innerHTML = '<div class="text-gray-400 p-2 text-xs text-center">Diretório vazio</div>';
            return;
        }

        this.contentEl.innerHTML = '';
        items.forEach(item => {
            const row = document.createElement('div');
            row.className = 'flex items-center gap-2 px-2 py-1.5 hover:bg-gray-800/70 rounded-md cursor-pointer text-xs transition-colors group';

            if (item.isDirectory) {
                row.innerHTML = `
                    <svg class="tree-dir-icon w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"></path>
                    </svg>
                    <span class="tree-dir-name truncate font-medium flex-1">${item.name}</span>
                    <button type="button" class="btn-cd-inline text-[10px] text-gray-400 hover:text-emerald-400 opacity-0 group-hover:opacity-100 px-1.5 py-0.5 rounded bg-gray-750 font-sans transition-opacity">cd</button>
                `;

                row.addEventListener('click', (e) => {
                    if (e.target.classList.contains('btn-cd-inline')) {
                        const newPath = `${dirPath.replace(/\/$/, '')}/${item.name}`;
                        wsClient.send({ action: 'command', tabId: state.activeTabId, data: `cd "${newPath}"` });
                        this.hide();
                    } else {
                        const nextDir = `${dirPath.replace(/\/$/, '')}/${item.name}`;
                        this.browse(nextDir);
                    }
                });
            } else {
                row.innerHTML = `
                    <svg class="tree-file-icon w-3.5 h-3.5 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path>
                    </svg>
                    <span class="tree-file-name truncate text-gray-300 flex-1">${item.name}</span>
                `;
            }

            this.contentEl.appendChild(row);
        });
    }
}

export const dirTreeManager = new DirectoryTreeManager();

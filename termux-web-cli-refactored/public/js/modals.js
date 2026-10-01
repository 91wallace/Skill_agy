/**
 * Bottom Sheets & Modals Manager (SSH, Snippets, Clipboard, Settings)
 */
import { state } from './state.js';
import { wsClient } from './ws.js';

class ModalManager {
    constructor() {
        this.activeModal = null;
    }

    init() {
        this.setupSSHModal();
        this.setupSnippetsModal();
        this.setupClipboardModal();
        this.setupSettingsModal();
    }

    openModal(modalId, sheetId) {
        const modal = document.getElementById(modalId);
        const sheet = document.getElementById(sheetId);
        if (!modal) return;

        modal.classList.remove('hidden');
        requestAnimationFrame(() => {
            modal.classList.remove('opacity-0');
            if (sheet) {
                sheet.classList.remove('translate-y-full', 'scale-95');
            }
        });
        this.activeModal = { modalId, sheetId };
    }

    closeModal(modalId, sheetId) {
        const modal = document.getElementById(modalId);
        const sheet = document.getElementById(sheetId);
        if (!modal) return;

        if (sheet) {
            if (sheetId === 'settings-card') sheet.classList.add('scale-95');
            else sheet.classList.add('translate-y-full');
        }
        modal.classList.add('opacity-0');

        setTimeout(() => {
            modal.classList.add('hidden');
            if (this.activeModal && this.activeModal.modalId === modalId) {
                this.activeModal = null;
            }
        }, 200);
    }

    // 1. SSH Modal
    setupSSHModal() {
        const toggleBtn = document.getElementById('btn-ssh-toggle');
        const modal = document.getElementById('ssh-modal');
        const backdrop = document.getElementById('ssh-backdrop');
        const closeBtn = document.getElementById('btn-close-ssh');
        const toggleAddBtn = document.getElementById('btn-toggle-add-ssh');
        const formContainer = document.getElementById('ssh-form-container');
        const cancelFormBtn = document.getElementById('btn-cancel-ssh-form');
        const saveProfileBtn = document.getElementById('btn-save-ssh-profile');
        const connectDirectBtn = document.getElementById('btn-connect-ssh-direct');

        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                this.renderSSHProfiles();
                this.openModal('ssh-modal', 'ssh-sheet');
            });
        }
        if (backdrop) backdrop.addEventListener('click', () => this.closeModal('ssh-modal', 'ssh-sheet'));
        if (closeBtn) closeBtn.addEventListener('click', () => this.closeModal('ssh-modal', 'ssh-sheet'));

        if (toggleAddBtn && formContainer) {
            toggleAddBtn.addEventListener('click', () => {
                formContainer.classList.toggle('hidden');
            });
        }
        if (cancelFormBtn && formContainer) {
            cancelFormBtn.addEventListener('click', () => {
                formContainer.classList.add('hidden');
            });
        }

        // Auth type radio switch
        document.querySelectorAll('input[name="ssh-auth-type"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                const passField = document.getElementById('ssh-auth-password-field');
                const keyField = document.getElementById('ssh-auth-key-field');
                if (e.target.value === 'password') {
                    if (passField) passField.classList.remove('hidden');
                    if (keyField) keyField.classList.add('hidden');
                } else {
                    if (passField) passField.classList.add('hidden');
                    if (keyField) keyField.classList.remove('hidden');
                }
            });
        });

        // Direct connect action
        if (connectDirectBtn) {
            connectDirectBtn.addEventListener('click', () => {
                const host = document.getElementById('ssh-host-input').value.trim();
                const port = document.getElementById('ssh-port-input').value.trim() || 22;
                const user = document.getElementById('ssh-user-input').value.trim() || 'root';
                const authType = document.querySelector('input[name="ssh-auth-type"]:checked').value;
                const password = document.getElementById('ssh-password-input').value;
                const key = document.getElementById('ssh-key-input').value;

                if (!host) {
                    alert('Por favor, informe o host ou IP.');
                    return;
                }

                wsClient.send({
                    action: 'ssh_connect',
                    tabId: state.activeTabId,
                    host,
                    port,
                    username: user,
                    password: authType === 'password' ? password : undefined,
                    privateKey: authType === 'key' ? key : undefined
                });

                this.closeModal('ssh-modal', 'ssh-sheet');
            });
        }

        // Save profile
        if (saveProfileBtn) {
            saveProfileBtn.addEventListener('click', () => {
                const label = document.getElementById('ssh-label-input').value.trim() || 'Novo Host';
                const host = document.getElementById('ssh-host-input').value.trim();
                const port = document.getElementById('ssh-port-input').value.trim() || 22;
                const user = document.getElementById('ssh-user-input').value.trim() || 'root';
                if (!host) return;

                state.sshProfiles.push({ label, host, port, username: user });
                state.saveSshProfiles();
                this.renderSSHProfiles();
                if (formContainer) formContainer.classList.add('hidden');
            });
        }
    }

    renderSSHProfiles() {
        const listEl = document.getElementById('ssh-profiles-list');
        if (!listEl) return;
        listEl.innerHTML = '';

        if (state.sshProfiles.length === 0) {
            listEl.innerHTML = '<div class="text-gray-400 p-4 text-center text-xs">Nenhum host SSH salvo. Clique em "+ Novo Host" acima.</div>';
            return;
        }

        state.sshProfiles.forEach((p, idx) => {
            const card = document.createElement('div');
            card.className = 'flex items-center justify-between p-2.5 bg-gray-800/80 hover:bg-gray-750 border border-gray-700/60 rounded-xl cursor-pointer text-xs transition-colors group';
            card.innerHTML = `
                <div class="flex flex-col truncate">
                    <span class="font-semibold text-gray-100 truncate">${p.label}</span>
                    <span class="font-mono text-[11px] text-emerald-400">${p.username}@${p.host}:${p.port}</span>
                </div>
                <div class="flex items-center gap-2">
                    <button type="button" class="btn-ssh-connect bg-emerald-600 hover:bg-emerald-500 text-white px-2.5 py-1 rounded-lg text-xs font-semibold">Conectar</button>
                    <button type="button" class="btn-ssh-delete text-gray-400 hover:text-red-400 p-1 text-xs">&times;</button>
                </div>
            `;

            card.querySelector('.btn-ssh-connect').addEventListener('click', (e) => {
                e.stopPropagation();
                wsClient.send({
                    action: 'ssh_connect',
                    tabId: state.activeTabId,
                    host: p.host,
                    port: p.port,
                    username: p.username
                });
                this.closeModal('ssh-modal', 'ssh-sheet');
            });

            card.querySelector('.btn-ssh-delete').addEventListener('click', (e) => {
                e.stopPropagation();
                state.sshProfiles.splice(idx, 1);
                state.saveSshProfiles();
                this.renderSSHProfiles();
            });

            listEl.appendChild(card);
        });
    }

    // 2. Snippets Modal
    setupSnippetsModal() {
        const toggleBtn = document.getElementById('btn-snippets-toggle');
        const backdrop = document.getElementById('snippets-backdrop');
        const closeBtn = document.getElementById('btn-close-snippets');
        const toggleAddBtn = document.getElementById('btn-toggle-add-snippet');
        const formContainer = document.getElementById('snippet-form-container');
        const cancelBtn = document.getElementById('btn-cancel-add-snippet');
        const saveBtn = document.getElementById('btn-save-snippet');

        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                this.renderSnippets();
                this.openModal('snippets-modal', 'snippets-sheet');
            });
        }
        if (backdrop) backdrop.addEventListener('click', () => this.closeModal('snippets-modal', 'snippets-sheet'));
        if (closeBtn) closeBtn.addEventListener('click', () => this.closeModal('snippets-modal', 'snippets-sheet'));

        if (toggleAddBtn && formContainer) {
            toggleAddBtn.addEventListener('click', () => formContainer.classList.toggle('hidden'));
        }
        if (cancelBtn && formContainer) {
            cancelBtn.addEventListener('click', () => formContainer.classList.add('hidden'));
        }

        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                const name = document.getElementById('snippet-name-input').value.trim();
                const cmd = document.getElementById('snippet-cmd-input').value.trim();
                if (!name || !cmd) return;

                state.snippets.push({ name, cmd });
                state.saveSnippets();
                this.renderSnippets();
                if (formContainer) formContainer.classList.add('hidden');
                document.getElementById('snippet-name-input').value = '';
                document.getElementById('snippet-cmd-input').value = '';
            });
        }
    }

    renderSnippets() {
        const listEl = document.getElementById('snippets-list');
        if (!listEl) return;
        listEl.innerHTML = '';

        state.snippets.forEach((s, idx) => {
            const card = document.createElement('div');
            card.className = 'flex items-center justify-between p-2.5 bg-gray-800/70 hover:bg-gray-750 border border-gray-700/50 rounded-xl cursor-pointer text-xs transition-colors group';
            card.innerHTML = `
                <div class="flex flex-col truncate flex-1 pr-2">
                    <span class="font-semibold text-gray-200">${s.name}</span>
                    <span class="font-mono text-[11px] text-gray-400 truncate">${s.cmd}</span>
                </div>
                <div class="flex items-center gap-2">
                    <button type="button" class="btn-run-snippet bg-blue-600 hover:bg-blue-500 text-white px-2.5 py-1 rounded-lg font-semibold text-xs">Rodar</button>
                    <button type="button" class="btn-del-snippet text-gray-400 hover:text-red-400 p-1 text-xs">&times;</button>
                </div>
            `;

            card.querySelector('.btn-run-snippet').addEventListener('click', (e) => {
                e.stopPropagation();
                wsClient.send({ action: 'command', tabId: state.activeTabId, data: s.cmd });
                this.closeModal('snippets-modal', 'snippets-sheet');
            });

            card.querySelector('.btn-del-snippet').addEventListener('click', (e) => {
                e.stopPropagation();
                state.snippets.splice(idx, 1);
                state.saveSnippets();
                this.renderSnippets();
            });

            listEl.appendChild(card);
        });
    }

    // 3. Clipboard Modal
    setupClipboardModal() {
        const toggleBtn = document.getElementById('btn-clipboard-toggle');
        const backdrop = document.getElementById('clipboard-backdrop');
        const closeBtn = document.getElementById('btn-close-clipboard');
        const syncBtn = document.getElementById('btn-clipboard-sync');
        const clearBtn = document.getElementById('btn-clipboard-clear-all');

        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                this.renderClipboard();
                this.openModal('clipboard-modal', 'clipboard-sheet');
            });
        }
        if (backdrop) backdrop.addEventListener('click', () => this.closeModal('clipboard-modal', 'clipboard-sheet'));
        if (closeBtn) closeBtn.addEventListener('click', () => this.closeModal('clipboard-modal', 'clipboard-sheet'));

        if (syncBtn) {
            syncBtn.addEventListener('click', async () => {
                try {
                    const text = await navigator.clipboard.readText();
                    if (text) {
                        state.addClipboardItem(text);
                        this.renderClipboard();
                    }
                } catch (err) {
                    alert('Permissão de área de transferência negada pelo navegador.');
                }
            });
        }

        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                state.clipboardHistory = [];
                state.saveClipboard();
                this.renderClipboard();
            });
        }
    }

    renderClipboard() {
        const listEl = document.getElementById('clipboard-list');
        if (!listEl) return;
        listEl.innerHTML = '';

        if (state.clipboardHistory.length === 0) {
            listEl.innerHTML = '<div class="text-gray-400 p-4 text-center text-xs">Área de transferência vazia.</div>';
            return;
        }

        state.clipboardHistory.forEach((text, idx) => {
            const card = document.createElement('div');
            card.className = 'flex items-center justify-between p-2 bg-gray-800/70 hover:bg-gray-750 border border-gray-700/50 rounded-lg cursor-pointer text-xs transition-colors group';
            card.innerHTML = `
                <span class="font-mono text-[11.5px] text-gray-200 truncate flex-1 pr-2">${text}</span>
                <button type="button" class="btn-paste-clip bg-purple-600 hover:bg-purple-500 text-white px-2 py-0.5 rounded text-xs">Inserir</button>
            `;

            card.querySelector('.btn-paste-clip').addEventListener('click', () => {
                const input = document.getElementById('command-input');
                if (input) {
                    input.value = text;
                    input.focus();
                }
                this.closeModal('clipboard-modal', 'clipboard-sheet');
            });

            listEl.appendChild(card);
        });
    }

    // 4. Settings Modal
    setupSettingsModal() {
        const toggleBtn = document.getElementById('btn-settings-toggle');
        const backdrop = document.getElementById('settings-backdrop');
        const closeBtn = document.getElementById('btn-close-settings');
        const hiddenToggle = document.getElementById('toggle-show-hidden');
        const resetColorsBtn = document.getElementById('btn-reset-colors');

        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                this.updateSettingsUI();
                this.openModal('settings-modal', 'settings-card');
            });
        }
        if (backdrop) backdrop.addEventListener('click', () => this.closeModal('settings-modal', 'settings-card'));
        if (closeBtn) closeBtn.addEventListener('click', () => this.closeModal('settings-modal', 'settings-card'));

        if (hiddenToggle) {
            hiddenToggle.checked = state.showHiddenFiles;
            hiddenToggle.addEventListener('change', (e) => {
                state.showHiddenFiles = e.target.checked;
                localStorage.setItem('termux_cli_show_hidden', state.showHiddenFiles);
            });
        }

        // Setup Swatches
        this.setupSwatches('swatches-prompt', 'prompt');
        this.setupSwatches('swatches-dirs', 'dir');
        this.setupSwatches('swatches-files', 'file');

        if (resetColorsBtn) {
            resetColorsBtn.addEventListener('click', () => {
                state.colors = { prompt: '#facc15', dir: '#facc15', file: '#9ca3af' };
                state.saveColors();
                this.updateSettingsUI();
            });
        }
    }

    setupSwatches(containerId, colorKey) {
        const container = document.getElementById(containerId);
        if (!container) return;
        container.querySelectorAll('.color-swatch-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const color = btn.getAttribute('data-color');
                state.colors[colorKey] = color;
                state.saveColors();
                this.updateSettingsUI();
            });
        });
    }

    updateSettingsUI() {
        const highlightSwatches = (containerId, activeColor) => {
            const container = document.getElementById(containerId);
            if (!container) return;
            container.querySelectorAll('.color-swatch-btn').forEach(btn => {
                if (btn.getAttribute('data-color') === activeColor) {
                    btn.classList.add('active-swatch');
                } else {
                    btn.classList.remove('active-swatch');
                }
            });
        };

        highlightSwatches('swatches-prompt', state.colors.prompt);
        highlightSwatches('swatches-dirs', state.colors.dir);
        highlightSwatches('swatches-files', state.colors.file);
    }
}

export const modalManager = new ModalManager();

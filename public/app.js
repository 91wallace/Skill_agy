let ws;
const reconnectInterval = 2000;
let isFirstSync = true;
let wakeLock = null;

// Gerenciamento de Múltiplas Abas de Terminal
const tabsListContainer = document.getElementById('tabs-list');
const btnAddTab = document.getElementById('btn-add-tab');

let activeTabId = 'tab-1';
const tabsMap = new Map(); // tabId -> { id, title, cwd, envType, envLabel, isRunning, isPty, isSsh, sshHost, logsHtml: '', pastCommands: [], activeCmd: null, activeProcessCardState: null }

function getOrCreateTabData(tabId, title = null) {
    if (!tabsMap.has(tabId)) {
        tabsMap.set(tabId, {
            id: tabId,
            title: title || 'Terminal',
            cwd: '~',
            envType: 'termux', // 'termux' | 'distro' | 'ssh'
            envLabel: 'Terminal',
            isRunning: false,
            isPty: false,
            isSsh: false,
            sshHost: null,
            outputHtml: '',
            pastCommandsHistory: [],
            activeCommandTracker: null,
            activeProcessCard: null
        });
    }
    return tabsMap.get(tabId);
}

// Inicializa a primeira aba
getOrCreateTabData('tab-1');

// Retorna o SVG de ícone e tag correspondente ao tipo de ambiente
function getEnvBadgeInfo(tab) {
    const isSsh = tab.isSsh || tab.envType === 'ssh';
    if (isSsh) {
        return {
            type: 'ssh',
            badgeClass: 'tab-env-ssh',
            iconSvg: `<svg class="w-3.5 h-3.5 text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01"></path></svg>`
        };
    }

    const env = (tab.envType || '').toLowerCase();
    const label = (tab.envLabel || '').toLowerCase();

    if (env === 'distro' || label.includes('ubuntu') || label.includes('debian') || label.includes('arch') || label.includes('proot') || label.includes('alpine') || label.includes('linux')) {
        return {
            type: 'distro',
            badgeClass: 'tab-env-distro',
            iconSvg: `<svg class="w-3.5 h-3.5 text-orange-400 shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/></svg>`
        };
    }

    // Padrão Termux
    return {
        type: 'termux',
        badgeClass: 'tab-env-termux',
        iconSvg: `<svg class="w-3.5 h-3.5 text-cyan-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>`
    };
}

function renderTabsBar() {
    if (!tabsListContainer) return;
    tabsListContainer.innerHTML = '';

    tabsMap.forEach((tab, id) => {
        const tabEl = document.createElement('div');
        const isActive = id === activeTabId;
        const envInfo = getEnvBadgeInfo(tab);
        tabEl.className = `tab-item ${isActive ? 'active' : ''} ${envInfo.badgeClass}`;
        
        let statusIndicator = '';
        if (tab.isSsh) {
            statusIndicator = `<span class="tab-running-dot ssh ${tab.isRunning ? 'animate-pulse' : ''}" title="Sessão Remota SSH"></span>`;
        } else if (tab.isRunning) {
            statusIndicator = `<span class="tab-running-dot ${tab.isPty ? 'pty' : ''}" title="${tab.isPty ? 'Sessão Interativa PTY' : 'Processo em Execução'}"></span>`;
        }

        const canClose = tabsMap.size > 1;

        tabEl.innerHTML = `
            ${statusIndicator}
            ${envInfo.iconSvg}
            <span class="truncate max-w-[120px] font-mono">${escapeHtml(tab.title || id)}</span>
            ${canClose ? `<span class="tab-close-btn" title="Fechar aba">&times;</span>` : ''}
        `;

        tabEl.addEventListener('click', (e) => {
            if (e.target.classList.contains('tab-close-btn')) {
                e.stopPropagation();
                closeTab(id);
                return;
            }
            switchTab(id);
        });

        tabsListContainer.appendChild(tabEl);
    });
}

function switchTab(newTabId) {
    if (!tabsMap.has(newTabId)) return;
    
    // Salva o estado atual da aba ativa no objeto
    const currentTab = tabsMap.get(activeTabId);
    if (currentTab) {
        currentTab.outputHtml = terminalOutput ? terminalOutput.innerHTML : '';
        currentTab.pastCommandsHistory = [...pastCommandsHistory];
        currentTab.activeCommandTracker = activeCommandTracker ? { ...activeCommandTracker } : null;
        currentTab.activeProcessCard = activeProcessCard;
        currentTab.cwd = activeCwd;
    }

    activeTabId = newTabId;
    const targetTab = tabsMap.get(newTabId);

    // Restaura o estado da nova aba
    if (targetTab) {
        activeCwd = targetTab.cwd || '~';
        pastCommandsHistory = [...(targetTab.pastCommandsHistory || [])];
        activeCommandTracker = targetTab.activeCommandTracker ? { ...targetTab.activeCommandTracker } : null;
        activeProcessCard = targetTab.activeProcessCard;
        if (terminalOutput) {
            terminalOutput.innerHTML = targetTab.outputHtml || '';
        }
        updateCwdDisplay(activeCwd);
        renderPastCommandsBar();
        setProcessing(targetTab.isRunning);
    }

    renderTabsBar();
    scrollToBottom();
}

function createNewTab() {
    const newId = 'tab-' + Date.now().toString(36);
    const newTabData = getOrCreateTabData(newId);
    newTabData.cwd = activeCwd || '~';

    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            action: 'create_tab',
            newTabId: newId,
            cwd: activeCwd || null
        }));
    }
    switchTab(newId);
}

function closeTab(targetId) {
    if (tabsMap.size <= 1) return;
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            action: 'close_tab',
            targetTabId: targetId
        }));
    }
    tabsMap.delete(targetId);
    if (activeTabId === targetId) {
        const remainingIds = Array.from(tabsMap.keys());
        switchTab(remainingIds[remainingIds.length - 1]);
    } else {
        renderTabsBar();
    }
}

if (btnAddTab) {
    btnAddTab.addEventListener('click', () => createNewTab());
}

let activeCwd = '~';
let pendingTreeRequests = new Map();

const MIN_FONT_SIZE = 9;
const MAX_FONT_SIZE = 28;
let currentFontSize = parseFloat(localStorage.getItem('termux_terminal_font_size')) || 13;

const terminalOutput = document.getElementById('terminal-output');
const terminalContainer = document.getElementById('terminal-container');
const commandInput = document.getElementById('command-input');
const btnRun = document.getElementById('btn-run');
const statusText = document.getElementById('status-text');
const statusDot = document.getElementById('status-dot');
const btnClear = document.getElementById('btn-clear');
const btnCancel = document.getElementById('btn-cancel');
const shortcutBtns = document.querySelectorAll('.shortcut-btn');

// Elementos da Barra de Comandos Anteriores (Histórico Expansível no Topo)
const pastCommandsBar = document.getElementById('past-commands-bar');
const pastCommandsHeader = document.getElementById('past-commands-header');
const pastCommandsLatestText = document.getElementById('past-commands-latest-text');
const btnTogglePastCommands = document.getElementById('btn-toggle-past-commands');
const pastCommandsList = document.getElementById('past-commands-list');

let pastCommandsHistory = []; // Armazena os comandos anteriores finalizados com seus outputs (exclui o atual)
let activeCommandTracker = null; // Armazena o comando atualmente ativo/em execução

function addPastCommand(dir, cmd, outputHtml = '') {
    if (!cmd) return;
    const item = {
        dir: dir || '~',
        cmd: cmd,
        output: outputHtml || '',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    pastCommandsHistory.push(item);
    if (pastCommandsHistory.length > 100) {
        pastCommandsHistory.shift();
    }
    renderPastCommandsBar();
}

function renderPastCommandsBar() {
    if (!pastCommandsBar) return;
    if (pastCommandsHistory.length === 0) {
        pastCommandsBar.classList.add('hidden');
        return;
    }
    pastCommandsBar.classList.remove('hidden');
    // O mais recente anterior ao atual é o último de pastCommandsHistory
    const latestPast = pastCommandsHistory[pastCommandsHistory.length - 1];
    if (pastCommandsLatestText) {
        pastCommandsLatestText.textContent = `${latestPast.dir} $ ${latestPast.cmd}`;
        pastCommandsLatestText.title = `${latestPast.dir} $ ${latestPast.cmd}`;
    }

    if (pastCommandsList) {
        pastCommandsList.innerHTML = '';
        // Renderiza todos os comandos anteriores em ordem cronológica reversa (mais recente no topo)
        [...pastCommandsHistory].reverse().forEach((item) => {
            const row = document.createElement('div');
            row.className = 'past-history-row px-2.5 py-1.5 rounded-lg hover:bg-gray-800/80 cursor-pointer flex flex-col gap-1 transition-all text-xs border border-gray-800/70 bg-gray-850/50';
            
            const hasOutput = item.output && item.output.trim().length > 0;
            const outputId = 'past-out-' + Math.random().toString(36).substr(2, 9);

            row.innerHTML = `
                <div class="past-history-header flex items-center justify-between gap-2.5">
                    <div class="flex items-center gap-2 min-w-0 flex-1 truncate">
                        <span class="text-gray-500 text-[10.5px] shrink-0 font-sans">${item.timestamp}</span>
                        <span class="text-gray-400 truncate"><span class="text-yellow-400 font-medium">${escapeHtml(item.dir)}</span> <span class="text-gray-500">$</span> <span class="text-gray-200 font-semibold">${escapeHtml(item.cmd)}</span></span>
                    </div>
                    <div class="flex items-center gap-1 shrink-0">
                        ${hasOutput ? `
                            <button type="button" class="btn-toggle-past-output text-gray-400 hover:text-gray-200 p-1 rounded hover:bg-gray-700/50 text-xs flex items-center justify-center transition-transform" title="Ver saída do comando">
                                <svg class="chevron-past-item w-3.5 h-3.5 transition-transform duration-150" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"></path>
                                </svg>
                            </button>
                        ` : ''}
                        <button type="button" class="btn-insert-past-cmd text-gray-500 hover:text-green-400 p-1 rounded hover:bg-gray-700/50 text-xs flex items-center justify-center active:scale-95 transition-transform" title="Inserir comando no campo">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path>
                            </svg>
                        </button>
                    </div>
                </div>
                ${hasOutput ? `
                    <div id="${outputId}" class="past-history-output hidden whitespace-pre-wrap font-mono text-[11px] p-2 mt-1 rounded bg-black/60 border border-gray-800 text-gray-300 max-h-48 overflow-y-auto">
                        ${item.output}
                    </div>
                ` : ''}
            `;

            const insertBtn = row.querySelector('.btn-insert-past-cmd');
            if (insertBtn) {
                insertBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (commandInput) {
                        commandInput.value = item.cmd;
                        commandInput.focus();
                    }
                });
            }

            const headerDiv = row.querySelector('.past-history-header');
            const toggleOutputBtn = row.querySelector('.btn-toggle-past-output');
            const outputDiv = hasOutput ? row.querySelector(`#${outputId}`) : null;
            const chevronIcon = row.querySelector('.chevron-past-item');

            const toggleOutput = () => {
                if (!outputDiv) return;
                const isHidden = outputDiv.classList.contains('hidden');
                if (isHidden) {
                    outputDiv.classList.remove('hidden');
                    if (chevronIcon) chevronIcon.style.transform = 'rotate(180deg)';
                } else {
                    outputDiv.classList.add('hidden');
                    if (chevronIcon) chevronIcon.style.transform = 'rotate(0deg)';
                }
            };

            if (headerDiv) {
                headerDiv.addEventListener('click', () => {
                    if (hasOutput) {
                        toggleOutput();
                    } else if (commandInput) {
                        commandInput.value = item.cmd;
                        commandInput.focus();
                    }
                });
            }

            if (toggleOutputBtn) {
                toggleOutputBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    toggleOutput();
                });
            }

            pastCommandsList.appendChild(row);
        });
    }
}

function togglePastCommandsList() {
    if (!pastCommandsList || !pastCommandsBar) return;
    const isHidden = pastCommandsList.classList.contains('hidden');
    if (isHidden) {
        pastCommandsList.classList.remove('hidden');
        pastCommandsBar.classList.add('open');
    } else {
        pastCommandsList.classList.add('hidden');
        pastCommandsBar.classList.remove('open');
    }
}

if (pastCommandsHeader) {
    pastCommandsHeader.addEventListener('click', () => togglePastCommandsList());
}
if (btnTogglePastCommands) {
    btnTogglePastCommands.addEventListener('click', (e) => {
        e.stopPropagation();
        togglePastCommandsList();
    });
}

// Elementos do Painel de Opções Interativas (Múltipla Escolha com Timer)
const interactiveOptionsPanel = document.getElementById('interactive-options-panel');
const optionsPanelTitle = document.getElementById('options-panel-title');
const optionsTimerBadge = document.getElementById('options-timer-badge');
const optionsTimerSeconds = document.getElementById('options-timer-seconds');
const optionsTimerProgressBar = document.getElementById('options-timer-progress-bar');
const interactiveOptionsList = document.getElementById('interactive-options-list');

let isProcessRunning = false;
let optionsCountdownInterval = null;
let optionsCountdownProgressInterval = null;
let optionsUserInteracted = false;
let currentOptionsPayload = null;

// Elementos do Terminal Interativo PTY Flutuante (Xterm.js)
const ptyTerminalModal = document.getElementById('pty-terminal-modal');
const ptyTerminalBackdrop = document.getElementById('pty-backdrop');
const ptyTerminalView = document.getElementById('pty-terminal-view');
const ptyViewTitle = document.getElementById('pty-view-title');
const btnPtyCollapse = document.getElementById('btn-pty-collapse');
const xtermContainer = document.getElementById('xterm-container');
const ptyKeyBtns = document.querySelectorAll('.pty-key-btn');

let xterm = null;
let fitAddon = null;
let isPtySessionActive = false;
let currentInteractiveCmd = 'agy';

function initXterm() {
    if (xterm || typeof Terminal === 'undefined') return;

    xterm = new Terminal({
        cursorBlink: true,
        fontFamily: 'monospace, "Courier New", Courier',
        fontSize: currentFontSize || 13,
        theme: {
            background: '#000000',
            foreground: '#f3f4f6',
            cursor: '#22c55e',
            selectionBackground: '#374151'
        },
        convertEol: true
    });

    if (typeof FitAddon !== 'undefined' && FitAddon.FitAddon) {
        fitAddon = new FitAddon.FitAddon();
        xterm.loadAddon(fitAddon);
    }

    xterm.open(xtermContainer);

    if (fitAddon) {
        fitAddon.fit();
    }

    xterm.onData((data) => {
        if (ws && ws.readyState === WebSocket.OPEN && isPtySessionActive) {
            ws.send(JSON.stringify({
                tabId: activeTabId,
                action: 'pty_input',
                data: data
            }));
        }
    });

    xterm.onResize(({ cols, rows }) => {
        if (ws && ws.readyState === WebSocket.OPEN && isPtySessionActive) {
            ws.send(JSON.stringify({
                tabId: activeTabId,
                action: 'pty_resize',
                cols: cols,
                rows: rows
            }));
        }
    });
}

function openPtyView(commandName) {
    if (commandName) {
        currentInteractiveCmd = commandName;
    }
    isPtySessionActive = true;

    // Se houver um card de processo ativo para essa sessão interativa, configura o modo interativo com LIVE badge
    if (activeProcessCard) {
        activeProcessCard.setInteractiveMode();
    }

    if (ptyTerminalModal) {
        ptyTerminalModal.classList.remove('hidden');
        requestAnimationFrame(() => {
            ptyTerminalModal.classList.remove('opacity-0');
            if (ptyTerminalView) {
                ptyTerminalView.classList.remove('scale-95');
                ptyTerminalView.classList.add('scale-100');
            }
        });
    }
    if (ptyViewTitle) {
        ptyViewTitle.textContent = `Sessão Interativa: ${commandName || currentInteractiveCmd || 'agy'}`;
    }
    
    initXterm();

    if (xterm && fitAddon) {
        // Redimensiona o canvas imediatamente e logo após a animação de entrada
        const syncSize = () => {
            try {
                fitAddon.fit();
                if (xterm && ws && ws.readyState === WebSocket.OPEN && xterm.cols > 10 && xterm.rows > 5) {
                    ws.send(JSON.stringify({
                        tabId: activeTabId,
                        action: 'pty_resize',
                        cols: xterm.cols,
                        rows: xterm.rows
                    }));
                }
            } catch (e) {}
        };

        syncSize();
        setTimeout(syncSize, 80);
        setTimeout(syncSize, 220);
        if (xterm) xterm.focus();
    }
}

function collapsePtyView() {
    // Colapsa a janela flutuante para a view estilo Antigravity sem matar o processo
    if (ptyTerminalModal) {
        ptyTerminalModal.classList.add('opacity-0');
        if (ptyTerminalView) {
            ptyTerminalView.classList.remove('scale-100');
            ptyTerminalView.classList.add('scale-95');
        }
        setTimeout(() => {
            ptyTerminalModal.classList.add('hidden');
        }, 200);
    }
}

function closePtyView() {
    isPtySessionActive = false;
    if (ptyTerminalModal) {
        ptyTerminalModal.classList.add('opacity-0');
        if (ptyTerminalView) {
            ptyTerminalView.classList.remove('scale-100');
            ptyTerminalView.classList.add('scale-95');
        }
        setTimeout(() => {
            ptyTerminalModal.classList.add('hidden');
        }, 200);
    }
}

if (btnPtyCollapse) {
    btnPtyCollapse.addEventListener('click', (e) => {
        e.stopPropagation();
        collapsePtyView();
    });
}

ptyKeyBtns.forEach((btn) => {
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        const key = btn.getAttribute('data-key');
        if (!key || !ws || ws.readyState !== WebSocket.OPEN || !isPtySessionActive) return;

        let parsedKey = key;
        if (key === '\\x1b') parsedKey = '\x1b';
        else if (key === '\\t') parsedKey = '\t';
        else if (key === '\\r') parsedKey = '\r';
        else if (key === '\\x03') parsedKey = '\x03';
        else if (key === '\\x1b[A') parsedKey = '\x1b[A';
        else if (key === '\\x1b[B') parsedKey = '\x1b[B';
        else if (key === '\\x1b[D') parsedKey = '\x1b[D';
        else if (key === '\\x1b[C') parsedKey = '\x1b[C';

        ws.send(JSON.stringify({
            tabId: activeTabId,
            action: 'pty_input',
            data: parsedKey
        }));

        if (xterm) xterm.focus();
    });
});

window.addEventListener('resize', () => {
    if (isPtySessionActive && fitAddon && xterm) {
        fitAddon.fit();
    }
});

function connect() {
    // Detecta protocolo e host automaticamente
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${location.host}`;
    console.log('[Termux CLI] Conectando WebSocket em:', wsUrl);
    
    try {
        ws = new WebSocket(wsUrl);
    } catch (e) {
        console.error('[Termux CLI] Erro ao instanciar WebSocket:', e);
    }

    ws.onopen = () => {
        console.log('[Termux CLI] WebSocket Conectado com sucesso!');
        updateStatus('Conectado', 'status-connected');
    };

    ws.onmessage = (event) => {
        const parsed = JSON.parse(event.data);
        const msgTabId = parsed.tabId || activeTabId;
        const targetTab = getOrCreateTabData(msgTabId, parsed.title);

        // Atualização da lista de abas vindas do servidor
        if (parsed.type === 'tabs_list') {
            if (Array.isArray(parsed.tabs)) {
                parsed.tabs.forEach(t => {
                    const existing = getOrCreateTabData(t.id, t.title);
                    existing.title = t.title || existing.title;
                    existing.cwd = t.cwd || existing.cwd;
                    existing.envType = t.envType || existing.envType;
                    existing.envLabel = t.envLabel || existing.envLabel;
                    existing.isRunning = t.isRunning;
                    existing.isPty = t.isPty;
                    existing.isSsh = !!t.isSsh;
                    existing.sshHost = t.sshHost || null;
                });
                renderTabsBar();
            }
            return;
        }

        // Nova aba criada
        if (parsed.type === 'tab_created') {
            const newTab = getOrCreateTabData(parsed.tabId, parsed.title);
            newTab.isSsh = !!parsed.isSsh;
            newTab.envType = parsed.envType || newTab.envType;
            newTab.envLabel = parsed.envLabel || newTab.envLabel;
            renderTabsBar();
            return;
        }

        // Aba fechada no servidor
        if (parsed.type === 'tab_closed') {
            tabsMap.delete(parsed.tabId);
            if (activeTabId === parsed.tabId) {
                const remaining = Array.from(tabsMap.keys());
                if (remaining.length > 0) {
                    switchTab(remaining[remaining.length - 1]);
                }
            } else {
                renderTabsBar();
            }
            return;
        }

        // Tratamento de sincronização de histórico ao reconectar / carregar aba
        if (parsed.type === 'history') {
            targetTab.isRunning = !!parsed.isRunning;
            targetTab.isPty = !!parsed.isPty;
            targetTab.isSsh = !!parsed.isSsh;
            targetTab.sshHost = parsed.sshHost || null;
            if (parsed.envType) targetTab.envType = parsed.envType;
            if (parsed.envLabel) targetTab.envLabel = parsed.envLabel;
            if (parsed.cwd) {
                targetTab.cwd = parsed.cwd;
            }

            if (msgTabId === activeTabId) {
                if (isFirstSync) {
                    terminalOutput.innerHTML = '';
                    if (Array.isArray(parsed.data)) {
                        parsed.data.forEach(item => {
                            appendLog(item.data, item.type, false, parsed.isRunning);
                        });
                    }
                    isFirstSync = false;
                }
                if (parsed.isRunning) {
                    setProcessing(true);
                } else {
                    setProcessing(false);
                    if (activeProcessCard) {
                        activeProcessCard.finish('success');
                    }
                }
                if (parsed.cwd) {
                    updateCwdDisplay(parsed.cwd);
                }
                scrollToBottom();
            }
            renderTabsBar();
            return;
        }

        // Resposta da leitura assíncrona de diretório em árvore
        if (parsed.type === 'dir_list_result') {
            const callback = pendingTreeRequests.get(parsed.requestId);
            if (callback) {
                callback(parsed.items, parsed.error);
                pendingTreeRequests.delete(parsed.requestId);
            }
            return;
        }

        // Atualização de CWD após comando CD
        if (parsed.type === 'cwd_updated') {
            targetTab.cwd = parsed.cwd;
            if (msgTabId === activeTabId) {
                updateCwdDisplay(parsed.cwd);
            }
            renderTabsBar();
            return;
        }

        // Atualização dinâmica de ambiente (ex: entrou no PRoot/Ubuntu ou voltou ao Termux)
        if (parsed.type === 'env_updated') {
            targetTab.envType = parsed.envType || targetTab.envType;
            targetTab.envLabel = parsed.envLabel || targetTab.envLabel;
            targetTab.title = parsed.title || targetTab.title;
            renderTabsBar();
            return;
        }

        // Eventos do terminal interativo PTY
        if (parsed.type === 'pty_opened') {
            targetTab.isRunning = true;
            targetTab.isPty = true;
            renderTabsBar();
            if (msgTabId === activeTabId) {
                setProcessing(true);
                openPtyView(parsed.command);
            }
            return;
        }

        if (parsed.type === 'pty_output') {
            if (msgTabId === activeTabId) {
                if (!isPtySessionActive) {
                    openPtyView();
                }
                if (xterm && parsed.data) {
                    xterm.write(parsed.data);
                }
            }
            return;
        }

        if (parsed.type === 'pty_closed') {
            targetTab.isPty = false;
            targetTab.isRunning = false;
            renderTabsBar();
            if (msgTabId === activeTabId) {
                setProcessing(false);
                setTimeout(() => {
                    closePtyView();
                }, 600);
            }
            return;
        }

        if (parsed.type === 'status_idle') {
            targetTab.isRunning = false;
            targetTab.isPty = false;
            renderTabsBar();
            if (msgTabId === activeTabId) {
                setProcessing(false);
                hideInteractiveOptionsPanel();
                if (activeProcessCard) {
                    activeProcessCard.finish('success');
                }
            }
            return;
        }

        if (parsed.data) {
            if (msgTabId === activeTabId) {
                appendLog(parsed.data, parsed.type);
                detectInteractiveOptionsInStream(parsed.data);
            } else {
                // Guarda saída em background para a aba inativa
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = targetTab.outputHtml || '';
                const span = document.createElement('span');
                span.textContent = parsed.data;
                tempDiv.appendChild(span);
                targetTab.outputHtml = tempDiv.innerHTML;
            }
        }
        
        // Remove estado "processando" quando detecta interrupção manual ou falha
        if (parsed.type === 'system' && (parsed.data.includes('Sinal SIGINT') || parsed.data.includes('Processo finalizado com erro'))) {
            targetTab.isRunning = false;
            targetTab.isPty = false;
            renderTabsBar();
            if (msgTabId === activeTabId) {
                setProcessing(false);
                hideInteractiveOptionsPanel();
                closePtyView();
                if (activeProcessCard) {
                    activeProcessCard.finish('error');
                }
            }
        }
    };

    ws.onclose = () => {
        updateStatus('Reconectando...', 'status-disconnected');
        setTimeout(connect, reconnectInterval);
    };

    ws.onerror = (err) => {
        console.error('Erro no WebSocket:', err);
        ws.close(); // Força o onclose para iniciar a reconexão
    };
}

function updateStatus(text, colorClass) {
    statusText.textContent = text;
    statusDot.className = `w-2 h-2 rounded-full mr-2 ${colorClass}`;
    
    if (colorClass === 'status-processing') {
        statusDot.classList.add('animate-pulse-fast');
    } else {
        statusDot.classList.remove('animate-pulse-fast');
    }
}

function setProcessing(state) {
    isProcessRunning = !!state;
    if (state) {
        updateStatus('Processando...', 'status-processing');
    } else if (ws && ws.readyState === WebSocket.OPEN) {
        updateStatus('Conectado', 'status-connected');
    }
}

// Parser minimalista de sequências de escape ANSI para suporte a cores no terminal (ex: ls --color)
function parseAnsiToHtml(text) {
    const ansiColorMap = {
        '30': 'ansi-black',
        '31': 'ansi-red',
        '32': 'ansi-green',
        '33': 'ansi-yellow',
        '34': 'ansi-dir',           // Azul (diretórios no ls) mapeado para cor customizada
        '35': 'ansi-magenta',
        '36': 'ansi-cyan',
        '37': 'ansi-file',          // Branco/cinza (arquivos no ls) mapeado para cor customizada
        '90': 'ansi-file',          // Cinza claro mapeado para cor de arquivo
        '91': 'ansi-bright-red',
        '92': 'ansi-bright-green',
        '93': 'ansi-bright-yellow',
        '94': 'ansi-dir',           // Azul brilhante mapeado para diretórios
        '95': 'ansi-bright-magenta',
        '96': 'ansi-bright-cyan',
        '97': 'ansi-file'
    };

    let result = '';
    let currentClasses = [];
    // Regex para capturar sequências ANSI do tipo \x1b[...m
    const tokens = text.split(/(\x1b\[[0-9;]*m)/g);

    for (const token of tokens) {
        if (!token) continue;
        const match = token.match(/^\x1b\[([0-9;]*)m$/);
        if (match) {
            const rawCodes = match[1] ? match[1].split(';') : ['0'];
            for (let rawCode of rawCodes) {
                // Normaliza "01" -> "1", "00" -> "0"
                const code = rawCode.replace(/^0+([1-9])/, '$1').trim();
                if (code === '0' || code === '' || rawCode === '00') {
                    currentClasses = [];
                } else if (code === '34' || code === '94') {
                    // Diretório
                    currentClasses = currentClasses.filter(c => !c.startsWith('ansi-'));
                    currentClasses.push('ansi-dir');
                } else if (code === '37' || code === '90' || code === '97') {
                    // Arquivo normal
                    currentClasses = currentClasses.filter(c => !c.startsWith('ansi-'));
                    currentClasses.push('ansi-file');
                } else if (ansiColorMap[code]) {
                    currentClasses = currentClasses.filter(c => !c.startsWith('ansi-'));
                    currentClasses.push(ansiColorMap[code]);
                } else if (code === '1') {
                    if (!currentClasses.includes('font-bold')) currentClasses.push('font-bold');
                } else if (code === '4') {
                    if (!currentClasses.includes('underline')) currentClasses.push('underline');
                }
            }
        } else {
            const escaped = escapeHtml(token);
            if (currentClasses.length > 0) {
                result += `<span class="${currentClasses.join(' ')}">${escaped}</span>`;
            } else {
                result += escaped;
            }
        }
    }
    return result;
}

// Função utilitária para destacar caminhos de diretórios e arquivos respeitando as cores configuradas
function highlightDirAndFilePaths(text) {
    if (!text) return '';
    let formatted = escapeHtml(text);
    // Destaca caminhos de diretórios (ex: src/components/, /root/projects/, ./dir/)
    formatted = formatted.replace(/((?:[\~a-zA-Z0-9_\-\.]*\/)+[a-zA-Z0-9_\-\.]*\/)/g, '<span class="agy-dir-highlight font-semibold">$1</span>');
    // Destaca arquivos com extensões comuns (ex: app.js, index.html, styles.css, server.py, etc.)
    formatted = formatted.replace(/\b([a-zA-Z0-9_\-\.\/]+\.(?:js|json|html|css|py|sh|ts|tsx|jsx|md|txt|yml|yaml|svg|png|c|cpp|h|java|go|rs|toml|lock|env|log))\b/g, '<span class="agy-file-highlight font-medium">$1</span>');
    return formatted;
}

// Gerenciador de Process Cards (Estilo Antigravity 2 Linhas com Ticker e Contador)
let activeProcessCard = null;

function createProcessCard(cmdText, isRunning = true) {
    const card = document.createElement('div');
    card.className = 'process-card';

    const header = document.createElement('div');
    header.className = 'process-card-header';

    // Linha 1: Ticker da última linha de output
    const line1 = document.createElement('div');
    line1.className = 'process-card-line1';
    line1.innerHTML = `
        <div class="process-ticker-wrapper">
            <div class="process-ticker-text process-ticker-active">Iniciando execução...</div>
        </div>
    `;

    // Linha 2: Faixa inferior cinza mais clara
    const line2 = document.createElement('div');
    line2.className = 'process-card-line2';
    line2.innerHTML = `
        <div class="process-card-left">
            <div class="process-spinner"></div>
            <span class="process-percent-badge hidden"></span>
            <span class="process-duration-badge">0s</span>
            <span class="process-cmd-badge" title="${escapeHtml(cmdText)}">${escapeHtml(cmdText)}</span>
        </div>
        <div class="flex items-center gap-2 shrink-0">
            <div class="process-live-badge hidden" title="Servidor ativo em execução - toque para expandir/recolher log">
                <span class="process-live-dot"></span>
                <span>LIVE</span>
            </div>
            <svg class="process-expand-chevron w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
            </svg>
        </div>
    `;

    header.appendChild(line1);
    header.appendChild(line2);

    // Painel expansível com todas as linhas de output
    const body = document.createElement('div');
    body.className = 'process-card-body';
    const bodyPre = document.createElement('pre');
    bodyPre.className = 'whitespace-pre-wrap word-break leading-relaxed m-0 p-0 font-mono';
    body.appendChild(bodyPre);

    card.appendChild(header);
    card.appendChild(body);

    // Detecta se é comando interativo (PTY / TUI ou agy interativo)
    const isInteractiveCommand = /^(?:agy(?:\s+.*)?|top|htop|nano|vi|vim|less|more|fzf|tmux)$/i.test(cmdText.trim()) &&
                                 !cmdText.includes(' -p ') && !cmdText.includes(' --print ') && !cmdText.includes(' --help ') && !cmdText.includes(' -h ') && !cmdText.includes(' --version ') && !cmdText.includes(' -v ') && !cmdText.includes(' models') && !cmdText.includes(' agents');

    // Auto-descolapsa comandos de listagem / inspeção rápida (ex: ls, dir, tree, cat, git status, top)
    const isListingCommand = /^(?:ls|dir|tree|cat|head|tail|find|grep|git status|pwd|df|free)\b/i.test(cmdText.trim());

    // Clique no card ou no badge LIVE: expande / recolhe o output completo ou reabre terminal interativo
    header.addEventListener('click', () => {
        if (isInteractiveCommand && isPtySessionActive) {
            openPtyView(cmdText);
            return;
        }
        if (!card.classList.contains('no-output') && bodyPre.textContent.trim().length > 0) {
            card.classList.toggle('expanded');
        }
    });

    const liveBadge = line2.querySelector('.process-live-badge');
    if (liveBadge) {
        liveBadge.addEventListener('click', (e) => {
            e.stopPropagation();
            if (isInteractiveCommand && isPtySessionActive) {
                openPtyView(cmdText);
            } else if (bodyPre.textContent.trim().length > 0) {
                card.classList.toggle('expanded');
            }
        });
    }

    const durationBadge = line2.querySelector('.process-duration-badge');
    const percentBadge = line2.querySelector('.process-percent-badge');

    if (isInteractiveCommand) {
        if (durationBadge) durationBadge.classList.add('hidden');
        if (percentBadge) percentBadge.classList.add('hidden');
        if (isRunning && liveBadge) {
            liveBadge.classList.remove('hidden');
        }
    }

    const startTime = Date.now();
    let timerInterval = null;

    if (isRunning && !isInteractiveCommand) {
        timerInterval = setInterval(() => {
            const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
            if (durationBadge) {
                durationBadge.textContent = `${elapsedSeconds}s`;
            }
        }, 1000);
    }

    const cardController = {
        element: card,
        bodyPre: bodyPre,
        tickerText: line1.querySelector('.process-ticker-text'),
        tickerWrapper: line1.querySelector('.process-ticker-wrapper'),
        spinner: line2.querySelector('.process-spinner'),
        percentBadge: line2.querySelector('.process-percent-badge'),
        durationBadge: line2.querySelector('.process-duration-badge'),
        liveBadge: liveBadge,
        isInteractive: isInteractiveCommand,
        startTime: startTime,
        timerInterval: timerInterval,
        lastLineText: '',
        
        // Modo interativo: exibe badge LIVE com bolinha verde pulsante e oculta timer/porcentagem
        setInteractiveMode() {
            this.isInteractive = true;
            if (this.timerInterval) {
                clearInterval(this.timerInterval);
                this.timerInterval = null;
            }
            if (this.durationBadge) {
                this.durationBadge.classList.add('hidden');
            }
            if (this.percentBadge) {
                this.percentBadge.classList.add('hidden');
            }
            if (this.liveBadge) {
                this.liveBadge.classList.remove('hidden');
            }
        },

        // Atualiza a linha de ticker com animação vertical suave, porcentagem total e detecção de servidor
        updateTicker(rawText) {
            if (!rawText) return;
            // Extrai a última linha não vazia
            const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
            if (lines.length === 0) return;
            let newLatestLine = lines[lines.length - 1];
            
            // 1. Extração de Porcentagem TOTAL (ignorado se for sessão interativa)
            if (!this.isInteractive) {
                let detectedPercent = null;
                
                // Detecta padrões explícitos de Total/Overall (ex: Total: 75%, Overall: 80%)
                const totalPercentMatch = rawText.match(/(?:total|overall|progresso geral|global)[\s\:\=]+(\d{1,3})%/i);
                if (totalPercentMatch) {
                    detectedPercent = parseInt(totalPercentMatch[1], 10);
                } else {
                    // Detecta passos no formato [4/10] ou (3 of 12)
                    const stepMatch = rawText.match(/(?:\[|\()(\d+)\s*(?:\/|of)\s*(\d+)(?:\]|\))/i);
                    if (stepMatch) {
                        const currentStep = parseInt(stepMatch[1], 10);
                        const totalSteps = parseInt(stepMatch[2], 10);
                        if (totalSteps > 0) {
                            detectedPercent = Math.min(100, Math.round((currentStep / totalSteps) * 100));
                        }
                    } else {
                        // Busca todas as porcentagens na linha/bloco e pega a última (mais representativa do estado atual)
                        const allPercentMatches = [...rawText.matchAll(/(\d{1,3})%/g)];
                        if (allPercentMatches.length > 0) {
                            const lastMatchVal = parseInt(allPercentMatches[allPercentMatches.length - 1][1], 10);
                            if (lastMatchVal <= 100) {
                                detectedPercent = lastMatchVal;
                            }
                        }
                    }
                }

                if (detectedPercent !== null && this.percentBadge) {
                    this.percentBadge.textContent = `${detectedPercent}%`;
                    this.percentBadge.classList.remove('hidden');
                }
            } else {
                if (this.percentBadge) {
                    this.percentBadge.classList.add('hidden');
                }
            }

            // 2. Detecção Automática de Servidor em Execução Contínua (Node, Python, Vite, Next, Flask, Go, Ruby, etc.)
            // Ex: "Server running on http://...", "Listening on port 3000", "Uvicorn running on...", "Ready on http://..."
            if (/server\s+running|listening\s+on|ready\s+on\s+http|started\s+server|running\s+on\s+http|development\s+server\s+started|local\:\s+http/i.test(rawText)) {
                this.isServerRunning = true;
                if (this.liveBadge) {
                    this.liveBadge.classList.remove('hidden');
                }
            }

            // 3. Reconhecimento inteligente de fluxos do Antigravity (AGY)
            if (newLatestLine.includes('[Thinking]') || newLatestLine.toLowerCase().includes('thinking:')) {
                newLatestLine = '🧠 Pensando na solução...';
            } else if (newLatestLine.includes('[Tool]') || newLatestLine.includes('tool_call:') || newLatestLine.includes('Executing:')) {
                const toolMatch = newLatestLine.match(/\[Tool\]\s*(.*)/) || newLatestLine.match(/Executing:\s*(.*)/);
                newLatestLine = `🛠️ ${toolMatch ? toolMatch[1] : 'Executando ferramenta...'}`;
            } else if (newLatestLine.includes('[Action]') || newLatestLine.includes('Action:')) {
                newLatestLine = `⚡ ${newLatestLine.replace(/\[Action\]\s*/, '')}`;
            } else if (newLatestLine.includes('[Artifact]') || newLatestLine.includes('artifact:')) {
                newLatestLine = '📦 Gerando artefato / código...';
            }

            if (newLatestLine === this.lastLineText) return;
            this.lastLineText = newLatestLine;

            if (this.tickerWrapper) {
                const oldTicker = this.tickerWrapper.querySelector('.process-ticker-active');
                if (oldTicker) {
                    oldTicker.classList.remove('process-ticker-active');
                    oldTicker.classList.add('process-ticker-exit');
                    setTimeout(() => {
                        if (oldTicker.parentNode) oldTicker.parentNode.removeChild(oldTicker);
                    }, 300);
                }

                const newTicker = document.createElement('div');
                newTicker.className = 'process-ticker-text process-ticker-enter';
                // Renderiza com cores ANSI se houver ou aplica realce de caminhos do Antigravity
                if (newLatestLine.includes('\x1b[')) {
                    newTicker.innerHTML = parseAnsiToHtml(newLatestLine);
                } else {
                    newTicker.innerHTML = highlightDirAndFilePaths(newLatestLine);
                }
                this.tickerWrapper.appendChild(newTicker);

                // Dispara transição de entrada vindo de baixo
                requestAnimationFrame(() => {
                    newTicker.classList.remove('process-ticker-enter');
                    newTicker.classList.add('process-ticker-active');
                });
            }
        },

        // Adiciona texto ao log expandido
        appendOutput(text, type = 'output') {
            const span = document.createElement('span');
            if (text.includes('\x1b[')) {
                span.innerHTML = parseAnsiToHtml(text);
            } else {
                span.innerHTML = highlightDirAndFilePaths(text);
            }
            if (type === 'error') span.classList.add('text-red-400');
            this.bodyPre.appendChild(span);
            this.updateTicker(text);

            // Se for comando de listagem / inspeção (ex: ls), descolapsa automaticamente
            if (isListingCommand && !card.classList.contains('expanded') && this.bodyPre.textContent.trim().length > 0) {
                card.classList.add('expanded');
            }
        },

        // Conclui o processo (congela timer e substitui o spinner)
        finish(status = 'success') {
            if (this.timerInterval) {
                clearInterval(this.timerInterval);
                this.timerInterval = null;
            }
            if (!this.isInteractive && this.durationBadge) {
                const totalSeconds = Math.max(0, Math.floor((Date.now() - this.startTime) / 1000));
                this.durationBadge.textContent = `${totalSeconds}s`;
            } else if (this.isInteractive && this.durationBadge) {
                this.durationBadge.classList.add('hidden');
            }

            // Ao finalizar, se a porcentagem estiver ativa e não for interativo, garante que seja finalizada
            if (!this.isInteractive && this.percentBadge && !this.percentBadge.classList.contains('hidden')) {
                if (status === 'success') {
                    this.percentBadge.textContent = '100%';
                }
            } else if (this.isInteractive && this.percentBadge) {
                this.percentBadge.classList.add('hidden');
            }

            // Ao finalizar, oculta o badge LIVE
            if (this.liveBadge) {
                this.liveBadge.classList.add('hidden');
            }

            // Se o comando terminou sem produzir output em stdout (ex: cd, export, mkdir)
            if (!this.lastLineText || this.bodyPre.textContent.trim().length === 0) {
                card.classList.add('no-output');
                card.classList.remove('expanded');
                const chevron = line2.querySelector('.process-expand-chevron');
                if (chevron) {
                    chevron.style.display = 'none';
                }
                if (status === 'error') {
                    this.updateTicker('Falha na execução');
                } else {
                    this.updateTicker('Concluído');
                }
            }

            if (this.spinner && this.spinner.parentNode) {
                const statusIcon = document.createElement('span');
                statusIcon.className = 'process-status-icon flex items-center justify-center';
                if (status === 'error') {
                    statusIcon.innerHTML = `
                        <svg class="w-3.5 h-3.5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                    `;
                } else {
                    statusIcon.innerHTML = `
                        <svg class="w-3.5 h-3.5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path>
                        </svg>
                    `;
                }
                this.spinner.parentNode.replaceChild(statusIcon, this.spinner);
            }
        },

        // Converte o card anterior finalizado em formato compacto de terminal padrão (diretório + comando + output simples)
        compactToHistory() {
            if (this.timerInterval) {
                clearInterval(this.timerInterval);
                this.timerInterval = null;
            }
            const fragment = document.createDocumentFragment();

            // Se o comando gerou saída real de texto, adiciona a saída de forma limpa
            const outputText = this.bodyPre.innerHTML.trim();
            if (outputText.length > 0) {
                const outputContainer = document.createElement('div');
                outputContainer.className = 'whitespace-pre-wrap word-break leading-relaxed py-0.5 font-mono text-gray-200';
                outputContainer.innerHTML = outputText;
                fragment.appendChild(outputContainer);
            }

            if (card.parentNode) {
                card.parentNode.replaceChild(fragment, card);
            }
        }
    };

    return cardController;
}

function appendLog(text, type, autoScroll = true, isRunning = true) {
    // Se for uma linha de comando emitida pelo sistema (texto com prompt $)
    if (type === 'system' && text.includes('$ ')) {
        // Se havia um comando anterior rodando com seu Process Card, finaliza-o e salva o output no histórico
        let previousOutputHtml = '';
        if (activeProcessCard) {
            activeProcessCard.finish('success');
            previousOutputHtml = activeProcessCard.bodyPre.innerHTML.trim();
            if (activeProcessCard.element && activeProcessCard.element.parentNode) {
                activeProcessCard.element.parentNode.removeChild(activeProcessCard.element);
            }
            activeProcessCard = null;
        }

        // Limpa todo o terminalOutput (outputs anteriores e prompt-lines antigas)
        // para que a saída fique EXCLUSIVAMENTE dentro do histórico colapsado no topo
        terminalOutput.innerHTML = '';

        const lineWrapper = document.createElement('div');
        lineWrapper.className = 'prompt-line flex items-center justify-between gap-2 py-0.5 group font-mono';
        
        // Extrai o diretório e o comando executado
        let dirPrefix = text.trim();
        let extractedCmd = text.trim();
        if (text.includes('$ ')) {
            const parts = text.split('$ ');
            dirPrefix = parts[0].trim();
            extractedCmd = parts.slice(1).join('$ ').trim();
        }

        // Remove colchetes [ ] e barra inicial do primeiro diretório se existirem
        dirPrefix = dirPrefix.replace(/^\[|\]$/g, '').replace(/^\/+/, '');

        // Linha do prompt com diretório e botão V para o comando ATUAL
        lineWrapper.innerHTML = `
            <span class="truncate flex-1 min-w-0"><span class="prompt-dir-prefix">${escapeHtml(dirPrefix)}</span> <span class="text-gray-400 font-normal">$</span> <span class="past-cmd-text font-bold">${escapeHtml(extractedCmd)}</span></span>
            <button type="button" class="btn-inline-dir opacity-70 hover:opacity-100 hover:bg-gray-800 p-1 rounded text-xs font-mono active:scale-90 transition-all shrink-0 flex items-center justify-center" title="Colapsar / Descolapsar diretório">
                <svg class="chevron-toggle w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"></path>
                </svg>
            </button>
        `;

        const toggleBtn = lineWrapper.querySelector('.btn-inline-dir');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleDirectoryTree(toggleBtn);
            });
        }

        // Se havia um comando anterior rodando, adiciona-o ao histórico de comandos passados com todo o seu output
        if (activeCommandTracker) {
            addPastCommand(activeCommandTracker.dir, activeCommandTracker.cmd, previousOutputHtml);
        }
        // Atualiza o comando ativo atual
        activeCommandTracker = { dir: dirPrefix, cmd: extractedCmd };

        terminalOutput.appendChild(lineWrapper);

        // Cria o novo Process Card estilo Antigravity exclusivo para o último comando ativo
        activeProcessCard = createProcessCard(extractedCmd, isRunning);
        if (!isRunning) {
            activeProcessCard.finish('success');
        }
        terminalOutput.appendChild(activeProcessCard.element);

        if (autoScroll) {
            scrollToBottom();
        }
        return;
    } else {
        // Se houver um card ativo em execução, roteia a saída para o card
        if (activeProcessCard && (type === 'output' || type === 'error' || (type === 'system' && !text.includes('$ ')))) {
            activeProcessCard.appendOutput(text, type);
            if (type === 'system' && (text.includes('Processo finalizado com erro') || text.includes('Sinal SIGINT'))) {
                activeProcessCard.finish('error');
            }
        } else {
            // Saída geral fora de cards
            const span = document.createElement('span');
            if (text.includes('\x1b[')) {
                span.innerHTML = parseAnsiToHtml(text);
            } else {
                span.textContent = text;
            }
            if (type === 'error') span.classList.add('text-red-400');
            if (type === 'system' && !text.includes('$ ')) span.classList.add('text-yellow-400');
            terminalOutput.appendChild(span);
        }
    }

    // Gerenciamento de memória: limita o número de elementos no DOM
    if (terminalOutput.children.length > 5000) {
        for (let i = 0; i < 500; i++) {
            if (terminalOutput.firstChild) {
                terminalOutput.removeChild(terminalOutput.firstChild);
            }
        }
    }

    if (autoScroll) {
        scrollToBottom();
    }
}

function scrollToBottom() {
    terminalContainer.scrollTop = terminalContainer.scrollHeight;
}

function sendInteractiveInput(value) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        if (isProcessRunning) {
            ws.send(JSON.stringify({ tabId: activeTabId, action: 'input', data: value }));
        } else {
            ws.send(JSON.stringify({ tabId: activeTabId, action: 'command', data: value }));
            setProcessing(true);
        }
    }
}

function sendInputCommand() {
    const cmd = commandInput.value.trim();
    if (!cmd || !ws || ws.readyState !== WebSocket.OPEN) return;

    // Se o usuário digitou e enviou manualmente, interrompe qualquer painel de opções ativo
    interruptOptionsCountdown();
    hideInteractiveOptionsPanel();

    if (isProcessRunning) {
        // Envia para o stdin do processo em execução
        sendInteractiveInput(cmd);
    } else {
        // Executa novo comando
        const payload = { tabId: activeTabId, action: 'command', data: cmd };
        if (xterm && xterm.cols && xterm.rows) {
            payload.cols = xterm.cols;
            payload.rows = xterm.rows;
        }
        ws.send(JSON.stringify(payload));
        setProcessing(true);
    }
    commandInput.value = '';
}

// Eventos de envio (Enter no teclado virtual ou clique em Run)
btnRun.addEventListener('click', sendInputCommand);

commandInput.addEventListener('keydown', (e) => {
    // Interrompe o countdown se o usuário começar a digitar
    interruptOptionsCountdown();
    if (e.key === 'Enter') {
        e.preventDefault();
        sendInputCommand();
    }
});

// Interrompe countdown caso o usuário toque/foque no input
commandInput.addEventListener('input', () => {
    interruptOptionsCountdown();
});

// Limpar terminal (limpa local e avisa o servidor)
btnClear.addEventListener('click', () => {
    terminalOutput.innerHTML = '';
    pastCommandsHistory = [];
    activeCommandTracker = null;
    const tab = tabsMap.get(activeTabId);
    if (tab) {
        tab.outputHtml = '';
        tab.pastCommandsHistory = [];
        tab.activeCommandTracker = null;
    }
    renderPastCommandsBar();
    updateCwdDisplay(activeCwd);
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ tabId: activeTabId, action: 'clear_history' }));
    }
});

// Cancelar processo (SIGINT)
btnCancel.addEventListener('click', () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ tabId: activeTabId, action: 'kill' }));
    }
});

// Botões de atalho customizáveis
shortcutBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const cmd = btn.getAttribute('data-cmd');
        if (cmd && ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ tabId: activeTabId, action: 'command', data: cmd }));
            setProcessing(true);
        }
    });
});

// Registro do Service Worker (PWA Offline / Standalone)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch((err) => {
            console.warn('Falha ao registrar Service Worker:', err);
        });
    });
}

// Garante que o input nunca fique oculto quando o teclado abrir
commandInput.addEventListener('focus', () => {
    setTimeout(() => {
        commandInput.scrollIntoView({ behavior: 'smooth', block: 'end' });
        scrollToBottom();
    }, 300);
});

// Suporte a navegadores com window.visualViewport
if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
        scrollToBottom();
    });
}

// ==========================================
// GERENCIADOR DE CONEXÕES SSH REMOTAS
// ==========================================
const btnSshToggle = document.getElementById('btn-ssh-toggle');
const sshModal = document.getElementById('ssh-modal');
const sshBackdrop = document.getElementById('ssh-backdrop');
const btnCloseSsh = document.getElementById('btn-close-ssh');
const btnToggleAddSsh = document.getElementById('btn-toggle-add-ssh');
const sshFormContainer = document.getElementById('ssh-form-container');
const sshLabelInput = document.getElementById('ssh-label-input');
const sshHostInput = document.getElementById('ssh-host-input');
const sshPortInput = document.getElementById('ssh-port-input');
const sshUserInput = document.getElementById('ssh-user-input');
const sshPasswordInput = document.getElementById('ssh-password-input');
const sshKeyInput = document.getElementById('ssh-key-input');
const sshPassphraseInput = document.getElementById('ssh-passphrase-input');
const sshAuthPasswordRadio = document.querySelector('input[name="ssh-auth-type"][value="password"]');
const sshAuthKeyRadio = document.querySelector('input[name="ssh-auth-type"][value="key"]');
const sshAuthPasswordField = document.getElementById('ssh-auth-password-field');
const sshAuthKeyField = document.getElementById('ssh-auth-key-field');
const btnCancelSshForm = document.getElementById('btn-cancel-ssh-form');
const btnSaveSshProfile = document.getElementById('btn-save-ssh-profile');
const btnConnectSshDirect = document.getElementById('btn-connect-ssh-direct');
const sshProfilesList = document.getElementById('ssh-profiles-list');

const SSH_STORAGE_KEY = 'termux_web_ssh_profiles_v1';

const defaultSshProfiles = [
    {
        id: 'default-local-proot',
        label: 'Proot Linux Local (SSH)',
        host: '127.0.0.1',
        port: 8022,
        username: 'root',
        authType: 'password',
        password: ''
    }
];

function getSshProfiles() {
    try {
        const saved = localStorage.getItem(SSH_STORAGE_KEY);
        return saved ? JSON.parse(saved) : defaultSshProfiles;
    } catch (e) {
        return defaultSshProfiles;
    }
}

function saveSshProfiles(profiles) {
    localStorage.setItem(SSH_STORAGE_KEY, JSON.stringify(profiles));
    renderSshProfiles();
}

function renderSshProfiles() {
    if (!sshProfilesList) return;
    const profiles = getSshProfiles();
    sshProfilesList.innerHTML = '';

    if (profiles.length === 0) {
        sshProfilesList.innerHTML = `
            <div class="text-center py-6 text-gray-500 text-xs">
                Nenhum host SSH salvo.<br>Clique em <b>Novo Host</b> acima para adicionar.
            </div>
        `;
        return;
    }

    profiles.forEach((profile) => {
        const card = document.createElement('div');
        card.className = 'ssh-profile-card bg-gray-800/60 border border-gray-700/60 hover:border-emerald-500/50 rounded-xl p-3 flex items-center justify-between gap-3 transition-all';
        
        const hostInfo = `${profile.username || 'root'}@${profile.host}:${profile.port || 22}`;
        const labelText = profile.label || profile.host;

        card.innerHTML = `
            <div class="flex items-center gap-2.5 min-w-0 flex-1">
                <div class="w-8 h-8 rounded-lg bg-emerald-950/80 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01"></path>
                    </svg>
                </div>
                <div class="min-w-0 flex-1">
                    <div class="text-xs font-bold text-gray-100 truncate">${escapeHtml(labelText)}</div>
                    <div class="text-[11px] text-emerald-400/90 font-mono truncate">${escapeHtml(hostInfo)}</div>
                </div>
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
                <button type="button" class="btn-ssh-delete text-gray-400 hover:text-red-400 p-1.5 rounded-lg hover:bg-gray-700/60 transition-colors" title="Excluir Perfil">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>
                <button type="button" class="btn-ssh-connect bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg active:scale-95 transition-transform flex items-center gap-1 shadow-sm">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
                    <span>Conectar</span>
                </button>
            </div>
        `;

        // Botão Conectar
        card.querySelector('.btn-ssh-connect').addEventListener('click', (e) => {
            e.stopPropagation();
            connectToSshProfile(profile);
        });

        // Botão Excluir
        card.querySelector('.btn-ssh-delete').addEventListener('click', (e) => {
            e.stopPropagation();
            deleteSshProfile(profile.id);
        });

        sshProfilesList.appendChild(card);
    });
}

function deleteSshProfile(id) {
    const profiles = getSshProfiles().filter(p => p.id !== id);
    saveSshProfiles(profiles);
}

function openSshModal() {
    renderSshProfiles();
    if (sshModal) {
        sshModal.classList.remove('hidden');
        void sshModal.offsetWidth;
        sshModal.classList.add('open');
    }
    hideSshForm();
}

function closeSshModal() {
    if (sshModal) {
        sshModal.classList.remove('open');
        setTimeout(() => {
            sshModal.classList.add('hidden');
            hideSshForm();
        }, 250);
    }
}

function showSshForm(prefill = null) {
    if (sshFormContainer) {
        sshFormContainer.classList.remove('hidden');
    }
    if (prefill) {
        sshLabelInput.value = prefill.label || '';
        sshHostInput.value = prefill.host || '';
        sshPortInput.value = prefill.port || 22;
        sshUserInput.value = prefill.username || 'root';
        if (prefill.authType === 'key') {
            if (sshAuthKeyRadio) sshAuthKeyRadio.checked = true;
            toggleSshAuthField('key');
            sshKeyInput.value = prefill.privateKey || '';
            sshPassphraseInput.value = prefill.password || '';
        } else {
            if (sshAuthPasswordRadio) sshAuthPasswordRadio.checked = true;
            toggleSshAuthField('password');
            sshPasswordInput.value = prefill.password || '';
        }
    } else {
        sshLabelInput.value = '';
        sshHostInput.value = '';
        sshPortInput.value = '22';
        sshUserInput.value = 'root';
        sshPasswordInput.value = '';
        sshKeyInput.value = '';
        sshPassphraseInput.value = '';
        if (sshAuthPasswordRadio) sshAuthPasswordRadio.checked = true;
        toggleSshAuthField('password');
    }
    if (sshHostInput) sshHostInput.focus();
}

function hideSshForm() {
    if (sshFormContainer) {
        sshFormContainer.classList.add('hidden');
    }
}

function toggleSshAuthField(type) {
    if (type === 'key') {
        if (sshAuthKeyField) sshAuthKeyField.classList.remove('hidden');
        if (sshAuthPasswordField) sshAuthPasswordField.classList.add('hidden');
    } else {
        if (sshAuthKeyField) sshAuthKeyField.classList.add('hidden');
        if (sshAuthPasswordField) sshAuthPasswordField.classList.remove('hidden');
    }
}

if (sshAuthPasswordRadio) {
    sshAuthPasswordRadio.addEventListener('change', () => toggleSshAuthField('password'));
}
if (sshAuthKeyRadio) {
    sshAuthKeyRadio.addEventListener('change', () => toggleSshAuthField('key'));
}

if (btnSshToggle) btnSshToggle.addEventListener('click', openSshModal);
if (btnCloseSsh) btnCloseSsh.addEventListener('click', closeSshModal);
if (sshBackdrop) sshBackdrop.addEventListener('click', closeSshModal);

if (btnToggleAddSsh) {
    btnToggleAddSsh.addEventListener('click', () => {
        if (sshFormContainer && sshFormContainer.classList.contains('hidden')) {
            showSshForm();
        } else {
            hideSshForm();
        }
    });
}

if (btnCancelSshForm) {
    btnCancelSshForm.addEventListener('click', hideSshForm);
}

function collectSshFormData() {
    const host = sshHostInput.value.trim();
    const port = parseInt(sshPortInput.value, 10) || 22;
    const username = sshUserInput.value.trim() || 'root';
    const label = sshLabelInput.value.trim() || `${username}@${host}`;
    const authType = (sshAuthKeyRadio && sshAuthKeyRadio.checked) ? 'key' : 'password';
    const password = authType === 'password' ? sshPasswordInput.value : (sshPassphraseInput.value || undefined);
    const privateKey = authType === 'key' ? sshKeyInput.value.trim() : undefined;

    if (!host) {
        alert('Por favor, informe o Host ou IP do servidor SSH.');
        return null;
    }

    return {
        id: 'ssh-' + Date.now().toString(36),
        label,
        host,
        port,
        username,
        authType,
        password,
        privateKey
    };
}

if (btnSaveSshProfile) {
    btnSaveSshProfile.addEventListener('click', () => {
        const profile = collectSshFormData();
        if (!profile) return;
        const profiles = getSshProfiles();
        profiles.unshift(profile);
        saveSshProfiles(profiles);
        hideSshForm();
    });
}

if (btnConnectSshDirect) {
    btnConnectSshDirect.addEventListener('click', () => {
        const profile = collectSshFormData();
        if (!profile) return;
        connectToSshProfile(profile);
    });
}

function connectToSshProfile(profile) {
    if (!profile || !profile.host) return;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        alert('WebSocket desconectado. Aguarde a conexão com o servidor local.');
        return;
    }

    closeSshModal();

    // Cria uma nova aba especificamente para a sessão SSH
    const newTabId = 'ssh-tab-' + Date.now().toString(36);
    const tabTitle = `SSH: ${profile.label || profile.host}`;
    const newTab = getOrCreateTabData(newTabId, tabTitle);
    newTab.isSsh = true;
    newTab.sshHost = `${profile.username || 'root'}@${profile.host}:${profile.port || 22}`;
    newTab.isRunning = true;
    newTab.isPty = true;

    // Envia criação de aba no servidor
    ws.send(JSON.stringify({
        action: 'create_tab',
        newTabId: newTabId,
        title: tabTitle,
        cwd: '~'
    }));

    switchTab(newTabId);

    // Envia comando de conexão SSH
    setTimeout(() => {
        const cols = (xterm && xterm.cols) ? xterm.cols : 80;
        const rows = (xterm && xterm.rows) ? xterm.rows : 24;

        ws.send(JSON.stringify({
            tabId: newTabId,
            action: 'ssh_connect',
            host: profile.host,
            port: profile.port || 22,
            username: profile.username || 'root',
            password: profile.password,
            privateKey: profile.privateKey,
            cols: cols,
            rows: rows
        }));

        setProcessing(true);
        openPtyView(`SSH ${profile.username || 'root'}@${profile.host}`);
    }, 120);
}


// ==========================================
// GERENCIADOR DE SNIPPETS & ATALHOS SALVOS
// ==========================================
const btnSnippetsToggle = document.getElementById('btn-snippets-toggle');
const snippetsModal = document.getElementById('snippets-modal');
const snippetsBackdrop = document.getElementById('snippets-backdrop');
const btnCloseSnippets = document.getElementById('btn-close-snippets');
const btnToggleDeleteMode = document.getElementById('btn-toggle-delete-mode');
const btnToggleAddSnippet = document.getElementById('btn-toggle-add-snippet');
const snippetFormContainer = document.getElementById('snippet-form-container');
const snippetNameInput = document.getElementById('snippet-name-input');
const snippetCmdInput = document.getElementById('snippet-cmd-input');
const btnSaveSnippet = document.getElementById('btn-save-snippet');
const btnCancelAddSnippet = document.getElementById('btn-cancel-add-snippet');
const snippetsList = document.getElementById('snippets-list');

const STORAGE_KEY = 'termux_web_snippets_v1';
let isDeleteMode = false;

// Snippets iniciais caso o usuário ainda não tenha nenhum
const defaultSnippets = [
    { id: '1', name: 'Iniciar Antigravity', cmd: 'agy' },
    { id: '2', name: 'Antigravity (Continuar)', cmd: 'agy --continue' },
    { id: '3', name: 'Modelos Antigravity', cmd: 'agy models' },
    { id: '4', name: 'Agentes Disponíveis', cmd: 'agy agents' },
    { id: '5', name: 'Status Git', cmd: 'git status' },
    { id: '6', name: 'Listar Detalhado', cmd: 'ls -la' },
    { id: '7', name: 'Monitor de Processos', cmd: 'top -n 1' },
    { id: '8', name: 'Diretório Raiz', cmd: 'cd / && pwd' },
    { id: '9', name: 'Home do Termux', cmd: 'cd ~ && pwd' }
];

function getSnippets() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        return saved ? JSON.parse(saved) : defaultSnippets;
    } catch (e) {
        return defaultSnippets;
    }
}

function saveSnippets(snippets) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snippets));
    renderSnippets();
}

function renderSnippets() {
    const snippets = getSnippets();
    snippetsList.innerHTML = '';

    if (snippets.length === 0) {
        snippetsList.innerHTML = `
            <div class="text-center py-6 text-gray-500 text-xs">
                Nenhum snippet salvo ainda.<br>Clique em <b>Novo</b> acima para adicionar.
            </div>
        `;
        return;
    }

    snippets.forEach((item) => {
        const row = document.createElement('div');
        row.className = `snippet-item p-2.5 rounded-xl cursor-pointer flex items-center justify-between gap-3 border transition-all ${
            isDeleteMode 
                ? 'bg-red-950/20 border-red-800/40 hover:bg-red-900/40' 
                : 'bg-gray-800/40 border-gray-800/60 hover:bg-gray-800/90 hover:border-gray-700/60'
        }`;
        
        row.innerHTML = `
            <div class="flex-1 min-w-0">
                <div class="text-xs font-semibold ${isDeleteMode ? 'text-red-300' : 'text-gray-100'} truncate">${escapeHtml(item.name)}</div>
                <div class="text-[11px] text-gray-400 font-mono truncate mt-0.5">${escapeHtml(item.cmd)}</div>
            </div>
            ${isDeleteMode ? '<span class="text-xs text-red-400 font-bold shrink-0 bg-red-900/40 px-2 py-1 rounded">Excluir</span>' : ''}
        `;

        // Ao clicar no comando
        row.addEventListener('click', () => {
            if (isDeleteMode) {
                deleteSnippet(item.id);
            } else {
                runSnippetCommand(item.cmd);
            }
        });

        snippetsList.appendChild(row);
    });
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function runSnippetCommand(cmd) {
    if (!cmd) return;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        alert('WebSocket desconectado. Aguarde a conexão com o Termux.');
        return;
    }
    ws.send(JSON.stringify({ action: 'command', data: cmd }));
    setProcessing(true);
    closeSnippetsModal();
}

function deleteSnippet(id) {
    const snippets = getSnippets().filter(s => s.id !== id);
    saveSnippets(snippets);
}

function openSnippetsModal() {
    isDeleteMode = false;
    updateDeleteModeButton();
    renderSnippets();
    snippetsModal.classList.remove('hidden');
    void snippetsModal.offsetWidth;
    snippetsModal.classList.add('open');
    hideSnippetForm();
}

function closeSnippetsModal() {
    snippetsModal.classList.remove('open');
    setTimeout(() => {
        snippetsModal.classList.add('hidden');
        hideSnippetForm();
        isDeleteMode = false;
        updateDeleteModeButton();
    }, 250);
}

function updateDeleteModeButton() {
    if (isDeleteMode) {
        btnToggleDeleteMode.textContent = 'Pronto';
        btnToggleDeleteMode.className = 'bg-gray-700 hover:bg-gray-600 text-white text-xs px-2.5 py-1.5 rounded-lg active:scale-95 transition-transform font-medium';
    } else {
        btnToggleDeleteMode.textContent = 'Deletar';
        btnToggleDeleteMode.className = 'bg-red-600 hover:bg-red-500 text-white text-xs px-2.5 py-1.5 rounded-lg active:scale-95 transition-transform font-medium';
    }
}

function showSnippetForm() {
    if (isDeleteMode) {
        isDeleteMode = false;
        updateDeleteModeButton();
        renderSnippets();
    }
    snippetFormContainer.classList.remove('hidden');
    snippetNameInput.value = '';
    snippetCmdInput.value = '';
    snippetNameInput.focus();
}

function hideSnippetForm() {
    snippetFormContainer.classList.add('hidden');
    snippetNameInput.value = '';
    snippetCmdInput.value = '';
}

// Eventos do modal de snippets
btnSnippetsToggle.addEventListener('click', openSnippetsModal);
btnCloseSnippets.addEventListener('click', closeSnippetsModal);
snippetsBackdrop.addEventListener('click', closeSnippetsModal);

btnToggleDeleteMode.addEventListener('click', () => {
    isDeleteMode = !isDeleteMode;
    hideSnippetForm();
    updateDeleteModeButton();
    renderSnippets();
});

btnToggleAddSnippet.addEventListener('click', () => {
    if (snippetFormContainer.classList.contains('hidden')) {
        showSnippetForm();
    } else {
        hideSnippetForm();
    }
});

btnCancelAddSnippet.addEventListener('click', hideSnippetForm);

btnSaveSnippet.addEventListener('click', () => {
    const name = snippetNameInput.value.trim();
    const cmd = snippetCmdInput.value.trim();

    if (!name || !cmd) {
        alert('Por favor, preencha o Nome e o Comando.');
        return;
    }

    const snippets = getSnippets();
    const newSnippet = {
        id: Date.now().toString(),
        name: name,
        cmd: cmd
    };

    snippets.unshift(newSnippet);
    saveSnippets(snippets);
    hideSnippetForm();
});

// ==========================================
// GERENCIADOR DE ÁREA DE TRANSFERÊNCIA (CLIPBOARD)
// ==========================================
const btnClipboardToggle = document.getElementById('btn-clipboard-toggle');
const clipboardModal = document.getElementById('clipboard-modal');
const clipboardBackdrop = document.getElementById('clipboard-backdrop');
const btnCloseClipboard = document.getElementById('btn-close-clipboard');
const btnClipboardSync = document.getElementById('btn-clipboard-sync');
const btnClipboardClearAll = document.getElementById('btn-clipboard-clear-all');
const clipboardList = document.getElementById('clipboard-list');

const CLIPBOARD_STORAGE_KEY = 'termux_web_clipboard_history_v1';
const MAX_CLIPBOARD_ITEMS = 20;

function getClipboardHistory() {
    try {
        const saved = localStorage.getItem(CLIPBOARD_STORAGE_KEY);
        return saved ? JSON.parse(saved) : [];
    } catch (e) {
        return [];
    }
}

function saveClipboardHistory(history) {
    // Mantém no máximo 20 itens
    const trimmed = history.slice(0, MAX_CLIPBOARD_ITEMS);
    localStorage.setItem(CLIPBOARD_STORAGE_KEY, JSON.stringify(trimmed));
    renderClipboard();
}

function addToClipboardHistory(text) {
    if (!text || typeof text !== 'string') return;
    const cleanText = text.trim();
    if (!cleanText) return;

    let history = getClipboardHistory();
    // Remove se já existir duplicado recente para mover ao topo
    history = history.filter(item => item.text !== cleanText);
    
    history.unshift({
        id: Date.now().toString(),
        text: cleanText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });

    saveClipboardHistory(history);
}

// Captura automática no evento 'copy' (lê diretamente do evento do browser e da seleção)
document.addEventListener('copy', (e) => {
    try {
        let copiedText = '';
        if (e.clipboardData && e.clipboardData.getData) {
            copiedText = e.clipboardData.getData('text');
        }
        if (!copiedText) {
            copiedText = window.getSelection().toString();
        }
        if (copiedText && copiedText.trim()) {
            addToClipboardHistory(copiedText);
        }
    } catch (err) {}
});

// Captura automática de seleção quando o usuário seleciona e solta o dedo no mobile
let lastSelection = '';
document.addEventListener('selectionchange', () => {
    try {
        const sel = window.getSelection().toString();
        if (sel && sel.trim() && sel.trim().length > 1) {
            lastSelection = sel.trim();
        }
    } catch (e) {}
});

// Se o usuário copiou no mobile (menu de contexto do Android), adiciona a última seleção
document.addEventListener('touchend', () => {
    if (lastSelection && lastSelection.length > 2) {
        // Guarda sem sobrescrever
    }
});

function renderClipboard() {
    const history = getClipboardHistory();
    clipboardList.innerHTML = '';

    if (history.length === 0) {
        clipboardList.innerHTML = `
            <div class="text-center py-8 text-gray-500 text-xs">
                Nenhum item na área de transferência.<br>
                Copie textos no terminal ou clique em <b>Colar Atual</b>.
            </div>
        `;
        return;
    }

    history.forEach((item) => {
        const row = document.createElement('div');
        row.className = 'clipboard-item p-2.5 rounded-xl cursor-pointer flex items-center justify-between gap-3 border bg-gray-800/40 border-gray-800/60 hover:bg-gray-800/90 hover:border-purple-500/40 transition-all group';
        
        row.innerHTML = `
            <div class="flex-1 min-w-0">
                <div class="text-xs text-gray-100 font-mono line-clamp-2 break-all group-hover:text-purple-300 transition-colors">${escapeHtml(item.text)}</div>
                <div class="text-[10px] text-gray-500 mt-1 flex items-center gap-1">
                    <span>🕒 ${item.timestamp || 'Recente'}</span>
                    <span>•</span>
                    <span class="text-gray-400 font-sans">Toque para colar no terminal</span>
                </div>
            </div>
            <button type="button" class="btn-delete-clip text-gray-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-red-500/10 active:scale-95 transition-all shrink-0 text-xs" data-id="${item.id}" title="Apagar">
                ✕
            </button>
        `;

        // Tocar no item insere o texto no campo de comando ou executa
        row.addEventListener('click', (e) => {
            if (e.target.closest('.btn-delete-clip')) return;
            insertTextIntoCommand(item.text);
            closeClipboardModal();
        });

        // Botão apagar individual
        row.querySelector('.btn-delete-clip').addEventListener('click', (e) => {
            e.stopPropagation();
            deleteClipboardItem(item.id);
        });

        clipboardList.appendChild(row);
    });
}

function insertTextIntoCommand(text) {
    if (typeof text === 'object' && text !== null) {
        text = text.text || text.name || text.cmd || JSON.stringify(text);
    }
    commandInput.value = String(text || '');
    commandInput.focus();
}

function deleteClipboardItem(id) {
    const history = getClipboardHistory().filter(item => item.id !== id);
    saveClipboardHistory(history);
}

async function trySyncClipboard() {
    try {
        if (navigator.clipboard && navigator.clipboard.readText) {
            const text = await navigator.clipboard.readText();
            if (text && text.trim()) {
                addToClipboardHistory(text);
                return true;
            }
        }
    } catch (e) {}
    return false;
}

async function openClipboardModal() {
    renderClipboard();
    clipboardModal.classList.remove('hidden');
    void clipboardModal.offsetWidth;
    clipboardModal.classList.add('open');

    // Tenta sincronizar automaticamente a área de transferência do sistema em background
    await trySyncClipboard();
}

function closeClipboardModal() {
    clipboardModal.classList.remove('open');
    setTimeout(() => {
        clipboardModal.classList.add('hidden');
    }, 250);
}

// Botão para ler a área de transferência do sistema (Clipboard API)
btnClipboardSync.addEventListener('click', async () => {
    try {
        if (navigator.clipboard && navigator.clipboard.readText) {
            const text = await navigator.clipboard.readText();
            if (text && text.trim()) {
                addToClipboardHistory(text);
            } else {
                alert('A área de transferência do sistema está vazia ou não contém texto recente.');
            }
        } else {
            // Fallback caso a Clipboard API não esteja disponível
            const manualText = prompt('Cole o texto copiado aqui para registrar no histórico:');
            if (manualText && manualText.trim()) {
                addToClipboardHistory(manualText);
            }
        }
    } catch (err) {
        // Se o navegador móvel exigir permissão por prompt
        const manualText = prompt('Cole o texto aqui:');
        if (manualText && manualText.trim()) {
            addToClipboardHistory(manualText);
        }
    }
});

// Limpar todo o histórico de clipboard
btnClipboardClearAll.addEventListener('click', () => {
    if (confirm('Deseja limpar todo o histórico da área de transferência?')) {
        saveClipboardHistory([]);
    }
});

// ==========================================
// EXPLORADOR EM ÁRVORE DE DIRETÓRIOS (VS CODE STYLE)
// ==========================================
const btnDirToggle = document.getElementById('btn-dir-toggle');
const dirTreePanel = document.getElementById('directory-tree-panel');
const btnCloseDirTree = document.getElementById('btn-close-dir-tree');
const btnTreeUp = document.getElementById('btn-tree-up');
const directoryTreeContent = document.getElementById('directory-tree-content');
const treeCurrentCwd = document.getElementById('tree-current-cwd');

// Carrega preferência de exibir arquivos e pastas ocultos (padrão: false)
let showHiddenFiles = localStorage.getItem('termux_show_hidden_files') === 'true';

function formatShortPath(fullPath) {
    if (!fullPath) return '';
    const normalized = fullPath.replace(/\\/g, '/').replace(/\/+$/, '');
    if (!normalized || normalized === '/') return '/';
    const segments = normalized.split('/').filter(Boolean);
    if (segments.length <= 2) {
        return segments.join('/');
    }
    return segments.slice(-2).join('/');
}

function updateCwdDisplay(newCwd) {
    if (!newCwd) return;
    activeCwd = newCwd;
    if (treeCurrentCwd) {
        treeCurrentCwd.textContent = activeCwd;
    }
    
    // Atualiza ou cria o prompt para que o usuário veja o diretório atualizado imediatamente
    const existingPromptLine = terminalOutput ? terminalOutput.querySelector('.prompt-line') : null;
    const shortCwd = formatShortPath(activeCwd);
    if (existingPromptLine) {
        const textSpan = existingPromptLine.querySelector('span');
        if (textSpan) {
            if (activeCommandTracker && activeCommandTracker.cmd) {
                textSpan.innerHTML = `<span class="prompt-dir-prefix">${escapeHtml(shortCwd)}</span> <span class="text-gray-400 font-normal">$</span> <span class="past-cmd-text font-bold">${escapeHtml(activeCommandTracker.cmd)}</span>`;
                activeCommandTracker.dir = shortCwd;
            } else {
                textSpan.innerHTML = `<span class="prompt-dir-prefix">${escapeHtml(shortCwd)}</span> <span class="text-gray-400 font-normal">$</span>`;
            }
        }
        const toggleBtn = existingPromptLine.querySelector('.btn-inline-dir');
        if (toggleBtn) {
            toggleBtn.onclick = (e) => {
                e.stopPropagation();
                toggleDirectoryTree(toggleBtn);
            };
        }
    } else if (terminalOutput) {
        const lineWrapper = document.createElement('div');
        lineWrapper.className = 'prompt-line flex items-center justify-between gap-2 py-0.5 group font-mono';
        lineWrapper.innerHTML = `
            <span class="truncate flex-1 min-w-0"><span class="prompt-dir-prefix">${escapeHtml(shortCwd)}</span> <span class="text-gray-400 font-normal">$</span></span>
            <button type="button" class="btn-inline-dir opacity-70 hover:opacity-100 hover:bg-gray-800 p-1 rounded text-xs font-mono active:scale-90 transition-all shrink-0 flex items-center justify-center" title="Colapsar / Descolapsar diretório">
                <svg class="chevron-toggle w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"></path>
                </svg>
            </button>
        `;
        const toggleBtn = lineWrapper.querySelector('.btn-inline-dir');
        if (toggleBtn) {
            toggleBtn.onclick = (e) => {
                e.stopPropagation();
                toggleDirectoryTree(toggleBtn);
            };
        }
        terminalOutput.appendChild(lineWrapper);
    }
    
    // Atualiza estado do botão voltar (esmaecido quando na raiz '/')
    if (btnTreeUp) {
        const isRoot = activeCwd === '/' || !activeCwd || activeCwd.trim() === '';
        btnTreeUp.disabled = isRoot;
        if (isRoot) {
            btnTreeUp.classList.add('opacity-30', 'cursor-not-allowed', 'pointer-events-none');
            btnTreeUp.classList.remove('hover:text-yellow-400', 'hover:bg-gray-800');
        } else {
            btnTreeUp.classList.remove('opacity-30', 'cursor-not-allowed', 'pointer-events-none');
            btnTreeUp.classList.add('hover:text-yellow-400', 'hover:bg-gray-800');
        }
    }

    // Se o painel de diretórios estiver aberto (ex: ao voltar para o diretório anterior), recarrega a listagem
    if (dirTreePanel && !dirTreePanel.classList.contains('hidden')) {
        loadDirectoryContent(activeCwd, directoryTreeContent, 0);
    }

    // Campo de comando sem texto esmaecido / placeholder conforme solicitado
    if (commandInput) {
        commandInput.placeholder = '';
    }
}

let activeToggleBtn = null;

function toggleDirectoryTree(btnTrigger = null) {
    if (dirTreePanel.classList.contains('hidden')) {
        openDirectoryTree(btnTrigger);
    } else {
        closeDirectoryTree();
    }
}

function openDirectoryTree(btnTrigger = null) {
    // Remove classe open de outros botões
    document.querySelectorAll('.btn-inline-dir').forEach(b => b.classList.remove('open'));
    
    if (btnTrigger) {
        activeToggleBtn = btnTrigger;
        activeToggleBtn.classList.add('open');
    } else {
        const lastBtn = terminalOutput ? terminalOutput.querySelector('.btn-inline-dir') : null;
        if (lastBtn) {
            activeToggleBtn = lastBtn;
            activeToggleBtn.classList.add('open');
        }
    }

    if (activeToggleBtn && terminalContainer) {
        const btnRect = activeToggleBtn.getBoundingClientRect();
        const containerRect = terminalContainer.getBoundingClientRect();
        const topOffset = Math.max(8, btnRect.bottom - containerRect.top + terminalContainer.scrollTop + 4);
        dirTreePanel.style.top = `${topOffset}px`;
    } else {
        dirTreePanel.style.top = '48px';
    }

    dirTreePanel.classList.remove('hidden');
    loadDirectoryContent(activeCwd, directoryTreeContent, 0);
}

function closeDirectoryTree() {
    dirTreePanel.classList.add('hidden');
    document.querySelectorAll('.btn-inline-dir').forEach(b => b.classList.remove('open'));
    activeToggleBtn = null;
}

function loadDirectoryContent(targetPath, containerElement, level = 0) {
    containerElement.innerHTML = `
        <div class="flex items-center gap-1.5 py-1 text-gray-500 text-[11px] animate-pulse pl-${Math.min(level * 3, 12)}">
            <span class="inline-block w-2 h-2 rounded-full bg-blue-500 animate-ping"></span>
            <span>Carregando...</span>
        </div>
    `;

    const requestId = 'req_' + Math.random().toString(36).substring(2, 9);
    
    pendingTreeRequests.set(requestId, (items, error) => {
        containerElement.innerHTML = '';

        if (error) {
            containerElement.innerHTML = `
                <div class="text-red-400 text-[11px] py-1 pl-${Math.min(level * 3, 12)}">
                    Falha ao listar pasta
                </div>
            `;
            return;
        }

        // Filtragem defensiva no frontend de acordo com a preferência de arquivos ocultos
        const visibleItems = showHiddenFiles ? items : (items || []).filter(item => !item.name.startsWith('.'));

        if (!visibleItems || visibleItems.length === 0) {
            containerElement.innerHTML = `
                <div class="text-gray-500 text-[11px] py-0.5 italic pl-${Math.min(level * 3, 12)}">
                    (pasta vazia)
                </div>
            `;
            return;
        }

        visibleItems.forEach(item => {
            const itemPath = targetPath === '/' ? `/${item.name}` : `${targetPath}/${item.name}`;
            const row = document.createElement('div');
            row.className = 'tree-node flex flex-col';

            const itemHeader = document.createElement('div');
            itemHeader.className = `flex items-center justify-between py-1 px-1 rounded hover:bg-gray-800/80 cursor-pointer transition-colors group text-xs`;
            itemHeader.style.paddingLeft = `${Math.max(4, level * 16)}px`;

            if (item.isDirectory) {
                itemHeader.innerHTML = `
                    <div class="flex items-center gap-2 min-w-0 flex-1">
                        <button type="button" class="tree-chevron text-gray-400 hover:text-white hover:bg-gray-700/60 p-1 -ml-1 rounded transition-colors flex items-center justify-center shrink-0 w-6 h-6" title="Expandir / Recolher pasta">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"></path>
                            </svg>
                        </button>
                        <svg class="tree-dir-icon w-4 h-4 fill-none stroke-current shrink-0" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path>
                        </svg>
                        <span class="tree-dir-name tree-folder-title font-semibold truncate hover:opacity-80 transition-opacity">${escapeHtml(item.name)}</span>
                    </div>
                `;

                const subContainer = document.createElement('div');
                subContainer.className = 'hidden flex flex-col';

                const chevron = itemHeader.querySelector('.tree-chevron');

                // Clique na seta: descolapsa/colapsa sem dar CD
                chevron.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (subContainer.classList.contains('hidden')) {
                        subContainer.classList.remove('hidden');
                        chevron.classList.add('expanded');
                        loadDirectoryContent(itemPath, subContainer, level + 1);
                    } else {
                        subContainer.classList.add('hidden');
                        chevron.classList.remove('expanded');
                    }
                });

                // Clique no nome da pasta: executa CD para aquela pasta e fecha o painel
                itemHeader.addEventListener('click', () => {
                    executeCd(itemPath);
                });

                row.appendChild(itemHeader);
                row.appendChild(subContainer);
            } else {
                itemHeader.innerHTML = `
                    <div class="flex items-center gap-2 min-w-0 flex-1">
                        <span class="w-6 shrink-0"></span>
                        <svg class="tree-file-icon w-4 h-4 fill-none stroke-current shrink-0" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path>
                        </svg>
                        <span class="tree-file-name font-mono truncate">${escapeHtml(item.name)}</span>
                    </div>
                `;

                // Clicar no arquivo cola o nome no input de comando
                itemHeader.addEventListener('click', () => {
                    commandInput.value = (commandInput.value ? commandInput.value + ' ' : '') + item.name;
                    commandInput.focus();
                });

                row.appendChild(itemHeader);
            }

            containerElement.appendChild(row);
        });
    });

    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            tabId: activeTabId,
            action: 'list_dir',
            requestId: requestId,
            path: targetPath,
            showHidden: showHiddenFiles
        }));
    }
}

function executeCd(newPath, keepTreeOpen = false) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ tabId: activeTabId, action: 'command', data: `cd "${newPath}"` }));
    setProcessing(true);
    if (!keepTreeOpen) {
        closeDirectoryTree();
    }
}

// ==========================================
// MODAL DE CONFIGURAÇÕES
// ==========================================
const btnSettingsToggle = document.getElementById('btn-settings-toggle');
const settingsModal = document.getElementById('settings-modal');
const btnCloseSettings = document.getElementById('btn-close-settings');
const settingsBackdrop = document.getElementById('settings-backdrop');
const toggleShowHidden = document.getElementById('toggle-show-hidden');

const swatchesPrompt = document.getElementById('swatches-prompt');
const swatchesDirs = document.getElementById('swatches-dirs');
const swatchesFiles = document.getElementById('swatches-files');
const btnResetColors = document.getElementById('btn-reset-colors');

// Cores padrão do sistema
const DEFAULT_COLORS = {
    prompt: '#facc15', // Linha amarela de prompt do terminal ([dir]$ cmd)
    dirs: '#facc15',   // Pastas na visualização de diretórios
    files: '#9ca3af'   // Arquivos na visualização de diretórios
};

// Carrega cores salvas ou aplica os padrões
let userColors = {
    prompt: localStorage.getItem('termux_color_prompt') || DEFAULT_COLORS.prompt,
    dirs: localStorage.getItem('termux_color_dirs') || DEFAULT_COLORS.dirs,
    files: localStorage.getItem('termux_color_files') || DEFAULT_COLORS.files
};

function updateActiveSwatches() {
    if (swatchesPrompt) {
        swatchesPrompt.querySelectorAll('.color-swatch-btn').forEach(btn => {
            const c = (btn.getAttribute('data-color') || (btn.dataset && btn.dataset.color) || '').toLowerCase();
            btn.classList.toggle('active', !!c && c === (userColors.prompt || '').toLowerCase());
        });
    }
    if (swatchesDirs) {
        swatchesDirs.querySelectorAll('.color-swatch-btn').forEach(btn => {
            const c = (btn.getAttribute('data-color') || (btn.dataset && btn.dataset.color) || '').toLowerCase();
            btn.classList.toggle('active', !!c && c === (userColors.dirs || '').toLowerCase());
        });
    }
    if (swatchesFiles) {
        swatchesFiles.querySelectorAll('.color-swatch-btn').forEach(btn => {
            const c = (btn.getAttribute('data-color') || (btn.dataset && btn.dataset.color) || '').toLowerCase();
            btn.classList.toggle('active', !!c && c === (userColors.files || '').toLowerCase());
        });
    }
}

function applyCustomColors() {
    document.documentElement.style.setProperty('--color-prompt-line', userColors.prompt);
    document.documentElement.style.setProperty('--color-dir-item', userColors.dirs);
    document.documentElement.style.setProperty('--color-file-item', userColors.files);

    updateActiveSwatches();
}

// Inicializa cores salvas
applyCustomColors();

// Listeners para os botões redondos de cores pré-selecionáveis
function setupSwatchGroup(container, type, storageKey, cssVar) {
    if (!container) return;
    container.querySelectorAll('.color-swatch-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const color = btn.dataset.color;
            userColors[type] = color;
            document.documentElement.style.setProperty(cssVar, color);
            localStorage.setItem(storageKey, color);
            updateActiveSwatches();
        });
    });
}

setupSwatchGroup(swatchesPrompt, 'prompt', 'termux_color_prompt', '--color-prompt-line');
setupSwatchGroup(swatchesDirs, 'dirs', 'termux_color_dirs', '--color-dir-item');
setupSwatchGroup(swatchesFiles, 'files', 'termux_color_files', '--color-file-item');

if (btnResetColors) {
    btnResetColors.addEventListener('click', () => {
        userColors = { ...DEFAULT_COLORS };
        localStorage.removeItem('termux_color_prompt');
        localStorage.removeItem('termux_color_dirs');
        localStorage.removeItem('termux_color_files');
        applyCustomColors();
    });
}

if (toggleShowHidden) {
    toggleShowHidden.checked = showHiddenFiles;
    toggleShowHidden.addEventListener('change', (e) => {
        showHiddenFiles = e.target.checked;
        localStorage.setItem('termux_show_hidden_files', showHiddenFiles ? 'true' : 'false');
        
        // Se a árvore de diretórios estiver aberta, recarrega com a nova preferência
        if (dirTreePanel && !dirTreePanel.classList.contains('hidden')) {
            loadDirectoryContent(activeCwd, directoryTreeContent, 0);
        }
    });
}

function openSettingsModal() {
    if (!settingsModal) return;
    settingsModal.classList.remove('hidden');
    requestAnimationFrame(() => {
        settingsModal.classList.add('open');
    });
}

function closeSettingsModal() {
    if (!settingsModal) return;
    settingsModal.classList.remove('open');
    setTimeout(() => {
        settingsModal.classList.add('hidden');
    }, 300);
}

if (btnSettingsToggle) {
    btnSettingsToggle.addEventListener('click', openSettingsModal);
}
if (btnCloseSettings) {
    btnCloseSettings.addEventListener('click', closeSettingsModal);
}
if (settingsBackdrop) {
    settingsBackdrop.addEventListener('click', closeSettingsModal);
}

// Eventos do explorador de diretórios
if (btnDirToggle) {
    btnDirToggle.addEventListener('click', toggleDirectoryTree);
}
if (btnCloseDirTree) {
    btnCloseDirTree.addEventListener('click', closeDirectoryTree);
}
if (btnTreeUp) {
    btnTreeUp.addEventListener('click', () => {
        executeCd('..', true);
    });
}

// Fecha/colapsa a visualização de diretórios ao clicar fora
document.addEventListener('click', (e) => {
    if (!dirTreePanel || dirTreePanel.classList.contains('hidden')) return;

    // Não fecha se o clique for dentro do painel da árvore ou em qualquer botão de toggle
    const isInsideTree = dirTreePanel.contains(e.target);
    const isToggleBtn = e.target.closest('.btn-inline-dir') || (btnDirToggle && btnDirToggle.contains(e.target));

    if (!isInsideTree && !isToggleBtn) {
        closeDirectoryTree();
    }
});

// Eventos do modal de Clipboard
btnClipboardToggle.addEventListener('click', openClipboardModal);
btnCloseClipboard.addEventListener('click', closeClipboardModal);
clipboardBackdrop.addEventListener('click', closeClipboardModal);

// ==========================================
// GESTO DE PINCH-TO-ZOOM NO TERMINAL
// ==========================================
function applyTerminalFontSize(size) {
    currentFontSize = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, size));
    document.documentElement.style.setProperty('--terminal-font-size', `${currentFontSize.toFixed(1)}px`);
    localStorage.setItem('termux_terminal_font_size', currentFontSize.toFixed(1));
}

// Aplica tamanho salvo inicialmente
applyTerminalFontSize(currentFontSize);

let initialPinchDistance = null;
let startFontSizeOnPinch = currentFontSize;
let isPinching = false;

function getDistanceBetweenTouches(touch1, touch2) {
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.hypot(dx, dy);
}

if (terminalContainer) {
    terminalContainer.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
            isPinching = true;
            initialPinchDistance = getDistanceBetweenTouches(e.touches[0], e.touches[1]);
            startFontSizeOnPinch = currentFontSize;
        }
    }, { passive: true });

    terminalContainer.addEventListener('touchmove', (e) => {
        if (isPinching && e.touches.length === 2 && initialPinchDistance) {
            const currentDistance = getDistanceBetweenTouches(e.touches[0], e.touches[1]);
            const scaleRatio = currentDistance / initialPinchDistance;
            const newSize = startFontSizeOnPinch * scaleRatio;
            applyTerminalFontSize(newSize);
            
            // Previne zoom padrão de página do navegador enquanto faz pinch no terminal
            if (e.cancelable) {
                e.preventDefault();
            }
        }
    }, { passive: false });

    const endPinch = (e) => {
        if (isPinching && e.touches.length < 2) {
            isPinching = false;
            initialPinchDistance = null;
        }
    };

    terminalContainer.addEventListener('touchend', endPinch, { passive: true });
    terminalContainer.addEventListener('touchcancel', endPinch, { passive: true });

    // Suporte também a Ctrl + Wheel do mouse/trackpad para testes em desktop
    terminalContainer.addEventListener('wheel', (e) => {
        if (e.ctrlKey) {
            e.preventDefault();
            const delta = e.deltaY < 0 ? 1 : -1;
            applyTerminalFontSize(currentFontSize + delta);
        }
    }, { passive: false });
}

// =========================================================================
// PAINEL DE OPÇÕES INTERATIVAS / MÚLTIPLA ESCOLHA COM CONTADOR REGRESSIVO
// =========================================================================

/**
 * Interrompe o contador regressivo caso ocorra qualquer ação do usuário
 */
function interruptOptionsCountdown() {
    if (!optionsUserInteracted) {
        optionsUserInteracted = true;
        if (optionsCountdownInterval) {
            clearInterval(optionsCountdownInterval);
            optionsCountdownInterval = null;
        }
        if (optionsCountdownProgressInterval) {
            clearInterval(optionsCountdownProgressInterval);
            optionsCountdownProgressInterval = null;
        }
        if (optionsTimerBadge) {
            optionsTimerBadge.innerHTML = `<span class="text-yellow-400 font-bold">Pausado</span>`;
            optionsTimerBadge.className = 'flex items-center gap-1.5 bg-yellow-950/70 border border-yellow-500/30 px-2 py-0.5 rounded-full text-yellow-300 text-[11px] font-mono';
        }
        if (optionsTimerProgressBar) {
            optionsTimerProgressBar.classList.remove('bg-indigo-500');
            optionsTimerProgressBar.classList.add('bg-yellow-500');
        }
    }
}

/**
 * Oculta o painel de opções interativas
 */
function hideInteractiveOptionsPanel() {
    if (optionsCountdownInterval) {
        clearInterval(optionsCountdownInterval);
        optionsCountdownInterval = null;
    }
    if (optionsCountdownProgressInterval) {
        clearInterval(optionsCountdownProgressInterval);
        optionsCountdownProgressInterval = null;
    }
    if (interactiveOptionsPanel) {
        interactiveOptionsPanel.classList.add('hidden');
    }
    currentOptionsPayload = null;
}

/**
 * Exibe o painel visual com os botões de opções, timer regressivo e suporte a toque/clique
 * @param {Object} data { title, options: [{ key, label, isDefault, tag }], timeoutSeconds: 5 }
 */
function showInteractiveOptionsPanel(data) {
    if (!data || !Array.isArray(data.options) || data.options.length === 0) return;
    
    currentOptionsPayload = data;
    optionsUserInteracted = false;
    
    const timeoutSeconds = data.timeoutSeconds !== undefined ? data.timeoutSeconds : 5;
    let remainingMs = timeoutSeconds * 1000;
    const totalMs = remainingMs;

    // Atualiza título
    optionsPanelTitle.textContent = data.title || 'Selecione uma opção:';

    // Limpa lista anterior
    interactiveOptionsList.innerHTML = '';

    // Procura a opção pré-selecionada (default)
    let defaultOption = data.options.find(opt => opt.isDefault);
    if (!defaultOption && data.options.length > 0) {
        defaultOption = data.options[0];
        defaultOption.isDefault = true;
    }

    // Renderiza cada botão de opção
    data.options.forEach((opt, index) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `option-btn ${opt.isDefault ? 'selected-default' : ''}`;
        
        const keyDisplay = opt.key !== undefined ? opt.key : (index + 1);
        const tagHtml = opt.isDefault ? `<span class="option-btn-tag">Padrão</span>` : (opt.tag ? `<span class="option-btn-tag">${escapeHtml(opt.tag)}</span>` : '');

        btn.innerHTML = `
            <div class="flex items-center min-w-0 flex-1">
                <span class="option-btn-key">${escapeHtml(String(keyDisplay))}</span>
                <span class="option-btn-label">${escapeHtml(opt.label)}</span>
            </div>
            ${tagHtml}
        `;

        // Toque/Clique no botão: interrompe o timer e executa a opção escolhida imediatamente
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            interruptOptionsCountdown();
            executeSelectedOption(opt);
        });

        interactiveOptionsList.appendChild(btn);
    });

    // Configura o visual do badge de timer
    optionsTimerBadge.className = 'flex items-center gap-1.5 bg-indigo-950/80 border border-indigo-500/30 px-2 py-0.5 rounded-full text-indigo-300 text-[11px] font-mono';
    optionsTimerBadge.innerHTML = `
        <svg class="w-3 h-3 text-indigo-400 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
        </svg>
        <span>Auto em <strong id="options-timer-seconds">${Math.ceil(remainingMs / 1000)}s</strong></span>
    `;
    
    if (optionsTimerProgressBar) {
        optionsTimerProgressBar.className = 'bg-indigo-500 h-full w-full transition-all duration-100 ease-linear';
        optionsTimerProgressBar.style.width = '100%';
    }

    interactiveOptionsPanel.classList.remove('hidden');
    scrollToBottom();

    // Limpa intervalos residuais
    if (optionsCountdownInterval) clearInterval(optionsCountdownInterval);
    if (optionsCountdownProgressInterval) clearInterval(optionsCountdownProgressInterval);

    if (timeoutSeconds > 0) {
        const stepInterval = 100;
        optionsCountdownProgressInterval = setInterval(() => {
            if (optionsUserInteracted) return;
            remainingMs -= stepInterval;
            
            const pct = Math.max(0, (remainingMs / totalMs) * 100);
            if (optionsTimerProgressBar) {
                optionsTimerProgressBar.style.width = `${pct}%`;
            }

            const secElement = document.getElementById('options-timer-seconds');
            if (secElement) {
                secElement.textContent = `${Math.max(1, Math.ceil(remainingMs / 1000))}s`;
            }

            if (remainingMs <= 0) {
                clearInterval(optionsCountdownProgressInterval);
                optionsCountdownProgressInterval = null;
                // Executa a opção padrão se não houve interação
                if (!optionsUserInteracted && defaultOption) {
                    executeSelectedOption(defaultOption);
                }
            }
        }, stepInterval);
    }
}

/**
 * Executa o envio da opção selecionada para o terminal / stdin
 */
function executeSelectedOption(option) {
    if (!option) return;
    const sendVal = option.value !== undefined ? option.value : (option.key !== undefined ? option.key : option.label);
    
    hideInteractiveOptionsPanel();
    
    if (isProcessRunning) {
        sendInteractiveInput(sendVal);
    } else {
        commandInput.value = sendVal;
        sendInputCommand();
    }
}

// Qualquer interação / toque no contêiner do terminal pausa o timer de auto-seleção
terminalContainer.addEventListener('mousedown', () => interruptOptionsCountdown());
terminalContainer.addEventListener('touchstart', () => interruptOptionsCountdown(), { passive: true });

/**
 * Detector inteligente de solicitações interativas no fluxo de saída (Antigravity e CLI prompts)
 */
let streamBufferForQuestions = '';
function detectInteractiveOptionsInStream(text) {
    if (!text) return;
    streamBufferForQuestions += text;
    if (streamBufferForQuestions.length > 4000) {
        streamBufferForQuestions = streamBufferForQuestions.slice(-2000);
    }

    // 1. Detecção de JSON Estruturado de ask_question ou interactive_options
    if (streamBufferForQuestions.includes('__INTERACTIVE_OPTIONS__=')) {
        const match = streamBufferForQuestions.match(/__INTERACTIVE_OPTIONS__=(.*?)(?:\r?\n|$)/);
        if (match && match[1]) {
            try {
                const parsed = JSON.parse(match[1]);
                streamBufferForQuestions = streamBufferForQuestions.replace(match[0], '');
                showInteractiveOptionsPanel(parsed);
                return;
            } catch (e) {}
        }
    }

    // 2. Detecção de prompts de confirmação simples do APT / DPKG / Pacman / Git / Scripts
    // Exemplos:
    // "Do you want to continue? [Y/n]"
    // "Deseja continuar? [S/n]"
    // "After this operation, 150 MB of additional disk space will be used. Do you want to continue? [Y/n]"
    const ynMatch = streamBufferForQuestions.match(/(?:Do you want to continue|Deseja continuar|Continue|Proceed|Confirma|Is this ok|Apply changes|Replace with)[^\n\r]*\??\s*\[([yYsSnN])\/([yYsSnN])\]/i) 
                 || streamBufferForQuestions.match(/\[([yYsSnN])\/([yYsSnN])\]\s*(?:\?|\:)?\s*$/i);
    if (ynMatch) {
        const firstChar = ynMatch[1];
        const secondChar = ynMatch[2];
        const defaultChar = firstChar === firstChar.toUpperCase() ? firstChar : (secondChar === secondChar.toUpperCase() ? secondChar : 'y');
        const isYesDefault = /^[yYsS]$/.test(defaultChar);
        
        showInteractiveOptionsPanel({
            title: 'Confirmação solicitada (APT / Sistema):',
            timeoutSeconds: 8,
            options: [
                { key: 'Y', label: 'Sim / Continuar (Y)', isDefault: isYesDefault, value: 'y' },
                { key: 'n', label: 'Não / Cancelar (n)', isDefault: !isYesDefault, value: 'n' }
            ]
        });
        streamBufferForQuestions = '';
        return;
    }

    // 3. Detecção de prompt de resolução de configuração do DPKG / APT (ex: dpkg conffile prompt)
    // Exemplo:
    // *** default.conf (Y/I/N/O/D/Z) [default=N] ?
    // What would you like to do about it ?
    // Y or I : install the package maintainer's version
    // N or O : keep your currently-installed version
    // D : show the differences between the versions
    // Z : start a shell to examine the situation
    const dpkgMatch = streamBufferForQuestions.match(/(?:\((?:[YyIiNnOoDdZz\/]+)\)|\[default=([a-zA-Z])\]|\*\*\* .*?\([a-zA-Z\/]+\))/i);
    if (dpkgMatch || streamBufferForQuestions.includes('What would you like to do about it')) {
        const defMatch = streamBufferForQuestions.match(/\[default=([a-zA-Z])\]/i);
        const defVal = defMatch ? defMatch[1].toLowerCase() : 'n';

        showInteractiveOptionsPanel({
            title: 'Conflito de Configuração de Pacote (DPKG):',
            timeoutSeconds: 12,
            options: [
                { key: 'N', label: 'Manter versão atual (Recomendado)', isDefault: defVal === 'n' || defVal === 'o', value: 'N' },
                { key: 'Y', label: 'Instalar versão do mantenedor do pacote', isDefault: defVal === 'y' || defVal === 'i', value: 'Y' },
                { key: 'D', label: 'Mostrar diferenças (diff)', isDefault: defVal === 'd', value: 'D' },
                { key: 'Z', label: 'Abrir shell para examinar', isDefault: defVal === 'z', value: 'Z' }
            ]
        });
        streamBufferForQuestions = '';
        return;
    }

    // 4. Detecção de perguntas numeradas (ex: 1) Opção A \n 2) Opção B \n 3) Opção C)
    const numberedLines = streamBufferForQuestions.match(/(?:^|\n)\s*(?:\()?(?:\[)?([1-9])(?:\)|\]|\.|\:)\s+([^\n\r]+)/g);
    if (numberedLines && numberedLines.length >= 2) {
        // Verifica se a saída solicita escolha ou listagem de opções
        if (/escolha|selecione|select|choice|option|digite o n[uú]mero|which one|please choose/i.test(streamBufferForQuestions)) {
            const extractedOptions = numberedLines.map((line, idx) => {
                const itemMatch = line.match(/(?:^|\n)\s*(?:\()?(?:\[)?([1-9])(?:\)|\]|\.|\:)\s+(.*)/);
                if (itemMatch) {
                    const num = itemMatch[1];
                    const label = itemMatch[2].replace(/\x1b\[[0-9;]*m/g, '').trim();
                    const isRecommended = idx === 0 || /recomendado|recommended|default|padrão/i.test(label);
                    return {
                        key: num,
                        label: label,
                        isDefault: isRecommended,
                        value: num
                    };
                }
                return null;
            }).filter(Boolean);

            if (extractedOptions.length >= 2) {
                // Se a primeira não estiver explicitamente marcada, define a primeira como default
                if (!extractedOptions.some(o => o.isDefault)) {
                    extractedOptions[0].isDefault = true;
                }
                showInteractiveOptionsPanel({
                    title: 'Escolha uma opção:',
                    timeoutSeconds: 8,
                    options: extractedOptions
                });
                streamBufferForQuestions = '';
            }
        }
    }
}

// Inicializa a conexão ao carregar a página
connect();





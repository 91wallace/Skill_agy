/**
 * Antigravity Headless Assistant & Command Hub - Frontend
 * Substitui emuladores PTY/Xterm por execução headless limpa e renderização nativa de Markdown.
 */

// ==========================================
// ESTADO GLOBAL
// ==========================================
let ws = null;
let activeTabId = 'tab-1';
const tabsMap = new Map(); // tabId -> { id, title, cwd, isAgyMode, messages: [], isRunning: false }
let activeProcessStartTime = null;
let activeProcessTimer = null;
let autoScrollEnabled = localStorage.getItem('agy_auto_scroll') !== 'false';
let showHiddenFiles = localStorage.getItem('agy_show_hidden') === 'true';

// Elementos Principais da DOM
const chatContainer = document.getElementById('chat-container');
const messagesFeed = document.getElementById('messages-feed');
const emptyState = document.getElementById('empty-state');
const promptForm = document.getElementById('prompt-form');
const promptInput = document.getElementById('prompt-input');
const btnSendPrompt = document.getElementById('btn-send-prompt');
const btnModeToggle = document.getElementById('btn-mode-toggle');
const modeLabel = document.getElementById('mode-label');
const activeCwdText = document.getElementById('active-cwd-text');
const btnShowCwd = document.getElementById('btn-show-cwd');
const btnClearChat = document.getElementById('btn-clear-chat');
const tabsListContainer = document.getElementById('tabs-list');
const btnAddTab = document.getElementById('btn-add-tab');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const activeProcessingIndicator = document.getElementById('active-processing-indicator');
const processingLabel = document.getElementById('processing-label');
const processingTimer = document.getElementById('processing-timer');
const btnStopExecution = document.getElementById('btn-stop-execution');

// Modais e Sheets
const dirModal = document.getElementById('dir-modal');
const btnDirToggle = document.getElementById('btn-dir-toggle');
const btnCloseDir = document.getElementById('btn-close-dir');
const dirBackdrop = document.getElementById('dir-backdrop');
const dirModalList = document.getElementById('dir-modal-list');
const dirModalPath = document.getElementById('dir-modal-path');
const btnDirParent = document.getElementById('btn-dir-parent');

const historyModal = document.getElementById('history-modal');
const btnHistoryToggle = document.getElementById('btn-history-toggle');
const btnCloseHistory = document.getElementById('btn-close-history');
const historyBackdrop = document.getElementById('history-backdrop');
const historyModalList = document.getElementById('history-modal-list');

const snippetsModal = document.getElementById('snippets-modal');
const btnSnippetsToggle = document.getElementById('btn-snippets-toggle');
const btnCloseSnippets = document.getElementById('btn-close-snippets');
const snippetsBackdrop = document.getElementById('snippets-backdrop');
const snippetsList = document.getElementById('snippets-list');
const btnToggleAddSnippet = document.getElementById('btn-toggle-add-snippet');
const snippetFormContainer = document.getElementById('snippet-form-container');
const btnCancelAddSnippet = document.getElementById('btn-cancel-add-snippet');
const btnSaveSnippet = document.getElementById('btn-save-snippet');
const snippetNameInput = document.getElementById('snippet-name-input');
const snippetCmdInput = document.getElementById('snippet-cmd-input');

const clipboardModal = document.getElementById('clipboard-modal');
const btnClipboardToggle = document.getElementById('btn-clipboard-toggle');
const btnCloseClipboard = document.getElementById('btn-close-clipboard');
const clipboardBackdrop = document.getElementById('clipboard-backdrop');
const clipboardList = document.getElementById('clipboard-list');
const btnClipboardSync = document.getElementById('btn-clipboard-sync');
const btnClipboardClearAll = document.getElementById('btn-clipboard-clear-all');

const sshModal = document.getElementById('ssh-modal');
const btnSshToggle = document.getElementById('btn-ssh-toggle');
const btnCloseSsh = document.getElementById('btn-close-ssh');
const sshBackdrop = document.getElementById('ssh-backdrop');
const btnConnectSshDirect = document.getElementById('btn-connect-ssh-direct');

const settingsModal = document.getElementById('settings-modal');
const btnSettingsToggle = document.getElementById('btn-settings-toggle');
const btnCloseSettings = document.getElementById('btn-close-settings');
const settingsBackdrop = document.getElementById('settings-backdrop');
const toggleShowHidden = document.getElementById('toggle-show-hidden');
const toggleAutoScroll = document.getElementById('toggle-auto-scroll');

// Snippets Padrão
let userSnippets = JSON.parse(localStorage.getItem('agy_snippets') || 'null') || [
    { name: 'Status do Git', cmd: 'git status' },
    { name: 'Últimos Commits', cmd: 'git log --oneline -n 5' },
    { name: 'Listar Arquivos', cmd: 'ls -la' },
    { name: 'Uso de Memória e Disco', cmd: 'df -h && free -m' },
    { name: 'Abrir no Termux Nativo', cmd: '/open' }
];

let clipboardHistory = JSON.parse(localStorage.getItem('agy_clipboard_history') || '[]');

// ==========================================
// CONFIGURAÇÃO DO MARKED COM HIGHLIGHT.JS
// ==========================================
if (typeof marked !== 'undefined') {
    marked.setOptions({
        gfm: true,
        breaks: true,
        highlight: function(code, lang) {
            if (typeof hljs !== 'undefined') {
                const language = hljs.getLanguage(lang) ? lang : 'plaintext';
                return hljs.highlight(code, { language }).value;
            }
            return code;
        }
    });
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function renderMarkdown(rawText) {
    if (!rawText) return '';
    try {
        let parsed = marked.parse(rawText);
        if (typeof DOMPurify !== 'undefined') {
            parsed = DOMPurify.sanitize(parsed);
        }
        return parsed;
    } catch (e) {
        return `<pre class="whitespace-pre-wrap font-mono text-xs">${escapeHtml(rawText)}</pre>`;
    }
}

// ==========================================
// GERENCIAMENTO DE ABAS E SESSÕES
// ==========================================
function getOrCreateTab(tabId, title = null, cwd = '~') {
    if (!tabsMap.has(tabId)) {
        tabsMap.set(tabId, {
            id: tabId,
            title: title || 'AGY Chat',
            cwd: cwd || '~',
            isAgyMode: true,
            messages: [],
            isRunning: false
        });
    }
    return tabsMap.get(tabId);
}

function renderTabs() {
    if (!tabsListContainer) return;
    tabsListContainer.innerHTML = '';

    tabsMap.forEach((tab, id) => {
        const isActive = id === activeTabId;
        const tabEl = document.createElement('div');
        tabEl.className = `tab-item ${isActive ? 'active' : ''} ${tab.isAgyMode ? 'tab-env-agy' : 'tab-env-termux'}`;

        const iconSvg = tab.isAgyMode
            ? `<svg class="w-3.5 h-3.5 text-purple-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>`
            : `<svg class="w-3.5 h-3.5 text-cyan-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>`;

        const runningIndicator = tab.isRunning
            ? `<span class="tab-running-dot" title="Em execução"></span>`
            : '';

        const canClose = tabsMap.size > 1;

        tabEl.innerHTML = `
            ${runningIndicator}
            ${iconSvg}
            <span class="truncate max-w-[110px] font-mono">${escapeHtml(tab.title || id)}</span>
            ${canClose ? `<span class="tab-close-btn" title="Fechar">&times;</span>` : ''}
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
    activeTabId = newTabId;
    const tab = tabsMap.get(newTabId);

    // Atualiza controles de UI
    setAgyMode(tab.isAgyMode);
    updateCwdDisplay(tab.cwd);
    renderMessagesFeed();
    renderTabs();
    updateProcessingUI(tab.isRunning);
    scrollToBottom();
}

function createNewTab(isAgy = true) {
    const newId = 'tab-' + Date.now().toString(36);
    const currentTab = tabsMap.get(activeTabId);
    const initialCwd = currentTab ? currentTab.cwd : '~';
    const newTab = getOrCreateTab(newId, isAgy ? 'AGY Chat' : 'Terminal', initialCwd);
    newTab.isAgyMode = isAgy;

    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            action: 'create_tab',
            newTabId: newId,
            cwd: initialCwd,
            isAgyMode: isAgy
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

    fetch(`/api/sessions/${targetId}`, { method: 'DELETE' }).catch(() => {});

    tabsMap.delete(targetId);
    if (activeTabId === targetId) {
        const remainingIds = Array.from(tabsMap.keys());
        switchTab(remainingIds[remainingIds.length - 1]);
    } else {
        renderTabs();
    }
}

function setAgyMode(isAgy) {
    const currentTab = tabsMap.get(activeTabId);
    if (currentTab) currentTab.isAgyMode = isAgy;

    if (isAgy) {
        modeLabel.textContent = 'Modo AGY IA';
        btnModeToggle.className = 'mode-pill active flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border border-purple-500/40 bg-purple-950/50 text-purple-300 hover:bg-purple-900/60 transition-all';
        promptInput.placeholder = 'Envie uma mensagem ou comando para o AGY...';
    } else {
        modeLabel.textContent = 'Modo Shell';
        btnModeToggle.className = 'mode-pill flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border border-cyan-500/40 bg-cyan-950/50 text-cyan-300 hover:bg-cyan-900/60 transition-all';
        promptInput.placeholder = 'Digite um comando bash (ex: ls -la, git status)...';
    }
    renderTabs();
}

function updateCwdDisplay(cwd) {
    if (!cwd) return;
    activeCwdText.textContent = cwd;
}

// ==========================================
// RENDERIZAÇÃO DE MENSAGENS E CARDS
// ==========================================
function renderMessagesFeed() {
    const tab = tabsMap.get(activeTabId);
    if (!tab || !tab.messages || tab.messages.length === 0) {
        if (emptyState) emptyState.classList.remove('hidden');
        if (messagesFeed) messagesFeed.innerHTML = '';
        return;
    }

    if (emptyState) emptyState.classList.add('hidden');
    if (!messagesFeed) return;

    messagesFeed.innerHTML = '';
    tab.messages.forEach((msg, index) => {
        const card = createMessageElement(msg, index);
        if (card) messagesFeed.appendChild(card);
    });

    // Injeta manipuladores de cópia nos blocos de código
    enhanceCodeBlocks(messagesFeed);
}

function createMessageElement(msg, index) {
    if (msg.role === 'user') {
        const div = document.createElement('div');
        div.className = 'msg-card-user flex flex-col gap-1.5';
        const timeStr = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

        div.innerHTML = `
            <div class="flex items-center justify-between text-[11px] text-purple-300/80 pb-1 border-b border-purple-500/20">
                <div class="flex items-center gap-1.5 font-semibold">
                    <svg class="w-3.5 h-3.5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
                    <span>Você</span>
                </div>
                <div class="flex items-center gap-2">
                    <span class="text-[10px] text-gray-400">${timeStr}</span>
                    <button type="button" class="btn-copy-prompt text-gray-400 hover:text-purple-300 transition-colors p-0.5" title="Copiar prompt">
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                    </button>
                </div>
            </div>
            <div class="text-xs sm:text-[13px] font-sans whitespace-pre-wrap leading-relaxed">${escapeHtml(msg.content)}</div>
        `;

        div.querySelector('.btn-copy-prompt').addEventListener('click', () => {
            copyToClipboard(msg.content, 'Prompt copiado!');
        });

        return div;
    } else if (msg.role === 'assistant') {
        const div = document.createElement('div');
        div.className = 'msg-card-assistant flex flex-col gap-2';
        const timeStr = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
        const renderedHtml = renderMarkdown(msg.content);

        div.innerHTML = `
            <div class="flex items-center justify-between text-[11.5px] pb-1.5 border-b border-gray-800 text-gray-400">
                <div class="flex items-center gap-1.5 font-bold text-purple-400">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                    <span>Antigravity</span>
                </div>
                <div class="flex items-center gap-2 text-[10.5px]">
                    ${msg.durationMs ? `<span class="bg-gray-800 text-gray-300 px-1.5 py-0.5 rounded font-mono">${(msg.durationMs / 1000).toFixed(1)}s</span>` : ''}
                    <span>${timeStr}</span>
                    <button type="button" class="btn-copy-response text-gray-400 hover:text-white transition-colors p-1" title="Copiar resposta inteira">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                    </button>
                </div>
            </div>
            <div class="markdown-body">${renderedHtml}</div>
        `;

        div.querySelector('.btn-copy-response').addEventListener('click', () => {
            copyToClipboard(msg.content, 'Resposta copiada!');
        });

        return div;
    } else if (msg.role === 'command') {
        const div = document.createElement('div');
        div.className = 'msg-card-command flex flex-col text-xs font-mono';
        const isSuccess = msg.exitCode === 0 || msg.exitCode === undefined;

        div.innerHTML = `
            <div class="bg-gray-900/90 px-3 py-2 border-b border-gray-800 flex items-center justify-between text-gray-300">
                <div class="flex items-center gap-2 truncate">
                    <span class="w-2 h-2 rounded-full ${isSuccess ? 'bg-green-400' : 'bg-red-400'}"></span>
                    <span class="text-amber-400 font-semibold truncate">${escapeHtml(msg.command)}</span>
                </div>
                <div class="flex items-center gap-2 shrink-0 text-[11px] text-gray-400">
                    ${msg.durationMs ? `<span>${(msg.durationMs / 1000).toFixed(1)}s</span>` : ''}
                    <button type="button" class="btn-copy-cmd-out text-gray-400 hover:text-white p-0.5" title="Copiar saída">
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                    </button>
                </div>
            </div>
            <div class="p-3 bg-gray-950/80 text-gray-200 overflow-x-auto whitespace-pre-wrap leading-relaxed">${escapeHtml(msg.output || '(Nenhuma saída)')}</div>
        `;

        div.querySelector('.btn-copy-cmd-out').addEventListener('click', () => {
            copyToClipboard(msg.output, 'Saída copiada!');
        });

        return div;
    }
    return null;
}

function enhanceCodeBlocks(container) {
    if (!container) return;
    const codeBlocks = container.querySelectorAll('pre code');

    codeBlocks.forEach((codeEl) => {
        const preEl = codeEl.parentElement;
        if (preEl.parentElement && preEl.parentElement.classList.contains('code-block-wrapper')) {
            return; // Já empacotado
        }

        const rawCode = codeEl.textContent;
        const langClass = Array.from(codeEl.classList).find(c => c.startsWith('language-'));
        const language = langClass ? langClass.replace('language-', '') : 'código';

        const wrapper = document.createElement('div');
        wrapper.className = 'code-block-wrapper';

        const header = document.createElement('div');
        header.className = 'code-block-header';
        header.innerHTML = `
            <span>${escapeHtml(language)}</span>
            <button type="button" class="code-copy-btn">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                <span>Copiar</span>
            </button>
        `;

        const copyBtn = header.querySelector('.code-copy-btn');
        copyBtn.addEventListener('click', () => {
            copyToClipboard(rawCode, 'Código copiado!');
            copyBtn.innerHTML = `
                <svg class="w-3 h-3 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
                <span class="text-green-400">Copiado!</span>
            `;
            setTimeout(() => {
                copyBtn.innerHTML = `
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
                    <span>Copiar</span>
                `;
            }, 2000);
        });

        preEl.parentNode.insertBefore(wrapper, preEl);
        wrapper.appendChild(header);
        wrapper.appendChild(preEl);
    });
}

function scrollToBottom() {
    if (!autoScrollEnabled) return;
    setTimeout(() => {
        if (chatContainer) {
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }
    }, 50);
}

function updateProcessingUI(isRunning) {
    const tab = tabsMap.get(activeTabId);
    if (tab) tab.isRunning = isRunning;

    if (isRunning) {
        if (activeProcessingIndicator) activeProcessingIndicator.classList.remove('hidden');
        if (activeProcessTimer) clearInterval(activeProcessTimer);
        activeProcessStartTime = Date.now();
        activeProcessTimer = setInterval(() => {
            const elapsedSec = Math.floor((Date.now() - activeProcessStartTime) / 1000);
            if (processingTimer) processingTimer.textContent = `${elapsedSec}s decorridos`;
        }, 1000);
    } else {
        if (activeProcessingIndicator) activeProcessingIndicator.classList.add('hidden');
        if (activeProcessTimer) {
            clearInterval(activeProcessTimer);
            activeProcessTimer = null;
        }
    }
    renderTabs();
}

// ==========================================
// ENVIO DE PROMPTS E EXECUÇÃO HEADLESS
// ==========================================
async function handleSend(text) {
    const content = (text || promptInput.value || '').trim();
    if (!content) return;

    const tab = tabsMap.get(activeTabId);
    if (!tab) return;

    if (tab.isRunning) {
        alert('Já existe uma execução em andamento nesta aba. Aguarde ou clique em Parar.');
        return;
    }

    // Salva no histórico do clipboard/comandos
    saveToHistory(content);

    // Registra mensagem do usuário localmente
    tab.messages.push({
        role: 'user',
        content: content,
        timestamp: Date.now()
    });

    // Limpa o input e redimensiona
    promptInput.value = '';
    adjustTextareaHeight(promptInput);
    renderMessagesFeed();
    updateProcessingUI(true);
    scrollToBottom();

    // Rota 1: Modo AGY Headless (POST /api/prompt)
    if (tab.isAgyMode) {
        try {
            const res = await fetch('/api/prompt', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    prompt: content,
                    tabId: activeTabId,
                    cwd: tab.cwd === '~' ? undefined : tab.cwd,
                    continueSession: true
                })
            });

            const data = await res.json();
            updateProcessingUI(false);

            if (data.success) {
                tab.messages.push({
                    role: 'assistant',
                    content: data.stdout || '(Resposta vazia)',
                    durationMs: data.durationMs,
                    timestamp: Date.now()
                });
            } else {
                tab.messages.push({
                    role: 'assistant',
                    content: `⚠️ **Erro de execução**: ${data.error || data.stderr || 'Falha ao processar comando.'}`,
                    durationMs: data.durationMs,
                    timestamp: Date.now()
                });
            }
            renderMessagesFeed();
            scrollToBottom();
        } catch (err) {
            updateProcessingUI(false);
            tab.messages.push({
                role: 'assistant',
                content: `⚠️ **Erro de rede**: Não foi possível comunicar com o servidor backend (${err.message}).`,
                timestamp: Date.now()
            });
            renderMessagesFeed();
            scrollToBottom();
        }
    } else {
        // Rota 2: Modo Shell Command (POST /api/command)
        try {
            const res = await fetch('/api/command', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    command: content,
                    tabId: activeTabId,
                    cwd: tab.cwd === '~' ? undefined : tab.cwd
                })
            });

            const data = await res.json();
            updateProcessingUI(false);

            if (data.cwd) {
                tab.cwd = data.cwd;
                updateCwdDisplay(data.cwd);
            }

            tab.messages.push({
                role: 'command',
                command: content,
                output: data.stdout || data.stderr || '(Comando executado sem retorno visual)',
                exitCode: data.exitCode,
                durationMs: data.durationMs,
                timestamp: Date.now()
            });
            renderMessagesFeed();
            scrollToBottom();
        } catch (err) {
            updateProcessingUI(false);
            tab.messages.push({
                role: 'command',
                command: content,
                output: `Erro de execução: ${err.message}`,
                exitCode: 1,
                timestamp: Date.now()
            });
            renderMessagesFeed();
            scrollToBottom();
        }
    }
}

async function stopActiveExecution() {
    try {
        await fetch('/api/cancel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tabId: activeTabId })
        });
        updateProcessingUI(false);
    } catch (e) {
        console.error('Erro ao cancelar:', e);
    }
}

// ==========================================
// CONEXÃO WEBSOCKET (REATIVIDADE & SINCRONISMO)
// ==========================================
function initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        statusDot.className = 'w-2 h-2 rounded-full bg-green-500 mr-1.5';
        statusText.textContent = 'Conectado';
    };

    ws.onclose = () => {
        statusDot.className = 'w-2 h-2 rounded-full bg-red-500 mr-1.5';
        statusText.textContent = 'Desconectado';
        setTimeout(initWebSocket, 2000);
    };

    ws.onerror = () => {
        statusDot.className = 'w-2 h-2 rounded-full bg-yellow-500 mr-1.5';
        statusText.textContent = 'Reconectando...';
    };

    ws.onmessage = (event) => {
        let msg;
        try {
            msg = JSON.parse(event.data);
        } catch (e) {
            return;
        }

        if (msg.type === 'tabs_list' && Array.isArray(msg.tabs)) {
            msg.tabs.forEach(t => {
                const tab = getOrCreateTab(t.id, t.title, t.cwd);
                tab.isAgyMode = t.isAgyMode !== false;
                tab.isRunning = !!t.isRunning;
                if (t.cwd) tab.cwd = t.cwd;
            });
            renderTabs();
        }

        if (msg.type === 'history' && msg.tabId) {
            const tab = getOrCreateTab(msg.tabId, msg.title, msg.cwd);
            if (Array.isArray(msg.messages) && msg.messages.length > 0) {
                tab.messages = msg.messages;
            }
            if (msg.cwd) tab.cwd = msg.cwd;
            if (msg.tabId === activeTabId) {
                updateCwdDisplay(tab.cwd);
                renderMessagesFeed();
            }
        }

        if (msg.type === 'cwd_updated' && msg.tabId) {
            const tab = tabsMap.get(msg.tabId);
            if (tab) {
                tab.cwd = msg.cwd;
                if (msg.tabId === activeTabId) updateCwdDisplay(msg.cwd);
            }
        }
    };
}

// ==========================================
// EXPLORADOR DE DIRETÓRIOS E ARQUIVOS
// ==========================================
let currentExplorerPath = '~';

async function loadDirectory(targetPath = '~') {
    dirModalList.innerHTML = '<div class="text-xs text-gray-400 p-3 text-center">Carregando pasta...</div>';
    try {
        const res = await fetch(`/api/fs/list?path=${encodeURIComponent(targetPath)}&showHidden=${showHiddenFiles}`);
        const data = await res.json();

        if (!data.success) {
            dirModalList.innerHTML = `<div class="text-xs text-red-400 p-3">Erro: ${escapeHtml(data.error)}</div>`;
            return;
        }

        currentExplorerPath = data.path;
        dirModalPath.textContent = data.path;
        dirModalList.innerHTML = '';

        if (!data.items || data.items.length === 0) {
            dirModalList.innerHTML = '<div class="text-xs text-gray-500 p-3 text-center">Pasta vazia</div>';
            return;
        }

        data.items.forEach(item => {
            const row = document.createElement('div');
            row.className = 'flex items-center justify-between p-2 rounded-xl bg-gray-800/40 hover:bg-gray-800 border border-gray-800 cursor-pointer transition-colors text-xs';

            const icon = item.isDirectory
                ? `<svg class="w-4 h-4 text-amber-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path></svg>`
                : `<svg class="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>`;

            row.innerHTML = `
                <div class="flex items-center gap-2 truncate flex-1 min-w-0">
                    ${icon}
                    <span class="font-mono text-gray-200 truncate ${item.isDirectory ? 'font-semibold' : ''}">${escapeHtml(item.name)}</span>
                </div>
                <div class="flex items-center gap-1.5 shrink-0">
                    <button type="button" class="btn-use-path text-gray-400 hover:text-purple-300 p-1 rounded" title="Inserir no prompt">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
                    </button>
                </div>
            `;

            row.addEventListener('click', (e) => {
                if (e.target.closest('.btn-use-path')) {
                    e.stopPropagation();
                    insertTextIntoPrompt(item.fullPath);
                    closeModal(dirModal);
                    return;
                }
                if (item.isDirectory) {
                    loadDirectory(item.fullPath);
                }
            });

            dirModalList.appendChild(row);
        });
    } catch (err) {
        dirModalList.innerHTML = `<div class="text-xs text-red-400 p-3">Erro ao ler arquivos: ${err.message}</div>`;
    }
}

// ==========================================
// MODAIS, HISTÓRICO, SNIPPETS & UTILITÁRIOS
// ==========================================
function openModal(modalEl) {
    if (!modalEl) return;
    modalEl.classList.remove('hidden');
    requestAnimationFrame(() => {
        modalEl.classList.add('sheet-open');
    });
}

function closeModal(modalEl) {
    if (!modalEl) return;
    modalEl.classList.remove('sheet-open');
    setTimeout(() => {
        modalEl.classList.add('hidden');
    }, 250);
}

function insertTextIntoPrompt(text) {
    if (!promptInput) return;
    const currentVal = promptInput.value;
    promptInput.value = currentVal ? `${currentVal} ${text}` : text;
    promptInput.focus();
    adjustTextareaHeight(promptInput);
}

function copyToClipboard(text, successToast = 'Copiado!') {
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).catch(() => {});
    }
    // Salva no histórico da área de transferência
    if (!clipboardHistory.includes(text)) {
        clipboardHistory.unshift(text);
        if (clipboardHistory.length > 30) clipboardHistory.pop();
        localStorage.setItem('agy_clipboard_history', JSON.stringify(clipboardHistory));
    }
}

function saveToHistory(text) {
    if (!text) return;
    let history = JSON.parse(localStorage.getItem('agy_cmd_history') || '[]');
    history = history.filter(item => item !== text);
    history.unshift(text);
    if (history.length > 50) history.pop();
    localStorage.setItem('agy_cmd_history', JSON.stringify(history));
}

function renderHistoryModal() {
    if (!historyModalList) return;
    const history = JSON.parse(localStorage.getItem('agy_cmd_history') || '[]');
    historyModalList.innerHTML = '';

    if (history.length === 0) {
        historyModalList.innerHTML = '<div class="text-xs text-gray-500 p-3 text-center">Nenhum comando no histórico</div>';
        return;
    }

    history.forEach(cmd => {
        const item = document.createElement('div');
        item.className = 'flex items-center justify-between p-2.5 rounded-xl bg-gray-800/40 hover:bg-gray-800 border border-gray-800 cursor-pointer transition-colors';
        item.innerHTML = `
            <span class="truncate font-mono text-gray-200 text-xs">${escapeHtml(cmd)}</span>
            <button type="button" class="text-purple-400 text-xs hover:text-purple-300 font-semibold px-2 py-1 rounded bg-purple-950/60 border border-purple-500/30">Usar</button>
        `;
        item.addEventListener('click', () => {
            promptInput.value = cmd;
            adjustTextareaHeight(promptInput);
            closeModal(historyModal);
            promptInput.focus();
        });
        historyModalList.appendChild(item);
    });
}

function renderSnippetsList() {
    if (!snippetsList) return;
    snippetsList.innerHTML = '';

    userSnippets.forEach((s, idx) => {
        const item = document.createElement('div');
        item.className = 'flex items-center justify-between p-2.5 rounded-xl bg-gray-800/40 hover:bg-gray-800 border border-gray-800 transition-colors text-xs';
        item.innerHTML = `
            <div class="flex flex-col min-w-0 flex-1 cursor-pointer pr-2">
                <span class="font-bold text-blue-300 truncate">${escapeHtml(s.name)}</span>
                <span class="font-mono text-gray-400 text-[11px] truncate">${escapeHtml(s.cmd)}</span>
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
                <button type="button" class="btn-run-snippet bg-blue-600/30 hover:bg-blue-600/50 text-blue-200 border border-blue-500/40 px-2 py-1 rounded-lg text-xs font-semibold">Executar</button>
                <button type="button" class="btn-del-snippet text-red-400 hover:text-red-300 p-1 rounded" title="Excluir">&times;</button>
            </div>
        `;

        item.querySelector('.btn-run-snippet').addEventListener('click', () => {
            closeModal(snippetsModal);
            handleSend(s.cmd);
        });

        item.querySelector('.btn-del-snippet').addEventListener('click', (e) => {
            e.stopPropagation();
            userSnippets.splice(idx, 1);
            localStorage.setItem('agy_snippets', JSON.stringify(userSnippets));
            renderSnippetsList();
        });

        snippetsList.appendChild(item);
    });
}

function renderClipboardList() {
    if (!clipboardList) return;
    clipboardList.innerHTML = '';

    if (clipboardHistory.length === 0) {
        clipboardList.innerHTML = '<div class="text-xs text-gray-500 p-3 text-center">Nenhum item salvo na área de transferência</div>';
        return;
    }

    clipboardHistory.forEach((text, idx) => {
        const item = document.createElement('div');
        item.className = 'flex items-center justify-between p-2.5 rounded-xl bg-gray-800/40 hover:bg-gray-800 border border-gray-800 text-xs';
        item.innerHTML = `
            <span class="font-mono text-gray-200 truncate flex-1 pr-2">${escapeHtml(text)}</span>
            <button type="button" class="btn-paste-clip bg-purple-950/60 border border-purple-500/30 text-purple-300 px-2 py-1 rounded text-[11px]">Colar</button>
        `;

        item.querySelector('.btn-paste-clip').addEventListener('click', () => {
            insertTextIntoPrompt(text);
            closeModal(clipboardModal);
        });

        clipboardList.appendChild(item);
    });
}

function adjustTextareaHeight(el) {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
}

// ==========================================
// EVENT LISTENERS DE INICIALIZAÇÃO
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    // Inicializa a primeira aba
    getOrCreateTab('tab-1', 'AGY Chat', '~');
    renderTabs();
    initWebSocket();

    // Envio do formulário
    if (promptForm) {
        promptForm.addEventListener('submit', (e) => {
            e.preventDefault();
            handleSend();
        });
    }

    // Tecla Enter para enviar e Shift+Enter para quebra de linha
    if (promptInput) {
        promptInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
            }
        });
        promptInput.addEventListener('input', () => adjustTextareaHeight(promptInput));
    }

    // Alternador de Modo (AGY vs Shell)
    if (btnModeToggle) {
        btnModeToggle.addEventListener('click', () => {
            const currentTab = tabsMap.get(activeTabId);
            const isCurrentlyAgy = currentTab ? currentTab.isAgyMode : true;
            setAgyMode(!isCurrentlyAgy);
        });
    }

    // Botão Adicionar Aba
    if (btnAddTab) {
        btnAddTab.addEventListener('click', () => createNewTab(true));
    }

    // Botão Limpar Chat
    if (btnClearChat) {
        btnClearChat.addEventListener('click', () => {
            const tab = tabsMap.get(activeTabId);
            if (tab) {
                tab.messages = [];
                renderMessagesFeed();
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ action: 'clear_history', tabId: activeTabId }));
                }
            }
        });
    }

    // Botão Parar Execução
    if (btnStopExecution) {
        btnStopExecution.addEventListener('click', stopActiveExecution);
    }

    // Chips de Prompt Rápido
    document.querySelectorAll('.quick-prompt-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const prompt = chip.getAttribute('data-prompt');
            if (prompt) handleSend(prompt);
        });
    });

    // Explorador de Arquivos
    if (btnDirToggle) {
        btnDirToggle.addEventListener('click', () => {
            const tab = tabsMap.get(activeTabId);
            loadDirectory(tab ? tab.cwd : '~');
            openModal(dirModal);
        });
    }
    if (btnShowCwd) {
        btnShowCwd.addEventListener('click', () => {
            const tab = tabsMap.get(activeTabId);
            loadDirectory(tab ? tab.cwd : '~');
            openModal(dirModal);
        });
    }
    if (btnCloseDir) btnCloseDir.addEventListener('click', () => closeModal(dirModal));
    if (dirBackdrop) dirBackdrop.addEventListener('click', () => closeModal(dirModal));
    if (btnDirParent) {
        btnDirParent.addEventListener('click', () => {
            if (currentExplorerPath && currentExplorerPath !== '/') {
                const parent = currentExplorerPath.split('/').slice(0, -1).join('/') || '/';
                loadDirectory(parent);
            }
        });
    }

    // Histórico
    if (btnHistoryToggle) {
        btnHistoryToggle.addEventListener('click', () => {
            renderHistoryModal();
            openModal(historyModal);
        });
    }
    if (btnCloseHistory) btnCloseHistory.addEventListener('click', () => closeModal(historyModal));
    if (historyBackdrop) historyBackdrop.addEventListener('click', () => closeModal(historyModal));

    // Snippets
    if (btnSnippetsToggle) {
        btnSnippetsToggle.addEventListener('click', () => {
            renderSnippetsList();
            openModal(snippetsModal);
        });
    }
    if (btnCloseSnippets) btnCloseSnippets.addEventListener('click', () => closeModal(snippetsModal));
    if (snippetsBackdrop) snippetsBackdrop.addEventListener('click', () => closeModal(snippetsModal));

    if (btnToggleAddSnippet) {
        btnToggleAddSnippet.addEventListener('click', () => {
            snippetFormContainer.classList.toggle('hidden');
        });
    }
    if (btnCancelAddSnippet) {
        btnCancelAddSnippet.addEventListener('click', () => {
            snippetFormContainer.classList.add('hidden');
        });
    }
    if (btnSaveSnippet) {
        btnSaveSnippet.addEventListener('click', () => {
            const name = snippetNameInput.value.trim();
            const cmd = snippetCmdInput.value.trim();
            if (!name || !cmd) return;
            userSnippets.unshift({ name, cmd });
            localStorage.setItem('agy_snippets', JSON.stringify(userSnippets));
            snippetNameInput.value = '';
            snippetCmdInput.value = '';
            snippetFormContainer.classList.add('hidden');
            renderSnippetsList();
        });
    }

    // Clipboard
    if (btnClipboardToggle) {
        btnClipboardToggle.addEventListener('click', () => {
            renderClipboardList();
            openModal(clipboardModal);
        });
    }
    if (btnCloseClipboard) btnCloseClipboard.addEventListener('click', () => closeModal(clipboardModal));
    if (clipboardBackdrop) clipboardBackdrop.addEventListener('click', () => closeModal(clipboardModal));
    if (btnClipboardClearAll) {
        btnClipboardClearAll.addEventListener('click', () => {
            clipboardHistory = [];
            localStorage.setItem('agy_clipboard_history', '[]');
            renderClipboardList();
        });
    }
    if (btnClipboardSync) {
        btnClipboardSync.addEventListener('click', async () => {
            try {
                if (navigator.clipboard && navigator.clipboard.readText) {
                    const text = await navigator.clipboard.readText();
                    if (text) {
                        copyToClipboard(text);
                        renderClipboardList();
                    }
                }
            } catch (e) {}
        });
    }

    // SSH
    if (btnSshToggle) btnSshToggle.addEventListener('click', () => openModal(sshModal));
    if (btnCloseSsh) btnCloseSsh.addEventListener('click', () => closeModal(sshModal));
    if (sshBackdrop) sshBackdrop.addEventListener('click', () => closeModal(sshModal));
    if (btnConnectSshDirect) {
        btnConnectSshDirect.addEventListener('click', () => {
            const host = document.getElementById('ssh-host-input').value.trim();
            const port = document.getElementById('ssh-port-input').value.trim() || '22';
            const user = document.getElementById('ssh-user-input').value.trim() || 'root';
            if (!host) return;
            createNewTab(false);
            closeModal(sshModal);
            handleSend(`ssh -p ${port} ${user}@${host}`);
        });
    }

    // Configurações
    if (btnSettingsToggle) btnSettingsToggle.addEventListener('click', () => openModal(settingsModal));
    if (btnCloseSettings) btnCloseSettings.addEventListener('click', () => closeModal(settingsModal));
    if (settingsBackdrop) settingsBackdrop.addEventListener('click', () => closeModal(settingsModal));

    if (toggleShowHidden) {
        toggleShowHidden.checked = showHiddenFiles;
        toggleShowHidden.addEventListener('change', (e) => {
            showHiddenFiles = e.target.checked;
            localStorage.setItem('agy_show_hidden', showHiddenFiles);
        });
    }

    if (toggleAutoScroll) {
        toggleAutoScroll.checked = autoScrollEnabled;
        toggleAutoScroll.addEventListener('change', (e) => {
            autoScrollEnabled = e.target.checked;
            localStorage.setItem('agy_auto_scroll', autoScrollEnabled);
        });
    }
});

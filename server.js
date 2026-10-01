const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { Client } = require('ssh2');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Servir os arquivos estáticos da interface web
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Constantes e Estados
const MAX_LOG_HISTORY = 1000;
const sessions = new Map(); // tabId -> SessionObject
const activeProcesses = new Map(); // tabId -> ChildProcess

// Utilitário para remoção de códigos de escape ANSI
function stripAnsi(str) {
    if (typeof str !== 'string') return '';
    return str
        .replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '')
        .replace(/\x1B\][0-9];[^\x07\x1B]*(\x07|\x1B\\)/g, '')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n');
}

// Localiza o binário do Antigravity (agy)
function getAgyBinaryPath() {
    const candidates = [
        '/root/.local/bin/agy',
        '/root/.gemini/antigravity-cli/bin/agy',
        '/data/data/com.termux/files/usr/bin/agy',
        '/usr/local/bin/agy',
        '/usr/bin/agy'
    ];
    for (const p of candidates) {
        if (fs.existsSync(p)) return p;
    }
    return 'agy'; // fallback para PATH do sistema
}

// Monta PATH completo do ambiente
function getFullEnvPath() {
    return [
        '/root/.gemini/antigravity-cli/bin',
        '/root/.local/bin',
        '/data/data/com.termux/files/usr/bin',
        '/usr/local/sbin',
        '/usr/local/bin',
        '/usr/sbin',
        '/usr/bin',
        '/sbin',
        '/bin',
        process.env.PATH || ''
    ].filter(Boolean).join(':');
}

function getExecutionEnv() {
    const userHome = process.env.HOME || '/root';
    const userName = process.env.USER || 'root';
    return Object.assign({}, process.env, {
        HOME: userHome,
        USER: userName,
        PATH: getFullEnvPath(),
        TERM: 'dumb',
        NO_COLOR: '1',
        FORCE_COLOR: '0',
        DEBIAN_FRONTEND: 'noninteractive'
    });
}

// Detecção de ambiente (Termux, Proot, Distro Linux)
function getHostEnvironmentType() {
    let distroName = null;
    try {
        if (fs.existsSync('/etc/os-release')) {
            const osRelease = fs.readFileSync('/etc/os-release', 'utf8');
            const nameMatch = osRelease.match(/^(?:NAME|ID)=(?:")?([^"\n\r]+)(?:")?/m);
            if (nameMatch && nameMatch[1]) {
                const rawName = nameMatch[1].trim();
                if (/ubuntu/i.test(rawName)) distroName = 'Ubuntu';
                else if (/debian/i.test(rawName)) distroName = 'Debian';
                else if (/arch/i.test(rawName)) distroName = 'Arch';
                else if (/alpine/i.test(rawName)) distroName = 'Alpine';
                else if (/fedora/i.test(rawName)) distroName = 'Fedora';
                else if (/kali/i.test(rawName)) distroName = 'Kali';
                else if (/void/i.test(rawName)) distroName = 'Void';
                else distroName = rawName.charAt(0).toUpperCase() + rawName.slice(1);
            }
        }
    } catch (e) {}

    if (distroName && !/termux/i.test(distroName)) {
        return { type: 'distro', label: distroName };
    }

    const isTermux = !!(process.env.TERMUX_VERSION || (process.env.PREFIX && process.env.PREFIX.includes('com.termux')) || fs.existsSync('/data/data/com.termux/files/usr/bin/bash'));
    const isProot = fs.existsSync('/proot') || (process.env.PROOT_TMP_DIR !== undefined) || (process.env.PRUN !== undefined);

    if (isTermux && !isProot) {
        return { type: 'termux', label: 'Termux' };
    } else if (distroName) {
        return { type: 'distro', label: distroName };
    } else {
        return { type: 'distro', label: 'Linux' };
    }
}

const SESSIONS_STATE_FILE = path.join(__dirname, '.sessions_state.json');
let saveSessionsTimeout = null;

function saveSessionsToDiskDebounced() {
    if (saveSessionsTimeout) clearTimeout(saveSessionsTimeout);
    saveSessionsTimeout = setTimeout(() => {
        saveSessionsToDisk();
    }, 500);
}

function saveSessionsToDisk() {
    try {
        const dataToSave = Array.from(sessions.values()).map(s => ({
            id: s.id,
            title: s.title,
            cwd: s.cwd,
            envType: s.envType,
            envLabel: s.envLabel,
            sessionId: s.sessionId || null,
            isAgyMode: !!s.isAgyMode,
            lastPrompt: s.lastPrompt || '',
            lastCommand: s.lastCommand || '',
            messages: s.messages ? s.messages.slice(-50) : [],
            logHistory: s.logHistory ? s.logHistory.slice(-300) : []
        }));
        fs.writeFileSync(SESSIONS_STATE_FILE, JSON.stringify(dataToSave, null, 2), 'utf8');
    } catch (e) {
        console.error('[Session Persistence] Erro ao salvar sessões:', e.message);
    }
}

function loadSessionsFromDisk() {
    try {
        if (fs.existsSync(SESSIONS_STATE_FILE)) {
            const raw = fs.readFileSync(SESSIONS_STATE_FILE, 'utf8');
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0) {
                const currentEnv = getHostEnvironmentType();
                parsed.forEach(item => {
                    if (item && item.id) {
                        let validatedCwd = item.cwd;
                        if (!validatedCwd || !fs.existsSync(validatedCwd)) {
                            validatedCwd = process.env.HOME || process.cwd();
                        }
                        const session = {
                            id: item.id,
                            title: item.title || (item.isAgyMode ? 'AGY Chat' : currentEnv.label),
                            cwd: validatedCwd,
                            envType: item.envType || currentEnv.type,
                            envLabel: item.envLabel || currentEnv.label,
                            sessionId: item.sessionId || null,
                            isAgyMode: !!item.isAgyMode,
                            messages: Array.isArray(item.messages) ? item.messages : [],
                            logHistory: Array.isArray(item.logHistory) ? item.logHistory : [],
                            lastPrompt: item.lastPrompt || '',
                            lastCommand: item.lastCommand || '',
                            isSsh: false,
                            sshClient: null,
                            sshStream: null,
                            sshHost: null
                        };
                        sessions.set(item.id, session);
                    }
                });
                console.log(`[Session Persistence] Restauradas ${sessions.size} sessão(ões) salvas.`);
            }
        }
    } catch (e) {
        console.error('[Session Persistence] Erro ao carregar sessões salvas:', e.message);
    }
}

function createSession(tabId, title = null, initialCwd = null, isAgy = true) {
    const currentEnv = getHostEnvironmentType();
    const defaultCwd = initialCwd || process.env.HOME || process.cwd();
    const defaultTitle = title || (isAgy ? 'AGY Chat' : currentEnv.label);
    const session = {
        id: tabId,
        title: defaultTitle,
        cwd: defaultCwd,
        envType: currentEnv.type,
        envLabel: currentEnv.label,
        sessionId: null,
        isAgyMode: isAgy,
        messages: [],
        logHistory: [],
        lastPrompt: '',
        lastCommand: '',
        isSsh: false,
        sshClient: null,
        sshStream: null,
        sshHost: null
    };
    sessions.set(tabId, session);
    saveSessionsToDisk();
    return session;
}

// Inicialização de sessões salvas
loadSessionsFromDisk();
if (sessions.size === 0) {
    createSession('tab-1', 'AGY Chat', process.cwd(), true);
}

function formatShortCwd(fullPath) {
    if (!fullPath) return '';
    const normalized = path.normalize(fullPath).replace(/[\\/]+$/, '');
    if (!normalized || normalized === '/') return '/';
    const segments = normalized.split(path.sep).filter(Boolean);
    if (segments.length <= 2) {
        return segments.join('/');
    }
    return segments.slice(-2).join('/');
}

function broadcastToTab(tabId, obj) {
    const session = sessions.get(tabId);
    if (session) {
        if (obj && typeof obj.data === 'string' && obj.data.length > 0) {
            session.logHistory.push({ type: obj.type, data: obj.data, timestamp: Date.now() });
            if (session.logHistory.length > MAX_LOG_HISTORY) {
                session.logHistory.shift();
            }
            saveSessionsToDiskDebounced();
        }
    }

    const payload = Object.assign({ tabId }, obj);
    const json = JSON.stringify(payload);
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(json);
        }
    });
}

function broadcastTabsList() {
    const defaultEnv = getHostEnvironmentType();
    const list = Array.from(sessions.values()).map(s => ({
        id: s.id,
        title: s.title,
        cwd: s.cwd,
        envType: s.isSsh ? 'ssh' : (s.envType || defaultEnv.type),
        envLabel: s.isSsh ? 'SSH' : (s.envLabel || defaultEnv.label),
        isRunning: activeProcesses.has(s.id) || (s.isSsh && s.sshClient !== null),
        isSsh: !!s.isSsh,
        sshHost: s.sshHost || null,
        sessionId: s.sessionId || null,
        isAgyMode: !!s.isAgyMode,
        lastCommand: s.lastCommand,
        lastPrompt: s.lastPrompt
    }));
    const json = JSON.stringify({ type: 'tabs_list', tabs: list });
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(json);
        }
    });
}

// Execução Headless de Prompt Antigravity
function runHeadlessAgyPrompt({ prompt, sessionId, tabId, cwd, continueSession, model, effort, onChunk, onFinish }) {
    const agyBin = getAgyBinaryPath();
    const targetTabId = tabId || 'tab-1';
    let session = sessions.get(targetTabId);
    if (!session) {
        session = createSession(targetTabId, 'AGY Chat', cwd || process.cwd(), true);
    }

    const workingDir = cwd || session.cwd || process.cwd();
    session.cwd = workingDir;
    session.lastPrompt = prompt;

    const args = [];

    // Contexto e Continuidade de Conversa
    if (sessionId) {
        args.push('--conversation', sessionId);
    } else if (session.sessionId) {
        args.push('--conversation', session.sessionId);
    } else if (continueSession || session.isAgyMode) {
        args.push('-c');
    }

    if (model) {
        args.push('--model', model);
    }
    if (effort) {
        args.push('--effort', effort);
    }

    args.push('-p', prompt);
    args.push('--dangerously-skip-permissions');

    const env = getExecutionEnv();
    const startTime = Date.now();

    broadcastToTab(targetTabId, {
        type: 'prompt_start',
        prompt: prompt,
        sessionId: session.sessionId || null,
        timestamp: startTime
    });
    broadcastTabsList();

    const proc = spawn(agyBin, args, {
        cwd: workingDir,
        env: env,
        detached: false
    });

    activeProcesses.set(targetTabId, proc);

    let stdoutAcc = '';
    let stderrAcc = '';

    proc.stdout.on('data', (chunk) => {
        const text = stripAnsi(chunk.toString());
        stdoutAcc += text;
        if (onChunk) onChunk({ type: 'stdout', text, raw: chunk.toString() });
        broadcastToTab(targetTabId, { type: 'prompt_chunk', data: text });
    });

    proc.stderr.on('data', (chunk) => {
        const text = stripAnsi(chunk.toString());
        stderrAcc += text;
        if (onChunk) onChunk({ type: 'stderr', text, raw: chunk.toString() });
        broadcastToTab(targetTabId, { type: 'prompt_stderr_chunk', data: text });
    });

    proc.on('error', (err) => {
        activeProcesses.delete(targetTabId);
        const errorMsg = `\n[Erro ao executar Antigravity: ${err.message}]\n`;
        stderrAcc += errorMsg;
        broadcastToTab(targetTabId, { type: 'error', data: errorMsg });
        broadcastToTab(targetTabId, { type: 'status_idle', exitCode: 1 });
        broadcastTabsList();
        if (onFinish) {
            onFinish({
                success: false,
                stdout: stripAnsi(stdoutAcc).trim(),
                stderr: stripAnsi(stderrAcc).trim(),
                exitCode: 1,
                durationMs: Date.now() - startTime,
                tabId: targetTabId,
                sessionId: session.sessionId
            });
        }
    });

    proc.on('close', (code) => {
        activeProcesses.delete(targetTabId);
        const durationMs = Date.now() - startTime;
        const cleanStdout = stripAnsi(stdoutAcc).trim();
        const cleanStderr = stripAnsi(stderrAcc).trim();

        // Registra mensagem no histórico da sessão
        session.messages.push({
            role: 'user',
            content: prompt,
            timestamp: startTime
        });
        session.messages.push({
            role: 'assistant',
            content: cleanStdout || cleanStderr,
            timestamp: Date.now(),
            exitCode: code
        });
        saveSessionsToDiskDebounced();

        broadcastToTab(targetTabId, {
            type: 'prompt_complete',
            data: cleanStdout,
            stderr: cleanStderr,
            exitCode: code,
            durationMs: durationMs
        });
        broadcastToTab(targetTabId, { type: 'status_idle', exitCode: code });
        broadcastTabsList();

        if (onFinish) {
            onFinish({
                success: code === 0,
                stdout: cleanStdout,
                stderr: cleanStderr,
                exitCode: code,
                durationMs: durationMs,
                tabId: targetTabId,
                sessionId: session.sessionId
            });
        }
    });

    return proc;
}

// Execução Headless de Comandos Shell
function runHeadlessCommand({ command, tabId, cwd, onChunk, onFinish }) {
    const targetTabId = tabId || 'tab-1';
    let session = sessions.get(targetTabId);
    if (!session) {
        session = createSession(targetTabId, 'Terminal', cwd || process.cwd(), false);
    }

    const workingDir = cwd || session.cwd || process.cwd();
    session.lastCommand = command;

    const shortCwd = formatShortCwd(workingDir);
    broadcastToTab(targetTabId, { type: 'command_start', command, cwd: workingDir, shortCwd });

    // Injeta captura de novo CWD e novo ambiente
    const envDetectSnippet = `if [ -f /etc/os-release ]; then . /etc/os-release; _DISTRO_NAME="$NAME"; elif [ -n "$PREFIX" ] && echo "$PREFIX" | grep -q com.termux; then _DISTRO_NAME="Termux"; else _DISTRO_NAME="Linux"; fi; echo "__NEW_ENV__=\${_DISTRO_NAME:-Linux}"`;
    const wrappedCmd = `${command}\n__EXIT_CODE__=$?\necho "__NEW_CWD__=$(pwd)"\n${envDetectSnippet}\nexit $__EXIT_CODE__`;

    const env = getExecutionEnv();
    const startTime = Date.now();

    const proc = spawn(wrappedCmd, {
        shell: true,
        cwd: workingDir,
        env: env,
        detached: false
    });

    activeProcesses.set(targetTabId, proc);
    broadcastTabsList();

    let stdoutAcc = '';
    let stderrAcc = '';

    proc.stdout.on('data', (chunk) => {
        let text = chunk.toString();

        if (text.includes('__NEW_CWD__=')) {
            const match = text.match(/__NEW_CWD__=(.*?)(\r?\n|$)/);
            if (match && match[1]) {
                session.cwd = match[1].trim();
                broadcastToTab(targetTabId, { type: 'cwd_updated', cwd: session.cwd });
                broadcastTabsList();
                saveSessionsToDisk();
            }
            text = text.replace(/__NEW_CWD__=.*?(\r?\n|$)/g, '');
        }

        if (text.includes('__NEW_ENV__=')) {
            const envMatch = text.match(/__NEW_ENV__=(.*?)(\r?\n|$)/);
            if (envMatch && envMatch[1]) {
                const rawEnv = envMatch[1].trim();
                let detectedType = 'distro';
                let detectedLabel = rawEnv;
                if (/termux/i.test(rawEnv)) {
                    detectedType = 'termux';
                    detectedLabel = 'Termux';
                }
                session.envType = detectedType;
                session.envLabel = detectedLabel;
                broadcastTabsList();
                saveSessionsToDisk();
            }
            text = text.replace(/__NEW_ENV__=.*?(\r?\n|$)/g, '');
        }

        const cleanText = stripAnsi(text);
        if (cleanText) {
            stdoutAcc += cleanText;
            if (onChunk) onChunk({ type: 'stdout', text: cleanText });
            broadcastToTab(targetTabId, { type: 'output', data: cleanText });
        }
    });

    proc.stderr.on('data', (chunk) => {
        const cleanText = stripAnsi(chunk.toString());
        stderrAcc += cleanText;
        if (onChunk) onChunk({ type: 'stderr', text: cleanText });
        broadcastToTab(targetTabId, { type: 'error', data: cleanText });
    });

    proc.on('error', (err) => {
        activeProcesses.delete(targetTabId);
        const errorMsg = `\n[Falha de execução: ${err.message}]\n`;
        stderrAcc += errorMsg;
        broadcastToTab(targetTabId, { type: 'error', data: errorMsg });
        broadcastToTab(targetTabId, { type: 'status_idle', exitCode: 1 });
        broadcastTabsList();
        if (onFinish) {
            onFinish({
                success: false,
                stdout: stdoutAcc,
                stderr: stderrAcc,
                exitCode: 1,
                cwd: session.cwd,
                tabId: targetTabId
            });
        }
    });

    proc.on('close', (code) => {
        activeProcesses.delete(targetTabId);
        const durationMs = Date.now() - startTime;
        broadcastToTab(targetTabId, { type: 'status_idle', exitCode: code, durationMs });
        broadcastTabsList();
        if (onFinish) {
            onFinish({
                success: code === 0,
                stdout: stdoutAcc.trim(),
                stderr: stderrAcc.trim(),
                exitCode: code,
                cwd: session.cwd,
                durationMs,
                tabId: targetTabId
            });
        }
    });

    return proc;
}

// ==========================================
// ENDPOINTS HTTP REST
// ==========================================

// 1. Endpoint HTTP Headless Antigravity (Requisito Principal do Refactor)
app.post('/api/prompt', (req, res) => {
    const { prompt, sessionId, tabId, cwd, continueSession, model, effort } = req.body;

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
        return res.status(400).json({ success: false, error: 'O campo prompt é obrigatório.' });
    }

    const targetTabId = tabId || 'tab-1';

    // Se já estiver rodando um processo nessa aba, cancela ou retorna erro
    if (activeProcesses.has(targetTabId)) {
        return res.status(409).json({
            success: false,
            error: 'Já existe uma execução ativa para esta sessão. Cancele-a antes de iniciar outra.'
        });
    }

    runHeadlessAgyPrompt({
        prompt: prompt.trim(),
        sessionId,
        tabId: targetTabId,
        cwd,
        continueSession: continueSession !== false,
        model,
        effort,
        onFinish: (result) => {
            res.json(result);
        }
    });
});

// 2. Endpoint HTTP para Streaming de Prompt (Server-Sent Events)
app.get('/api/prompt/stream', (req, res) => {
    const prompt = req.query.prompt;
    const tabId = req.query.tabId || 'tab-1';
    const sessionId = req.query.sessionId;
    const cwd = req.query.cwd;
    const model = req.query.model;

    if (!prompt) {
        return res.status(400).json({ error: 'Prompt ausente.' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    runHeadlessAgyPrompt({
        prompt,
        sessionId,
        tabId,
        cwd,
        continueSession: true,
        model,
        onChunk: (chunk) => {
            res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        },
        onFinish: (result) => {
            res.write(`data: ${JSON.stringify({ type: 'done', result })}\n\n`);
            res.end();
        }
    });
});

// 3. Endpoint HTTP para Execução de Comandos Shell
app.post('/api/command', (req, res) => {
    const { command, tabId, cwd } = req.body;

    if (!command || typeof command !== 'string' || !command.trim()) {
        return res.status(400).json({ success: false, error: 'Comando ausente.' });
    }

    const targetTabId = tabId || 'tab-1';

    if (activeProcesses.has(targetTabId)) {
        return res.status(409).json({
            success: false,
            error: 'Um processo já está em execução nesta aba.'
        });
    }

    runHeadlessCommand({
        command: command.trim(),
        tabId: targetTabId,
        cwd,
        onFinish: (result) => {
            res.json(result);
        }
    });
});

// 4. Endpoints de Gerenciamento de Sessões
app.get('/api/sessions', (req, res) => {
    const list = Array.from(sessions.values()).map(s => ({
        id: s.id,
        title: s.title,
        cwd: s.cwd,
        envType: s.envType,
        envLabel: s.envLabel,
        sessionId: s.sessionId,
        isAgyMode: s.isAgyMode,
        isRunning: activeProcesses.has(s.id),
        messageCount: s.messages.length
    }));
    res.json({ success: true, sessions: list });
});

app.post('/api/sessions', (req, res) => {
    const { id, title, cwd, isAgyMode } = req.body;
    const tabId = id || ('tab-' + Date.now().toString(36));
    const session = createSession(tabId, title, cwd, isAgyMode !== false);
    broadcastTabsList();
    res.json({ success: true, session });
});

app.get('/api/sessions/:id/messages', (req, res) => {
    const session = sessions.get(req.params.id);
    if (!session) {
        return res.status(404).json({ success: false, error: 'Sessão não encontrada.' });
    }
    res.json({ success: true, messages: session.messages, cwd: session.cwd, title: session.title });
});

app.delete('/api/sessions/:id', (req, res) => {
    const tabId = req.params.id;
    if (activeProcesses.has(tabId)) {
        const proc = activeProcesses.get(tabId);
        try { proc.kill('SIGKILL'); } catch (e) {}
        activeProcesses.delete(tabId);
    }
    sessions.delete(tabId);
    if (sessions.size === 0) {
        createSession('tab-1');
    }
    saveSessionsToDisk();
    broadcastTabsList();
    res.json({ success: true });
});

// 5. Cancelamento / Interrupção de Processo Ativo
app.post('/api/cancel', (req, res) => {
    const { tabId } = req.body;
    const targetTabId = tabId || 'tab-1';

    if (activeProcesses.has(targetTabId)) {
        const proc = activeProcesses.get(targetTabId);
        try {
            if (proc.pid) process.kill(-proc.pid, 'SIGINT');
        } catch (e) {
            try { proc.kill('SIGKILL'); } catch (e2) {}
        }
        activeProcesses.delete(targetTabId);
        broadcastToTab(targetTabId, { type: 'system', data: '\n[Processo interrompido pelo usuário]\n' });
        broadcastToTab(targetTabId, { type: 'status_idle', exitCode: 130 });
        broadcastTabsList();
        return res.json({ success: true, message: 'Processo cancelado.' });
    }
    res.json({ success: true, message: 'Nenhum processo ativo.' });
});

// 6. Endpoint do Explorador de Diretórios / Arquivos
app.get('/api/fs/list', (req, res) => {
    const rawPath = req.query.path || process.env.HOME || '/root';
    const userHome = process.env.HOME || '/root';
    let targetPath = rawPath;

    if (rawPath === '~') {
        targetPath = userHome;
    } else if (rawPath.startsWith('~/')) {
        targetPath = path.join(userHome, rawPath.substring(2));
    }

    if (!path.isAbsolute(targetPath)) {
        targetPath = path.resolve(userHome, targetPath);
    }

    fs.readdir(targetPath, { withFileTypes: true }, (err, entries) => {
        if (err) {
            return res.status(500).json({ success: false, error: err.message, path: targetPath, items: [] });
        }

        const showHidden = req.query.showHidden === 'true';
        const filtered = showHidden ? entries : entries.filter(e => !e.name.startsWith('.'));

        const items = filtered.map(entry => {
            const itemPath = path.join(targetPath, entry.name);
            let isDir = entry.isDirectory();
            let size = 0;
            let mtime = null;
            try {
                const stats = fs.statSync(itemPath);
                size = stats.size;
                mtime = stats.mtime;
                isDir = stats.isDirectory();
            } catch (e) {}

            return {
                name: entry.name,
                fullPath: itemPath,
                isDirectory: isDir,
                isSymbolicLink: entry.isSymbolicLink(),
                size: size,
                mtime: mtime
            };
        }).sort((a, b) => {
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;
            return a.name.localeCompare(b.name);
        });

        res.json({
            success: true,
            path: targetPath,
            parent: targetPath === '/' ? null : path.dirname(targetPath),
            items: items
        });
    });
});

// 7. Termux Bridge / Disparo Remoto
app.post('/api/bridge/open', (req, res) => {
    const { targetPath } = req.body;
    const scriptPath = path.join(__dirname, 'scripts', 'open_in_termux.py');
    const p = spawn('python3', [scriptPath, targetPath || process.cwd()], {
        cwd: process.cwd(),
        env: process.env
    });

    let out = '';
    p.stdout.on('data', d => { out += d.toString(); });
    p.stderr.on('data', d => { out += d.toString(); });

    p.on('close', code => {
        res.json({ success: code === 0, code, output: out });
    });
});

// ==========================================
// WEBSOCKET HANDLERS (COMPATIBILIDADE E TEMPO REAL)
// ==========================================
wss.on('connection', (ws) => {
    broadcastTabsList();

    const defaultEnv = getHostEnvironmentType();

    sessions.forEach((session) => {
        ws.send(JSON.stringify({
            type: 'history',
            tabId: session.id,
            title: session.title,
            envType: session.isSsh ? 'ssh' : (session.envType || defaultEnv.type),
            envLabel: session.isSsh ? 'SSH' : (session.envLabel || defaultEnv.label),
            data: session.logHistory,
            messages: session.messages,
            cwd: session.cwd,
            isRunning: activeProcesses.has(session.id) || (session.isSsh && session.sshClient !== null),
            isSsh: !!session.isSsh,
            sshHost: session.sshHost || null,
            isAgyMode: !!session.isAgyMode
        }));
    });

    ws.on('message', (message) => {
        let parsed;
        try {
            parsed = JSON.parse(message);
        } catch (e) {
            ws.send(JSON.stringify({ type: 'error', data: '\n[Erro: JSON inválido]\n' }));
            return;
        }

        const tabId = parsed.tabId || 'tab-1';
        let session = sessions.get(tabId);

        if (parsed.action === 'sync_tab') {
            if (session) {
                const defaultEnv = getHostEnvironmentType();
                ws.send(JSON.stringify({
                    type: 'history',
                    tabId: session.id,
                    title: session.title,
                    envType: session.isSsh ? 'ssh' : (session.envType || defaultEnv.type),
                    envLabel: session.isSsh ? 'SSH' : (session.envLabel || defaultEnv.label),
                    data: session.logHistory,
                    messages: session.messages,
                    cwd: session.cwd,
                    isRunning: activeProcesses.has(session.id) || (session.isSsh && session.sshClient !== null),
                    isSsh: !!session.isSsh,
                    sshHost: session.sshHost || null,
                    isAgyMode: !!session.isAgyMode
                }));
            }
            return;
        }

        if (parsed.action === 'create_tab') {
            const newTabId = parsed.newTabId || ('tab-' + Date.now().toString(36));
            const initialCwd = parsed.cwd || (session ? session.cwd : null);
            const isAgy = parsed.isAgyMode !== false;
            const newSession = createSession(newTabId, parsed.title || null, initialCwd, isAgy);
            broadcastTabsList();
            ws.send(JSON.stringify({
                type: 'tab_created',
                tabId: newTabId,
                title: newSession.title,
                envType: newSession.envType,
                envLabel: newSession.envLabel,
                cwd: newSession.cwd,
                isAgyMode: newSession.isAgyMode,
                isRunning: false,
                isSsh: false
            }));
            return;
        }

        if (parsed.action === 'close_tab') {
            const targetTabId = parsed.targetTabId || tabId;
            const targetSession = sessions.get(targetTabId);
            if (targetSession) {
                if (activeProcesses.has(targetTabId)) {
                    const p = activeProcesses.get(targetTabId);
                    try { p.kill('SIGKILL'); } catch (e) {}
                    activeProcesses.delete(targetTabId);
                }
                if (targetSession.isSsh && targetSession.sshClient) {
                    try {
                        if (targetSession.sshStream) targetSession.sshStream.end();
                        targetSession.sshClient.end();
                    } catch (e) {}
                }
                sessions.delete(targetTabId);
                if (sessions.size === 0) {
                    createSession('tab-1');
                }
                saveSessionsToDisk();
                broadcastTabsList();
                const json = JSON.stringify({ type: 'tab_closed', tabId: targetTabId });
                wss.clients.forEach(c => {
                    if (c.readyState === WebSocket.OPEN) c.send(json);
                });
            }
            return;
        }

        if (!session) {
            session = createSession(tabId);
            broadcastTabsList();
        }

        if (parsed.action === 'kill') {
            if (activeProcesses.has(tabId)) {
                const p = activeProcesses.get(tabId);
                try {
                    if (p.pid) process.kill(-p.pid, 'SIGINT');
                } catch (e) {
                    try { p.kill('SIGKILL'); } catch (e2) {}
                }
                activeProcesses.delete(tabId);
                broadcastToTab(tabId, { type: 'system', data: '\n[Processo interrompido pelo usuário]\n' });
                broadcastToTab(tabId, { type: 'status_idle', exitCode: 130 });
                broadcastTabsList();
            } else {
                ws.send(JSON.stringify({ tabId, type: 'status_idle' }));
            }
            return;
        }

        if (parsed.action === 'clear_history') {
            session.logHistory.length = 0;
            session.messages.length = 0;
            saveSessionsToDisk();
            return;
        }

        // Ação de Execução de Prompt ou Comando via WebSocket
        if (parsed.action === 'prompt' || parsed.action === 'command') {
            const cmd = parsed.data ? parsed.data.trim() : '';
            if (!cmd) return;

            if (activeProcesses.has(tabId)) {
                ws.send(JSON.stringify({ tabId, type: 'error', data: '\n[Aviso: Já existe um processo em execução nesta aba]\n' }));
                return;
            }

            // Tratamento especial /open para Termux Bridge
            if (/^\/open(\s+.*)?$/i.test(cmd) || /^\/termux(\s+.*)?$/i.test(cmd)) {
                const targetArg = cmd.replace(/^\/(?:open|termux)\s*/i, '').trim();
                const targetPath = targetArg || session.cwd;
                const shortCwd = formatShortCwd(session.cwd);
                broadcastToTab(tabId, { type: 'system', data: `\n${shortCwd}$ ${cmd}\n` });
                
                const openScript = path.join(__dirname, 'scripts', 'open_in_termux.py');
                const p = spawn('python3', [openScript, targetPath], {
                    cwd: session.cwd,
                    env: process.env
                });

                p.stdout.on('data', (d) => broadcastToTab(tabId, { type: 'stdout', data: d.toString() }));
                p.stderr.on('data', (d) => broadcastToTab(tabId, { type: 'stderr', data: d.toString() }));
                p.on('close', (code) => {
                    if (code === 0) {
                        broadcastToTab(tabId, { type: 'system', data: `\n[Sucesso: Solicitação enviada ao Termux Bridge]\n` });
                    } else {
                        broadcastToTab(tabId, { type: 'error', data: `\n[Aviso: Termux Bridge retornou código ${code}]\n` });
                    }
                    broadcastToTab(tabId, { type: 'status_idle' });
                });
                return;
            }

            // Se for modo AGY Chat ou começar com agy
            if (session.isAgyMode || parsed.action === 'prompt' || /^agy\s+/i.test(cmd) || cmd === 'agy') {
                let cleanPrompt = cmd;
                if (/^agy\s+/i.test(cleanPrompt)) {
                    cleanPrompt = cleanPrompt.replace(/^agy\s+/i, '').trim();
                } else if (cleanPrompt === 'agy') {
                    cleanPrompt = 'Olá! Em que posso ajudar com este projeto?';
                }

                session.isAgyMode = true;
                session.title = 'AGY Chat';
                saveSessionsToDisk();
                broadcastTabsList();

                runHeadlessAgyPrompt({
                    prompt: cleanPrompt,
                    tabId: tabId,
                    cwd: session.cwd,
                    continueSession: true
                });
            } else {
                // Comando de shell tradicional
                runHeadlessCommand({
                    command: cmd,
                    tabId: tabId,
                    cwd: session.cwd
                });
            }
        }
    });
});

const PORT = parseInt(process.env.PORT, 10) || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`[Termux CLI Web] Servidor Headless rodando em http://0.0.0.0:${PORT}`);
    console.log(`[Termux CLI Web] Endpoint Headless Antigravity ativo: POST /api/prompt`);
});

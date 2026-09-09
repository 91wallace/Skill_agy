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

// Serve a pasta 'public' onde ficará o frontend (PWA)
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Gerenciamento de Múltiplas Sessões / Abas de Terminal
const MAX_LOG_HISTORY = 1000;
const sessions = new Map(); // tabId -> SessionObject

// Detecção do ambiente de execução do sistema hospedeiro (Termux, Proot, Distro Linux)
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

    // Se encontramos uma distro via /etc/os-release (ex: Ubuntu em PRoot ou Ubuntu Linux nativo)
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

function createSession(tabId, title = null, initialCwd = null) {
    const currentEnv = getHostEnvironmentType();
    const defaultCwd = initialCwd || process.env.HOME || process.cwd();
    const defaultTitle = title || currentEnv.label;
    const session = {
        id: tabId,
        title: defaultTitle,
        cwd: defaultCwd,
        envType: currentEnv.type, // 'termux' | 'distro' | 'ssh'
        envLabel: currentEnv.label,
        currentProcess: null,
        isCurrentProcessPty: false,
        isSsh: false,
        sshClient: null,
        sshStream: null,
        sshHost: null,
        logHistory: [],
        lastCommand: ''
    };
    sessions.set(tabId, session);
    return session;
}

// Inicializa a primeira sessão padrão
createSession('tab-1');

// Formata caminho encurtado exibindo os dois últimos diretórios sem barra inicial (ex: projects/Skill_agy)
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
        // Salva no histórico da aba específica (exceto chunks de streaming PTY xterm)
        if (obj.type !== 'pty_output') {
            session.logHistory.push(obj);
            if (session.logHistory.length > MAX_LOG_HISTORY) {
                session.logHistory.shift();
            }
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
        isRunning: (s.currentProcess !== null) || (s.isSsh && s.sshClient !== null),
        isPty: s.isCurrentProcessPty || s.isSsh,
        isSsh: !!s.isSsh,
        sshHost: s.sshHost || null,
        lastCommand: s.lastCommand
    }));
    const json = JSON.stringify({ type: 'tabs_list', tabs: list });
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(json);
        }
    });
}

wss.on('connection', (ws) => {
    // Ao conectar/reconectar, envia lista de abas disponíveis
    broadcastTabsList();

    const defaultEnv = getHostEnvironmentType();

    // Envia o estado de todas as abas
    sessions.forEach((session) => {
        ws.send(JSON.stringify({
            type: 'history',
            tabId: session.id,
            title: session.title,
            envType: session.isSsh ? 'ssh' : (session.envType || defaultEnv.type),
            envLabel: session.isSsh ? 'SSH' : (session.envLabel || defaultEnv.label),
            data: session.logHistory,
            cwd: session.cwd,
            isRunning: (session.currentProcess !== null) || (session.isSsh && session.sshClient !== null),
            isPty: session.isCurrentProcessPty || session.isSsh,
            isSsh: !!session.isSsh,
            sshHost: session.sshHost || null
        }));
    });

    ws.on('message', (message) => {
        let parsed;
        try {
            parsed = JSON.parse(message);
        } catch (e) {
            ws.send(JSON.stringify({ type: 'error', data: '\n[Erro: Formato JSON inválido]\n' }));
            return;
        }

        const tabId = parsed.tabId || 'tab-1';
        let session = sessions.get(tabId);

        // Ação: Criar nova aba
        if (parsed.action === 'create_tab') {
            const newTabId = parsed.newTabId || ('tab-' + Date.now().toString(36));
            const initialCwd = parsed.cwd || (session ? session.cwd : null);
            const newSession = createSession(newTabId, parsed.title || null, initialCwd);
            broadcastTabsList();
            ws.send(JSON.stringify({
                type: 'tab_created',
                tabId: newTabId,
                title: newSession.title,
                envType: newSession.envType,
                envLabel: newSession.envLabel,
                cwd: newSession.cwd,
                isRunning: false,
                isPty: false,
                isSsh: false
            }));
            return;
        }

        // Ação: Fechar aba
        if (parsed.action === 'close_tab') {
            const targetTabId = parsed.targetTabId || tabId;
            const targetSession = sessions.get(targetTabId);
            if (targetSession) {
                // Se for sessão SSH ativa, encerra conexão
                if (targetSession.isSsh && targetSession.sshClient) {
                    try {
                        if (targetSession.sshStream) targetSession.sshStream.end();
                        targetSession.sshClient.end();
                    } catch (e) {}
                    targetSession.sshClient = null;
                    targetSession.sshStream = null;
                }
                // Se o processo local estiver rodando na aba, encerra-o
                if (targetSession.currentProcess) {
                    try {
                        if (targetSession.isCurrentProcessPty && targetSession.currentProcess.stdin && !targetSession.currentProcess.stdin.destroyed) {
                            targetSession.currentProcess.stdin.write(JSON.stringify({ __ctrl__: 'kill' }) + '\n');
                        }
                        if (targetSession.currentProcess.pid) {
                            process.kill(-targetSession.currentProcess.pid, 'SIGKILL');
                        }
                    } catch (e) {
                        try {
                            targetSession.currentProcess.kill('SIGKILL');
                        } catch (e2) {}
                    }
                }
                sessions.delete(targetTabId);
                // Garante que sempre exista ao menos 1 aba ativa
                if (sessions.size === 0) {
                    createSession('tab-1');
                }
                broadcastTabsList();
                const json = JSON.stringify({ type: 'tab_closed', tabId: targetTabId });
                wss.clients.forEach(c => {
                    if (c.readyState === WebSocket.OPEN) c.send(json);
                });
            }
            return;
        }

        // Se a sessão não existir para as demais ações, cria dinamicamente
        if (!session) {
            session = createSession(tabId);
            broadcastTabsList();
        }

        // Ação: Conectar via SSH Nativo
        if (parsed.action === 'ssh_connect') {
            const host = parsed.host;
            const port = parseInt(parsed.port, 10) || 22;
            const username = parsed.username || 'root';
            const password = parsed.password;
            const privateKey = parsed.privateKey;
            const termCols = parsed.cols || 80;
            const termRows = parsed.rows || 24;

            if (!host) {
                ws.send(JSON.stringify({ tabId, type: 'error', data: '\n[Erro SSH: Host ou IP não especificado]\n' }));
                return;
            }

            // Encerra processo ou conexão SSH anterior na mesma aba se houver
            if (session.sshClient) {
                try {
                    if (session.sshStream) session.sshStream.end();
                    session.sshClient.end();
                } catch (e) {}
                session.sshClient = null;
                session.sshStream = null;
            }

            session.isSsh = true;
            session.envType = 'ssh';
            session.envLabel = 'SSH';
            session.sshHost = `${username}@${host}:${port}`;
            session.title = `SSH: ${username}@${host}`;
            session.isCurrentProcessPty = true;

            broadcastToTab(tabId, { type: 'system', data: `\n[Iniciando conexão SSH com ${username}@${host}:${port}...]\n` });
            broadcastToTab(tabId, { type: 'pty_opened', command: `ssh ${username}@${host}` });
            broadcastTabsList();

            const conn = new Client();
            session.sshClient = conn;

            conn.on('ready', () => {
                broadcastToTab(tabId, { type: 'system', data: `\n[Autenticado com sucesso em ${host}! Abrindo terminal PTY...]\n\r` });
                conn.shell({ term: 'xterm-256color', cols: termCols, rows: termRows }, (err, stream) => {
                    if (err) {
                        broadcastToTab(tabId, { type: 'error', data: `\n[Erro ao criar shell SSH: ${err.message}]\n` });
                        conn.end();
                        return;
                    }

                    session.sshStream = stream;

                    stream.on('data', (data) => {
                        broadcastToTab(tabId, { type: 'pty_output', data: data.toString('utf-8') });
                    });

                    stream.stderr.on('data', (data) => {
                        broadcastToTab(tabId, { type: 'pty_output', data: data.toString('utf-8') });
                    });

                    stream.on('close', () => {
                        broadcastToTab(tabId, { type: 'system', data: `\n\r[Sessão SSH encerrada pelo servidor remoto]\n\r` });
                        broadcastToTab(tabId, { type: 'pty_closed' });
                        broadcastToTab(tabId, { type: 'status_idle' });
                        session.isSsh = false;
                        session.sshStream = null;
                        session.sshClient = null;
                        session.isCurrentProcessPty = false;
                        broadcastTabsList();
                    });
                });
            });

            conn.on('error', (err) => {
                broadcastToTab(tabId, { type: 'error', data: `\n[Erro de Conexão SSH: ${err.message}]\n` });
                broadcastToTab(tabId, { type: 'pty_closed' });
                broadcastToTab(tabId, { type: 'status_idle' });
                session.isSsh = false;
                session.sshStream = null;
                session.sshClient = null;
                session.isCurrentProcessPty = false;
                broadcastTabsList();
            });

            conn.on('end', () => {
                session.isSsh = false;
                session.sshStream = null;
                session.sshClient = null;
                session.isCurrentProcessPty = false;
                broadcastTabsList();
            });

            const sshConfig = {
                host: host,
                port: port,
                username: username,
                readyTimeout: 20000,
                keepaliveInterval: 10000
            };

            if (privateKey && privateKey.trim()) {
                sshConfig.privateKey = privateKey.trim();
                if (password) sshConfig.passphrase = password;
            } else if (password !== undefined) {
                sshConfig.password = password;
            }

            try {
                conn.connect(sshConfig);
            } catch (err) {
                broadcastToTab(tabId, { type: 'error', data: `\n[Falha ao inicializar SSH: ${err.message}]\n` });
                session.isSsh = false;
                session.sshClient = null;
                broadcastTabsList();
            }
            return;
        }

        // Ação de listagem de diretório em árvore (rápida e assíncrona)
        if (parsed.action === 'list_dir') {
            let rawPath = parsed.path || session.cwd || process.env.HOME || '/root';
            const userHome = process.env.HOME || '/root';
            if (rawPath === '~') {
                rawPath = userHome;
            } else if (rawPath.startsWith('~/')) {
                rawPath = path.join(userHome, rawPath.substring(2));
            }

            let targetPath;
            if (path.isAbsolute(rawPath)) {
                targetPath = path.normalize(rawPath);
            } else {
                targetPath = path.resolve(session.cwd || userHome, rawPath);
            }

            fs.readdir(targetPath, { withFileTypes: true }, (err, entries) => {
                if (err) {
                    ws.send(JSON.stringify({
                        type: 'dir_list_result',
                        tabId: tabId,
                        requestId: parsed.requestId,
                        path: targetPath,
                        error: err.message,
                        items: []
                    }));
                    return;
                }

                const showHidden = parsed.showHidden === true;
                const filteredEntries = showHidden ? entries : entries.filter(e => !e.name.startsWith('.'));

                const items = filteredEntries.map(entry => ({
                    name: entry.name,
                    isDirectory: entry.isDirectory(),
                    isSymbolicLink: entry.isSymbolicLink()
                })).sort((a, b) => {
                    if (a.isDirectory && !b.isDirectory) return -1;
                    if (!a.isDirectory && b.isDirectory) return 1;
                    return a.name.localeCompare(b.name);
                });

                ws.send(JSON.stringify({
                    type: 'dir_list_result',
                    tabId: tabId,
                    requestId: parsed.requestId,
                    path: targetPath,
                    items: items
                }));
            });
            return;
        }

        // Ação de redimensionamento do terminal PTY
        if (parsed.action === 'pty_resize') {
            const cols = parsed.cols || 80;
            const rows = parsed.rows || 24;
            if (session.isSsh && session.sshStream) {
                try {
                    session.sshStream.setWindow(rows, cols, 0, 0);
                } catch (e) {}
            } else if (session.currentProcess && session.isCurrentProcessPty && session.currentProcess.stdin && !session.currentProcess.stdin.destroyed) {
                try {
                    const resizePayload = JSON.stringify({
                        __ctrl__: 'resize',
                        cols: cols,
                        rows: rows
                    }) + '\n';
                    session.currentProcess.stdin.write(resizePayload);
                } catch (e) {}
            }
            return;
        }

        // Ação de cancelamento explícito (Ctrl+C)
        if (parsed.action === 'kill') {
            if (session.isSsh && session.sshStream) {
                try {
                    session.sshStream.write('\x03');
                } catch (e) {}
                return;
            }
            if (session.currentProcess) {
                try {
                    if (session.isCurrentProcessPty && session.currentProcess.stdin && !session.currentProcess.stdin.destroyed) {
                        session.currentProcess.stdin.write(JSON.stringify({ __ctrl__: 'kill' }) + '\n');
                    }
                    if (session.currentProcess.pid) {
                        process.kill(-session.currentProcess.pid, 'SIGINT');
                    }
                } catch (e) {
                    try {
                        session.currentProcess.kill('SIGKILL');
                    } catch (e2) {}
                }
                broadcastToTab(tabId, { type: 'system', data: '\n[Sinal SIGINT enviado: Processo interrompido pelo usuário]\n' });
                broadcastToTab(tabId, { type: 'pty_closed' });
                broadcastToTab(tabId, { type: 'status_idle' });
                session.currentProcess = null;
                session.isCurrentProcessPty = false;
                broadcastTabsList();
            } else {
                ws.send(JSON.stringify({ tabId, type: 'system', data: '\n[Nenhum processo ativo para interromper]\n' }));
                ws.send(JSON.stringify({ tabId, type: 'status_idle' }));
            }
            return;
        }

        // Ação de limpar histórico no servidor para a aba
        if (parsed.action === 'clear_history') {
            session.logHistory.length = 0;
            return;
        }

        // Ação de entrada interativa / tecla / resposta (stdin ou PTY raw input)
        if (parsed.action === 'input' || parsed.action === 'pty_input') {
            const rawData = parsed.data !== undefined ? String(parsed.data) : '';
            if (session.isSsh && session.sshStream) {
                try {
                    session.sshStream.write(rawData);
                } catch (e) {}
                return;
            }
            if (session.currentProcess && session.currentProcess.stdin && !session.currentProcess.stdin.destroyed) {
                try {
                    if (session.isCurrentProcessPty) {
                        // Envia para a bridge PTY
                        const ctrlMsg = JSON.stringify({ __ctrl__: 'input', data: rawData }) + '\n';
                        session.currentProcess.stdin.write(ctrlMsg);
                    } else {
                        session.currentProcess.stdin.write(rawData + '\n');
                        broadcastToTab(tabId, { type: 'system', data: `[Entrada: ${rawData}]\n` });
                    }
                } catch (err) {
                    console.error('Erro ao escrever no stdin:', err);
                }
            }
            return;
        }

        // Ação de execução de comando
        if (parsed.action === 'command') {
            const cmd = parsed.data ? parsed.data.trim() : '';
            if (!cmd) return;
            
            if (session.currentProcess) {
                ws.send(JSON.stringify({ tabId, type: 'error', data: '\n[Aviso: Um processo já está em execução nesta aba. Encerre-o ou abra uma nova aba.]\n' }));
                return;
            }

            session.lastCommand = cmd;

            // Identifica se é comando com tela cheia / TUI tradicional (top, nano, htop, vi, fzf, etc.)
            const isInteractiveTui = /^(top|htop|nano|vi|vim|less|more|fzf|tmux)$/.test(cmd);

            const shortCwd = formatShortCwd(session.cwd);
            broadcastToTab(tabId, { type: 'system', data: `\n${shortCwd}$ ${cmd}\n` });

            const fullPath = [
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

            const userHome = process.env.HOME || '/root';
            const userName = process.env.USER || 'root';
            const defaultCols = parsed.cols || 80;
            const defaultRows = parsed.rows || 24;

            if (isInteractiveTui) {
                session.isCurrentProcessPty = true;
                broadcastToTab(tabId, { type: 'pty_opened', command: cmd });
                broadcastTabsList();

                const bridgeScript = path.join(__dirname, 'pty_bridge.py');
                session.currentProcess = spawn('python3', [bridgeScript, cmd, String(defaultRows), String(defaultCols)], {
                    cwd: session.cwd,
                    detached: true,
                    env: Object.assign({}, process.env, {
                        HOME: userHome,
                        USER: userName,
                        PATH: fullPath,
                        FORCE_COLOR: '1',
                        CLICOLOR: '1',
                        CLICOLOR_FORCE: '1',
                        TERM: 'xterm-256color',
                        COLORTERM: 'truecolor'
                    })
                });

                session.currentProcess.stdout.on('data', (data) => {
                    const str = data.toString('utf-8');
                    broadcastToTab(tabId, { type: 'pty_output', data: str });
                });

                session.currentProcess.stderr.on('data', (data) => {
                    const str = data.toString('utf-8');
                    broadcastToTab(tabId, { type: 'pty_output', data: str });
                });
            } else {
                session.isCurrentProcessPty = false;
                broadcastTabsList();

                let effectiveCmd = cmd;
                // Se for comando 'agy' ou 'agy <prompt>', adapta para execução limpa em streaming não-bloqueante
                if (effectiveCmd === 'agy') {
                    effectiveCmd = `agy -p "Olá! Como posso te ajudar com o projeto?" -c --dangerously-skip-permissions`;
                } else if (/^agy\s+(.+)$/.test(effectiveCmd)) {
                    const agyArgs = effectiveCmd.replace(/^agy\s+/, '').trim();
                    // Se não tiver flags de print ou help (-p, --print, -h, --help, models, etc.), passa como prompt
                    if (!agyArgs.startsWith('-') && !/^(models|mcp|plugins|update|help|changelog|agents)/.test(agyArgs)) {
                        effectiveCmd = `agy -p ${JSON.stringify(agyArgs)} -c --dangerously-skip-permissions`;
                    }
                }

                // Injeta suporte para execução limpa de comandos preservando detecção de cwd e de ambiente (Termux vs Distro/PRoot)
                const envDetectSnippet = `if [ -f /etc/os-release ]; then . /etc/os-release; _DISTRO_NAME="$NAME"; elif [ -n "$PREFIX" ] && echo "$PREFIX" | grep -q com.termux; then _DISTRO_NAME="Termux"; else _DISTRO_NAME="Linux"; fi; echo "__NEW_ENV__=\${_DISTRO_NAME:-Linux}"`;
                const wrappedCmd = `${effectiveCmd}\n__EXIT_CODE__=$?\necho "__NEW_CWD__=$(pwd)"\n${envDetectSnippet}\nexit $__EXIT_CODE__`;

                session.currentProcess = spawn(wrappedCmd, {
                    shell: true,
                    detached: true,
                    cwd: session.cwd,
                    env: Object.assign({}, process.env, {
                        HOME: userHome,
                        USER: userName,
                        PATH: fullPath,
                        FORCE_COLOR: '1',
                        CLICOLOR: '1',
                        CLICOLOR_FORCE: '1',
                        TERM: 'xterm-256color',
                        DEBIAN_FRONTEND: 'readline',
                        LS_COLORS: process.env.LS_COLORS || 'rs=0:no=37:fi=37:di=01;34:ln=01;36:mh=00:pi=40;33:so=01;35:do=01;35:bd=40;33;01:cd=40;33;01:or=40;31;01:mi=00:su=37;41:sg=30;43:ca=30;41:tw=30;42:ow=34;42:st=37;44:ex=01;32'
                    })
                });

                session.currentProcess.stdout.on('data', (data) => {
                    let text = data.toString();
                    
                    // Intercepta e atualiza o novo diretório atual
                    if (text.includes('__NEW_CWD__=')) {
                        const match = text.match(/__NEW_CWD__=(.*?)(\r?\n|$)/);
                        if (match && match[1]) {
                            session.cwd = match[1].trim();
                            broadcastToTab(tabId, { type: 'cwd_updated', cwd: session.cwd });
                            broadcastTabsList();
                        }
                        text = text.replace(/__NEW_CWD__=.*?(\r?\n|$)/g, '');
                    }

                    // Intercepta e atualiza o novo ambiente em tempo real (ex: Termux -> Ubuntu PRoot)
                    if (text.includes('__NEW_ENV__=')) {
                        const envMatch = text.match(/__NEW_ENV__=(.*?)(\r?\n|$)/);
                        if (envMatch && envMatch[1]) {
                            const rawEnv = envMatch[1].trim();
                            let detectedType = 'distro';
                            let detectedLabel = rawEnv;

                            if (/termux/i.test(rawEnv)) {
                                detectedType = 'termux';
                                detectedLabel = 'Termux';
                            } else if (/ubuntu/i.test(rawEnv)) {
                                detectedLabel = 'Ubuntu';
                            } else if (/debian/i.test(rawEnv)) {
                                detectedLabel = 'Debian';
                            } else if (/arch/i.test(rawEnv)) {
                                detectedLabel = 'Arch';
                            } else if (/alpine/i.test(rawEnv)) {
                                detectedLabel = 'Alpine';
                            } else if (/fedora/i.test(rawEnv)) {
                                detectedLabel = 'Fedora';
                            } else if (/kali/i.test(rawEnv)) {
                                detectedLabel = 'Kali';
                            }

                            if (!session.isSsh && (session.envLabel !== detectedLabel || session.envType !== detectedType)) {
                                session.envType = detectedType;
                                session.envLabel = detectedLabel;
                                session.title = detectedLabel;
                                broadcastToTab(tabId, {
                                    type: 'env_updated',
                                    envType: detectedType,
                                    envLabel: detectedLabel,
                                    title: detectedLabel
                                });
                                broadcastTabsList();
                            }
                        }
                        text = text.replace(/__NEW_ENV__=.*?(\r?\n|$)/g, '');
                    }

                    if (text && text.trim().length > 0) {
                        broadcastToTab(tabId, { type: 'output', data: text });
                    }
                });

                session.currentProcess.stderr.on('data', (data) => {
                    broadcastToTab(tabId, { type: 'error', data: data.toString() });
                });
            }

            let isFinished = false;
            const handleFinish = (code, reason) => {
                if (isFinished) return;
                isFinished = true;
                const wasPty = session.isCurrentProcessPty;
                session.currentProcess = null;
                session.isCurrentProcessPty = false;

                if (wasPty) {
                    broadcastToTab(tabId, { type: 'pty_closed' });
                }
                broadcastToTab(tabId, { type: 'status_idle', exitCode: code });
                broadcastTabsList();
            };

            session.currentProcess.on('exit', (code) => {
                handleFinish(code, 'exit');
            });

            session.currentProcess.on('close', (code) => {
                handleFinish(code, 'close');
            });
            
            session.currentProcess.on('error', (err) => {
                broadcastToTab(tabId, { type: 'error', data: `\n[Falha de execução: ${err.message}]\n` });
                handleFinish(1, 'error');
            });
        }
    });
});

// Binding do servidor e fallback dinâmico
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`[Termux CLI Web] Servidor rodando em http://localhost:${PORT}`);
    console.log(`[Termux CLI Web] Suporte a Múltiplas Abas + PTY + Xterm ativado.`);
});

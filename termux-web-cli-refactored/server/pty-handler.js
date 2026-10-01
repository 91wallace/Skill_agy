/**
 * PTY and Command Execution Handler for Termux Web CLI v2
 */
const { spawn } = require('child_process');
const path = require('path');
const { broadcastToTab, broadcastTabsList, saveSessionsToDisk, formatShortCwd, getHostEnvironmentType } = require('./session-manager');
const { handleAgyStreamTurn } = require('./agy-stream-handler');

const DEFAULT_PATH = [
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

function handleResize(session, parsed) {
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
}

function handleKill(session, tabId, ws) {
    let wasAgy = session.isAgyMode;
    if (session.isAgyMode) {
        session.isAgyMode = false;
        const defaultEnv = getHostEnvironmentType();
        session.title = session.envLabel || defaultEnv.label;
        broadcastToTab(tabId, { type: 'system', data: '\n[Sessão do AGY Assistente finalizada]\n' });
        broadcastTabsList();
    }

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
        broadcastToTab(tabId, { type: 'system', data: '\n[Sinal SIGINT enviado: Processo interrompido]\n' });
        broadcastToTab(tabId, { type: 'pty_closed' });
        broadcastToTab(tabId, { type: 'status_idle' });
        session.currentProcess = null;
        session.isCurrentProcessPty = false;
        broadcastTabsList();
    } else if (!wasAgy) {
        ws.send(JSON.stringify({ tabId, type: 'system', data: '\n[Nenhum processo ativo para interromper]\n' }));
        ws.send(JSON.stringify({ tabId, type: 'status_idle' }));
    }
}

function handleInput(session, tabId, parsed) {
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
}

function handleCommand(session, tabId, parsed, ws) {
    const cmd = parsed.data ? parsed.data.trim() : '';
    if (!cmd) return;

    if (session.currentProcess) {
        ws.send(JSON.stringify({ tabId, type: 'error', data: '\n[Aviso: Um processo já está em execução nesta aba.]\n' }));
        return;
    }

    if (session.isAgyMode && /^(exit|sair|quit|:q|stop|fechar)$/i.test(cmd)) {
        session.isAgyMode = false;
        const defaultEnv = getHostEnvironmentType();
        session.title = session.envLabel || defaultEnv.label;
        broadcastToTab(tabId, { type: 'system', data: `\n${formatShortCwd(session.cwd)}$ ${cmd}\n[Sessão do AGY Assistente finalizada. Modo terminal restaurado.]\n` });
        broadcastToTab(tabId, { type: 'status_idle' });
        broadcastTabsList();
        saveSessionsToDisk();
        return;
    }

    session.lastCommand = cmd;

    if (cmd === 'agy' || /^agy\s+/i.test(cmd)) {
        session.isAgyMode = true;
        session.title = 'AGY Assistente';
        broadcastTabsList();
        saveSessionsToDisk();

        let prompt = '';
        if (cmd === 'agy') {
            prompt = 'Olá! Como posso te ajudar com o projeto?';
        } else {
            prompt = cmd.replace(/^agy\s+/i, '').trim();
        }
        return handleAgyStreamTurn(session, tabId, prompt);
    }

    if (session.isAgyMode) {
        return handleAgyStreamTurn(session, tabId, cmd);
    }

    const isInteractiveTui = /^(top|htop|nano|vi|vim|less|more|fzf|tmux)$/.test(cmd);
    broadcastToTab(tabId, { type: 'command_start', command: cmd, cwd: session.cwd });

    const userHome = process.env.HOME || '/root';
    const userName = process.env.USER || 'root';
    const defaultCols = parsed.cols || 80;
    const defaultRows = parsed.rows || 24;

    if (isInteractiveTui) {
        session.isCurrentProcessPty = true;
        broadcastToTab(tabId, { type: 'pty_opened', command: cmd });
        broadcastTabsList();

        const bridgeScript = path.join(__dirname, '..', 'pty_bridge.py');
        session.currentProcess = spawn('python3', [bridgeScript, cmd, String(defaultRows), String(defaultCols)], {
            cwd: session.cwd,
            detached: true,
            env: Object.assign({}, process.env, {
                HOME: userHome,
                USER: userName,
                PATH: DEFAULT_PATH,
                FORCE_COLOR: '1',
                CLICOLOR: '1',
                CLICOLOR_FORCE: '1',
                TERM: 'xterm-256color',
                COLORTERM: 'truecolor'
            })
        });

        session.currentProcess.stdout.on('data', (data) => {
            broadcastToTab(tabId, { type: 'pty_output', data: data.toString('utf-8') });
        });

        session.currentProcess.stderr.on('data', (data) => {
            broadcastToTab(tabId, { type: 'pty_output', data: data.toString('utf-8') });
        });
    } else {
        session.isCurrentProcessPty = false;
        broadcastTabsList();

        const envDetectSnippet = `if [ -f /etc/os-release ]; then . /etc/os-release; _DISTRO_NAME="$NAME"; elif [ -n "$PREFIX" ] && echo "$PREFIX" | grep -q com.termux; then _DISTRO_NAME="Termux"; else _DISTRO_NAME="Linux"; fi; echo "__NEW_ENV__=\${_DISTRO_NAME:-Linux}"`;
        const wrappedCmd = `${cmd}\n__EXIT_CODE__=$?\necho "__NEW_CWD__=$(pwd)"\n${envDetectSnippet}\nexit $__EXIT_CODE__`;

        session.currentProcess = spawn(wrappedCmd, {
            shell: true,
            detached: true,
            cwd: session.cwd,
            env: Object.assign({}, process.env, {
                HOME: userHome,
                USER: userName,
                PATH: DEFAULT_PATH,
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
            
            if (text.includes('__NEW_CWD__=')) {
                const match = text.match(/__NEW_CWD__=(.*?)(\r?\n|$)/);
                if (match && match[1]) {
                    session.cwd = match[1].trim();
                    broadcastToTab(tabId, { type: 'cwd_updated', cwd: session.cwd });
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
                        saveSessionsToDisk();
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

module.exports = {
    handleResize,
    handleKill,
    handleInput,
    handleCommand
};

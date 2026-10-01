/**
 * Termux Web CLI v2 - Modular Express + WebSocket Server
 */
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const cors = require('cors');

const {
    sessions,
    setWebSocketServer,
    loadSessionsFromDisk,
    saveSessionsToDisk,
    createSession,
    getSession,
    deleteSession,
    broadcastTabsList,
    getHostEnvironmentType
} = require('./server/session-manager');

const { handleSshConnect } = require('./server/ssh-handler');
const { handleListDir } = require('./server/file-handler');
const { handleResize, handleKill, handleInput, handleCommand } = require('./server/pty-handler');

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
setWebSocketServer(wss);

// Restore saved sessions or create default tab
loadSessionsFromDisk();
if (sessions.size === 0) {
    createSession('tab-1');
}

wss.on('connection', (ws) => {
    broadcastTabsList();
    const defaultEnv = getHostEnvironmentType ? getHostEnvironmentType() : { type: 'termux', label: 'Termux' };

    // Send initial history and state for all active tabs
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
            sshHost: session.sshHost || null,
            isAgyMode: !!session.isAgyMode
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
        let session = getSession(tabId);

        // Sync tab state
        if (parsed.action === 'sync_tab') {
            if (session) {
                const isRunning = (session.currentProcess !== null) || (session.isSsh && session.sshClient !== null);
                ws.send(JSON.stringify({
                    type: 'history',
                    tabId: session.id,
                    title: session.title,
                    envType: session.isSsh ? 'ssh' : session.envType,
                    envLabel: session.isSsh ? 'SSH' : session.envLabel,
                    data: session.logHistory,
                    cwd: session.cwd,
                    isRunning: isRunning,
                    isPty: session.isCurrentProcessPty || session.isSsh,
                    isSsh: !!session.isSsh,
                    sshHost: session.sshHost || null,
                    isAgyMode: !!session.isAgyMode
                }));
            }
            return;
        }

        // Create new tab
        if (parsed.action === 'create_tab') {
            const newTabId = parsed.newTabId || ('tab-' + Date.now().toString(36));
            const initialCwd = parsed.cwd || (session ? session.cwd : null);
            const isAgy = !!parsed.isAgyMode;
            const title = parsed.title || (isAgy ? 'AGY Assistente' : null);
            const newSession = createSession(newTabId, title, initialCwd, isAgy);
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
                isSsh: false,
                isAgyMode: isAgy
            }));
            return;
        }

        // Close tab
        if (parsed.action === 'close_tab') {
            const targetTabId = parsed.targetTabId || tabId;
            const targetSession = getSession(targetTabId);
            if (targetSession) {
                if (targetSession.isSsh && targetSession.sshClient) {
                    try {
                        if (targetSession.sshStream) targetSession.sshStream.end();
                        targetSession.sshClient.end();
                    } catch (e) {}
                    targetSession.sshClient = null;
                    targetSession.sshStream = null;
                }
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
                deleteSession(targetTabId);
                broadcastTabsList();
                const json = JSON.stringify({ type: 'tab_closed', tabId: targetTabId });
                wss.clients.forEach(c => {
                    if (c.readyState === WebSocket.OPEN) c.send(json);
                });
            }
            return;
        }

        // Ensure session exists
        if (!session) {
            session = createSession(tabId);
            broadcastTabsList();
        }

        // SSH Connect
        if (parsed.action === 'ssh_connect') {
            return handleSshConnect(session, tabId, parsed, ws);
        }

        // Directory listing
        if (parsed.action === 'list_dir') {
            return handleListDir(session, tabId, parsed, ws);
        }

        // Resize terminal
        if (parsed.action === 'pty_resize') {
            return handleResize(session, parsed);
        }

        // Kill / Ctrl+C
        if (parsed.action === 'kill') {
            return handleKill(session, tabId, ws);
        }

        // Clear history
        if (parsed.action === 'clear_history') {
            session.logHistory.length = 0;
            return;
        }

        // Input keystrokes / stdin
        if (parsed.action === 'input' || parsed.action === 'pty_input') {
            return handleInput(session, tabId, parsed);
        }

        // Command execution
        if (parsed.action === 'command') {
            return handleCommand(session, tabId, parsed, ws);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`[Termux CLI Web v2] Servidor rodando em http://localhost:${PORT}`);
    console.log(`[Termux CLI Web v2] Arquitetura modular ativa.`);
});

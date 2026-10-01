/**
 * SSH Connection Handler using ssh2.
 */
const { Client } = require('ssh2');
const { broadcastToTab, broadcastTabsList } = require('./session-manager');

function handleSshConnect(session, tabId, parsed, ws) {
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

    // Terminate existing SSH connection on tab if present
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
}

module.exports = { handleSshConnect };

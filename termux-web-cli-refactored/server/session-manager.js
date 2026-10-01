/**
 * Session Manager for Termux Web CLI v2
 * Manages tab sessions, state persistence, command buffers and broadcasting.
 */
const path = require('path');
const fs = require('fs');
const { getHostEnvironmentType } = require('./env-detector');

const MAX_LOG_HISTORY = 1000;
const sessions = new Map();
const SESSIONS_STATE_FILE = path.join(__dirname, '..', '.sessions_state.json');

let wssInstance = null;

function setWebSocketServer(wss) {
    wssInstance = wss;
}

function saveSessionsToDisk() {
    try {
        const dataToSave = Array.from(sessions.values()).map(s => ({
            id: s.id,
            title: s.title,
            cwd: s.cwd,
            envType: s.envType,
            envLabel: s.envLabel,
            isAgyMode: !!s.isAgyMode,
            agyConversationId: s.agyConversationId || null,
            lastCommand: s.lastCommand || '',
            logHistory: s.logHistory ? s.logHistory.slice(-100) : []
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
                            title: item.title || currentEnv.label,
                            cwd: validatedCwd,
                            envType: item.envType || currentEnv.type,
                            envLabel: item.envLabel || currentEnv.label,
                            currentProcess: null,
                            isCurrentProcessPty: false,
                            isSsh: false,
                            sshClient: null,
                            sshStream: null,
                            sshHost: null,
                            isAgyMode: !!item.isAgyMode,
                            agyConversationId: item.agyConversationId || null,
                            logHistory: Array.isArray(item.logHistory) ? item.logHistory : [],
                            lastCommand: item.lastCommand || ''
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

function createSession(tabId, title = null, initialCwd = null, isAgyMode = false) {
    const currentEnv = getHostEnvironmentType();
    const defaultCwd = initialCwd || process.env.HOME || process.cwd();
    const defaultTitle = title || (isAgyMode ? 'AGY Assistente' : currentEnv.label);
    const session = {
        id: tabId,
        title: defaultTitle,
        cwd: defaultCwd,
        envType: isAgyMode ? 'agy' : currentEnv.type,
        envLabel: isAgyMode ? 'AGY Assistente' : currentEnv.label,
        currentProcess: null,
        isCurrentProcessPty: false,
        isSsh: false,
        sshClient: null,
        sshStream: null,
        sshHost: null,
        isAgyMode: !!isAgyMode,
        agyConversationId: null,
        logHistory: [],
        lastCommand: ''
    };
    sessions.set(tabId, session);
    saveSessionsToDisk();
    return session;
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
        // Only store durable events in history (skip high-frequency pty_output and agy_stream deltas)
        if (obj.type !== 'pty_output' && obj.type !== 'agy_stream') {
            session.logHistory.push(obj);
            if (session.logHistory.length > MAX_LOG_HISTORY) {
                session.logHistory.shift();
            }
        }
    }

    if (!wssInstance) return;
    const payload = Object.assign({ tabId }, obj);
    const json = JSON.stringify(payload);
    wssInstance.clients.forEach((client) => {
        if (client.readyState === 1 /* WebSocket.OPEN */) {
            client.send(json);
        }
    });
}

function broadcastTabsList() {
    if (!wssInstance) return;
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
        isAgyMode: !!s.isAgyMode,
        lastCommand: s.lastCommand
    }));
    const json = JSON.stringify({ type: 'tabs_list', tabs: list });
    wssInstance.clients.forEach((client) => {
        if (client.readyState === 1 /* WebSocket.OPEN */) {
            client.send(json);
        }
    });
}

function getSession(tabId) {
    return sessions.get(tabId);
}

function getAllSessions() {
    return sessions;
}

function deleteSession(tabId) {
    sessions.delete(tabId);
    if (sessions.size === 0) {
        createSession('tab-1');
    }
    saveSessionsToDisk();
}

module.exports = {
    sessions,
    setWebSocketServer,
    loadSessionsFromDisk,
    saveSessionsToDisk,
    createSession,
    getSession,
    getAllSessions,
    deleteSession,
    formatShortCwd,
    broadcastToTab,
    broadcastTabsList,
    getHostEnvironmentType
};

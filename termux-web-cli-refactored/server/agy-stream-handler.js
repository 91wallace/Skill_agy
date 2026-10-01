/**
 * Antigravity Assistant Streaming Handler
 * Manages real-time NDJSON stream execution, Google OAuth detection, and turn lifecycle.
 */
const { spawn } = require('child_process');
const readline = require('readline');
const { broadcastToTab, broadcastTabsList, saveSessionsToDisk, formatShortCwd } = require('./session-manager');

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

/**
 * Executes a streaming AGY turn
 */
function handleAgyStreamTurn(session, tabId, promptText) {
    const prompt = promptText ? promptText.trim() : 'Olá! Como posso ajudar você no projeto?';
    
    // Announce start of assistant turn to tab
    broadcastToTab(tabId, {
        type: 'agy_turn_start',
        prompt: prompt,
        timestamp: Date.now()
    });

    const userHome = process.env.HOME || '/root';
    const userName = process.env.USER || 'root';

    const args = [
        '-p', prompt,
        '--output-format', 'stream-json',
        '--dangerously-skip-permissions'
    ];

    if (session.agyConversationId) {
        args.push('--conversation', session.agyConversationId);
    } else {
        args.push('-c');
    }

    const env = Object.assign({}, process.env, {
        HOME: userHome,
        USER: userName,
        PATH: DEFAULT_PATH,
        FORCE_COLOR: '0',
        PYTHONUNBUFFERED: '1'
    });

    try {
        const proc = spawn('agy', args, {
            cwd: session.cwd,
            env: env,
            detached: true
        });

        session.currentProcess = proc;
        session.isCurrentProcessPty = false;
        broadcastTabsList();

        let fullAccumulatedText = '';
        const executedTools = [];
        let isTurnFinished = false;

        const rlOut = readline.createInterface({
            input: proc.stdout,
            crlfDelay: Infinity
        });

        rlOut.on('line', (line) => {
            const trimmed = line.trim();
            if (!trimmed) return;

            try {
                const eventObj = JSON.parse(trimmed);
                const eventType = eventObj.event;

                if (eventType === 'init') {
                    if (eventObj.conversation_id) {
                        session.agyConversationId = eventObj.conversation_id;
                        saveSessionsToDisk();
                    }
                    if (eventObj.init && eventObj.init.cwd) {
                        session.cwd = eventObj.init.cwd;
                        broadcastToTab(tabId, { type: 'cwd_updated', cwd: session.cwd });
                    }
                    broadcastToTab(tabId, {
                        type: 'agy_init',
                        conversationId: session.agyConversationId,
                        tools: eventObj.init ? eventObj.init.tools : []
                    });
                } else if (eventType === 'step_update') {
                    const step = eventObj.step_update;
                    if (!step) return;

                    if (step.step_type === 'agent_response' && step.text_delta) {
                        fullAccumulatedText += step.text_delta;
                        broadcastToTab(tabId, {
                            type: 'agy_stream',
                            textDelta: step.text_delta,
                            stepIndex: step.step_index
                        });
                    } else if (step.step_type === 'tool') {
                        if (step.state === 'ACTIVE') {
                            const toolData = {
                                stepIndex: step.step_index,
                                toolName: step.tool_name,
                                parameters: step.tool_info ? step.tool_info.parameters : {},
                                status: 'running'
                            };
                            executedTools.push(toolData);
                            broadcastToTab(tabId, {
                                type: 'agy_tool_start',
                                tool: toolData
                            });
                        } else if (step.state === 'DONE') {
                            const toolData = {
                                stepIndex: step.step_index,
                                toolName: step.tool_name,
                                output: step.tool_info ? step.tool_info.output : '',
                                duration: step.duration_seconds || 0,
                                status: 'done'
                            };
                            broadcastToTab(tabId, {
                                type: 'agy_tool_end',
                                tool: toolData
                            });
                        }
                    }
                } else if (eventType === 'result') {
                    const res = eventObj.result || {};
                    if (res.conversation_id) {
                        session.agyConversationId = res.conversation_id;
                    }
                    if (res.response && !fullAccumulatedText) {
                        fullAccumulatedText = res.response;
                    }
                }
            } catch (jsonErr) {
                // If output was not JSON (e.g. raw text or banner), stream as text delta
                fullAccumulatedText += trimmed + '\n';
                broadcastToTab(tabId, {
                    type: 'agy_stream',
                    textDelta: trimmed + '\n'
                });
            }
        });

        const rlErr = readline.createInterface({
            input: proc.stderr,
            crlfDelay: Infinity
        });

        rlErr.on('line', (errLine) => {
            const matchAuth = errLine.match(/(https:\/\/accounts\.google\.com\/o\/oauth2\/auth\S+)/);
            if (matchAuth) {
                const authUrl = matchAuth[1];
                broadcastToTab(tabId, {
                    type: 'agy_auth_required',
                    url: authUrl
                });
            }
        });

        const finalizeTurn = (code) => {
            if (isTurnFinished) return;
            isTurnFinished = true;
            session.currentProcess = null;

            broadcastToTab(tabId, {
                type: 'agy_turn_done',
                fullText: fullAccumulatedText,
                tools: executedTools,
                exitCode: code || 0
            });

            broadcastToTab(tabId, { type: 'status_idle', exitCode: code || 0 });
            broadcastTabsList();
            saveSessionsToDisk();
        };

        proc.on('exit', (code) => finalizeTurn(code));
        proc.on('close', (code) => finalizeTurn(code));
        proc.on('error', (err) => {
            broadcastToTab(tabId, {
                type: 'agy_error',
                error: err.message
            });
            finalizeTurn(1);
        });

    } catch (err) {
        broadcastToTab(tabId, {
            type: 'agy_error',
            error: err.message
        });
        session.currentProcess = null;
        broadcastToTab(tabId, { type: 'status_idle', exitCode: 1 });
        broadcastTabsList();
    }
}

module.exports = {
    handleAgyStreamTurn
};

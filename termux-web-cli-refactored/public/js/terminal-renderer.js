/**
 * Terminal Output & AI Assistant Stream Renderer for Termux Web CLI v2
 * High-performance progressive streaming renderer with real-time Markdown and interactive tool cards.
 */
import { state } from './state.js';
import { wsClient } from './ws.js';
import { ansiToHtml } from './ansi.js';
import { xtermManager } from './xterm-manager.js';
import { quickBarManager } from './quick-bar.js';

class TerminalRenderer {
    constructor() {
        this.container = null;
        this.outputEl = null;
        this.autoScroll = true;
        this.activeTurns = new Map(); // tabId -> turn state
        this.activeCmdBadges = new Map(); // tabId -> badge element

        // Configure marked options
        if (window.marked && typeof window.marked.setOptions === 'function') {
            window.marked.setOptions({
                gfm: true,
                breaks: true,
                headerIds: false
            });
        }
    }

    init() {
        this.container = document.getElementById('terminal-container');
        this.outputEl = document.getElementById('terminal-output');

        if (this.container) {
            this.container.addEventListener('scroll', () => {
                const threshold = 80;
                const atBottom = this.container.scrollHeight - this.container.scrollTop - this.container.clientHeight <= threshold;
                this.autoScroll = atBottom;
            });
        }

        // Delegated copy button listener for markdown code blocks
        if (this.outputEl) {
            this.outputEl.addEventListener('click', (e) => {
                const copyBtn = e.target.closest('.agy-code-copy-btn');
                if (copyBtn) {
                    const codeWrapper = copyBtn.closest('.agy-code-wrapper');
                    if (codeWrapper) {
                        const codeEl = codeWrapper.querySelector('code');
                        if (codeEl) {
                            const text = codeEl.innerText || codeEl.textContent;
                            navigator.clipboard.writeText(text).then(() => {
                                const origText = copyBtn.textContent;
                                copyBtn.textContent = '✓ Copiado!';
                                copyBtn.classList.add('text-emerald-400');
                                setTimeout(() => {
                                    copyBtn.textContent = origText;
                                    copyBtn.classList.remove('text-emerald-400');
                                }, 2000);
                            }).catch(() => {
                                copyBtn.textContent = 'Erro ao copiar';
                            });
                        }
                    }
                }
            });
        }

        // 1. History replay on tab switch / initial connect
        wsClient.on('history', (msg) => {
            state.sessionsData.set(msg.tabId, {
                history: msg.data || [],
                cwd: msg.cwd || '~',
                isRunning: msg.isRunning,
                isPty: msg.isPty,
                isSsh: msg.isSsh,
                isAgyMode: msg.isAgyMode,
                title: msg.title
            });

            if (msg.tabId === state.activeTabId) {
                this.renderFullHistory(msg.data || []);
                quickBarManager.updatePromptCwd(msg.cwd);

                if (msg.isPty || msg.isSsh) {
                    xtermManager.open(msg.title || (msg.isSsh ? 'Sessão SSH' : 'Terminal PTY'));
                } else {
                    xtermManager.close();
                }
            }
        });

        // 2. Standard shell streaming outputs
        wsClient.on('output', (msg) => {
            if (msg.tabId === state.activeTabId) {
                this.handleTerminalOutput(msg.tabId, msg.data, 'text-gray-100');
            }
        });

        wsClient.on('error', (msg) => {
            if (msg.tabId === state.activeTabId) {
                this.handleTerminalOutput(msg.tabId, msg.data, 'text-rose-400');
            }
        });

        wsClient.on('system', (msg) => {
            if (msg.tabId === state.activeTabId) {
                this.handleTerminalOutput(msg.tabId, msg.data, 'text-emerald-400');
            }
        });

        // Command execution start
        wsClient.on('command_start', (msg) => {
            if (msg.tabId === state.activeTabId) {
                // If a badge doesn't already exist for this tab, create the execution entry
                if (!this.activeCmdBadges.has(msg.tabId)) {
                    this.notifyCommandSent(msg.tabId, msg.command, false);
                }
            }
        });

        // Command completion
        wsClient.on('status_idle', (msg) => {
            if (msg.tabId === state.activeTabId) {
                this.handleCommandFinished(msg.tabId, msg.exitCode);
            }
        });

        // 3. Antigravity AI Assistant Real-Time Streaming Events
        wsClient.on('agy_turn_start', (msg) => {
            if (msg.tabId === state.activeTabId) {
                this.handleAgyTurnStart(msg.tabId, msg.prompt);
            }
        });

        wsClient.on('agy_stream', (msg) => {
            if (msg.tabId === state.activeTabId) {
                this.handleAgyStream(msg.tabId, msg.textDelta);
            }
        });

        wsClient.on('agy_tool_start', (msg) => {
            if (msg.tabId === state.activeTabId) {
                this.handleAgyToolStart(msg.tabId, msg.tool);
            }
        });

        wsClient.on('agy_tool_end', (msg) => {
            if (msg.tabId === state.activeTabId) {
                this.handleAgyToolEnd(msg.tabId, msg.tool);
            }
        });

        wsClient.on('agy_turn_done', (msg) => {
            if (msg.tabId === state.activeTabId) {
                this.handleAgyTurnDone(msg.tabId, msg.fullText, msg.tools);
            }
        });

        wsClient.on('agy_auth_required', (msg) => {
            if (msg.tabId === state.activeTabId) {
                this.handleAgyAuthRequired(msg.url);
            }
        });

        wsClient.on('agy_error', (msg) => {
            if (msg.tabId === state.activeTabId) {
                this.appendChunk(`\n[Erro AGY: ${msg.error}]\n`, 'text-rose-400');
            }
        });

        // 4. PTY Events
        wsClient.on('pty_opened', (msg) => {
            if (msg.tabId === state.activeTabId) {
                this.handleCommandFinished(msg.tabId, 0);
                xtermManager.open(msg.command || 'Terminal Interativo');
            }
        });

        wsClient.on('pty_output', (msg) => {
            if (msg.tabId === state.activeTabId) {
                xtermManager.write(msg.data);
            }
        });

        wsClient.on('pty_closed', (msg) => {
            if (msg.tabId === state.activeTabId) {
                xtermManager.close();
            }
        });

        // 5. CWD Update
        wsClient.on('cwd_updated', (msg) => {
            const current = state.sessionsData.get(msg.tabId) || {};
            current.cwd = msg.cwd;
            state.sessionsData.set(msg.tabId, current);
            if (msg.tabId === state.activeTabId) {
                quickBarManager.updatePromptCwd(msg.cwd);
            }
        });

        // 6. Tab switch subscriber
        state.subscribe((event, tabId) => {
            if (event === 'tab_switched') {
                const session = state.sessionsData.get(tabId);
                if (session) {
                    this.renderFullHistory(session.history || []);
                    quickBarManager.updatePromptCwd(session.cwd);
                    if (session.isPty || session.isSsh) {
                        xtermManager.open(session.title || 'Terminal');
                    } else {
                        xtermManager.close();
                    }
                } else {
                    if (this.outputEl) this.outputEl.innerHTML = '';
                }
            }
        });
    }

    /**
     * User dispatched a command from the input / quick actions
     */
    notifyCommandSent(tabId, command, isAgy) {
        if (!this.outputEl || !command) return;

        if (isAgy) {
            // Start AGY Assistant turn immediately with loading state
            this.handleAgyTurnStart(tabId, command);
        } else {
            // Render terminal command prompt line with active execution badge
            const session = state.sessionsData.get(tabId);
            const promptCwd = session ? session.cwd : '~';
            const shortCwd = promptCwd === '/' ? '/' : promptCwd.split('/').filter(Boolean).slice(-2).join('/') || '~';

            const cmdEntry = document.createElement('div');
            cmdEntry.className = 'terminal-cmd-entry';
            cmdEntry.innerHTML = `
                <div class="terminal-cmd-header">
                    <div class="flex items-center gap-1.5">
                        <span class="text-amber-400 font-semibold">${this.escapeHtml(shortCwd)}</span>
                        <span class="text-emerald-400 font-bold">$</span>
                        <span class="text-gray-100 font-bold">${this.escapeHtml(command)}</span>
                    </div>
                    <span class="cmd-status-badge">
                        <span class="loading-spinner-sm"></span>
                        <span>Enviado • Executando...</span>
                    </span>
                </div>
            `;
            this.outputEl.appendChild(cmdEntry);

            const badge = cmdEntry.querySelector('.cmd-status-badge');
            if (badge) {
                this.activeCmdBadges.set(tabId, badge);
            }

            this.scrollToBottom();
        }
    }

    handleTerminalOutput(tabId, text, colorClass) {
        const badge = this.activeCmdBadges.get(tabId);
        if (badge) {
            badge.innerHTML = `
                <span class="loading-spinner-sm"></span>
                <span>Recebendo saída...</span>
            `;
        }
        this.appendChunk(text, colorClass);
    }

    handleCommandFinished(tabId, exitCode) {
        const badge = this.activeCmdBadges.get(tabId);
        if (badge) {
            if (exitCode === 0 || exitCode === undefined) {
                badge.className = 'cmd-status-badge badge-success';
                badge.innerHTML = `<span>✓ Concluído</span>`;
            } else {
                badge.className = 'cmd-status-badge badge-error';
                badge.innerHTML = `<span>✕ Código ${exitCode}</span>`;
            }
            setTimeout(() => {
                if (badge && badge.parentNode) {
                    badge.style.opacity = '0';
                    badge.style.transition = 'opacity 0.5s ease';
                    setTimeout(() => badge.remove(), 500);
                }
            }, 3000);
            this.activeCmdBadges.delete(tabId);
        }
    }

    /**
     * Start a new AGY Assistant Turn UI with instant feedback
     */
    handleAgyTurnStart(tabId, prompt) {
        if (!this.outputEl) return;

        // Clean up previous turn interval if any
        if (this.activeTurns.has(tabId)) {
            const oldTurn = this.activeTurns.get(tabId);
            if (oldTurn.streamTicker) clearInterval(oldTurn.streamTicker);
        }

        // 1. Render User prompt bubble
        if (prompt && prompt.trim()) {
            const userWrap = document.createElement('div');
            userWrap.className = 'agy-user-msg';
            userWrap.innerHTML = `
                <div class="agy-user-bubble">
                    <div class="text-[11px] font-semibold text-blue-300 pb-0.5 flex items-center justify-between gap-2">
                        <div class="flex items-center gap-1">
                            <svg class="w-3 h-3 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
                            <span>Você</span>
                        </div>
                        <span class="text-[10px] text-blue-300/70 font-mono">Enviado</span>
                    </div>
                    <div>${this.escapeHtml(prompt)}</div>
                </div>
            `;
            this.outputEl.appendChild(userWrap);
        }

        // 2. Create Assistant Response Card
        const card = document.createElement('div');
        card.className = 'agy-assistant-card';

        const header = document.createElement('div');
        header.className = 'agy-card-header';
        header.innerHTML = `
            <div class="flex items-center gap-2">
                <span class="agy-badge">
                    <svg class="w-3.5 h-3.5 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                    <span>AGY Assistente</span>
                </span>
                <span class="text-[10px] text-indigo-300/80 font-mono agy-card-status">Conectando...</span>
            </div>
            <span class="text-[11px] text-gray-500 font-mono">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        `;
        card.appendChild(header);

        // Thinking / Loading indicator
        const thinkingEl = document.createElement('div');
        thinkingEl.className = 'agy-thinking';
        thinkingEl.innerHTML = `
            <span class="loading-spinner-sm"></span>
            <span class="thinking-text">Comando enviado... Conectando à IA e aguardando resposta...</span>
        `;
        card.appendChild(thinkingEl);

        // Tools container
        const toolsEl = document.createElement('div');
        toolsEl.className = 'flex flex-col gap-1.5 my-1';
        card.appendChild(toolsEl);

        // Markdown content container
        const mdEl = document.createElement('div');
        mdEl.className = 'agy-md pt-1';
        card.appendChild(mdEl);

        this.outputEl.appendChild(card);

        const turnState = {
            cardEl: card,
            mdEl: mdEl,
            toolsEl: toolsEl,
            thinkingEl: thinkingEl,
            statusEl: card.querySelector('.agy-card-status'),
            targetText: '',
            renderedText: '',
            streamTicker: null,
            toolsMap: new Map()
        };

        // Start progressive smooth typewriter/line stream ticker
        turnState.streamTicker = setInterval(() => {
            if (turnState.renderedText.length < turnState.targetText.length) {
                const diff = turnState.targetText.length - turnState.renderedText.length;
                // Reveal smoothly: 2-6 chars per tick or faster if queue is big
                const step = diff > 80 ? Math.ceil(diff / 4) : (diff > 20 ? 4 : 2);
                turnState.renderedText = turnState.targetText.slice(0, turnState.renderedText.length + step);
                
                // Hide thinking element once characters appear
                if (turnState.thinkingEl && turnState.thinkingEl.style.display !== 'none') {
                    turnState.thinkingEl.style.display = 'none';
                }
                if (turnState.statusEl) {
                    turnState.statusEl.textContent = 'Gerando resposta...';
                }

                this.renderMarkdownInto(turnState.mdEl, turnState.renderedText, true /* isStreaming */);

                if (this.autoScroll) {
                    this.scrollToBottom();
                }
            }
        }, 20);

        this.activeTurns.set(tabId, turnState);
        this.scrollToBottom();
    }

    /**
     * Handle live token stream chunk
     */
    handleAgyStream(tabId, textDelta) {
        let turn = this.activeTurns.get(tabId);
        if (!turn) {
            this.handleAgyTurnStart(tabId, '');
            turn = this.activeTurns.get(tabId);
        }

        turn.targetText += textDelta;
    }

    /**
     * Handle tool call start
     */
    handleAgyToolStart(tabId, tool) {
        const turn = this.activeTurns.get(tabId);
        if (!turn || !turn.toolsEl) return;

        if (turn.statusEl) {
            turn.statusEl.textContent = `Executando: ${tool.toolName || 'ferramenta'}...`;
        }

        const toolId = String(tool.stepIndex || Date.now());
        const toolBox = document.createElement('div');
        toolBox.className = 'agy-tool-box';

        const paramSummary = tool.parameters ? (tool.parameters.CommandLine || tool.parameters.Query || tool.parameters.Pattern || tool.parameters.SearchPath || '') : '';
        const paramEscaped = this.escapeHtml(paramSummary);

        toolBox.innerHTML = `
            <div class="agy-tool-header">
                <div class="flex items-center gap-1.5 truncate">
                    <span class="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                    <span class="font-bold text-amber-300 font-mono text-[12px]">${this.escapeHtml(tool.toolName || 'tool')}</span>
                    ${paramEscaped ? `<span class="text-gray-400 font-mono text-[11px] truncate">(${paramEscaped})</span>` : ''}
                </div>
                <span class="text-[10px] text-amber-300 font-sans">executando...</span>
            </div>
            <div class="agy-tool-output hidden"></div>
        `;

        turn.toolsEl.appendChild(toolBox);
        turn.toolsMap.set(toolId, toolBox);

        if (this.autoScroll) {
            this.scrollToBottom();
        }
    }

    /**
     * Handle tool call finish
     */
    handleAgyToolEnd(tabId, tool) {
        const turn = this.activeTurns.get(tabId);
        if (!turn) return;

        const toolId = String(tool.stepIndex || '');
        const toolBox = turn.toolsMap.get(toolId);
        if (toolBox) {
            const header = toolBox.querySelector('.agy-tool-header');
            const outputEl = toolBox.querySelector('.agy-tool-output');
            
            if (header) {
                const durationText = tool.duration ? `${tool.duration.toFixed(2)}s` : 'concluído';
                header.innerHTML = `
                    <div class="flex items-center gap-1.5 truncate">
                        <svg class="w-3.5 h-3.5 text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path></svg>
                        <span class="font-bold text-emerald-300 font-mono text-[12px]">${this.escapeHtml(tool.toolName || 'tool')}</span>
                    </div>
                    <div class="flex items-center gap-2">
                        <span class="text-[10px] text-gray-400 font-mono">${durationText}</span>
                        <span class="text-[10px] text-blue-400 hover:underline cursor-pointer">detalhes</span>
                    </div>
                `;

                if (outputEl && tool.output) {
                    outputEl.textContent = tool.output;
                    header.addEventListener('click', () => {
                        outputEl.classList.toggle('hidden');
                    });
                }
            }
        }
    }

    /**
     * Complete the AGY assistant turn
     */
    handleAgyTurnDone(tabId, fullText, tools) {
        const turn = this.activeTurns.get(tabId);
        if (turn) {
            if (turn.streamTicker) {
                clearInterval(turn.streamTicker);
                turn.streamTicker = null;
            }
            if (turn.thinkingEl) turn.thinkingEl.remove();
            if (turn.statusEl) {
                turn.statusEl.textContent = '✓ Resposta concluída';
                turn.statusEl.className = 'text-[10px] text-emerald-400/90 font-mono agy-card-status';
            }

            const finalText = fullText || turn.targetText || turn.renderedText;
            if (finalText) {
                this.renderMarkdownInto(turn.mdEl, finalText, false /* isStreaming */);
            }
            this.activeTurns.delete(tabId);
        }
        if (this.autoScroll) {
            this.scrollToBottom();
        }
    }

    /**
     * Show Google OAuth Authentication card
     */
    handleAgyAuthRequired(authUrl) {
        if (!this.outputEl) return;
        const authBox = document.createElement('div');
        authBox.className = 'agy-auth-box';
        authBox.innerHTML = `
            <div class="flex items-center gap-2 text-rose-300 font-bold text-xs">
                <svg class="w-4 h-4 text-rose-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                <span>Autenticação Google Necessária</span>
            </div>
            <p class="text-gray-300 text-xs">O Antigravity CLI precisa de autorização de conta Google para continuar.</p>
            <a href="${this.escapeHtml(authUrl)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center justify-center gap-2 px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs transition-colors shadow-lg active:scale-95 w-fit">
                <span>Fazer Login no Google</span>
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
            </a>
        `;
        this.outputEl.appendChild(authBox);
        this.scrollToBottom();
    }

    /**
     * Renders history items upon tab load or reload
     */
    renderFullHistory(historyItems) {
        if (!this.outputEl) return;
        this.outputEl.innerHTML = '';
        this.activeTurns.clear();
        this.activeCmdBadges.clear();

        historyItems.forEach(item => {
            if (item.type === 'command_start') {
                const promptCwd = item.cwd || '~';
                const shortCwd = promptCwd === '/' ? '/' : promptCwd.split('/').filter(Boolean).slice(-2).join('/') || '~';
                const cmdDiv = document.createElement('div');
                cmdDiv.className = 'terminal-cmd-entry';
                cmdDiv.innerHTML = `
                    <div class="terminal-cmd-header">
                        <div class="flex items-center gap-1.5">
                            <span class="text-amber-400 font-semibold">${this.escapeHtml(shortCwd)}</span>
                            <span class="text-emerald-400 font-bold">$</span>
                            <span class="text-gray-100 font-bold">${this.escapeHtml(item.command)}</span>
                        </div>
                    </div>
                `;
                this.outputEl.appendChild(cmdDiv);
            } else if (item.type === 'output') {
                this.appendChunk(item.data, 'text-gray-100');
            } else if (item.type === 'error') {
                this.appendChunk(item.data, 'text-rose-400');
            } else if (item.type === 'system') {
                this.appendChunk(item.data, 'text-emerald-400');
            } else if (item.type === 'agy_turn_start') {
                const userWrap = document.createElement('div');
                userWrap.className = 'agy-user-msg';
                userWrap.innerHTML = `
                    <div class="agy-user-bubble">
                        <div class="text-[11px] font-semibold text-blue-300 pb-0.5 flex items-center gap-1">
                            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
                            <span>Você</span>
                        </div>
                        <div>${this.escapeHtml(item.prompt)}</div>
                    </div>
                `;
                this.outputEl.appendChild(userWrap);
            } else if (item.type === 'agy_turn_done') {
                const card = document.createElement('div');
                card.className = 'agy-assistant-card';
                card.innerHTML = `
                    <div class="agy-card-header">
                        <div class="flex items-center gap-2">
                            <span class="agy-badge">
                                <svg class="w-3.5 h-3.5 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                                <span>AGY Assistente</span>
                            </span>
                        </div>
                    </div>
                    <div class="agy-md pt-1"></div>
                `;
                const mdContainer = card.querySelector('.agy-md');
                if (mdContainer && item.fullText) {
                    this.renderMarkdownInto(mdContainer, item.fullText, false);
                }
                this.outputEl.appendChild(card);
            } else if (item.type === 'agy_auth_required') {
                this.handleAgyAuthRequired(item.url);
            }
        });

        this.scrollToBottom();
    }

    /**
     * Formats and sanitizes Markdown with code wrappers and copy buttons
     */
    renderMarkdownInto(element, rawMarkdown, isStreaming = false) {
        if (!element || typeof rawMarkdown !== 'string') return;

        let processedMarkdown = rawMarkdown;

        // In streaming mode, auto-close unclosed code blocks for flawless live preview
        if (isStreaming) {
            const fenceMatches = processedMarkdown.match(/```/g);
            if (fenceMatches && fenceMatches.length % 2 !== 0) {
                processedMarkdown += '\n```';
            }
        }

        let rawHtml = '';
        if (window.marked) {
            try {
                rawHtml = window.marked.parse(processedMarkdown);
            } catch (e) {
                rawHtml = this.escapeHtml(processedMarkdown);
            }
        } else {
            rawHtml = this.escapeHtml(processedMarkdown);
        }

        if (window.DOMPurify) {
            rawHtml = window.DOMPurify.sanitize(rawHtml, {
                ADD_TAGS: ['span'],
                ADD_ATTR: ['class', 'data-lang']
            });
        }

        // Enhance code blocks with custom wrapper, language badge, and copy button
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = rawHtml;

        const pres = tempDiv.querySelectorAll('pre');
        pres.forEach(pre => {
            const code = pre.querySelector('code');
            const langClass = code ? code.className : '';
            const matchLang = langClass.match(/language-([a-zA-Z0-9_-]+)/);
            const langName = matchLang ? matchLang[1] : 'code';

            const wrapper = document.createElement('div');
            wrapper.className = 'agy-code-wrapper';
            wrapper.innerHTML = `
                <div class="agy-code-header">
                    <span class="font-mono text-[11px] font-semibold text-gray-300 uppercase">${this.escapeHtml(langName)}</span>
                    <button type="button" class="agy-code-copy-btn">Copiar</button>
                </div>
            `;
            pre.parentNode.insertBefore(wrapper, pre);
            wrapper.appendChild(pre);
        });

        if (isStreaming) {
            element.innerHTML = tempDiv.innerHTML + '<span class="agy-cursor"></span>';
        } else {
            element.innerHTML = tempDiv.innerHTML;
        }
    }

    appendChunk(rawText, defaultColorClass = 'text-gray-100') {
        if (!this.outputEl || !rawText) return;

        const line = document.createElement('div');
        line.className = `whitespace-pre-wrap font-mono text-xs leading-relaxed ${defaultColorClass}`;
        line.innerHTML = ansiToHtml(rawText);

        this.outputEl.appendChild(line);

        if (this.autoScroll) {
            this.scrollToBottom();
        }
    }

    escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    scrollToBottom() {
        if (this.container) {
            this.container.scrollTop = this.container.scrollHeight;
        }
    }
}

export const terminalRenderer = new TerminalRenderer();

O arquivo public/app.js gerencia toda a interatividade do frontend, a conexão contínua com o backend e a renderização dinâmica do terminal na interface mobile.
1. Gerenciamento do Ciclo de Vida do WebSocket
A conexão é estabelecida dinamicamente usando a mesma origem da página (location.host), o que evita hardcoding de IPs e garante o funcionamento automático tanto em localhost quanto em redes Wi-Fi locais.
 * Reconexão Automática: Se o aplicativo for minimizado no Android e o sistema operacional derrubar a aba, o evento ws.onclose entra em ação, disparando um loop setTimeout que tenta restabelecer a conexão a cada 2 segundos.
 * Controle de Estados: Os eventos onopen, onclose e onerror atualizam o indicador visual no topo da tela, alternando as classes de cor e a animação definidas no styles.css.
2. Captura de Eventos e Interação com a Interface
O script intercepta os comandos do usuário sem recarregar a página, garantindo a experiência de um aplicativo Single Page Application (SPA).
 * Envio de Formulário: O evento submit do formulário (acionado pelo botão "Run" ou tecla Enter do teclado virtual) é cancelado com e.preventDefault(). O valor lido é encapsulado em um objeto JSON {"action": "command", "data": "..."} e enviado ao servidor.
 * Atalhos Rápidos: Os botões com a classe .shortcut-btn utilizam o atributo HTML data-cmd. Um laço forEach adiciona ouvintes de clique que enviam o comando embutido no botão imediatamente, poupando digitação no celular.
 * Cancelamento de Processo: O botão "Cancelar" envia um payload {"action": "kill"}, instruindo o backend a emitir um sinal SIGINT ao processo filho atual.
3. Renderização Segura e Rolagem Automática
A saída do terminal precisa ser exibida rapidamente, sem risco de injeção de código HTML e sem forçar o usuário a rolar a tela manualmente a cada linha.
 * Sanitização Nativa: Os blocos de texto recebidos via WebSocket são anexados ao DOM utilizando document.createElement('span') e span.textContent = text. O uso de textContent (no lugar de innerHTML) evita que comandos que geram saída com caracteres < ou > quebrem a estrutura HTML.
 * Auto-scroll Integrado: Após cada inserção de linha no DOM, a função scrollToBottom() é chamada, igualando o scrollTop do contêiner ao seu scrollHeight, mantendo o foco sempre na última linha renderizada.
4. Código Fonte Completo (public/app.js)
const terminalOutput = document.getElementById('terminal-output');
const terminalContainer = document.getElementById('terminal-container');
const commandForm = document.getElementById('command-form');
const commandInput = document.getElementById('command-input');
const statusText = document.getElementById('status-text');
const statusDot = document.getElementById('status-dot');
const btnClear = document.getElementById('btn-clear');
const btnCancel = document.getElementById('btn-cancel');
const shortcutBtns = document.querySelectorAll('.shortcut-btn');

let ws;
const reconnectInterval = 2000;

function connect() {
    // Detecta protocolo e host automaticamente
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${location.host}`);

    ws.onopen = () => {
        updateStatus('Conectado', 'status-connected');
    };

    ws.onmessage = (event) => {
        const parsed = JSON.parse(event.data);
        appendLog(parsed.data, parsed.type);
        
        // Remove estado "processando" quando detecta o fim do processo
        if (parsed.type === 'system' && (parsed.data.includes('Processo encerrado') || parsed.data.includes('Sinal SIGINT') || parsed.data.includes('Falha de execução'))) {
            setProcessing(false);
        }
    };

    ws.onclose = () => {
        updateStatus('Desconectado. Reconectando...', 'status-disconnected');
        setProcessing(false);
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
    if (state) {
        updateStatus('Processando...', 'status-processing');
    } else if (ws && ws.readyState === WebSocket.OPEN) {
        updateStatus('Conectado', 'status-connected');
    }
}

function appendLog(text, type) {
    const span = document.createElement('span');
    span.textContent = text;
    
    // Adiciona cores baseadas no tipo de saída
    if (type === 'error') span.classList.add('text-red-400');
    if (type === 'system') span.classList.add('text-yellow-400');
    
    terminalOutput.appendChild(span);
    scrollToBottom();
}

function scrollToBottom() {
    terminalContainer.scrollTop = terminalContainer.scrollHeight;
}

// Evento do input de texto (Botão Run / Enter)
commandForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const cmd = commandInput.value.trim();
    if (!cmd || !ws || ws.readyState !== WebSocket.OPEN) return;

    ws.send(JSON.stringify({ action: 'command', data: cmd }));
    commandInput.value = '';
    setProcessing(true);
});

// Limpar terminal
btnClear.addEventListener('click', () => {
    terminalOutput.innerHTML = '';
});

// Cancelar processo (SIGINT)
btnCancel.addEventListener('click', () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ action: 'kill' }));
    }
});

// Botões de atalho customizáveis
shortcutBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const cmd = btn.getAttribute('data-cmd');
        if (cmd && ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ action: 'command', data: cmd }));
            setProcessing(true);
        }
    });
});

// Inicializa a conexão ao carregar a página
connect();


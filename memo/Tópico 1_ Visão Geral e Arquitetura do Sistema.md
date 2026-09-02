Tópico 1: Visão Geral e Arquitetura do Sistema
Este documento define a arquitetura, o fluxo de dados e os requisitos de desempenho para a construção da interface web do terminal/CLI rodando nativamente no Android via Termux. O objetivo é estabelecer uma base técnica clara para que o sistema seja leve, rápido e resiliente.
1. Mapeamento da Arquitetura Local
O sistema opera inteiramente em localhost (127.0.0.1), dispensando conexões externas (exceto para o carregamento do CDN do Tailwind CSS). A arquitetura é dividida em três camadas principais:
 * Camada de Apresentação (Frontend / PWA):
   * Tecnologia: HTML5, Vanilla JavaScript (ECMAScript moderno) e CSS (Tailwind via CDN + CSS customizado).
   * Função: Atuar como um Progressive Web App (PWA) instalável (standalone). Oferece a interface gráfica adaptada para telas de smartphones, capturando entradas do usuário (teclado virtual ou botões de atalho) e renderizando a saída do terminal de forma contínua.
 * Camada de Comunicação (WebSocket):
   * Tecnologia: Protocolo WebSocket nativo no frontend e biblioteca ws (ou socket.io em modo minimalista) no backend.
   * Função: Prover comunicação bidirecional em tempo real, com baixíssima latência. Elimina a necessidade de long polling HTTP, sendo ideal para o tráfego de streams de dados gerados por ferramentas CLI.
 * Camada de Servidor e Execução (Backend Node.js):
   * Tecnologia: Node.js, framework express (apenas para servir a pasta estática public/) e módulo nativo child_process.
   * Função: Receber comandos via WebSocket, instanciar processos no sistema operacional do Termux usando child_process.spawn(), gerenciar os streams contínuos de stdout e stderr, e lidar com sinais de interrupção de processos (SIGINT/SIGTERM).
2. Modelo de Fluxo de Dados Assíncrono
O funcionamento do sistema baseia-se em eventos não bloqueantes para garantir que a interface do usuário nunca congele durante a execução de comandos demorados.
 * Envio de Comando: O usuário digita um comando e pressiona Enter. O JavaScript do frontend intercepta o evento de formulário, limpa o campo, exibe o comando na tela (eco) e envia o payload via WebSocket para o servidor Node.js.
 * Processamento e Spawn: O Node.js recebe o comando, faz o parse e utiliza spawn(comando, args, { shell: true }) para iniciar o processo no Termux. A opção de usar shell garante suporte a pipes (|) e redirecionamentos lógicos nativos.
 * Streaming de Saída: Assim que o processo gera qualquer saída, os eventos process.stdout.on('data') e process.stderr.on('data') são acionados no Node.js. Os dados (em formato buffer) são convertidos para texto e imediatamente emitidos de volta via WebSocket para o frontend.
 * Renderização e Auto-scroll: O frontend recebe os blocos de texto (chunks) via WebSocket, sanitiza a saída (para evitar injeção de HTML acidental) e anexa (append) o texto ao contêiner de logs. Imediatamente após a inserção, um cálculo de rolagem (scroll) é disparado para manter a visualização no final do log.
 * Interrupção de Processos: Se um comando entra em loop ou demora muito, o usuário aciona um botão "Cancelar" na interface. Um evento específico é enviado pelo WebSocket, fazendo o servidor Node.js invocar process.kill() com o sinal SIGINT no processo filho em execução.
3. Diretrizes de Desempenho e Consumo de Recursos no Android
Sendo um ambiente mobile (Termux), os recursos de CPU e RAM são compartilhados com o sistema operacional do smartphone. As seguintes diretrizes devem guiar a implementação do código:
 * Zero Build Process: O projeto não utilizará Webpack, Vite ou Babel. Os arquivos HTML, CSS e JS serão servidos de forma estática e bruta. Isso garante inicialização instantânea do projeto com um simples node server.js.
 * Gerenciamento de Memória no Frontend: A renderização do terminal deve evitar estourar a memória do navegador mobile. O contêiner de log deve ser otimizado (por exemplo, usando fragmentos de documento para inserções em massa) e, se o log ultrapassar um limite muito alto (ex: 5000 linhas), as linhas mais antigas devem ser removidas progressivamente do DOM.
 * Resiliência de Conexão: Como navegadores mobile frequentemente pausam abas em segundo plano, o cliente WebSocket deve possuir lógica de reconexão automática (auto-reconnect) com atraso exponencial (backoff).
 * UI Mobile-First Real: Elementos de toque devem ter tamanho mínimo de 44x44 pixels. O layout deve concentrar os controles principais (input, enter, atalhos, cancelar) na parte inferior da tela, ao alcance do polegar do usuário. O teclado virtual não deve sobrepor o input.

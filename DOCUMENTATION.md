# Documentação Viva do Projeto - Termux Web CLI

Este documento serve como o registro central de arquitetura, decisões técnicas, topologia de arquivos e histórico de mudanças do projeto **Termux Web CLI**.

---

## 1. Visão Geral do Sistema

O **Termux Web CLI** é uma aplicação PWA (Progressive Web App) desenhada para permitir o controle do terminal nativo do Android via navegador ou aplicativo instalado, com foco em:
* **Zero Build:** Sem dependência de Webpack, Vite ou Babel. Execução pura e imediata.
* **Comunicação Real-Time:** Conexão WebSocket bidirecional para streaming contínuo de dados.
* **Mobile-First UX:** Interface adaptada para polegar (thumb-zone), suporte ao teclado virtual e prevenção de zoom indesejado.
* **Resiliência:** Tratamento para reconexão automática e limpeza de processos órfãos (`SIGINT`).

---

## 2. Topologia de Arquivos

```
/root/projects/Skill_agy/
├── DOCUMENTATION.md       # Documentação viva e registro de alterações do projeto
├── README.md              # Guia rápido de instalação e uso no Termux
├── package.json           # Dependências e scripts de inicialização
├── server.js              # Servidor HTTP Express + WebSocket + child_process.spawn
└── public/
    ├── index.html         # Estrutura visual PWA com Tailwind CSS via CDN
    ├── manifest.json      # Manifesto PWA para instalação standalone com ícone SVG
    ├── styles.css         # Estilizações complementares de UX mobile e animações
    ├── app.js             # Lógica do cliente, conexão WebSocket, limpeza de DOM e atalhos
    └── sw.js              # Service Worker para suporte a cache offline do PWA
```

---

## 3. Mapeamento das Camadas

### 3.1. Backend (`server.js`)
* **Express & CORS:** Serve a pasta `public/` de forma estática e possibilita conexões externas na rede local.
* **WebSocket (`ws`):** Gerencia a troca de mensagens em formato JSON (`command`, `kill`, `output`, `error`, `system`).
* **Execução via `child_process.spawn`:**
  * Configurado com `{ shell: true }` para suporte a comandos compostos, pipes (`|`) e redirecionamentos.
  * Streams contínuos de `stdout` e `stderr` enviados em tempo real ao cliente.
  * Controle de concorrência com bloqueio de múltiplos comandos simultâneos.
  * Tratamento de desconexão repentina do cliente com encerramento automático do processo filho via `SIGINT`.

### 3.2. Frontend & PWA (`public/`)
* **`index.html`:** Viewport travada para evitar zoom no toque (`maximum-scale=1.0, user-scalable=no`). Utiliza classes utilitárias do Tailwind CSS via CDN.
* **`manifest.json`:** Modo de exibição `standalone`, cor de fundo e tema `#111827`, ícone SVG Data URI inline (elimina necessidade de arquivos PNG extras).
* **`sw.js`:** Service Worker registrando cache dos assets estáticos para funcionamento do PWA.
* **`styles.css`:** Ocultação de barras de rolagem horizontais nos atalhos (`.no-scrollbar`), tratamento de quebra de linhas longas de terminal (`.word-break`) e animação pulsante para status (`.animate-pulse-fast`).
* **`app.js`:**
  * Detecção dinâmica de protocolo e host (`location.host`).
  * Reconexão automática a cada 2 segundos em caso de perda de conexão.
  * Sanitização de saídas com `document.createElement('span')` e `span.textContent` para proteção contra injeção de HTML.
  * Rolagem automática (`scrollToBottom`) a cada chunk recebido.
  * Poda de nós no DOM (limite de 5000 elementos) para garantir performance e economizar memória no Android.
  * Mapeamento de botões de atalho (`data-cmd`) e comando de cancelamento (SIGINT).

---

## 4. Registro de Alterações (Changelog)

### [2026-09-05] - Suporte a Emulador Pseudo-Terminal (PTY) e Sessão Interativa (Xterm.js)
* **Backend PTY Bridge (`pty_bridge.py` + `server.js`):**
  * Criação da ponte PTY nativa em Python para alocar canais `/dev/pts/*` com controle de dimensões de janela (`rows`, `cols`) e envio de sinal `SIGWINCH`.
  * Detecção inteligente de comandos interativos/TUI (`agy`, `top`, `nano`, `htop`, `vi`, `fzf`, etc.) no backend.
  * Transmissão bidirecional de bytes brutos via WebSocket (`pty_opened`, `pty_output`, `pty_input`, `pty_resize`, `pty_closed`).
* **Frontend & UX Mobile (`public/index.html`, `public/app.js`, `public/styles.css`):**
  * Integração do **XTerm.js** e **FitAddon** embutidos diretamente no fluxo visual da view (`#pty-terminal-view`).
  * Barra de navegação auxiliar com teclas físicas mobile (`ESC`, `TAB`, `▲`, `▼`, `◀`, `▶`, `ENTER`, `Ctrl+C`).
  * Mantido 100% do layout, histórico, cards, snippets e personalização de cores.

### [2026-09-04] - Criação e Refinamento do Projeto
* **Configuração e Instalação:** Criação do `package.json` e execução de `npm install` com sucesso.
* **Backend:** Implementação completa do `server.js` com suporte a `spawn`, `SIGINT`, tratamento de erros e WebSocket.
* **Frontend & PWA:**
  * Criação de `index.html`, `manifest.json`, `styles.css` e `app.js`.
  * Criação de `public/sw.js` (Service Worker para cache offline e suporte robusto a PWA).
  * Adição de política de poda do buffer de log no `app.js` (limpeza das 500 linhas mais antigas ao ultrapassar 5.000 nós no DOM).
  * **Correção de Proporção e Layout Mobile:**
    * Atualização para `100dvh` (dynamic viewport height) no contêiner principal para adaptar dinamicamente ao teclado virtual e barras do navegador.
    * Adição de `viewport-fit=cover` e espaçamento dinâmico de segurança (`env(safe-area-inset-bottom)`) no rodapé.
    * Correção no dimensionamento flex do campo de texto com `min-w-0`, `w-full` e `shrink-0` no botão Run para evitar estouro horizontal.
  * **Desativação Definitiva de Autofill e Heurísticas de Login:**
    * Remoção da tag `<form>` e substituição por `<div role="search">` com `<input type="search" inputmode="text" enterkeyhint="go">`.
  * **Prevenção Avançada de Sobreposição do Teclado:**
    * Inclusão de `interactive-widget=resizes-content` na meta viewport (instrui o Chrome/Android a redimensionar a área visível imediatamente quando o teclado abre).
    * `html, body { position: fixed; height: 100%; width: 100%; }` para travar o body e forçar a flexbox interna a encolher proporcionalmente.
  * **Navegação Persistente de Diretórios (`cd` / `cwd`):**
    * Implementada a variável de estado `currentCwd` no backend `server.js` (inicializada com o `$HOME` do Termux ou diretório atual).
  * **Execução em Background e Resiliência a Desconexões Móveis:**
    * Desacoplamento total do ciclo de vida dos processos (`Antigravity CLI`, builds, downloads) em relação às desconexões temporárias de abas do Android. O processo **nunca** é morto por fechar/minimizar a aba, apenas por solicitação explícita via botão Cancelar (`SIGINT`).
    * Implementação de buffer circular de histórico (`logHistory`) no servidor com retransmissão automática ao restabelecer o WebSocket.
  * **Ferramenta de Snippets e Atalhos Customizados:**
  * **Refinamento Ultra-Minimalista de Comandos/Snippets:**
    * Cabeçalho simplificado com título **"Comandos"** (removido contador numérico).
    * Adicionado botão **"Deletar"** em vermelho no cabeçalho superior e botão **"Novo"** limpo (sem o sinal `+`).
    * Removidos todos os botões individuais de executar e apagar de cada linha: tocar diretamente em qualquer comando o executa na hora.
  * **Histórico da Área de Transferência (Clipboard Manager):**
    * Adicionado o botão `📋 Clipboard` na barra de atalhos rápidos inferior (em tom roxo minimalista).
    * Modal estilo *Bottom Sheet* idêntico ao de comandos, registrando automaticamente cópias realizadas na página e sincronização com a área de transferência do sistema.
    * Limite estrito de **20 itens** mais recentes com persistência no `localStorage`.
  * **Botão Estilo V de Colapso/Descolapso na Linha Amarela de Comando:**
    * Ícone em formato **V chevron**: aponta para cima (`⌃` / `M5 15l7-7 7 7`) quando colapsado e rotaciona para baixo (`⌄`) quando descolapsado.
    * **Visibilidade Exclusiva na Última Saída:** O botão estilo V aparece somente no último prompt amarelo do terminal.
    * **Resumo de Caminho (Últimos 2 Diretórios):** A linha amarela de comando do terminal exibe de forma concisa apenas os **dois últimos diretórios** (ex: `[projects/Skill_agy]$ ls -la` em vez do path absoluto longo), mantendo a tela limpa.
    * **Botão Voltar Diretório na Árvore:** Na barra superior do explorador de arquivos descolapsável, foi adicionado um botão de seta/voltar (`cd ..`) para subir um nível de diretório de forma rápida.
    * **Ícone de Pasta Flaticon (Design de Pasta):** Todos os ícones de diretório (cabeçalho do explorador e linhas de subpastas na árvore) foram atualizados com o ícone vetorial de pasta correspondente ao design Flaticon (pasta amarela com aba superior), e os arquivos com o ícone de documento.
    * **Ergonomia e Navegação Fluida de Diretórios:**
    * **Painel Visual de Múltipla Escolha Interativo com Contador Regressivo:**
      * **Detecção Automática:** Detecta no stream saídas com `[Y/n]`, listas numeradas (`1) ... 2) ...`) ou tags estruturadas do Antigravity.
      * **Contador Regressivo & Opção Padrão:** Exibe barra de progresso e contagem regressiva em segundos. Se o usuário não interagir, a opção pré-selecionada (`isDefault` / recomendada) é executada automaticamente.
      * **Interrupção Inteligente:** Se o usuário tocar na tela, rolar o terminal, clicar em uma opção diferente ou digitar no campo de texto, o contador é pausado imediatamente (`Pausado`) para permitir controle manual sem pressa.
      * **Suporte a `stdin` Bidirecional:** Envia a resposta selecionada diretamente para o fluxo de entrada do processo em execução no backend.
    * **Auto-Descolapso para Comandos de Listagem e Inspeção:**
      * **Detecção Automática:** Comandos de visualização e listagem imediata (`ls`, `dir`, `tree`, `cat`, `head`, `tail`, `find`, `grep`, `git status`, `pwd`, `df`, `free`) abrem automaticamente com o campo de output descolapsado/expandido assim que a saída é gerada.
      * **Controle Manual:** O usuário ainda pode recolher/expandir o card a qualquer momento com um toque no cabeçalho.


      * Remoção do rótulo de texto `"cd"` ao lado de cada pasta para um layout limpo.
      * O botão de voltar ao diretório anterior (`cd ..`) mantém o explorador aberto e recarrega instantaneamente a nova listagem do diretório pai.
      * **Auto-Colapso ao Clicar Fora:** Tocar ou clicar em qualquer área externa ao painel de diretórios o fecha/colapsa automaticamente, restaurando o botão V para a posição colapsada.
    * **Personalização de Cores Exclusiva com Círculos do Sistema e Tons Brilhantes (Neon):**
      * Adicionadas novas cores vibrantes nos seletores redondos: **Verde Brilhante (Neon `#00ff66`)**, **Azul Brilhante (Neon `#00d4ff`)** e **Vermelho Brilhante (Neon `#ff3366`)**, além das cores clássicas.
      * Mapeamento de cores:
        1. **Linha de Comando (Prompt):** Cor da linha de comando (`[diretório]$ comando`) e do botão V no terminal.
        2. **Diretórios / Pastas:** Cor dos ícones e nomes das pastas na visualização descolapsável **E** nas saídas de comandos do terminal (como `ls`).
        3. **Arquivos:** Cor dos ícones e nomes dos arquivos na visualização descolapsável **E** nas saídas de comandos do terminal.
      * **Classificação Automática de Cores para `ls` e Listagens do Terminal:**
        * No backend (`server.js`), os comandos executados contam com expansão de aliases e habilitação forçada de saída colorida (`alias ls='ls --color=always 2>/dev/null || ls -G'` e definição de `LS_COLORS` + `FORCE_COLOR=1` / `TERM=xterm-256color`).
        * O parser ANSI (`parseAnsiToHtml` no `app.js`) decodifica códigos compostos (`01;34`, `1;34`, `34`, `94`, etc.) e converte pastas e arquivos nas classes `.ansi-dir` e `.ansi-file`.
        * O `styles.css` vincula `.ansi-dir` a `var(--color-dir-item)` e `.ansi-file` a `var(--color-file-item)`, garantindo que a cor escolhida nas configurações para pastas e arquivos reflita imediatamente no output do comando `ls`.
    * **Card de Processo / Output Interativo (Estilo Antigravity 2 Linhas):**
      * Substituição do fluxo de texto bruto contínuo por um **Process Card retangular com bordas arredondadas e sombra suave**.
      * **Linha 1 (Ticker com Animação Vertical):** Exibe a última linha de saída em tempo real; a cada nova linha gerada, a anterior sobe e esmaece suavemente para cima (`process-ticker-exit`), enquanto a nova entra vindo de baixo para a posição ativa (`process-ticker-active`).
      * **Linha 2 (Barra Inferior em Tom Cinza Claro):**
        * Spinner animado enquanto o processo executa (substituído por ícone de check verde em sucesso ou X vermelho em erro).
        * Indicador de porcentagem (`%`) inteligente com exibição dinâmica apenas quando detectado no stream.
        * Cronômetro de tempo de execução contínuo em segundos (ex: `0s`, `3s`, `15s`).
        * Nome/texto do comando executado.
      * **Expandir / Recolher:** Tocar em qualquer ponto do card desdobra o painel com o log completo de todas as linhas de output formatadas com suporte total às cores customizadas do sistema.
* **Testes:** Validação de ponta a ponta com script de integração automatizado (conexão WebSocket + execução de comando `echo Hello_Termux_CLI` e teste de navegação `cd / && pwd`).
* **Documentação:** Atualização contínua do `DOCUMENTATION.md` e criação do `README.md`.
















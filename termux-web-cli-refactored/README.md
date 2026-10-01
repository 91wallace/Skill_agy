# Termux Web CLI v2

Uma interface web PWA moderna, modular e de altíssimo desempenho para controlar o terminal nativo do Android via Termux, Proot e Distros Linux.

Construído seguindo as diretrizes das skills **`impeccable`** (modo *Operate*, robustez de estados e ergonomia mobile) e **`design-taste-frontend`** (estética anti-clichê, paleta Obsidian com superfícies de vidro fosco e micro-interações táteis).

---

## 🚀 Como Executar

1. **Instale as dependências:**
   ```bash
   cd termux-web-cli-refactored
   npm install
   ```

2. **Inicie o Servidor:**
   ```bash
   npm start
   ```
   *(Ou em outra porta: `PORT=8080 npm start`)*

3. **Acesse no Navegador:**
   Abra `http://localhost:3000` no navegador do celular ou desktop.
   *Dica: Selecione "Adicionar à tela inicial" no menu do Chrome/Brave para usar em modo aplicativo (PWA) de tela cheia.*

---

## 🏛️ Arquitetura Modular (Zero-Build ES6)

```
termux-web-cli-refactored/
├── server.js               # Ponto de entrada Express & WebSocket Server
├── pty_bridge.py           # Bridge Python PTY de baixa latência para TUI interativo (nano, htop, vi)
├── agent_bridge.py         # Bridge de conversação contínua com Antigravity AI Agent
├── server/                 # Módulos do Backend
│   ├── env-detector.js     # Identificação dinâmica de ambiente (Termux / Ubuntu / Arch / Debian / PRoot)
│   ├── session-manager.js  # Gerenciamento de abas, histórico de buffers e persistência em disco
│   ├── ssh-handler.js      # Conexões SSH2 nativas com chave privada / senha
│   ├── pty-handler.js      # Spawn de processos com preservação de CWD e sinais SIGINT
│   └── file-handler.js     # Listagem rápida de diretórios para o explorador
└── public/                 # Frontend PWA (Zero-Build)
    ├── index.html          # Markup semântico, acessível e otimizado para viewport mobile
    ├── css/
    │   └── theme.css       # Tokens, superfícies de vidro fosco, ANSI e ergonomia de toque
    └── js/                 # Módulos ES6 nativos do navegador
        ├── state.js        # Store reativa centralizada (localStorage, temas, abas, snippets)
        ├── ws.js           # Cliente WebSocket resiliente com reconexão exponencial
        ├── ansi.js         # Parser ANSI para HTML com sintaxe colorida
        ├── tabs.js         # Barra de abas dinâmicas estilo VS Code / Browser
        ├── quick-bar.js    # Dock inferior de polegar (Thumb-zone) e histórico Up/Down
        ├── dir-tree.js     # Explorador de arquivos e diretórios integrado
        ├── modals.js       # Bottom sheets fluidos (SSH, Snippets, Clipboard, Configurações)
        ├── options-panel.js# Painel interativo com timer para prompts de múltipla escolha
        ├── xterm-manager.js# Overlay XTerm.js para apps TUI em tela cheia
        └── main.js         # Inicializador principal
```

---

## ✨ Destaques da Refatoração

1. **Modularização Limpa**: O código monolítico de ~128KB foi decomposto em módulos especializados e isolados, facilitando manutenção e testes.
2. **Design Taste**: Substituição de pretos puros por Obsidian (`#0b0f19`) e superfícies com realce especular de 1px interno (`inset 0 1px 0 rgba(255,255,255,0.06)`).
3. **Ergonomia Mobile**: Barra inferior no alcance do polegar com safe-area insets (`100dvh`), sem travamento durante digitação no teclado virtual.
4. **Resiliência e Persistência**: Sessões salvas automaticamente em disco e reconexão automática com buffer de mensagens pendentes.

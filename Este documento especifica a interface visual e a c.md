Este documento especifica a interface visual e a configuração de aplicativo progressivo (PWA) para a camada de apresentação. O objetivo é garantir que a aplicação seja instalável na tela inicial do Android e opere com a aparência de um aplicativo nativo em tela cheia, sem as barras de navegação do browser.
1. Estrutura Semântica e Mobile-First (public/index.html)
O arquivo HTML é projetado para máxima eficiência em telas de smartphones, priorizando o alcance dos dedos (thumb-zone) na parte inferior da tela.
 * Meta Tags de Viewport: A tag viewport é configurada com maximum-scale=1.0 e user-scalable=no. Isso é crítico no Android para impedir que a tela dê zoom acidentalmente quando o usuário toca rapidamente nos botões de atalho ou no terminal.
 * Tailwind CSS via CDN: O script do Tailwind carrega as classes utilitárias diretamente, dispensando configuração de build. A interface utiliza um fundo escuro (bg-gray-900) e texto claro (text-gray-100) para simular um terminal tradicional e economizar bateria em telas OLED.
 * Layout em Flexbox: A tela é dividida em flexbox direcional de coluna (flex-col e h-screen).
   * O cabeçalho exibe o status da conexão WebSocket.
   * O corpo principal (flex-1, overflow-y-auto) contém o elemento <pre> que renderizará as saídas de comando.
   * O rodapé concentra os controles interativos (input de texto e botões rápidos), mantendo o teclado do celular sempre adjacente à área de digitação.
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>Termux Web CLI</title>
    
    <!-- Manifesto PWA -->
    <link rel="manifest" href="manifest.json">
    <meta name="theme-color" content="#111827">
    <link rel="apple-touch-icon" href="icon.png">
    
    <!-- Tailwind CSS -->
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="styles.css">
</head>
<body class="bg-gray-900 text-gray-100 h-screen flex flex-col font-mono overflow-hidden">

    <!-- Cabeçalho / Status -->
    <header class="bg-gray-800 p-3 flex justify-between items-center shadow-md border-b border-gray-700 z-10">
        <h1 class="text-sm font-bold text-green-400">Termux CLI</h1>
        <div id="status-indicator" class="flex items-center text-xs">
            <span class="w-2 h-2 rounded-full bg-yellow-500 mr-2" id="status-dot"></span>
            <span id="status-text" class="text-gray-300">Conectando...</span>
        </div>
    </header>

    <!-- Área do Terminal -->
    <main id="terminal-container" class="flex-1 overflow-y-auto p-2 scroll-smooth">
        <pre id="terminal-output" class="whitespace-pre-wrap word-break text-xs md:text-sm leading-relaxed pb-4"></pre>
    </main>

    <!-- Controles Inferiores (Thumb-zone) -->
    <footer class="bg-gray-800 p-2 border-t border-gray-700 flex flex-col gap-2 z-10 shrink-0">
        <!-- Atalhos Rápidos -->
        <div class="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            <button id="btn-clear" class="bg-gray-700 hover:bg-gray-600 text-xs px-3 py-2 rounded-md whitespace-nowrap active:scale-95 transition-transform">Limpar</button>
            <button id="btn-cancel" class="bg-red-900 hover:bg-red-800 text-red-200 text-xs px-3 py-2 rounded-md whitespace-nowrap active:scale-95 transition-transform">Cancelar (Ctrl+C)</button>
            <button class="shortcut-btn bg-gray-700 hover:bg-gray-600 text-xs px-3 py-2 rounded-md whitespace-nowrap active:scale-95 transition-transform" data-cmd="ls -la">ls -la</button>
            <button class="shortcut-btn bg-gray-700 hover:bg-gray-600 text-xs px-3 py-2 rounded-md whitespace-nowrap active:scale-95 transition-transform" data-cmd="top -n 1">top</button>
        </div>
        
        <!-- Input de Comando -->
        <form id="command-form" class="flex gap-2">
            <input type="text" id="command-input" class="flex-1 bg-gray-900 border border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500 transition-colors" placeholder="Digite um comando..." autocomplete="off" spellcheck="false" autocorrect="off" autocapitalize="none">
            <button type="submit" class="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-md text-sm font-bold active:scale-95 transition-transform">Run</button>
        </form>
    </footer>

    <script src="app.js"></script>
</body>
</html>

2. Configuração do PWA (public/manifest.json)
Para que o Google Chrome (ou outro navegador no Android) ofereça a opção de instalar a interface no sistema operacional, o manifesto JSON deve estar presente com parâmetros específicos.
 * display: "standalone": Força a abertura do app em uma janela própria, ocultando a barra de endereços do navegador e fundindo a interface com a barra de status do Android.
 * theme_color e background_color: Definidos em #111827 (equivalente ao bg-gray-900 do Tailwind) para garantir uma transição imperceptível e livre de flashes brancos ao abrir o app.
{
  "name": "Termux Web CLI",
  "short_name": "TermuxWeb",
  "description": "Interface web interativa para o terminal do Android via Termux",
  "start_url": "./index.html",
  "display": "standalone",
  "orientation": "portrait-primary",
  "background_color": "#111827",
  "theme_color": "#111827",
  "icons": [
    {
      "src": "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' fill='%23111827'/><text y='60' x='15' font-size='50' fill='%234ade80' font-family='monospace'>&gt;_</text></svg>",
      "sizes": "512x512",
      "type": "image/svg+xml",
      "purpose": "any maskable"
    }
  ]
}

Nota sobre o ícone: No JSON acima, utilizou-se um Data URI em formato SVG gerando um símbolo clássico >_ sobre fundo escuro. Isso elimina a necessidade imediata de criar e hospedar um arquivo .png apenas para cumprir o requisito de ícone do PWA, facilitando o deploy instantâneo em três passos.

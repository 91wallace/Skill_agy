Tópico 7: Documentação e Guia de Execução no Termux (README.md) e Instruções de Agrupamento
Este documento final fornece o conteúdo do README.md da aplicação e as diretrizes definitivas de compilação para o agente AntiGravity, garantindo que ele entenda a topologia do projeto e gere o código funcional em sua totalidade, sem omissões.
1. Código Fonte Completo (README.md)
# Termux Web CLI

Uma interface web leve, responsiva e interativa (PWA) para acessar e controlar o terminal nativo do Android via Termux.

## Requisitos
* Termux instalado no Android.
* Node.js instalado no Termux (`pkg install nodejs`).

## Instalação e Execução em 3 Passos

1. **Instale as dependências:**
   No diretório do projeto, onde o `package.json` está localizado, execute:
   ```bash
   npm install

 * Inicie o Servidor:
   Execute o script de inicialização para levantar o backend e o WebSocket:
   npm start

   (Opcional: Para rodar em outra porta, use PORT=8080 npm start)
 * Acesse a Interface:
   * Abra o navegador do seu smartphone (Google Chrome, Brave, etc.).
   * Acesse http://localhost:3000.
   * Dica: No menu do navegador, selecione "Adicionar à tela inicial" para instalar como um aplicativo nativo (PWA) em tela cheia.
Uso Básico
 * Digite comandos no campo inferior e pressione Enter ou "Run".
 * Use os botões de atalho para comandos frequentes (ex: top, ls -la).
 * Use o botão "Cancelar (Ctrl+C)" para interromper processos em loop ou demorados.

## 2. Instruções de Agrupamento e Contexto para o Agente (AntiGravity)

Copie o bloco abaixo e anexe ao final do seu prompt principal para o AntiGravity. Ele instruirá o agente sobre como processar todos os tópicos anteriores e construir a aplicação corretamente.

***

**INSTRUÇÕES DE SISTEMA PARA O AGENTE GERADOR:**

Você está recebendo um contexto completo dividido em 7 partes detalhadas para a criação do projeto **Termux Web CLI**. Sua tarefa é processar todo esse escopo e gerar a aplicação final completa. Siga estritamente as regras abaixo:

*   **Zero Placeholders:** Você deve gerar o código-fonte completo e funcional de **todos** os arquivos solicitados. É terminantemente proibido o uso de comentários como `// ... resto do código aqui` ou `/* adicione sua lógica */`.
*   **Estrutura de Diretórios Obrigatória:** O projeto deve conter exatamente a seguinte topologia. Crie as pastas e arquivos conforme listado:
    *   `/package.json` (Dependências e scripts de inicialização)
    *   `/server.js` (Backend em Node.js com Express e ws)
    *   `/README.md` (Instruções de uso)
    *   `/public/index.html` (Interface PWA com Tailwind via CDN)
    *   `/public/manifest.json` (Manifesto de instalação standalone)
    *   `/public/styles.css` (Ajustes de UX mobile, animações e remoção de scrollbars)
    *   `/public/app.js` (Lógica de WebSocket, auto-scroll e captura de comandos)
*   **Integração de Backend:** O arquivo `server.js` deve utilizar `child_process.spawn` com `{ shell: true }` de forma contínua, fazendo o stream de `stdout` e `stderr` em tempo real para o cliente, gerenciando colisões de execução e permitindo a interrupção do processo em andamento via sinal `SIGINT`.
*   **Integração de Frontend:** O aplicativo deve ser renderizado inteiramente client-side, utilizando a conexão de WebSocket definida em `app.js` para escutar e escrever os logs nativamente no DOM (`document.createElement('span')`).
*   **Foco em Mobile:** Respeite rigorosamente a meta tag de viewport, a ausência de recursos pesados de build (nada de Webpack/Babel) e garanta que o layout de entrada fique acessível ao teclado virtual do Android.

Analise as especificações de cada arquivo fornecidas nos tópicos e construa o espaço de trabalho completo com todos os arquivos prontos para execução imediata no Termux.


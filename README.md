# Termux Web CLI

Uma interface web leve, responsiva e interativa (PWA) para acessar e controlar o terminal nativo do Android via Termux.

## Requisitos
* Termux instalado no Android.
* Node.js instalado no Termux (`pkg install nodejs`).

## Instalação e Execução em 3 Passos

1. **Instale as dependências:**
   No diretório do projeto, execute:
   ```bash
   npm install
   ```

2. **Inicie o Servidor:**
   Execute o script de inicialização para levantar o backend e o WebSocket:
   ```bash
   npm start
   ```
   *(Opcional: Para rodar em outra porta, use `PORT=8080 npm start`)*

3. **Acesse a Interface:**
   * Abra o navegador do seu smartphone (Google Chrome, Brave, etc.).
   * Acesse `http://localhost:3000`.
   * **Dica:** No menu do navegador, selecione **"Adicionar à tela inicial"** para instalar como um aplicativo nativo (PWA) em tela cheia.

## Uso Básico
* Digite comandos no campo inferior e pressione Enter ou "Run".
* Use os botões de atalho para comandos frequentes (ex: `top`, `ls -la`).
* Use o botão "Cancelar (Ctrl+C)" para interromper processos em loop ou demorados.

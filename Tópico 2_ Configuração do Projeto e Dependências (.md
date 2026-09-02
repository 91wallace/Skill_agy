# Tópico 2: Configuração do Projeto e Dependências (`package.json`)

Este documento detalha a estrutura base do projeto Node.js e a configuração do arquivo `package.json`. O foco é manter o ambiente o mais enxuto possível, garantindo rápida inicialização e baixo consumo de memória no Termux.

## 1. Estrutura Base do Pacote Node.js

O projeto não utilizará bundlers ou processos de build. A estrutura raiz conterá apenas os arquivos essenciais para o backend e a pasta `public/` para o frontend. O `package.json` é o ponto de entrada que define a identidade do projeto e suas dependências rigorosamente selecionadas.

## 2. Seleção de Dependências Minimalistas

Para atender ao requisito de leveza no ambiente mobile, optou-se pelas seguintes bibliotecas:

*   **`express`**: Framework web rápido e minimalista. Será utilizado exclusivamente para servir a pasta estática `public/` (onde residem o HTML, CSS e JS do PWA).
*   **`ws`**: Biblioteca de WebSocket para Node.js. Foi escolhida em detrimento do `socket.io` por ser consideravelmente mais leve, mais rápida e implementar o protocolo WebSocket puro, o que reduz o overhead e o consumo de recursos na CPU do smartphone.
*   **`cors`**: Middleware para habilitar Cross-Origin Resource Sharing. Essencial caso o usuário decida acessar a interface via navegador de outro dispositivo na mesma rede Wi-Fi, evitando bloqueios de política de mesma origem.

Como não há etapa de transpilação (Babel) ou empacotamento (Webpack/Vite), a seção `devDependencies` será inexistente, economizando espaço em disco e acelerando a instalação via `npm install`.

## 3. Estrutura Detalhada do `package.json`

Abaixo está o conteúdo exato que deve compor o arquivo `package.json`:

```json
{
  "name": "termux-web-cli",
  "version": "1.0.0",
  "description": "Interface web interativa tipo PWA para o terminal nativo do Android via Termux",
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  },
  "author": "",
  "license": "MIT",
  "dependencies": {
    "cors": "^2.8.5",
    "express": "^4.19.2",
    "ws": "^8.17.0"
  }
}
```

### Detalhamento dos Campos Chave:

*   **`main`**: Aponta para `server.js`, que será o coração do backend e gerenciador de conexões.
*   **`scripts.start`**: Define o comando padrão para iniciar a aplicação. No Termux, você precisará rodar apenas `npm start`. A ausência de scripts complexos reflete a arquitetura "zero-build".
*   **`dependencies`**: As versões fixadas garantem previsibilidade na instalação, evitando que atualizações maiores quebrem a aplicação no ambiente restrito do Termux.

## 4. Variáveis de Ambiente Padrão

O sistema será projetado para utilizar a porta `3000` por padrão. No entanto, o código do `server.js` (que será detalhado no Tópico 3) consumirá a variável `process.env.PORT`, permitindo a alteração da porta dinamicamente se necessário, sem modificar o código-fonte (ex: `PORT=8080 npm start`).
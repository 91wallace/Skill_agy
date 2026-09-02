Tópico 3: Backend, Servidor WebSocket e Gerenciamento de Processos (server.js)
Este documento detalha o núcleo lógico do sistema. O arquivo server.js atua como a ponte entre a interface web (PWA) e o shell nativo do Android via Termux. O foco principal é manter o event loop do Node.js livre, garantindo a fluidez da comunicação bidirecional em tempo real por meio de WebSockets e streams de dados.
1. Configuração do Servidor Express e HTTP
O Express é configurado de forma minimalista. Sua única responsabilidade é entregar o frontend.
 * Serviço de Arquivos Estáticos: O middleware express.static('public') é utilizado para expor a pasta onde estarão o index.html, styles.css e app.js.
 * Acoplamento HTTP: Em vez de usar app.listen() diretamente, o Express é acoplado a um servidor nativo http.createServer(app). Isso é obrigatório para que a mesma porta (3000) possa compartilhar o tráfego HTTP comum (carregamento inicial da página) e o tráfego de upgrade do protocolo WebSocket.
2. Implementação do Servidor WebSocket (ws)
A biblioteca ws gerencia o canal de comunicação persistente com o cliente.
 * Inicialização: O WebSocket.Server é instanciado recebendo o servidor HTTP criado anteriormente.
 * Comunicação em JSON: Todas as mensagens trafegadas são strings formatadas em JSON contendo um type (ex: command, kill, output, error, system) e o data (o conteúdo de texto). Isso facilita o roteamento da lógica no frontend.
 * Gerenciamento de Ciclo de Vida: O evento connection saúda o cliente. O evento close possui um gatilho de segurança: se o usuário fechar a aba do navegador no celular enquanto um comando demorado (ex: apt update) estiver rodando, o backend intercepta a queda de conexão e mata o processo órfão para não travar os recursos do smartphone.
3. Execução e Streaming via child_process.spawn
Para rodar os comandos no Termux, a função spawn é estritamente necessária no lugar de exec.
 * Por que não exec? O exec faz buffer de toda a saída e só a retorna quando o processo termina. No Termux, comandos como top ou ping rodariam para sempre ou estourariam a memória RAM do celular.
 * Uso de spawn com { shell: true }: O spawn cria streams contínuos. A flag shell: true é vital, pois permite que comandos compostos, pipes (|) e redirecionamentos lógicos (&&) funcionem exatamente como o usuário digitaria diretamente no terminal do Termux.
 * Captura de Streams: São registrados listeners para currentProcess.stdout.on('data') e stderr.on('data'). Sempre que o processo emite um fragmento (chunk) de saída, esse buffer é convertido para string com .toString() e despachado instantaneamente pela conexão WebSocket ativa.
4. Estado de Execução e Interrupção (SIGINT)
O servidor precisa proteger o Termux contra a execução concorrente desordenada, já que estamos emulando um único terminal interativo.
 * Variável de Estado: Uma variável global currentProcess guarda a referência do processo em andamento.
 * Prevenção de Colisão: Se uma mensagem de command chegar enquanto currentProcess não for nulo, o servidor recusa o novo comando e envia um aviso de erro, evitando a sobrecarga de threads.
 * Sinal de Cancelamento: Se o frontend enviar uma ação kill, o servidor invoca currentProcess.kill('SIGINT'), emulando o atalho Ctrl+C. O processo é limpo da memória e o terminal fica pronto para a próxima instrução.
5. Código Fonte Completo (server.js)
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { spawn } = require('child_process');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());

// Serve a pasta 'public' onde ficará o frontend (PWA)
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Armazena a referência do processo em execução no momento
let currentProcess = null;

wss.on('connection', (ws) => {
    ws.send(JSON.stringify({ type: 'system', data: 'Conectado ao backend Termux via WebSocket.\n' }));

    ws.on('message', (message) => {
        const parsed = JSON.parse(message);

        // Ação de cancelamento (Ctrl+C)
        if (parsed.action === 'kill') {
            if (currentProcess) {
                currentProcess.kill('SIGINT');
                ws.send(JSON.stringify({ type: 'system', data: '\n[Sinal SIGINT enviado: Processo interrompido]\n' }));
                currentProcess = null;
            }
            return;
        }

        // Ação de execução de comando
        if (parsed.action === 'command') {
            const cmd = parsed.data;
            
            if (currentProcess) {
                ws.send(JSON.stringify({ type: 'error', data: '\n[Aviso: Um processo já está em execução. Encerre-o primeiro.]\n' }));
                return;
            }

            ws.send(JSON.stringify({ type: 'system', data: `\n$ ${cmd}\n` }));

            // spawn com shell: true permite resolver pipes e utilitários nativos
            currentProcess = spawn(cmd, { shell: true });

            currentProcess.stdout.on('data', (data) => {
                ws.send(JSON.stringify({ type: 'output', data: data.toString() }));
            });

            currentProcess.stderr.on('data', (data) => {
                ws.send(JSON.stringify({ type: 'error', data: data.toString() }));
            });

            currentProcess.on('close', (code) => {
                ws.send(JSON.stringify({ type: 'system', data: `\n[Processo encerrado com código ${code}]\n` }));
                currentProcess = null;
            });
            
            currentProcess.on('error', (err) => {
                ws.send(JSON.stringify({ type: 'error', data: `\n[Falha de execução: ${err.message}]\n` }));
                currentProcess = null;
            });
        }
    });
    
    // Limpeza de processos órfãos caso o cliente desconecte abruptamente
    ws.on('close', () => {
        if (currentProcess) {
            currentProcess.kill('SIGINT');
            currentProcess = null;
        }
    });
});

// Binding do servidor e fallback dinâmico
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`[Termux CLI Web] Servidor rodando em http://localhost:${PORT}`);
    console.log(`[Termux CLI Web] Aguardando conexões WebSocket...`);
});


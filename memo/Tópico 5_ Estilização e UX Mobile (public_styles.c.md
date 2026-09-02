Tópico 5: Estilização e UX Mobile (public/styles.css)
Este documento detalha a camada de estilo complementar do frontend. Como a estrutura principal utiliza as classes utilitárias do Tailwind CSS embutidas no index.html (detalhado no Tópico 4), o arquivo styles.css é mantido intencionalmente enxuto. Sua função exclusiva é injetar refinamentos de usabilidade (UX) e comportamentos visuais específicos para dispositivos móveis que o Tailwind via CDN não cobre nativamente.
1. Ocultação de Barras de Rolagem (Estética de App Nativo)
Em aplicativos mobile nativos, as barras de rolagem horizontais (especialmente em listas de atalhos) costumam ficar invisíveis para manter a interface limpa, revelando-se apenas durante a interação.
 * Classe .no-scrollbar: Criada para ocultar as barras de rolagem na lista horizontal de botões de atalho (acima do campo de input), permitindo que o usuário deslize os botões lateralmente sem a poluição visual de uma barra de scroll padrão do navegador. Abrange implementações para WebKit (Chrome/Safari) e Firefox.
2. Quebra de Texto Segura no Terminal
A saída de comandos no Linux (como logs de erros ou hashes longos) frequentemente gera strings contínuas sem espaços. Se renderizadas puramente no HTML, essas strings forçam a expansão horizontal do contêiner, quebrando o layout responsivo.
 * Classe .word-break: Garante que palavras excessivamente longas ou blocos de código sem espaços sejam quebrados forçadamente e envolvam para a próxima linha (word-wrap: break-word e word-break: break-all). Isso mantém todo o conteúdo legível dentro do eixo vertical do smartphone, eliminando a necessidade de rolagem horizontal dentro do bloco <pre>.
3. Feedback Visual de Status (Keyframes)
O indicador de status no cabeçalho precisa comunicar claramente se a conexão WebSocket está ativa, processando ou morta.
 * Animação .animate-pulse-fast: Adiciona uma animação CSS personalizada para fazer o "ponto de status" (status dot) piscar rapidamente quando um comando estiver em execução, fornecendo feedback tátil e visual de que o backend está trabalhando, essencial em comandos de longa duração.
4. Código Fonte Completo (public/styles.css)
/* public/styles.css */

/* 
 * 1. Ocultar barras de rolagem em contêineres horizontais (ex: barra de atalhos)
 * Mantém a funcionalidade de scroll nativa intacta.
 */
.no-scrollbar::-webkit-scrollbar {
    display: none;
}
.no-scrollbar {
    -ms-overflow-style: none;  /* IE e Edge */
    scrollbar-width: none;  /* Firefox */
}

/* 
 * 2. Comportamento do Terminal
 * Garante que saídas de comando longas não quebrem o layout horizontal da tela.
 */
.word-break {
    word-wrap: break-word;
    word-break: break-all;
    white-space: pre-wrap; /* Preserva formatação, mas permite quebra */
}

/* 
 * 3. Ajuste fino de toques no mobile
 * Remove o destaque azul padrão de navegadores webkit ao tocar em botões.
 */
button, input {
    -webkit-tap-highlight-color: transparent;
}

/* 
 * 4. Animação personalizada para o status "Processando"
 */
@keyframes pulse-fast {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
}

.animate-pulse-fast {
    animation: pulse-fast 1s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

/* Cores de status para o JavaScript injetar via classe */
.status-connected {
    background-color: #4ade80; /* bg-green-400 */
}
.status-disconnected {
    background-color: #ef4444; /* bg-red-500 */
}
.status-processing {
    background-color: #eab308; /* bg-yellow-500 */
}


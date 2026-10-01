Migracao Antigravity: Modo Headless e Persistencia de Contexto
Objetivo
Eliminar falhas visuais causadas por emuladores de terminal (xterm.js, PTY, ttyd) substituindo a interface interativa por execucao headless com saida limpa e gestao de sessao/contexto.

---

1. Problema Atual
• A captura e renderizacao do terminal interativo (TUI/PTY) gera quebras de escape ANSI, atraso de buffer e falhas visuais no ambiente Android/Termux.

• Dependencia de emuladores para ler fluxos de terminal em tempo real.

---

2. Solucao Proposta: Modo Headless / Execucao Silenciosa
• Desacoplar a interface visual do terminal interativo.

• Rodar o binario `antigravity` / `agy` de forma nao interativa via backend local (Node.js ou Python).

• O backend recebe as requisicoes da interface e dispara comandos em modo batch/prompt direto, capturando `stdout` e `stderr` limpos.

• O frontend renderiza texto puro, Markdown ou JSON sem necessidade de xterm.js.

---

3. Preservacao do Contexto e Historico
Para manter a continuidade do projeto sem terminal interativo aberto:

Opcao A: Flags Nativas do Antigravity CLI

• Retomada automatica da ultima conversa: `agy -c -p "<prompt>"`

• Continuacao de sessao especifica por identificador: `agy --conversation <session_id> -p "<prompt>"`

• O CLI le o historico gravado no disco (JSONL/SQLite), processa com o contexto acumulado e devolve a saida limpa.

Opcao B: Gerenciamento pelo Backend (API Direta)

• O backend local mantem o array de mensagens (`user` / `model`) em memoria ou banco local (SQLite).

• A cada requisicao, repassa o contexto completo acumulado para a chamada de inferencia.

---

4. Roteiro de Implementacao
1. Backend:

  • Criar endpoint HTTP (ex.: `POST /api/prompt`) que recebe a mensagem do usuario e opcionalmente o `session_id`.

  • Executar subprocesso chamando o CLI em modo headless (`agy -c -p` ou `--conversation`).

  • Retornar o `stdout` sanitizado (sem codigos ANSI) em resposta JSON.

2. Frontend:

  • Remover emuladores de terminal da camada de visualizacao.

  • Usar componentes padrao de chat web (HTML/CSS) com renderizador de Markdown nativo.

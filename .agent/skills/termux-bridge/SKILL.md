---
name: termux-bridge
description: Termux & Android OpenSSH Bridge Integration. Permite abrir o Termux nativo a partir do PRoot, navegar para pastas específicas (/open), disparar intents do Android (am start), abrir URLs e aplicativos, e controlar hardware/Termux:API diretamente via SSH nativo na porta 8022 (sem servidor adicional).
---

# Termux SSH Bridge & Android Automation

## 1. Visão Geral
Esta ferramenta conecta o ambiente Linux PRoot diretamente ao **Termux nativo (Android)** através do **OpenSSH (porta 8022)**. Não requer a execução de servidores intermediários, usando apenas o `sshd` do Termux.

## 2. Comandos e Capacidades
- **/open [caminho|url|pacote|comando]**:
  - Sem parâmetros: Ativa a Activity do Termux no Android via SSH e foca no diretório atual do PRoot.
  - Com diretório (ex: `/open /root/projects`): Abre o Termux na pasta especificada.
  - Com URL (ex: `/open https://github.com`): Abre no navegador nativo do Android.
  - Com pacote (ex: `/open com.whatsapp`): Abre o aplicativo correspondente via `am start`.
  - Com comando nativo (ex: `/open termux-battery-status`): Executa o comando via SSH.
- **termux-remote '<comando>'**: Executa qualquer comando shell diretamente no Termux nativo via SSH.
- **termux-open [alvo]**: Utilitário CLI para abrir pastas, links ou aplicativos.

## 3. Configuração do SSH no Termux
No Termux nativo (uma única vez):
```bash
pkg install openssh -y
sshd
```

Para autenticação sem senha a partir do PRoot:
```bash
# Adicionar a chave pública do PRoot ao authorized_keys do Termux
cat /root/.ssh/id_ed25519.pub
# Cole o conteúdo acima no arquivo ~/.ssh/authorized_keys do Termux nativo
```

## 4. Exemplos de Uso pelo Agente
```bash
# Abrir a pasta atual no Termux
/usr/local/bin/termux-open

# Abrir um link no navegador Android
/usr/local/bin/termux-open https://google.com

# Consultar bateria
/usr/local/bin/termux-remote 'termux-battery-status'

# Emitir notificação
/usr/local/bin/termux-remote 'termux-notification -t "AGY" -c "Concluído!"'
```

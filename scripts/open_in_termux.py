#!/usr/bin/env python3
"""
Termux SSH Bridge Client - Open Directories, URLs, and Android Apps via Native SSH
Executa comandos diretamente no Termux nativo via OpenSSH (porta padrão 8022), sem necessidade de servidor HTTP.
"""

import os
import sys
import json
import subprocess

SSH_PORT = os.environ.get("TERMUX_SSH_PORT", "8022")
SSH_HOST = os.environ.get("TERMUX_SSH_HOST", "127.0.0.1")
SSH_USER = os.environ.get("TERMUX_SSH_USER", "")

def run_ssh_command(remote_cmd: str, timeout: int = 10):
    """Executa comando remoto no Termux nativo via SSH."""
    target_dest = f"{SSH_USER}@{SSH_HOST}" if SSH_USER else SSH_HOST
    
    ssh_cmd = [
        "ssh",
        "-p", str(SSH_PORT),
        "-o", "StrictHostKeyChecking=no",
        "-o", "UserKnownHostsFile=/dev/null",
        "-o", "LogLevel=ERROR",
        "-o", f"ConnectTimeout={timeout}",
        target_dest,
        remote_cmd
    ]
    
    try:
        res = subprocess.run(
            ssh_cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=timeout + 2
        )
        return {
            "success": res.returncode == 0,
            "exitCode": res.returncode,
            "stdout": res.stdout,
            "stderr": res.stderr,
            "error": None if res.returncode == 0 else res.stderr
        }
    except subprocess.TimeoutExpired:
        return {
            "success": False,
            "exitCode": -1,
            "stdout": "",
            "stderr": f"Timeout ao conectar via SSH em {SSH_HOST}:{SSH_PORT}",
            "error": "Timeout"
        }
    except Exception as e:
        return {
            "success": False,
            "exitCode": -1,
            "stdout": "",
            "stderr": f"Falha ao executar SSH ({str(e)}). Verifique se o sshd está rodando no Termux nativo ('sshd').",
            "error": str(e)
        }

def open_target(target: str = None):
    """Abre diretório no Termux/PRoot, URL no navegador ou app no Android via SSH."""
    if not target or target.strip() == "":
        target = os.getcwd()

    target = target.strip()

    # Caso 0: Comando direto do Termux / Android
    if target.startswith("termux-") or target.startswith("am ") or target.startswith("pm ") or target.startswith("cmd ") or target.startswith("dumpsys "):
        if target == "termux-batery-status":
            target = "termux-battery-status"
        print(f"[*] Executando comando nativo via SSH ({SSH_HOST}:{SSH_PORT}): {target}")
        return run_ssh_command(target)

    # Caso 1: URL Web
    if target.startswith("http://") or target.startswith("https://"):
        print(f"[*] Abrindo URL no navegador Android via SSH: {target}")
        cmd = f"am start -a android.intent.action.VIEW -d '{target}'"
        return run_ssh_command(cmd)

    # Caso 2: App Android pelo package name
    if (target.startswith("com.") or target.startswith("org.") or target.startswith("net.") or target.startswith("br.")) and "/" not in target and " " not in target:
        print(f"[*] Abrindo aplicativo Android ({target}) via SSH...")
        cmd = (
            f'ACT=$(dumpsys package {target} 2>/dev/null | grep -B 1 "android.intent.category.LAUNCHER" | grep "{target}/" | awk \'{{print $2}}\' | head -n 1); '
            f'if [ -z "$ACT" ]; then ACT=$(cmd package resolve-activity --brief {target} 2>/dev/null | grep -E "^[a-zA-Z0-9._]+/" | head -n 1); fi; '
            f'if [ -n "$ACT" ]; then '
            f'  am start -n "$ACT"; '
            f'elif am start -n {target}/.Main 2>/dev/null; then '
            f'  true; '
            f'else '
            f'  monkey -p {target} -c android.intent.category.LAUNCHER 1; '
            f'fi'
        )
        return run_ssh_command(cmd)

    # Caso 3: Diretório / PRoot
    abs_path = os.path.abspath(os.path.expanduser(target))
    print(f"[*] Abrindo Termux no PRoot e navegando para: {abs_path}")
    termux_cmd = "am start -a android.intent.action.MAIN -c android.intent.category.LAUNCHER -n com.termux/.app.TermuxActivity"
    res = run_ssh_command(termux_cmd)
    if res.get("success"):
        res["directory"] = abs_path
        res["message"] = f"Termux ativado no Android via SSH. Diretório de trabalho: {abs_path}"
    return res

def main():
    target = sys.argv[1] if len(sys.argv) > 1 else ""
    res = open_target(target)
    print(json.dumps(res, indent=2, ensure_ascii=False))
    if not res.get("success"):
        sys.exit(1)

if __name__ == "__main__":
    main()

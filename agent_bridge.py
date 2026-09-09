#!/usr/bin/env python3
import sys
import os
import json
import subprocess
import threading
import re

current_process = None

def run_agent_turn(prompt, conversation_id=None, cwd=None):
    global current_process
    cmd = ['agy', '-p', prompt, '--dangerously-skip-permissions']
    if conversation_id:
        cmd.extend(['--conversation', conversation_id])
    else:
        cmd.append('-c')

    env = os.environ.copy()
    env['FORCE_COLOR'] = '0'

    current_process = subprocess.Popen(
        cmd,
        cwd=cwd or os.getcwd(),
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,
        env=env
    )

    def read_stderr():
        buf = ""
        for line in current_process.stderr:
            buf += line
            # Detecta URL de login do Google OAuth
            if "accounts.google.com/o/oauth2/auth" in line or "Authentication required" in line:
                match = re.search(r'(https://accounts\.google\.com/o/oauth2/auth\S+)', line)
                if match:
                    auth_url = match.group(1)
                    sys.stdout.write(json.dumps({"event": "auth_required", "url": auth_url}) + "\n")
                    sys.stdout.flush()
            sys.stderr.write(line)
            sys.stderr.flush()

    err_thread = threading.Thread(target=read_stderr, daemon=True)
    err_thread.start()

    # Lê em chunks pequenos para streaming fluido no WebSocket
    while True:
        chunk = current_process.stdout.read(64)
        if not chunk and current_process.poll() is not None:
            break
        if chunk:
            msg = json.dumps({"event": "chunk", "text": chunk})
            sys.stdout.write(msg + "\n")
            sys.stdout.flush()

    current_process.wait()
    msg = json.dumps({"event": "done", "exit_code": current_process.returncode})
    sys.stdout.write(msg + "\n")
    sys.stdout.flush()
    current_process = None

def main():
    global current_process
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
            action = req.get('action')
            if action == 'chat':
                prompt = req.get('prompt', '')
                conv_id = req.get('conversation_id')
                cwd = req.get('cwd')
                run_agent_turn(prompt, conv_id, cwd)
            elif action == 'ping':
                sys.stdout.write(json.dumps({"event": "pong"}) + "\n")
                sys.stdout.flush()
        except Exception as e:
            sys.stdout.write(json.dumps({"event": "error", "error": str(e)}) + "\n")
            sys.stdout.flush()

if __name__ == '__main__':
    main()

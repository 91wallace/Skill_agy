import pty
import os
import sys
import select
import termios
import struct
import fcntl
import json
import signal

def set_winsize(fd, rows, cols):
    winsize = struct.pack("HHHH", int(rows), int(cols), 0, 0)
    try:
        fcntl.ioctl(fd, termios.TIOCSWINSZ, winsize)
    except Exception:
        pass

def main():
    if len(sys.argv) < 2:
        sys.stderr.write("Uso: pty_bridge.py '<command>' [rows] [cols]\n")
        sys.exit(1)

    cmd = sys.argv[1]
    rows = int(sys.argv[2]) if len(sys.argv) > 2 else 24
    cols = int(sys.argv[3]) if len(sys.argv) > 3 else 80

    master, slave = pty.openpty()
    set_winsize(master, rows, cols)

    env = os.environ.copy()
    env["TERM"] = "xterm-256color"
    env["COLORTERM"] = "truecolor"
    env["FORCE_COLOR"] = "1"

    pid = os.fork()

    if pid == 0:
        os.close(master)
        os.setsid()
        os.dup2(slave, 0)
        os.dup2(slave, 1)
        os.dup2(slave, 2)
        if slave > 2:
            os.close(slave)

        shell = os.environ.get("SHELL", "/bin/bash")
        os.execvpe(shell, [shell, "-c", cmd], env)
    else:
        os.close(slave)
        stdin_fd = sys.stdin.fileno()
        stdout_fd = sys.stdout.fileno()

        flags = fcntl.fcntl(stdin_fd, fcntl.F_GETFL)
        fcntl.fcntl(stdin_fd, fcntl.F_SETFL, flags | os.O_NONBLOCK)

        is_running = True

        def handle_sigint(sig, frame):
            try:
                os.kill(pid, signal.SIGINT)
            except Exception:
                pass

        signal.signal(signal.SIGINT, handle_sigint)

        input_buffer = b""

        while is_running:
            rlist = [master, stdin_fd]
            try:
                r, _, _ = select.select(rlist, [], [], 0.05)
            except (select.error, OSError):
                break

            if master in r:
                try:
                    data = os.read(master, 4096)
                    if not data:
                        break
                    os.write(stdout_fd, data)
                except OSError:
                    break

            if stdin_fd in r:
                try:
                    chunk = os.read(stdin_fd, 4096)
                    if not chunk:
                        break
                    input_buffer += chunk

                    while b"\n" in input_buffer:
                        line, input_buffer = input_buffer.split(b"\n", 1)
                        line_str = line.decode("utf-8", errors="ignore").strip()
                        if not line_str:
                            continue
                        
                        try:
                            ctrl = json.loads(line_str)
                            if isinstance(ctrl, dict) and "__ctrl__" in ctrl:
                                action = ctrl.get("__ctrl__")
                                if action == "resize":
                                    new_rows = ctrl.get("rows", rows)
                                    new_cols = ctrl.get("cols", cols)
                                    set_winsize(master, new_rows, new_cols)
                                    try:
                                        os.kill(pid, signal.SIGWINCH)
                                    except Exception:
                                        pass
                                elif action == "input":
                                    raw_text = ctrl.get("data", "")
                                    os.write(master, raw_text.encode("utf-8"))
                                elif action == "kill":
                                    try:
                                        os.kill(pid, signal.SIGINT)
                                    except Exception:
                                        pass
                                continue
                        except Exception:
                            pass

                        os.write(master, line + b"\n")
                except BlockingIOError:
                    pass
                except OSError:
                    break

            try:
                res_pid, status = os.waitpid(pid, os.WNOHANG)
                if res_pid == pid:
                    while True:
                        try:
                            r, _, _ = select.select([master], [], [], 0.02)
                            if master in r:
                                data = os.read(master, 4096)
                                if not data:
                                    break
                                os.write(stdout_fd, data)
                            else:
                                break
                        except Exception:
                            break
                    is_running = False
                    exit_code = os.waitstatus_to_exitcode(status) if hasattr(os, "waitstatus_to_exitcode") else (status >> 8)
                    sys.exit(exit_code)
            except ChildProcessError:
                break

        try:
            os.close(master)
        except Exception:
            pass

if __name__ == "__main__":
    main()

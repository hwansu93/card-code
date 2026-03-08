from __future__ import annotations

import subprocess
import time


class TmuxManager:
    def __init__(self, socket: str | None = None):
        self.socket = socket
        self.prefix = "cc-"

    def _cmd(self, *args: str) -> list[str]:
        cmd = ["tmux"]
        if self.socket:
            cmd += ["-S", self.socket]
        cmd += list(args)
        return cmd

    def make_session_name(self, project_name: str) -> str:
        suffix = hex(int(time.time() * 1000))[-6:]
        safe_name = project_name.replace("/", "-").replace(" ", "-")
        return f"{self.prefix}{safe_name}-{suffix}"

    def list_sessions(self) -> list[dict]:
        """List all tmux sessions that have a claude process in any pane."""
        result = subprocess.run(
            self._cmd("list-panes", "-a", "-F", "#{session_name} #{pane_current_command}"),
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            return []
        claude_sessions: dict[str, bool] = {}
        for line in result.stdout.strip().splitlines():
            parts = line.split(None, 1)
            if len(parts) == 2:
                session_name, command = parts
                if "claude" in command.lower():
                    claude_sessions[session_name] = True
        return [{"name": name} for name in claude_sessions]

    def list_external_claude_processes(self) -> list[dict]:
        """Find Claude Code processes not running in any tmux session."""
        # Get PIDs of all processes inside tmux panes
        tmux_result = subprocess.run(
            self._cmd("list-panes", "-a", "-F", "#{pane_pid}"),
            capture_output=True,
            text=True,
        )
        tmux_pids: set[int] = set()
        if tmux_result.returncode == 0:
            for line in tmux_result.stdout.strip().splitlines():
                line = line.strip()
                if line.isdigit():
                    tmux_pids.add(int(line))
                    # Also collect all descendant PIDs of tmux panes
                    children = subprocess.run(
                        ["pgrep", "-P", line],
                        capture_output=True, text=True,
                    )
                    if children.returncode == 0:
                        for child in children.stdout.strip().splitlines():
                            if child.strip().isdigit():
                                tmux_pids.add(int(child.strip()))

        # Find all claude processes
        pgrep_result = subprocess.run(
            ["pgrep", "-a", "claude"],
            capture_output=True,
            text=True,
        )
        if pgrep_result.returncode != 0:
            return []

        external: list[dict] = []
        for line in pgrep_result.stdout.strip().splitlines():
            parts = line.split(None, 1)
            if len(parts) < 2:
                continue
            pid_str, command = parts
            if not pid_str.isdigit():
                continue
            pid = int(pid_str)
            if pid in tmux_pids:
                continue

            # Try to get cwd from /proc
            cwd = None
            try:
                import os
                cwd = os.readlink(f"/proc/{pid}/cwd")
            except OSError:
                pass

            external.append({"pid": pid, "command": command, "cwd": cwd})

        return external

    def spawn_session(
        self,
        project_path: str,
        project_name: str,
        initial_prompt: str | None = None,
    ) -> str:
        session_name = self.make_session_name(project_name)
        cmd = self._cmd(
            "new-session",
            "-d",
            "-s",
            session_name,
            "-c",
            project_path,
        )
        subprocess.run(cmd, check=True)

        claude_cmd = "claude"
        if initial_prompt:
            claude_cmd = f"claude --prompt {_shell_quote(initial_prompt)}"
        self.send_keys(session_name, claude_cmd)

        return session_name

    def send_keys(self, session_name: str, text: str) -> None:
        subprocess.run(
            self._cmd("send-keys", "-t", session_name, text, "Enter"),
            check=True,
        )

    def kill_session(self, session_name: str) -> None:
        subprocess.run(
            self._cmd("kill-session", "-t", session_name),
            check=True,
        )

    def capture_pane(self, session_name: str, lines: int = 50) -> str:
        result = subprocess.run(
            self._cmd(
                "capture-pane", "-t", session_name, "-p", "-e", "-S", f"-{lines}"
            ),
            capture_output=True,
            text=True,
        )
        return result.stdout if result.returncode == 0 else ""

    def is_session_alive(self, session_name: str) -> bool:
        result = subprocess.run(
            self._cmd("has-session", "-t", session_name),
            capture_output=True,
        )
        return result.returncode == 0


def _shell_quote(s: str) -> str:
    return "'" + s.replace("'", "'\\''") + "'"

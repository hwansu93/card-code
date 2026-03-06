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
        result = subprocess.run(
            self._cmd("list-sessions"),
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            return []
        sessions = []
        for line in result.stdout.strip().splitlines():
            name = line.split(":")[0].strip()
            if name.startswith(self.prefix):
                sessions.append({"name": name, "raw": line})
        return sessions

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
                "capture-pane", "-t", session_name, "-p", "-S", f"-{lines}"
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

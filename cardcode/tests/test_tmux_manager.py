import pytest
from unittest.mock import patch, MagicMock

from cardcode.tmux_manager import TmuxManager


@pytest.fixture
def tmux():
    return TmuxManager()


def test_session_name_format(tmux):
    name = tmux.make_session_name("my-project")
    assert name.startswith("cc-my-project-")


@patch("cardcode.tmux_manager.subprocess.run")
def test_list_sessions_finds_claude_panes(mock_run, tmux):
    mock_run.return_value = MagicMock(
        returncode=0,
        stdout="cc-proj-abc123 claude\nbonsai_forge claude\nother-session bash\n",
    )
    sessions = tmux.list_sessions()
    names = [s["name"] for s in sessions]
    assert len(sessions) == 2
    assert "cc-proj-abc123" in names
    assert "bonsai_forge" in names
    assert "other-session" not in names


@patch("cardcode.tmux_manager.subprocess.run")
def test_list_sessions_empty_when_no_server(mock_run, tmux):
    mock_run.return_value = MagicMock(returncode=1, stdout="", stderr="no server running")
    sessions = tmux.list_sessions()
    assert sessions == []


@patch("cardcode.tmux_manager.subprocess.run")
def test_list_sessions_no_claude_sessions(mock_run, tmux):
    mock_run.return_value = MagicMock(
        returncode=0,
        stdout="mysession bash\nother vim\n",
    )
    sessions = tmux.list_sessions()
    assert sessions == []


@patch("cardcode.tmux_manager.subprocess.run")
def test_spawn_session(mock_run, tmux):
    mock_run.return_value = MagicMock(returncode=0)
    name = tmux.spawn_session(
        project_path="/home/user/projects/myapp",
        project_name="myapp",
        initial_prompt="Fix the bug",
    )
    assert name.startswith("cc-myapp-")
    assert mock_run.called


@patch("cardcode.tmux_manager.subprocess.run")
def test_send_keys(mock_run, tmux):
    mock_run.return_value = MagicMock(returncode=0)
    tmux.send_keys("cc-proj-abc", "hello world")
    mock_run.assert_called()
    call_args = mock_run.call_args[0][0]
    assert "send-keys" in call_args


@patch("cardcode.tmux_manager.subprocess.run")
def test_kill_session(mock_run, tmux):
    mock_run.return_value = MagicMock(returncode=0)
    tmux.kill_session("cc-proj-abc")
    call_args = mock_run.call_args[0][0]
    assert "kill-session" in call_args

from unittest.mock import patch, MagicMock

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

from cardcode.app import create_app
from cardcode.database import init_db


@pytest.fixture
def app(tmp_path):
    return create_app(overrides={"data_dir": str(tmp_path / "data")})


@pytest_asyncio.fixture
async def client(app):
    await init_db(app.state.config.db_path)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


# --- Archive endpoint ---


@pytest.mark.asyncio
async def test_list_archived_empty(client):
    resp = await client.get("/api/cards/archived")
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_list_archived_returns_only_archived_cards(client):
    # Create the archive column first
    await client.post("/api/columns", json={"name": "archive"})

    await client.post("/api/cards", json={"title": "Active card"})
    c2 = await client.post("/api/cards", json={"title": "Archived card"})
    card_id = c2.json()["id"]

    # Move card to archive column
    await client.patch(
        f"/api/cards/{card_id}/move",
        json={"column_name": "archive", "position": 1.0},
    )

    resp = await client.get("/api/cards/archived")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["title"] == "Archived card"
    assert data[0]["column_name"] == "archive"


@pytest.mark.asyncio
async def test_list_archived_multiple_cards(client):
    # Create the archive column first
    await client.post("/api/columns", json={"name": "archive"})

    for i in range(3):
        c = await client.post("/api/cards", json={"title": f"Card {i}"})
        await client.patch(
            f"/api/cards/{c.json()['id']}/move",
            json={"column_name": "archive", "position": float(i)},
        )

    resp = await client.get("/api/cards/archived")
    assert resp.status_code == 200
    assert len(resp.json()) == 3


# --- Settings endpoints ---


@pytest.mark.asyncio
async def test_get_settings(client):
    resp = await client.get("/api/settings")
    assert resp.status_code == 200
    data = resp.json()
    assert "claude_dir" in data
    assert "projects_dir" in data
    assert "data_dir" in data
    assert "port" in data
    assert "host" in data
    assert "base_path" in data


@pytest.mark.asyncio
async def test_get_settings_values(client):
    resp = await client.get("/api/settings")
    data = resp.json()
    assert data["port"] == 8420
    assert isinstance(data["host"], str)


@pytest.mark.asyncio
async def test_save_settings(client, app):
    resp = await client.post("/api/settings", json={
        "claude_dir": "/tmp/claude",
        "projects_dir": "/tmp/projects",
        "port": "9000",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "saved"
    assert "path" in data

    # Verify the file was written
    from pathlib import Path
    config_path = Path(data["path"])
    assert config_path.exists()
    content = config_path.read_text()
    assert 'claude_dir = "/tmp/claude"' in content
    assert 'projects_dir = "/tmp/projects"' in content
    assert "port = 9000" in content


@pytest.mark.asyncio
async def test_save_settings_empty_body(client):
    resp = await client.post("/api/settings", json={})
    assert resp.status_code == 200
    assert resp.json()["status"] == "saved"


@pytest.mark.asyncio
async def test_save_settings_ignores_empty_values(client):
    resp = await client.post("/api/settings", json={
        "claude_dir": "",
        "port": "8420",
    })
    assert resp.status_code == 200
    from pathlib import Path
    content = Path(resp.json()["path"]).read_text()
    assert "claude_dir" not in content
    assert "port = 8420" in content


# --- Integrations endpoint ---


@pytest.mark.asyncio
async def test_check_integrations(client):
    resp = await client.get("/api/settings/integrations")
    assert resp.status_code == 200
    data = resp.json()
    assert "tmux" in data
    assert "claude" in data
    assert "git" in data
    assert all(isinstance(v, bool) for v in data.values())


@pytest.mark.asyncio
@patch("shutil.which")
async def test_check_integrations_all_missing(mock_which, client):
    mock_which.return_value = None
    resp = await client.get("/api/settings/integrations")
    assert resp.status_code == 200
    data = resp.json()
    assert data["tmux"] is False
    assert data["claude"] is False
    assert data["git"] is False


@pytest.mark.asyncio
@patch("shutil.which")
async def test_check_integrations_all_present(mock_which, client):
    mock_which.return_value = "/usr/bin/tool"
    resp = await client.get("/api/settings/integrations")
    data = resp.json()
    assert data["tmux"] is True
    assert data["claude"] is True
    assert data["git"] is True


# --- Terminal output endpoint ---


@pytest.mark.asyncio
async def test_terminal_output_no_session(client):
    create = await client.post("/api/cards", json={"title": "No session"})
    card_id = create.json()["id"]

    resp = await client.get(f"/api/cards/{card_id}/terminal")
    assert resp.status_code == 200
    data = resp.json()
    assert data["output"] == ""
    assert data["session"] is None
    assert data["alive"] is False


@pytest.mark.asyncio
async def test_terminal_output_nonexistent_card(client):
    resp = await client.get("/api/cards/nonexistent/terminal")
    assert resp.status_code == 404


@pytest.mark.asyncio
@patch("cardcode.routes.TmuxManager")
async def test_terminal_output_alive_session(mock_tmux_cls, client):
    mock_tmux = MagicMock()
    mock_tmux.spawn_session.return_value = "cc-proj-abc"
    mock_tmux.is_session_alive.return_value = True
    mock_tmux.capture_pane.return_value = "$ echo hello\nhello\n$"
    mock_tmux_cls.return_value = mock_tmux

    create = await client.post(
        "/api/cards",
        json={"title": "Task", "project_path": "/tmp/proj"},
    )
    card_id = create.json()["id"]
    await client.post(f"/api/cards/{card_id}/spawn")

    resp = await client.get(f"/api/cards/{card_id}/terminal")
    assert resp.status_code == 200
    data = resp.json()
    assert data["session"] == "cc-proj-abc"
    assert data["alive"] is True
    assert "hello" in data["output"]
    mock_tmux.capture_pane.assert_called_once_with("cc-proj-abc", lines=100)


@pytest.mark.asyncio
@patch("cardcode.routes.TmuxManager")
async def test_terminal_output_dead_session(mock_tmux_cls, client):
    mock_tmux = MagicMock()
    mock_tmux.spawn_session.return_value = "cc-proj-abc"
    mock_tmux.is_session_alive.return_value = False
    mock_tmux_cls.return_value = mock_tmux

    create = await client.post(
        "/api/cards",
        json={"title": "Task", "project_path": "/tmp/proj"},
    )
    card_id = create.json()["id"]
    await client.post(f"/api/cards/{card_id}/spawn")

    resp = await client.get(f"/api/cards/{card_id}/terminal")
    assert resp.status_code == 200
    data = resp.json()
    assert data["session"] == "cc-proj-abc"
    assert data["alive"] is False
    assert data["output"] == ""
    mock_tmux.capture_pane.assert_not_called()

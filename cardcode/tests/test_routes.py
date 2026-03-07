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


@pytest.mark.asyncio
async def test_create_card(client):
    resp = await client.post("/api/cards", json={"title": "Fix login bug"})
    assert resp.status_code == 201
    data = resp.json()
    assert data["title"] == "Fix login bug"
    assert data["column_name"] == "backlog"
    assert data["id"]  # has KSUID


@pytest.mark.asyncio
async def test_list_cards(client):
    await client.post("/api/cards", json={"title": "Card 1"})
    await client.post("/api/cards", json={"title": "Card 2"})
    resp = await client.get("/api/cards")
    assert resp.status_code == 200
    assert len(resp.json()) == 2


@pytest.mark.asyncio
async def test_list_cards_filter_by_project(client):
    await client.post("/api/cards", json={"title": "A", "project": "foo"})
    await client.post("/api/cards", json={"title": "B", "project": "bar"})
    resp = await client.get("/api/cards?project=foo")
    data = resp.json()
    assert len(data) == 1
    assert data[0]["project"] == "foo"


@pytest.mark.asyncio
async def test_update_card(client):
    create = await client.post("/api/cards", json={"title": "Old"})
    card_id = create.json()["id"]
    resp = await client.patch(f"/api/cards/{card_id}", json={"title": "New"})
    assert resp.status_code == 200
    assert resp.json()["title"] == "New"


@pytest.mark.asyncio
async def test_move_card(client):
    create = await client.post("/api/cards", json={"title": "Moveable"})
    card_id = create.json()["id"]
    resp = await client.patch(
        f"/api/cards/{card_id}/move",
        json={"column_name": "active", "position": 1.5},
    )
    assert resp.status_code == 200
    assert resp.json()["column_name"] == "active"
    assert resp.json()["position"] == 1.5


@pytest.mark.asyncio
async def test_delete_card(client):
    create = await client.post("/api/cards", json={"title": "Deleteme"})
    card_id = create.json()["id"]
    resp = await client.delete(f"/api/cards/{card_id}")
    assert resp.status_code == 204
    resp = await client.get("/api/cards")
    assert len(resp.json()) == 0


@pytest.mark.asyncio
async def test_get_nonexistent_card_returns_404(client):
    resp = await client.patch("/api/cards/nonexistent", json={"title": "X"})
    assert resp.status_code == 404


@pytest.mark.asyncio
@patch("cardcode.routes.TmuxManager")
async def test_spawn_session(mock_tmux_cls, client):
    mock_tmux = MagicMock()
    mock_tmux.spawn_session.return_value = "cc-myapp-abc123"
    mock_tmux_cls.return_value = mock_tmux

    create = await client.post(
        "/api/cards",
        json={"title": "Task", "project": "myapp", "project_path": "/tmp/myapp"},
    )
    card_id = create.json()["id"]

    resp = await client.post(f"/api/cards/{card_id}/spawn")
    assert resp.status_code == 200
    data = resp.json()
    assert data["tmux_session"] == "cc-myapp-abc123"
    assert data["column_name"] == "active"


@pytest.mark.asyncio
@patch("cardcode.routes.TmuxManager")
async def test_send_prompt(mock_tmux_cls, client):
    mock_tmux = MagicMock()
    mock_tmux.spawn_session.return_value = "cc-proj-abc"
    mock_tmux_cls.return_value = mock_tmux

    create = await client.post(
        "/api/cards",
        json={"title": "Task", "project_path": "/tmp/proj"},
    )
    card_id = create.json()["id"]
    await client.post(f"/api/cards/{card_id}/spawn")

    resp = await client.post(
        f"/api/cards/{card_id}/prompt",
        json={"text": "Fix the tests"},
    )
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_queue_prompt(client):
    create = await client.post("/api/cards", json={"title": "Task"})
    card_id = create.json()["id"]

    resp = await client.post(
        f"/api/cards/{card_id}/queue-prompt",
        json={"text": "Run the linter"},
    )
    assert resp.status_code == 201
    assert resp.json()["prompt_text"] == "Run the linter"
    assert resp.json()["status"] == "pending"


@pytest.mark.asyncio
async def test_list_columns_returns_defaults(client):
    resp = await client.get("/api/columns")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 5
    names = [c["name"] for c in data]
    assert names == ["backlog", "queue", "active", "review", "done"]


@pytest.mark.asyncio
async def test_create_column(client):
    resp = await client.post("/api/columns", json={"name": "testing"})
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "testing"
    assert data["position"] == 6.0
    assert data["id"]

    # Verify it appears in the list
    resp = await client.get("/api/columns")
    assert len(resp.json()) == 6


@pytest.mark.asyncio
async def test_create_column_duplicate_name(client):
    resp = await client.post("/api/columns", json={"name": "backlog"})
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_rename_column(client):
    # Get existing columns to find an ID
    resp = await client.get("/api/columns")
    col = resp.json()[0]

    resp = await client.patch(f"/api/columns/{col['id']}", json={"name": "renamed"})
    assert resp.status_code == 200
    assert resp.json()["name"] == "renamed"


@pytest.mark.asyncio
async def test_patch_column_position(client):
    resp = await client.get("/api/columns")
    col = resp.json()[0]

    resp = await client.patch(f"/api/columns/{col['id']}", json={"position": 99.0})
    assert resp.status_code == 200
    assert resp.json()["position"] == 99.0


@pytest.mark.asyncio
async def test_patch_nonexistent_column_returns_404(client):
    resp = await client.patch("/api/columns/nonexistent", json={"name": "x"})
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_patch_column_duplicate_name_returns_409(client):
    resp = await client.get("/api/columns")
    columns = resp.json()
    # Try to rename the second column to the first column's name
    resp = await client.patch(
        f"/api/columns/{columns[1]['id']}", json={"name": columns[0]["name"]}
    )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_delete_column_moves_cards(client):
    # Get columns
    resp = await client.get("/api/columns")
    columns = resp.json()
    # "review" is at index 3
    review_col = next(c for c in columns if c["name"] == "review")

    # Create a card in the review column
    card_resp = await client.post(
        "/api/cards", json={"title": "Review Card", "column_name": "review"}
    )
    card_id = card_resp.json()["id"]

    # Delete the review column
    resp = await client.delete(f"/api/columns/{review_col['id']}")
    assert resp.status_code == 204

    # Verify column count decreased
    resp = await client.get("/api/columns")
    assert len(resp.json()) == 4

    # Verify card moved to first column (backlog)
    resp = await client.get(f"/api/cards")
    cards = resp.json()
    card = next(c for c in cards if c["id"] == card_id)
    assert card["column_name"] == "backlog"


@pytest.mark.asyncio
async def test_delete_last_column_returns_400(client):
    # Delete all columns except one
    resp = await client.get("/api/columns")
    columns = resp.json()
    for col in columns[1:]:
        resp = await client.delete(f"/api/columns/{col['id']}")
        assert resp.status_code == 204

    # Try to delete the last one
    resp = await client.get("/api/columns")
    assert len(resp.json()) == 1
    last_col = resp.json()[0]
    resp = await client.delete(f"/api/columns/{last_col['id']}")
    assert resp.status_code == 400


@pytest.mark.asyncio
@patch("cardcode.routes.TmuxManager")
async def test_stop_session(mock_tmux_cls, client):
    mock_tmux = MagicMock()
    mock_tmux.spawn_session.return_value = "cc-proj-abc"
    mock_tmux_cls.return_value = mock_tmux

    create = await client.post(
        "/api/cards",
        json={"title": "Task", "project_path": "/tmp/proj"},
    )
    card_id = create.json()["id"]
    await client.post(f"/api/cards/{card_id}/spawn")

    resp = await client.post(f"/api/cards/{card_id}/stop")
    assert resp.status_code == 200
    assert resp.json()["session_status"] == "dead"


@pytest.mark.asyncio
@patch("cardcode.routes.TmuxManager")
async def test_terminal_output_preserves_ansi(mock_tmux_cls, client):
    mock_tmux = MagicMock()
    mock_tmux.spawn_session.return_value = "cc-proj-abc"
    mock_tmux.is_session_alive.return_value = True
    ansi_output = "\x1b[32mgreen text\x1b[0m \x1b[1;31mbold red\x1b[0m"
    mock_tmux.capture_pane.return_value = ansi_output
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
    assert data["alive"] is True
    assert "\x1b[32m" in data["output"]
    assert "\x1b[1;31m" in data["output"]
    assert data["output"] == ansi_output

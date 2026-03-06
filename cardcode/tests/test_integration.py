import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

from cardcode.app import create_app
from cardcode.database import init_db


@pytest.fixture
def app(tmp_path):
    projects_dir = tmp_path / "projects"
    projects_dir.mkdir()
    (projects_dir / "testapp" / ".git").mkdir(parents=True)
    return create_app(overrides={
        "data_dir": str(tmp_path / "data"),
        "projects_dir": str(projects_dir),
    })


@pytest_asyncio.fixture
async def client(app):
    await init_db(app.state.config.db_path)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest.mark.asyncio
async def test_full_card_lifecycle(client):
    """Test creating, moving, updating, and deleting a card."""
    # Create
    resp = await client.post("/api/cards", json={
        "title": "Implement auth",
        "project": "testapp",
        "initial_prompt": "Add JWT auth to the API",
    })
    assert resp.status_code == 201
    card = resp.json()
    card_id = card["id"]
    assert card["column_name"] == "backlog"

    # Move to queue
    resp = await client.patch(f"/api/cards/{card_id}/move", json={
        "column_name": "queue",
        "position": 1.0,
    })
    assert resp.status_code == 200
    assert resp.json()["column_name"] == "queue"

    # Update description
    resp = await client.patch(f"/api/cards/{card_id}", json={
        "description": "JWT auth with refresh tokens",
    })
    assert resp.status_code == 200
    assert resp.json()["description"] == "JWT auth with refresh tokens"

    # Queue a prompt
    resp = await client.post(f"/api/cards/{card_id}/queue-prompt", json={
        "text": "Also add rate limiting",
    })
    assert resp.status_code == 201

    # Move to done
    resp = await client.patch(f"/api/cards/{card_id}/move", json={
        "column_name": "done",
        "position": 1.0,
    })
    assert resp.json()["column_name"] == "done"

    # Delete
    resp = await client.delete(f"/api/cards/{card_id}")
    assert resp.status_code == 204


@pytest.mark.asyncio
async def test_projects_and_config(client):
    resp = await client.get("/api/projects")
    assert resp.status_code == 200
    assert any(p["name"] == "testapp" for p in resp.json())

    resp = await client.get("/api/config")
    assert resp.status_code == 200
    assert resp.json()["port"] == 8420

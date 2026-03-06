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

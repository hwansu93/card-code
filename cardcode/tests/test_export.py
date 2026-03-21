import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

from cardcode.app import create_app
from cardcode.database import init_db


@pytest.fixture
def app(tmp_path):
    projects_dir = tmp_path / "projects"
    projects_dir.mkdir()
    (projects_dir / "myapp" / ".git").mkdir(parents=True)
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
async def test_list_projects(client):
    resp = await client.get("/api/projects")
    assert resp.status_code == 200
    names = [p["name"] for p in resp.json()]
    assert "myapp" in names


@pytest.mark.asyncio
async def test_get_config(client):
    resp = await client.get("/api/config")
    assert resp.status_code == 200
    assert "port" in resp.json()


@pytest.mark.asyncio
async def test_export_import_roundtrip(client):
    await client.post("/api/cards", json={"title": "Card A"})
    await client.post("/api/cards", json={"title": "Card B"})
    resp = await client.post("/api/export")
    assert resp.status_code == 200
    export_data = resp.json()
    assert len(export_data["cards"]) == 2

    cards = (await client.get("/api/cards")).json()
    for card in cards:
        await client.delete(f"/api/cards/{card['id']}")
    assert len((await client.get("/api/cards")).json()) == 0

    resp = await client.post("/api/import", json=export_data)
    assert resp.status_code == 200
    assert resp.json()["imported"] == 2
    assert len((await client.get("/api/cards")).json()) == 2


@pytest.mark.asyncio
async def test_export_includes_columns(client):
    await client.post("/api/columns", json={"name": "In Progress"})
    await client.post("/api/columns", json={"name": "Done"})
    resp = await client.post("/api/export")
    assert resp.status_code == 200
    export_data = resp.json()
    assert "columns" in export_data
    names = [c["name"] for c in export_data["columns"]]
    assert "In Progress" in names
    assert "Done" in names


@pytest.mark.asyncio
async def test_import_creates_new_columns(client):
    data = {
        "cards": [],
        "columns": [
            {"id": "col_1", "name": "Backlog", "position": 1.0},
            {"id": "col_2", "name": "Review", "position": 2.0},
        ],
    }
    resp = await client.post("/api/import", json=data)
    assert resp.status_code == 200
    cols = (await client.get("/api/columns")).json()
    names = [c["name"] for c in cols]
    assert "Backlog" in names
    assert "Review" in names


@pytest.mark.asyncio
async def test_import_skips_existing_columns(client):
    await client.post("/api/columns", json={"name": "Todo"})
    cols_before = (await client.get("/api/columns")).json()
    todo_count_before = sum(1 for c in cols_before if c["name"] == "Todo")

    data = {
        "cards": [],
        "columns": [
            {"id": "col_dup", "name": "Todo", "position": 5.0},
        ],
    }
    await client.post("/api/import", json=data)
    cols_after = (await client.get("/api/columns")).json()
    todo_count_after = sum(1 for c in cols_after if c["name"] == "Todo")
    assert todo_count_after == todo_count_before


@pytest.mark.asyncio
async def test_import_without_columns_key(client):
    data = {"cards": []}
    resp = await client.post("/api/import", json=data)
    assert resp.status_code == 200
    assert resp.json()["imported"] == 0

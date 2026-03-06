import pytest
from httpx import AsyncClient, ASGITransport

from cardcode.app import create_app


@pytest.fixture
def app(tmp_path):
    return create_app(overrides={"data_dir": str(tmp_path / "data")})


@pytest.mark.asyncio
async def test_health_endpoint(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_static_index(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/")
    # Should serve index.html or return 404 if not yet created
    assert resp.status_code in (200, 404)

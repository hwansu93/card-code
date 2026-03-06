import pytest
from unittest.mock import AsyncMock

from cardcode.websocket import ConnectionManager


@pytest.mark.asyncio
async def test_connect_and_disconnect():
    manager = ConnectionManager()
    ws = AsyncMock()
    await manager.connect(ws)
    assert ws in manager.active_connections
    manager.disconnect(ws)
    assert ws not in manager.active_connections


@pytest.mark.asyncio
async def test_broadcast():
    manager = ConnectionManager()
    ws1 = AsyncMock()
    ws2 = AsyncMock()
    await manager.connect(ws1)
    await manager.connect(ws2)
    await manager.broadcast({"type": "test", "data": "hello"})
    ws1.send_json.assert_called_once_with({"type": "test", "data": "hello"})
    ws2.send_json.assert_called_once_with({"type": "test", "data": "hello"})


@pytest.mark.asyncio
async def test_broadcast_removes_dead_connections():
    manager = ConnectionManager()
    ws_alive = AsyncMock()
    ws_dead = AsyncMock()
    ws_dead.send_json.side_effect = Exception("connection closed")
    await manager.connect(ws_alive)
    await manager.connect(ws_dead)
    await manager.broadcast({"type": "test"})
    assert ws_dead not in manager.active_connections
    assert ws_alive in manager.active_connections

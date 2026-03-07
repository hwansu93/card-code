import pytest
import pytest_asyncio
import aiosqlite

from cardcode.database import (
    init_db,
    get_db,
    get_columns,
    get_column_by_name,
    create_column,
    update_column,
    delete_column,
)


@pytest.fixture
def db_path(tmp_path):
    return tmp_path / "test.db"


@pytest.mark.asyncio
async def test_init_db_creates_tables(db_path):
    await init_db(db_path)
    async with aiosqlite.connect(db_path) as db:
        cursor = await db.execute(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        )
        tables = [row[0] for row in await cursor.fetchall()]
    assert "cards" in tables
    assert "queued_prompts" in tables
    assert "projects" in tables


@pytest.mark.asyncio
async def test_init_db_is_idempotent(db_path):
    await init_db(db_path)
    await init_db(db_path)  # should not raise
    async with aiosqlite.connect(db_path) as db:
        cursor = await db.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='cards'"
        )
        assert await cursor.fetchone() is not None


@pytest.mark.asyncio
async def test_cards_table_columns(db_path):
    await init_db(db_path)
    async with aiosqlite.connect(db_path) as db:
        cursor = await db.execute("PRAGMA table_info(cards)")
        columns = {row[1] for row in await cursor.fetchall()}
    expected = {
        "id", "title", "description", "project", "project_path",
        "column_name", "position", "provider", "session_id",
        "tmux_session", "jsonl_path", "session_status",
        "cost_usd", "input_tokens", "output_tokens", "context_pct",
        "initial_prompt", "handoff_notes", "manual_overrides",
        "is_launching", "created_at", "started_at", "completed_at",
        "updated_at",
    }
    assert expected.issubset(columns)


@pytest_asyncio.fixture
async def db_conn(db_path):
    """Initialized DB with a connection using row factory."""
    await init_db(db_path)
    db = await get_db(db_path)
    yield db
    await db.close()


@pytest.mark.asyncio
async def test_init_db_creates_columns_table(db_path):
    await init_db(db_path)
    async with aiosqlite.connect(db_path) as db:
        cursor = await db.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='columns'"
        )
        assert await cursor.fetchone() is not None


@pytest.mark.asyncio
async def test_init_db_seeds_default_columns(db_path):
    await init_db(db_path)
    async with aiosqlite.connect(db_path) as db:
        cursor = await db.execute("SELECT COUNT(*) FROM columns")
        row = await cursor.fetchone()
        assert row is not None
        count = row[0]
    assert count == 5


@pytest.mark.asyncio
async def test_init_db_seeds_are_idempotent(db_path):
    await init_db(db_path)
    await init_db(db_path)
    async with aiosqlite.connect(db_path) as db:
        cursor = await db.execute("SELECT COUNT(*) FROM columns")
        row = await cursor.fetchone()
        assert row is not None
        count = row[0]
    assert count == 5


@pytest.mark.asyncio
async def test_get_columns_ordered_by_position(db_conn):
    cols = await get_columns(db_conn)
    assert len(cols) == 5
    names = [c["name"] for c in cols]
    assert names == ["backlog", "queue", "active", "review", "done"]


@pytest.mark.asyncio
async def test_get_column_by_name(db_conn):
    col = await get_column_by_name(db_conn, "active")
    assert col is not None
    assert col["name"] == "active"
    assert col["position"] == 3.0


@pytest.mark.asyncio
async def test_get_column_by_name_not_found(db_conn):
    col = await get_column_by_name(db_conn, "nonexistent")
    assert col is None


@pytest.mark.asyncio
async def test_create_column(db_conn):
    from cardcode.models import generate_ksuid

    col_id = generate_ksuid()
    await create_column(db_conn, col_id, "testing", 6.0)
    col = await get_column_by_name(db_conn, "testing")
    assert col is not None
    assert col["id"] == col_id
    assert col["position"] == 6.0


@pytest.mark.asyncio
async def test_create_column_duplicate_name_raises(db_conn):
    from cardcode.models import generate_ksuid

    with pytest.raises(aiosqlite.IntegrityError):
        await create_column(db_conn, generate_ksuid(), "backlog", 10.0)


@pytest.mark.asyncio
async def test_update_column_rename(db_conn):
    col = await get_column_by_name(db_conn, "queue")
    assert col is not None
    await update_column(db_conn, col["id"], name="up-next")
    updated = await get_column_by_name(db_conn, "up-next")
    assert updated is not None
    assert updated["id"] == col["id"]


@pytest.mark.asyncio
async def test_update_column_position(db_conn):
    col = await get_column_by_name(db_conn, "review")
    assert col is not None
    await update_column(db_conn, col["id"], position=4.5)
    cols = await get_columns(db_conn)
    positions = {c["name"]: c["position"] for c in cols}
    assert positions["review"] == 4.5


@pytest.mark.asyncio
async def test_delete_column(db_conn):
    col = await get_column_by_name(db_conn, "done")
    assert col is not None
    await delete_column(db_conn, col["id"])
    cols = await get_columns(db_conn)
    names = [c["name"] for c in cols]
    assert "done" not in names
    assert len(cols) == 4

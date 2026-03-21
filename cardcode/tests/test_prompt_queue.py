import pytest
import pytest_asyncio
from cardcode.database import init_db, get_db
from cardcode.models import generate_ksuid
from cardcode.prompt_queue import get_next_pending, mark_sent, mark_failed


@pytest_asyncio.fixture
async def db(tmp_path):
    db_path = tmp_path / "test.db"
    await init_db(db_path)
    conn = await get_db(db_path)
    yield conn
    await conn.close()


@pytest_asyncio.fixture
async def card_id(db):
    cid = generate_ksuid()
    await db.execute(
        "INSERT INTO cards (id, title, column_name, position, created_at, updated_at) VALUES (?, 'Test', 'active', 0, '2026-01-01', '2026-01-01')",
        (cid,),
    )
    await db.commit()
    return cid


@pytest.mark.asyncio
async def test_get_next_pending_returns_oldest(db, card_id):
    for i, text in enumerate(["first", "second", "third"]):
        await db.execute(
            "INSERT INTO queued_prompts (id, card_id, prompt_text, status, created_at) VALUES (?, ?, ?, 'pending', ?)",
            (generate_ksuid(), card_id, text, f"2026-01-01T00:00:0{i}Z"),
        )
    await db.commit()
    prompt = await get_next_pending(db, card_id)
    assert prompt is not None
    assert prompt["prompt_text"] == "first"


@pytest.mark.asyncio
async def test_get_next_pending_returns_none_when_empty(db, card_id):
    prompt = await get_next_pending(db, card_id)
    assert prompt is None


@pytest.mark.asyncio
async def test_mark_sent(db, card_id):
    pid = generate_ksuid()
    await db.execute(
        "INSERT INTO queued_prompts (id, card_id, prompt_text, status, created_at) VALUES (?, ?, 'do stuff', 'pending', '2026-01-01')",
        (pid, card_id),
    )
    await db.commit()
    await mark_sent(db, pid)
    cursor = await db.execute("SELECT status FROM queued_prompts WHERE id = ?", (pid,))
    row = await cursor.fetchone()
    assert row[0] == "sent"


@pytest.mark.asyncio
async def test_mark_failed(db, card_id):
    pid = generate_ksuid()
    await db.execute(
        "INSERT INTO queued_prompts (id, card_id, prompt_text, status, created_at) VALUES (?, ?, 'do stuff', 'pending', '2026-01-01')",
        (pid, card_id),
    )
    await db.commit()
    await mark_failed(db, pid)
    cursor = await db.execute("SELECT status FROM queued_prompts WHERE id = ?", (pid,))
    row = await cursor.fetchone()
    assert row[0] == "failed"

from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from cardcode.config import CardCodeConfig, load_config
from cardcode.database import init_db
from cardcode.websocket import ConnectionManager


@asynccontextmanager
async def lifespan(app: FastAPI):
    config: CardCodeConfig = app.state.config
    await init_db(config.db_path)
    yield


def create_app(overrides: dict | None = None) -> FastAPI:
    config = load_config(overrides=overrides)
    app = FastAPI(title="CardCode", version="0.1.0", lifespan=lifespan)
    app.state.config = config
    app.state.ws_manager = ConnectionManager()

    from cardcode.routes import router

    app.include_router(router)

    @app.get("/health")
    async def health():
        return {"status": "ok"}

    # Mount static files if directory exists
    static_dir = Path(__file__).parent.parent / "static"
    if static_dir.is_dir():
        app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")

    return app


# Default app instance for uvicorn
app = create_app()

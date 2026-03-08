from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

from cardcode.config import CardCodeConfig, load_config
from cardcode.database import init_db
from cardcode.session_watcher import watcher_loop
from cardcode.websocket import ConnectionManager


@asynccontextmanager
async def lifespan(app: FastAPI):
    config: CardCodeConfig = app.state.config
    await init_db(config.db_path)
    watcher_task = asyncio.create_task(watcher_loop(config, app.state.ws_manager))
    yield
    watcher_task.cancel()
    try:
        await watcher_task
    except asyncio.CancelledError:
        pass


def create_app(overrides: dict | None = None) -> FastAPI:
    config = load_config(overrides=overrides)
    app = FastAPI(title="CardCode", version="0.1.0", lifespan=lifespan)
    app.state.config = config
    app.state.ws_manager = ConnectionManager()

    bp = config.base_path  # e.g. "/cardcode" or ""

    from cardcode.routes import router

    app.include_router(router, prefix=bp)

    @app.get(f"{bp}/health")
    async def health():
        return {"status": "ok"}

    @app.websocket(f"{bp}/ws")
    async def websocket_endpoint(websocket: WebSocket):
        manager = app.state.ws_manager
        await manager.connect(websocket)
        try:
            while True:
                await websocket.receive_text()
        except WebSocketDisconnect:
            manager.disconnect(websocket)

    # Serve static assets with base path support
    static_dir = Path(__file__).parent.parent / "static"
    if static_dir.is_dir():
        css_dir = static_dir / "css"
        js_dir = static_dir / "js"
        if css_dir.is_dir():
            app.mount(f"{bp}/css", StaticFiles(directory=css_dir), name="css")
        if js_dir.is_dir():
            app.mount(f"{bp}/js", StaticFiles(directory=js_dir), name="js")
        img_dir = static_dir / "img"
        if img_dir.is_dir():
            app.mount(f"{bp}/img", StaticFiles(directory=img_dir), name="img")

        index_html = (static_dir / "index.html").read_text()

        @app.get(f"{bp}/", response_class=HTMLResponse)
        async def index():
            html = index_html.replace(
                '<meta name="base-path" content="">',
                f'<meta name="base-path" content="{bp}">',
            ).replace(
                'href="/css/', f'href="{bp}/css/',
            ).replace(
                'src="/js/', f'src="{bp}/js/',
            ).replace(
                'href="/img/', f'href="{bp}/img/',
            ).replace(
                'src="/img/', f'src="{bp}/img/',
            )
            return html

    return app


# Default app instance for uvicorn
app = create_app()

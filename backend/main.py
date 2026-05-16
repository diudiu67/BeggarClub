import asyncio
import os
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from database import init_db
from player import player_manager
from config import settings
from routes import search, playlists, player, guilds
import bot_runner

FRONTEND_DIST = Path(__file__).parent.parent / "frontend" / "dist"


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    # Store FastAPI's event loop so the bot thread can post broadcasts back to it
    bot_runner.set_fastapi_loop(asyncio.get_event_loop())
    raw_token = os.environ.get("DISCORD_TOKEN", "NOT_IN_ENV")
    print(f"[Debug] os.environ DISCORD_TOKEN length={len(raw_token)} first8={raw_token[:8]!r}")
    token = settings.DISCORD_TOKEN
    print(f"[Config] pydantic DISCORD_TOKEN length={len(token)} dots={token.count('.')} first8={token[:8]!r}")
    # Launch bot in its own thread + event loop (prevents voice timeout issues)
    bot_runner.launch(token)
    print("[Server] Started — bot launching in background thread")
    yield


app = FastAPI(title="Discord Music", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(search.router, prefix="/api")
app.include_router(playlists.router, prefix="/api")
app.include_router(player.router, prefix="/api")
app.include_router(guilds.router, prefix="/api")


def _check_secret(secret: str):
    if secret != settings.WEB_SECRET:
        raise HTTPException(status_code=401, detail="Unauthorized")


@app.get("/api/health")
async def health():
    return {"ok": True}


@app.websocket("/ws/{guild_id}")
async def websocket_endpoint(websocket: WebSocket, guild_id: str, secret: str = ""):
    if secret != settings.WEB_SECRET:
        await websocket.close(code=4001)
        return

    await websocket.accept()
    gp = player_manager.get(guild_id)
    gp.add_ws_client(websocket)

    # Send current state immediately on connect
    await websocket.send_json({"event": "state", "data": gp.get_state()})

    try:
        while True:
            await websocket.receive_text()  # keep alive
    except WebSocketDisconnect:
        gp.remove_ws_client(websocket)


# Serve the built React frontend (must come after all API/WS routes)
if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_frontend(full_path: str):
        return FileResponse(FRONTEND_DIST / "index.html")

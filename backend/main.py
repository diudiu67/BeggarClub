import asyncio
import glob
import os
import sys

# Force UTF-8 stdout/stderr so Japanese/Unicode song titles don't crash print()
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from database import init_db
from player import player_manager
from config import settings
from routes import search, playlists, player, guilds, gallery
import bot_runner

FRONTEND_DIST = Path(__file__).parent.parent / "frontend" / "dist"


def _ensure_ffmpeg_on_path():
    """Prepend ffmpeg to PATH so it's always found regardless of how the process was launched."""
    if os.environ.get("PATH") and any(
        os.path.isfile(os.path.join(p, "ffmpeg.exe") if os.name == "nt" else os.path.join(p, "ffmpeg"))
        for p in os.environ["PATH"].split(os.pathsep)
    ):
        return  # already on PATH

    # Search common locations relative to this project
    project_root = Path(__file__).parent.parent
    patterns = [
        str(project_root / "ffmpeg*" / "**" / "ffmpeg.exe"),
        str(project_root / "ffmpeg*" / "ffmpeg.exe"),
        r"C:\ffmpeg\bin\ffmpeg.exe",
        r"C:\Program Files\ffmpeg\bin\ffmpeg.exe",
    ]
    for pattern in patterns:
        for match in glob.glob(pattern, recursive=True):
            bin_dir = str(Path(match).parent)
            os.environ["PATH"] = bin_dir + os.pathsep + os.environ.get("PATH", "")
            print(f"[Server] ffmpeg found and added to PATH: {match}")
            return
    print("[Server] WARNING: ffmpeg not found — audio playback will fail")


_ensure_ffmpeg_on_path()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    # Store FastAPI's event loop so the bot thread can post broadcasts back to it
    bot_runner.set_fastapi_loop(asyncio.get_event_loop())
    token = settings.DISCORD_TOKEN
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
app.include_router(gallery.router, prefix="/api")


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

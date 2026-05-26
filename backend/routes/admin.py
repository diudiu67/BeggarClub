"""
Admin API routes — password-gated via X-Admin-Secret header.
Covers bot status, stream-notification config, and a test-fire endpoint.
"""
import hmac
import platform
import sys
import time
from datetime import datetime

import psutil
from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel

from config import settings
from database import AsyncSessionLocal
from models import Setting
from player import player_manager
from sqlalchemy import select

router = APIRouter(prefix="/api/admin", tags=["admin"])

# ─── Auth ──────────────────────────────────────────────────────────────────────

async def require_admin(x_admin_secret: str = Header(default="")):
    if not settings.ADMIN_SECRET:
        raise HTTPException(status_code=503, detail="Admin access is not configured")
    if not hmac.compare_digest(x_admin_secret, settings.ADMIN_SECRET):
        raise HTTPException(status_code=401, detail="Invalid admin secret")


# ─── Helper: read/write settings ───────────────────────────────────────────────

async def _get_setting(key: str, default: str = "") -> str:
    async with AsyncSessionLocal() as db:
        row = await db.get(Setting, key)
        return row.value if row else default


async def _set_setting(key: str, value: str):
    async with AsyncSessionLocal() as db:
        row = await db.get(Setting, key)
        if row:
            row.value = value
        else:
            db.add(Setting(key=key, value=value))
        await db.commit()


# ─── Routes ────────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    password: str


@router.post("/login")
async def login(body: LoginRequest):
    if not settings.ADMIN_SECRET:
        raise HTTPException(status_code=503, detail="Admin access is not configured")
    if not hmac.compare_digest(body.password, settings.ADMIN_SECRET):
        raise HTTPException(status_code=401, detail="Wrong password")
    return {"ok": True}


@router.get("/status", dependencies=[Depends(require_admin)])
async def get_status():
    import bot_runner
    bot = bot_runner.get_bot()

    uptime_seconds = int(time.time() - bot_runner.get_started_at()) if bot_runner.get_started_at() else 0

    guilds_info = []
    if bot and bot.is_ready():
        for g in bot.guilds:
            gp = player_manager.get(str(g.id))
            vc_name = None
            if bot.voice_clients:
                for vc in bot.voice_clients:
                    if vc.guild.id == g.id and vc.channel:
                        vc_name = vc.channel.name
                        break
            guilds_info.append({
                "id": str(g.id),
                "name": g.name,
                "voice_channel": vc_name,
                "now_playing": gp.current.title if gp.current else None,
            })

    proc = psutil.Process()
    memory_mb = round(proc.memory_info().rss / 1024 / 1024, 1)

    return {
        "uptime_seconds": uptime_seconds,
        "connected_guilds": guilds_info,
        "memory_mb": memory_mb,
        "python_version": f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
        "platform": platform.system(),
        "bot_user": str(bot.user) if bot and bot.is_ready() else None,
    }


@router.get("/notifications/config", dependencies=[Depends(require_admin)])
async def get_notifications_config():
    import bot_runner
    bot = bot_runner.get_bot()

    enabled = (await _get_setting("stream_notifications_enabled", "true")) == "true"

    channel_id = settings.notification_channel_id
    channel_name = None
    if bot and bot.is_ready() and channel_id:
        ch = bot.get_channel(channel_id)
        if ch:
            channel_name = ch.name

    return {
        "stream_notifications_enabled": enabled,
        "notification_channel_id": str(channel_id) if channel_id else None,
        "notification_channel_name": channel_name,
    }


class ToggleRequest(BaseModel):
    enabled: bool


@router.post("/notifications/toggle", dependencies=[Depends(require_admin)])
async def toggle_notifications(body: ToggleRequest):
    await _set_setting("stream_notifications_enabled", "true" if body.enabled else "false")
    return {"ok": True, "stream_notifications_enabled": body.enabled}


@router.get("/channels", dependencies=[Depends(require_admin)])
async def list_admin_channels():
    """Return gallery-configured channels with resolved names (for utility channel dropdowns)."""
    import bot_runner
    b = bot_runner.get_bot()
    result = []
    for cid in settings.gallery_channel_ids:
        ch = b.get_channel(cid) if b else None
        result.append({
            "id": str(cid),
            "name": ch.name if ch else str(cid),
        })
    return result


@router.post("/notifications/test", dependencies=[Depends(require_admin)])
async def test_notification():
    """Fire a fake stream-start notification to verify Discord embed + browser notification."""
    import bot_runner
    from bot import _handle_stream_start_raw
    bot = bot_runner.get_bot()
    if not bot or not bot.is_ready():
        raise HTTPException(status_code=503, detail="Bot is not ready")

    channel_id = settings.notification_channel_id
    if not channel_id:
        raise HTTPException(status_code=400, detail="NOTIFICATION_CHANNEL_ID is not configured")

    notif_channel = bot.get_channel(channel_id)
    if not notif_channel:
        raise HTTPException(status_code=404, detail=f"Channel {channel_id} not found")

    # Use the bot itself as the fake "streamer" so we don't need a real member
    await _handle_stream_start_raw(
        bot.user,
        notif_channel,
        guild=bot.guilds[0] if bot.guilds else None,
        is_test=True,
    )
    return {"ok": True}

"""
Strategy Tab API — public read, admin-gated write.
Posts come from two Discord channels (Strategy/攻略 and Guild War/百業戰).
Two-way: admin can also create posts here which are echoed to Discord.
"""
import json
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Form, HTTPException, UploadFile, File
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db, AsyncSessionLocal
from models import StrategyPost
from routes.admin import require_admin

router = APIRouter(prefix="/api/strategy", tags=["strategy"])

CATEGORY_LABELS = {
    "strategy": "Strategy/攻略",
    "guildwar": "Guild War/百業戰",
}


def _post_to_dict(p: StrategyPost) -> dict:
    return {
        "id": p.id,
        "guild_id": p.guild_id,
        "message_id": p.message_id,
        "category": p.category,
        "category_label": CATEGORY_LABELS.get(p.category, p.category),
        "author_name": p.author_name,
        "author_avatar": p.author_avatar,
        "content": p.content,
        "media": json.loads(p.media) if p.media else [],
        "position": p.position,
        "message_url": p.message_url,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "pinned": bool(p.pinned),
        "source": p.source or "discord",
    }


# ─── Routes ──────────────────────────────────────────────────────────────────

@router.get("/posts")
async def list_strategy_posts(
    guild_id: str = "",
    category: str = "",
    db: AsyncSession = Depends(get_db),
):
    """Public — no auth required."""
    q = select(StrategyPost).order_by(StrategyPost.position, StrategyPost.created_at.desc())
    if guild_id:
        q = q.where(StrategyPost.guild_id == guild_id)
    if category:
        q = q.where(StrategyPost.category == category)
    result = await db.execute(q)
    return [_post_to_dict(p) for p in result.scalars().all()]


@router.post("/posts", dependencies=[Depends(require_admin)])
async def create_strategy_post(
    guild_id: str = Form(...),
    category: str = Form(...),      # "strategy" | "guildwar"
    content: str = Form(default=""),
    files: list[UploadFile] = File(default=[]),
    db: AsyncSession = Depends(get_db),
):
    """Admin-only — create a post that is also dispatched to Discord."""
    if category not in CATEGORY_LABELS:
        raise HTTPException(400, f"category must be one of: {list(CATEGORY_LABELS)}")
    if not content.strip() and not files:
        raise HTTPException(400, "Post must have content or at least one file")

    # Upload media to R2
    media_items = []
    for file in files:
        ct = file.content_type or ""
        if not (ct.startswith("image/") or ct.startswith("video/")):
            continue
        data = await file.read()
        ext = file.filename.rsplit(".", 1)[-1] if file.filename and "." in file.filename else "bin"
        key = f"strategy/{uuid.uuid4().hex}.{ext}"
        from r2 import upload_to_r2
        public_url = await upload_to_r2(key, data, ct)
        media_items.append({
            "public_url": public_url,
            "r2_key": key,
            "media_type": "image" if ct.startswith("image/") else "video",
        })

    # Compute position (append to bottom)
    max_pos_result = await db.execute(
        select(func.max(StrategyPost.position)).where(StrategyPost.guild_id == guild_id)
    )
    max_pos = max_pos_result.scalar() or 0

    # Use a placeholder message_id — updated after Discord post
    temp_id = f"admin-{uuid.uuid4().hex}"

    import bot_runner
    from config import settings
    post = StrategyPost(
        guild_id=guild_id,
        message_id=temp_id,
        category=category,
        author_name="Admin",
        author_avatar="",
        content=content,
        media=json.dumps(media_items),
        position=max_pos + 1,
        message_url="",
        created_at=datetime.now(timezone.utc),
        source="web",
    )
    db.add(post)
    await db.commit()
    await db.refresh(post)

    # Dispatch to Discord via the bot's event loop (discord.py requires its own loop)
    bot_runner.fire_in_bot(_post_to_discord(post.id, content, media_items, category))

    return _post_to_dict(post)


class MoveRequest(BaseModel):
    position: int


@router.patch("/posts/{post_id}/position", dependencies=[Depends(require_admin)])
async def move_post(post_id: int, body: MoveRequest, db: AsyncSession = Depends(get_db)):
    post = await db.get(StrategyPost, post_id)
    if not post:
        raise HTTPException(404, "Post not found")
    post.position = body.position
    await db.commit()
    return _post_to_dict(post)


@router.patch("/posts/{post_id}/pin", dependencies=[Depends(require_admin)])
async def pin_post(post_id: int, db: AsyncSession = Depends(get_db)):
    """Toggle pinned state — pinned posts appear on the strategy homepage."""
    post = await db.get(StrategyPost, post_id)
    if not post:
        raise HTTPException(404, "Post not found")
    post.pinned = not post.pinned
    await db.commit()
    return _post_to_dict(post)


class EditRequest(BaseModel):
    content: str


@router.patch("/posts/{post_id}", dependencies=[Depends(require_admin)])
async def edit_post(post_id: int, body: EditRequest, db: AsyncSession = Depends(get_db)):
    """Admin-only — edit post text and propagate to Discord (bot-authored posts only)."""
    post = await db.get(StrategyPost, post_id)
    if not post:
        raise HTTPException(404, "Post not found")
    post.content = body.content
    await db.commit()
    # Fire Discord edit in bot loop — silently skips for user-authored Discord messages
    import bot_runner
    bot_runner.fire_in_bot(_edit_discord_message(post.message_id, body.content, post.category))
    return _post_to_dict(post)


@router.delete("/posts/{post_id}", dependencies=[Depends(require_admin)])
async def delete_post(post_id: int, db: AsyncSession = Depends(get_db)):
    post = await db.get(StrategyPost, post_id)
    if not post:
        raise HTTPException(404, "Post not found")

    # Delete R2 objects
    media_items = json.loads(post.media) if post.media else []
    for item in media_items:
        try:
            from r2 import delete_from_r2
            await delete_from_r2(item["r2_key"])
        except Exception:
            pass

    await db.delete(post)
    await db.commit()
    return {"ok": True}


# ─── Async helpers ────────────────────────────────────────────────────────────

async def _post_to_discord(post_id: int, content: str, media_items: list, category: str):
    """Post admin-created strategy post to the matching Discord channel and update message_id."""
    from bot import bot
    from config import settings

    channel_id = (
        settings.strategy_channel_id if category == "strategy"
        else settings.guildwar_channel_id
    )
    if not channel_id:
        return

    channel = bot.get_channel(channel_id)
    if not channel:
        print(f"[Strategy] Channel {channel_id} not found")
        return

    try:
        import discord
        files = []
        for item in media_items:
            # Fetch from R2 URL and send as Discord attachment
            import aiohttp
            async with aiohttp.ClientSession() as session:
                async with session.get(item["public_url"]) as resp:
                    data = await resp.read()
            filename = item["r2_key"].split("/")[-1]
            files.append(discord.File(fp=__import__("io").BytesIO(data), filename=filename))

        kwargs = {}
        if content:
            kwargs["content"] = content
        if files:
            kwargs["files"] = files

        if not kwargs:
            return

        msg = await channel.send(**kwargs)

        # Reply with web deep-link so members can navigate to the exact post
        web_url = f"{settings.FRONTEND_URL}?mode=strategy&msg={msg.id}"
        try:
            await msg.reply(
                f"🔗 **View on BeggarClub** → {web_url}",
                mention_author=False,
            )
        except Exception as e:
            print(f"[Strategy] Could not send web-link reply: {e}")

        # Update post with real Discord message ID + URL
        async with AsyncSessionLocal() as db:
            post = await db.get(StrategyPost, post_id)
            if post:
                post.message_id = str(msg.id)
                post.message_url = msg.jump_url
                await db.commit()

    except Exception as e:
        print(f"[Strategy] Failed to post to Discord: {e}")


async def _edit_discord_message(message_id: str, new_content: str, category: str):
    """Edit the Discord message if the bot authored it. Silently skips otherwise."""
    from bot import bot
    from config import settings

    # "admin-{uuid}" placeholder means Discord post is still pending — skip
    try:
        mid = int(message_id)
    except ValueError:
        return

    channel_id = (
        settings.strategy_channel_id if category == "strategy"
        else settings.guildwar_channel_id
    )
    if not channel_id:
        return

    channel = bot.get_channel(channel_id)
    if not channel:
        return

    try:
        msg = await channel.fetch_message(mid)
        # Use zero-width space if content is empty (Discord rejects fully empty edits)
        await msg.edit(content=new_content if new_content else "​")
    except Exception as e:
        print(f"[Strategy] Could not edit Discord message {message_id}: {e}")

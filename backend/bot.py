import asyncio
import glob
import json
import logging
import os
import random
import time
import uuid
from datetime import date, datetime, timedelta, timezone
import discord
import discord.opus
from discord.ext import commands
from player import player_manager, Track
from youtube import get_stream_url, get_recommendations
from config import settings

# ── Bot start timestamp (used by /api/admin/status) ─────────────────────────
_bot_started_at: float = 0.0

def get_bot_started_at() -> float:
    return _bot_started_at

# ── Voice event log (survives hidden-window runs) ────────────────────────────
_vlog = logging.getLogger("voice")
_vlog.setLevel(logging.DEBUG)
_vfh = logging.FileHandler(
    "D:/Test/discord-music/backend/voice_events.log",
    encoding="utf-8",
    mode="a",
)
_vfh.setFormatter(logging.Formatter("%(asctime)s  %(message)s", datefmt="%Y-%m-%d %H:%M:%S"))
_vlog.addHandler(_vfh)
_vlog.info("=== bot.py loaded ===")

# ── Route discord.py voice-WS and gateway events into voice_events.log ───────
# discord.voice_client: DEBUG → captures voice-WS close codes (4006, 4014, etc.)
# discord.gateway:      INFO  → captures RESUME/IDENTIFY without heartbeat spam
for _dpy_logger_name, _dpy_level in (
    ("discord.voice_client", logging.DEBUG),
    ("discord.gateway",      logging.INFO),
):
    _dpy_log = logging.getLogger(_dpy_logger_name)
    _dpy_log.setLevel(_dpy_level)
    _dpy_log.addHandler(_vfh)

OWNER_ID = settings.OWNER_ID


def _load_opus():
    if discord.opus.is_loaded():
        return
    # discord.py bundles libopus — try that first (works on all platforms)
    try:
        discord.opus._load_default()
        if discord.opus.is_loaded():
            print("[Bot] Opus loaded: discord bundled library")
            return
    except Exception:
        pass
    # Try common names (works on most Linux/Mac systems)
    for name in ["opus", "libopus", "libopus-0", "libopus.so.0"]:
        try:
            discord.opus.load_opus(name)
            if discord.opus.is_loaded():
                print(f"[Bot] Opus loaded: {name}")
                return
        except Exception:
            continue
    # Linux/Nix: search hash-based store paths
    for pattern in [
        "/nix/store/*/lib/libopus.so*",
        "/run/current-system/sw/lib/libopus.so*",
        "/usr/lib/libopus.so*",
        "/usr/lib/x86_64-linux-gnu/libopus.so*",
    ]:
        for path in sorted(glob.glob(pattern), reverse=True):
            try:
                discord.opus.load_opus(path)
                if discord.opus.is_loaded():
                    print(f"[Bot] Opus loaded from {path}")
                    return
            except Exception:
                continue
    print("[Bot] WARNING: Opus library not found — voice audio will not work")


_load_opus()

intents = discord.Intents.default()
intents.message_content = True
intents.voice_states = True

bot = commands.Bot(command_prefix="!", intents=intents)


async def send_owner_dm(message: str):
    """Send a DM alert to the bot owner. Safe to call from any async context."""
    if not OWNER_ID or not bot.is_ready():
        return
    try:
        user = await bot.fetch_user(OWNER_ID)
        dm   = await user.create_dm()
        await dm.send(message)
        _vlog.info(f"Owner DM sent: {message[:80]}")
    except Exception as e:
        _vlog.info(f"send_owner_dm failed: {e}")

FFMPEG_OPTIONS = {
    "before_options": "-reconnect 1 -reconnect_streamed 1 -reconnect_delay_max 5",
    # -vn: strip video track.
    # discord.py already appends -f s16le -ar 48000 -ac 2 internally,
    # so do NOT add -ar/-ac here — duplicates cause malformed audio output
    # that makes Discord kick the bot from the voice channel.
    "options": "-vn",
}


def _set_encoder_bitrate(voice_client) -> None:
    """Set Opus encoder bitrate to match the voice channel's configured bitrate.
    Reads channel.bitrate (bps) from Discord and applies it to the encoder so
    the bot automatically uses whatever quality the server allows (e.g. 256 kbps
    on a Level 2 boosted server) without any hardcoding.
    """
    try:
        kbps = getattr(voice_client.channel, "bitrate", 128000) // 1000
        voice_client.encoder.set_bitrate(kbps)
    except Exception:
        pass


def _is_webm_stream(url: str) -> bool:
    """Return True if the URL is a WebM/Opus DASH stream (itag 251).
    WebM DASH uses byte-range segment URLs — FFmpeg's -reconnect_streamed flag
    causes IO error -10054 (Broken pipe) on these and must be omitted.
    Standard HTTP streams (m4a, itag 140) still benefit from -reconnect_streamed.
    """
    return "itag=251" in url or "mime=audio%2Fwebm" in url or "mime=audio/webm" in url


def _ffmpeg_opts_for(stream_url: str) -> dict:
    """Return FFmpeg options tuned for the detected stream type.
    WebM/Opus DASH → no -reconnect_streamed (DASH byte-range segments are not seekable streams).
    m4a/AAC HTTP  → keep -reconnect_streamed for mid-song reconnection resilience.
    """
    if _is_webm_stream(stream_url):
        return {"before_options": "-reconnect 1 -reconnect_delay_max 5", "options": "-vn"}
    return FFMPEG_OPTIONS



async def _save_gallery_item(item_data: dict):
    """Run on FastAPI loop — saves a gallery item to the database."""
    from database import AsyncSessionLocal
    from models import GalleryItem
    from datetime import datetime
    async with AsyncSessionLocal() as db:
        item = GalleryItem(**item_data, created_at=datetime.utcnow())
        db.add(item)
        await db.commit()


@bot.event
async def on_message(message: discord.Message):
    if message.author.bot:
        return

    # ── Gallery channel handling ──────────────────────────────────────────────
    gallery_channel_ids = settings.gallery_channel_ids
    if gallery_channel_ids and message.channel.id in gallery_channel_ids:
        for attachment in message.attachments:
            ct = attachment.content_type or ""
            if not (ct.startswith("image/") or ct.startswith("video/")):
                continue
            try:
                data = await attachment.read()
                ext = attachment.filename.rsplit(".", 1)[-1] if "." in attachment.filename else "bin"
                key = f"{uuid.uuid4().hex}.{ext}"

                from r2 import upload_to_r2
                public_url = await upload_to_r2(key, data, ct)

                item_data = {
                    "r2_key": key,
                    "public_url": public_url,
                    "original_name": attachment.filename,
                    "media_type": "image" if ct.startswith("image/") else "video",
                    "uploader": message.author.display_name,
                    "caption": message.content or "",
                    "source": "discord",
                    "channel_name": getattr(message.channel, "name", ""),
                    "channel_id": str(message.channel.id),
                    "guild_id": str(message.guild.id) if message.guild else "",
                }
                import bot_runner
                bot_runner.fire_in_fastapi(_save_gallery_item(item_data))
                print(f"[Gallery] Saved {attachment.filename} from {message.author.display_name}")
            except Exception as e:
                print(f"[Gallery] Failed to process attachment: {e}")
                asyncio.create_task(send_owner_dm(
                    f"⚠️ **[R2 UPLOAD FAILED]**\n"
                    f"Gallery upload failed for `{attachment.filename}`.\n"
                    f"Error: {str(e)[:200]}"
                ))

    # ── Strategy channel handling ─────────────────────────────────────────────
    category = _strategy_category_for_channel(message.channel.id)
    if category:
        import bot_runner
        bot_runner.fire_in_fastapi(_save_strategy_post(message, category))
        web_url = f"{settings.FRONTEND_URL}?mode=strategy&msg={message.id}"
        await message.reply(
            f"🔗 **View on BeggarClub** → {web_url}",
            mention_author=False,
        )


# ─── Stream notification helpers ─────────────────────────────────────────────

async def _stream_notifs_enabled() -> bool:
    """Check the DB setting; default True if row is missing."""
    try:
        from database import AsyncSessionLocal
        from models import Setting
        async with AsyncSessionLocal() as db:
            row = await db.get(Setting, "stream_notifications_enabled")
            return row.value == "true" if row else True
    except Exception:
        return True


async def _handle_stream_start_raw(
    user,
    notif_channel,
    *,
    guild=None,
    is_test: bool = False,
):
    """
    Post a Discord embed and broadcast a WS notification event.
    `user` can be a discord.Member or a discord.ClientUser (for test).
    `notif_channel` is the TextChannel to post to.
    """
    try:
        label = "🔴 TEST — Stream notification" if is_test else "🔴 Live stream started"
        embed = discord.Embed(
            title=label,
            color=0xFF0000,
            timestamp=datetime.now(timezone.utc),
        )
        embed.set_author(
            name=user.display_name if hasattr(user, "display_name") else str(user),
            icon_url=user.display_avatar.url if hasattr(user, "display_avatar") else None,
        )
        if not is_test and hasattr(user, "voice") and user.voice and user.voice.channel:
            embed.add_field(name="Channel", value=user.voice.channel.mention, inline=False)
        embed.set_thumbnail(url=user.display_avatar.url if hasattr(user, "display_avatar") else None)

        content = user.mention if not is_test else None
        await notif_channel.send(content=content, embed=embed)

        # WS broadcast — find the guild and broadcast to all its WS clients
        target_guild = guild or (getattr(user, "guild", None))
        if target_guild:
            gp = player_manager.get(str(target_guild.id))
            payload = {
                "type": "stream_start",
                "is_test": is_test,
                "user_id": str(user.id),
                "user_name": user.display_name if hasattr(user, "display_name") else str(user),
                "user_avatar": str(user.display_avatar.url) if hasattr(user, "display_avatar") else "",
                "channel_name": (
                    user.voice.channel.name
                    if not is_test and hasattr(user, "voice") and user.voice and user.voice.channel
                    else "test"
                ),
                "started_at": datetime.now(timezone.utc).isoformat(),
            }
            gp.broadcast("notification", payload)

    except Exception as e:
        print(f"[StreamNotif] Failed: {e}")


async def _handle_stream_start(member: discord.Member, channel):
    """Called when a real member starts Go Live."""
    notif_channel_id = settings.notification_channel_id
    if not notif_channel_id:
        return
    notif_channel = bot.get_channel(notif_channel_id)
    if not notif_channel:
        return
    await _handle_stream_start_raw(member, notif_channel, guild=member.guild)


# ─── Strategy helpers ────────────────────────────────────────────────────────

def _strategy_category_for_channel(channel_id: int) -> str | None:
    """Return "strategy" or "guildwar" if channel_id is a strategy channel, else None."""
    if settings.strategy_channel_id and channel_id == settings.strategy_channel_id:
        return "strategy"
    if settings.guildwar_channel_id and channel_id == settings.guildwar_channel_id:
        return "guildwar"
    return None


async def _save_strategy_post(message: discord.Message, category: str):
    """Run on FastAPI event loop — save a Discord message as a StrategyPost."""
    from database import AsyncSessionLocal
    from models import StrategyPost
    from sqlalchemy import select, func

    # Skip if message has no text and no media
    has_media = any(
        a.content_type and (a.content_type.startswith("image/") or a.content_type.startswith("video/"))
        for a in message.attachments
    )
    if not message.content.strip() and not has_media:
        return

    async with AsyncSessionLocal() as db:
        # Deduplicate by message_id
        existing = await db.execute(
            select(StrategyPost).where(StrategyPost.message_id == str(message.id))
        )
        if existing.scalar_one_or_none():
            return

        # Compute position
        max_pos_result = await db.scalar(
            select(func.max(StrategyPost.position)).where(
                StrategyPost.guild_id == str(message.guild.id) if message.guild else StrategyPost.guild_id == ""
            )
        )
        position = (max_pos_result or 0) + 1

        # Upload attachments to R2
        media_items = []
        for attachment in message.attachments:
            ct = attachment.content_type or ""
            if not (ct.startswith("image/") or ct.startswith("video/")):
                continue
            try:
                data = await attachment.read()
                ext = attachment.filename.rsplit(".", 1)[-1] if "." in attachment.filename else "bin"
                key = f"strategy/{uuid.uuid4().hex}.{ext}"
                from r2 import upload_to_r2
                public_url = await upload_to_r2(key, data, ct)
                media_items.append({
                    "public_url": public_url,
                    "r2_key": key,
                    "media_type": "image" if ct.startswith("image/") else "video",
                })
            except Exception as e:
                print(f"[Strategy] Failed to upload attachment: {e}")

        post = StrategyPost(
            guild_id=str(message.guild.id) if message.guild else "",
            message_id=str(message.id),
            category=category,
            author_name=message.author.display_name,
            author_avatar=str(message.author.display_avatar.url) if hasattr(message.author, "display_avatar") else "",
            content=message.content or "",
            media=json.dumps(media_items),
            position=position,
            message_url=message.jump_url,
            created_at=message.created_at.replace(tzinfo=timezone.utc) if message.created_at else datetime.now(timezone.utc),
        )
        db.add(post)
        await db.commit()
        print(f"[Strategy] Saved post from {message.author.display_name} in category={category}")


# ─── Poll helpers ─────────────────────────────────────────────────────────────

# Regional-indicator emojis for reaction polls (A–J for up to 10 options)
_POLL_EMOJIS = ["🇦", "🇧", "🇨", "🇩", "🇪", "🇫", "🇬", "🇭", "🇮", "🇯"]

# Debounce tracker: poll_id → pending asyncio.Task
_pending_embed_updates: dict[int, asyncio.Task] = {}


async def _send_native_poll(channel: discord.TextChannel, poll_row) -> int:
    """Send a Discord native poll. Returns the Discord message ID."""
    options = json.loads(poll_row.options)
    poll = discord.Poll(
        question=poll_row.question,
        duration=timedelta(seconds=poll_row.duration_seconds),
        multiple=poll_row.multi_select,
    )
    for opt in options:
        poll.add_answer(text=opt)
    msg = await channel.send(poll=poll)
    return msg.id


async def _send_reaction_poll(channel: discord.TextChannel, poll_row) -> int:
    """Send a custom reaction embed poll. Returns the Discord message ID."""
    options = json.loads(poll_row.options)
    lines = [f"{_POLL_EMOJIS[i]} **{opt}** — 0 votes" for i, opt in enumerate(options)]
    embed = discord.Embed(
        title=f"📊 {poll_row.question}",
        description="\n".join(lines),
        color=0x5865F2,
    )
    footer = "Anonymous poll · React to vote" if poll_row.anonymous else "React to vote · Single choice only"
    embed.set_footer(text=footer)
    msg = await channel.send(embed=embed)
    for i in range(len(options)):
        await msg.add_reaction(_POLL_EMOJIS[i])
    return msg.id


async def _rebuild_reaction_embed(poll_id: int, options: list[str], anonymous: bool):
    """Rebuild and edit the reaction poll embed with updated tallies."""
    from database import AsyncSessionLocal
    from models import Poll, PollVote
    from sqlalchemy import select

    async with AsyncSessionLocal() as db:
        poll = await db.get(Poll, poll_id)
        if not poll or poll.ended_at or not poll.message_id or not poll.channel_id:
            return
        # Get tallies
        votes_result = await db.execute(select(PollVote).where(PollVote.poll_id == poll_id))
        votes = votes_result.scalars().all()

    tallies: dict[int, int] = {i: 0 for i in range(len(options))}
    for vote in votes:
        tallies[vote.option_index] = tallies.get(vote.option_index, 0) + 1

    lines = [f"{_POLL_EMOJIS[i]} **{opt}** — {tallies[i]} vote{'s' if tallies[i] != 1 else ''}" for i, opt in enumerate(options)]
    embed = discord.Embed(
        title=f"📊 {poll.question}",
        description="\n".join(lines),
        color=0x5865F2,
    )
    footer = "Anonymous poll · React to vote" if anonymous else "React to vote · Single choice only"
    embed.set_footer(text=footer)

    try:
        channel = bot.get_channel(int(poll.channel_id))
        if channel:
            msg = await channel.fetch_message(int(poll.message_id))
            await msg.edit(embed=embed)
    except Exception as e:
        print(f"[Polls] Embed update failed for poll {poll_id}: {e}")


async def _debounced_embed_update(poll_id: int, options: list[str], anonymous: bool, delay: float = 2.0):
    await asyncio.sleep(delay)
    _pending_embed_updates.pop(poll_id, None)
    await _rebuild_reaction_embed(poll_id, options, anonymous)


async def _finalize_poll(poll, db, bot_instance):
    """Save final results, mark poll ended, post a summary message."""
    from models import PollVote
    from sqlalchemy import select

    now = datetime.now(timezone.utc)
    options = json.loads(poll.options)
    tallies: dict[str, int] = {}

    if poll.poll_type == "native" and poll.message_id and poll.channel_id:
        # Try to read native poll results from Discord
        try:
            channel = bot_instance.get_channel(int(poll.channel_id))
            if channel:
                msg = await channel.fetch_message(int(poll.message_id))
                if msg.poll and msg.poll.results:
                    for ac in msg.poll.results.answer_counts:
                        tallies[str(ac.id - 1)] = ac.count  # Discord answer IDs are 1-indexed
        except Exception as e:
            print(f"[Polls] Could not fetch native poll results: {e}")
    else:
        # Reaction poll — read from DB
        votes_result = await db.execute(select(PollVote).where(PollVote.poll_id == poll.id))
        for vote in votes_result.scalars().all():
            tallies[str(vote.option_index)] = tallies.get(str(vote.option_index), 0) + 1

    # Initialize zeros for options with no votes
    for i in range(len(options)):
        tallies.setdefault(str(i), 0)

    poll.ended_at = now
    poll.final_results = json.dumps(tallies)
    await db.commit()

    # Post summary to Discord
    if poll.message_id and poll.channel_id:
        try:
            channel = bot_instance.get_channel(int(poll.channel_id))
            if channel:
                embed = discord.Embed(title="📊 Poll Ended", color=0x57F287)
                embed.add_field(name="Question", value=poll.question, inline=False)
                winner_idx = max(tallies, key=lambda k: tallies[k]) if tallies else None
                for i, opt in enumerate(options):
                    votes = tallies.get(str(i), 0)
                    emoji = _POLL_EMOJIS[i] if poll.poll_type == "reaction" else f"{i + 1}."
                    prefix = "🏆 " if str(i) == winner_idx else ""
                    embed.add_field(name=f"{emoji} {opt}", value=f"{prefix}{votes} vote{'s' if votes != 1 else ''}", inline=True)
                await channel.send(embed=embed)
        except Exception as e:
            print(f"[Polls] Failed to post poll summary: {e}")


# ─── Reaction event handlers for polls ───────────────────────────────────────

@bot.event
async def on_raw_reaction_add(payload: discord.RawReactionActionEvent):
    if payload.user_id == bot.user.id:
        return  # ignore bot's own pre-reactions
    await _handle_reaction(payload, add=True)


@bot.event
async def on_raw_reaction_remove(payload: discord.RawReactionActionEvent):
    if payload.user_id == bot.user.id:
        return
    await _handle_reaction(payload, add=False)


async def _handle_reaction(payload: discord.RawReactionActionEvent, add: bool):
    """Process a reaction add/remove for reaction-type polls."""
    from database import AsyncSessionLocal
    from models import Poll, PollVote
    from sqlalchemy import select

    emoji_str = str(payload.emoji)
    if emoji_str not in _POLL_EMOJIS:
        return

    option_index = _POLL_EMOJIS.index(emoji_str)

    async with AsyncSessionLocal() as db:
        # Find an active reaction poll with this message_id
        result = await db.execute(
            select(Poll).where(
                Poll.message_id == str(payload.message_id),
                Poll.poll_type == "reaction",
                Poll.ended_at == None,  # noqa: E711
            )
        )
        poll = result.scalar_one_or_none()
        if not poll:
            return

        poll_id = poll.id
        options = json.loads(poll.options)
        anonymous = poll.anonymous

        if add:
            # Remove any existing vote from this user (single-vote enforcement)
            existing = await db.execute(
                select(PollVote).where(
                    PollVote.poll_id == poll_id,
                    PollVote.user_id == str(payload.user_id),
                )
            )
            existing_vote = existing.scalar_one_or_none()
            if existing_vote:
                if existing_vote.option_index == option_index:
                    return  # Same option — no change needed
                # Remove old reaction from Discord
                try:
                    channel = bot.get_channel(payload.channel_id)
                    if channel:
                        msg = await channel.fetch_message(payload.message_id)
                        old_emoji = _POLL_EMOJIS[existing_vote.option_index]
                        member = payload.member or channel.guild.get_member(payload.user_id)
                        if member:
                            await msg.remove_reaction(old_emoji, member)
                except Exception:
                    pass
                existing_vote.option_index = option_index
            else:
                db.add(PollVote(poll_id=poll_id, user_id=str(payload.user_id), option_index=option_index))
        else:
            # Remove vote
            existing = await db.execute(
                select(PollVote).where(
                    PollVote.poll_id == poll_id,
                    PollVote.user_id == str(payload.user_id),
                    PollVote.option_index == option_index,
                )
            )
            vote = existing.scalar_one_or_none()
            if vote:
                await db.delete(vote)

        await db.commit()

    # Debounce embed update (2 s)
    existing_task = _pending_embed_updates.get(poll_id)
    if existing_task and not existing_task.done():
        existing_task.cancel()
    _pending_embed_updates[poll_id] = asyncio.create_task(
        _debounced_embed_update(poll_id, options, anonymous, delay=2.0)
    )


# ─── Scheduler: polls, birthdays, reminders ──────────────────────────────────

_scheduler_started = False
_last_birthday_post: dict[str, str] = {}  # guild_id → "YYYY-MM-DD"


async def _scheduler_loop():
    """Run every 30 s: dispatch scheduled polls, end expired polls, fire birthdays and reminders."""
    while True:
        await asyncio.sleep(30)
        now = datetime.now(timezone.utc)
        try:
            await _tick_polls(now)
        except Exception as e:
            print(f"[Scheduler] Polls tick error: {e}")
        try:
            await _tick_birthdays(now)
        except Exception as e:
            print(f"[Scheduler] Birthdays tick error: {e}")
        try:
            await _tick_reminders(now)
        except Exception as e:
            print(f"[Scheduler] Reminders tick error: {e}")


async def _tick_polls(now: datetime):
    from database import AsyncSessionLocal
    from models import Poll
    from sqlalchemy import select

    async with AsyncSessionLocal() as db:
        # Dispatch scheduled polls whose time has come
        result = await db.execute(
            select(Poll).where(
                Poll.scheduled_for <= now,
                Poll.dispatched_at == None,  # noqa: E711
                Poll.ended_at == None,  # noqa: E711
            )
        )
        for poll in result.scalars().all():
            try:
                channel = bot.get_channel(int(poll.channel_id))
                if channel:
                    if poll.poll_type == "native":
                        message_id = await _send_native_poll(channel, poll)
                    else:
                        message_id = await _send_reaction_poll(channel, poll)
                    poll.message_id = str(message_id)
                    poll.dispatched_at = now
                    poll.ends_at = now + timedelta(seconds=poll.duration_seconds)
                    await db.commit()
                    print(f"[Scheduler] Dispatched scheduled poll {poll.id}")
            except Exception as e:
                print(f"[Scheduler] Failed to dispatch poll {poll.id}: {e}")

        # Auto-end expired polls
        result2 = await db.execute(
            select(Poll).where(
                Poll.ends_at <= now,
                Poll.ended_at == None,  # noqa: E711
                Poll.dispatched_at != None,  # noqa: E711
            )
        )
        for poll in result2.scalars().all():
            try:
                await _finalize_poll(poll, db, bot)
                print(f"[Scheduler] Auto-ended poll {poll.id}")
            except Exception as e:
                print(f"[Scheduler] Failed to finalize poll {poll.id}: {e}")


async def _tick_birthdays(now: datetime):
    from database import AsyncSessionLocal
    from models import Birthday
    from routes.admin import _get_setting
    from sqlalchemy import select

    today = now.date()
    today_str = today.isoformat()

    async with AsyncSessionLocal() as db:
        # Find all guilds that have birthdays configured
        result = await db.execute(select(Birthday))
        all_birthdays = result.scalars().all()

    # Group by guild
    guilds: dict[str, list] = {}
    for b in all_birthdays:
        guilds.setdefault(b.guild_id, []).append(b)

    for guild_id, birthdays in guilds.items():
        # Check if already posted today
        if _last_birthday_post.get(guild_id) == today_str:
            continue

        post_hour = int(await _get_setting(f"birthday_post_hour_{guild_id}", "9"))
        if now.hour != post_hour:
            continue

        channel_id_str = await _get_setting(f"birthday_channel_{guild_id}", "")
        if not channel_id_str:
            continue
        channel = bot.get_channel(int(channel_id_str))
        if not channel:
            continue

        message_template = await _get_setting(
            f"birthday_message_{guild_id}",
            "🎂 Happy birthday, {mention}!"
        )

        # Find today's birthdays
        for b in birthdays:
            if b.birth_month == today.month and b.birth_day == today.day:
                try:
                    guild = bot.get_guild(int(guild_id))
                    member = guild.get_member(int(b.user_id)) if guild else None
                    mention = member.mention if member else b.display_name
                    msg_text = message_template.replace("{mention}", mention)
                    await channel.send(msg_text)
                    print(f"[Birthday] Posted wish for {b.display_name} in guild {guild_id}")
                except Exception as e:
                    print(f"[Birthday] Failed to post for {b.user_id}: {e}")

        _last_birthday_post[guild_id] = today_str


async def _tick_reminders(now: datetime):
    from database import AsyncSessionLocal
    from models import Reminder
    from routes.reminders import _advance_next_run
    from sqlalchemy import select

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Reminder).where(
                Reminder.active == True,  # noqa: E712
                Reminder.next_run_at <= now,
            )
        )
        reminders = result.scalars().all()

        for reminder in reminders:
            try:
                channel = bot.get_channel(int(reminder.channel_id))
                if channel:
                    await channel.send(reminder.text)
                    print(f"[Reminders] Fired reminder {reminder.id} to #{channel.name}")
                reminder.last_run_at = now
                if reminder.recurrence:
                    reminder.next_run_at = _advance_next_run(reminder.recurrence, now)
                else:
                    # One-off: disable after firing
                    reminder.active = False
                await db.commit()
            except Exception as e:
                print(f"[Reminders] Failed to fire reminder {reminder.id}: {e}")


@bot.command(name="web", aliases=["player", "ui", "link"])
async def web_command(ctx: commands.Context):
    url = settings.FRONTEND_URL
    embed = discord.Embed(
        title="🎵 BeggarClub Music Player",
        description="Click the link below to open the web player",
        color=0xD4A437,
    )
    embed.add_field(name="🔗 Open Player", value=url, inline=False)
    embed.set_footer(text="Music controls • Playlists • Queue")
    await ctx.send(embed=embed)


@bot.event
async def on_voice_state_update(member: discord.Member, before: discord.VoiceState, after: discord.VoiceState):
    """Detect Go Live streams from members, and handle bot disconnects."""
    # ── Stream-start detection (non-bot members only) ──────────────────────
    if member.id != bot.user.id:
        stream_started = not before.self_stream and after.self_stream
        if stream_started:
            try:
                enabled = await _stream_notifs_enabled()
                if enabled:
                    await _handle_stream_start(member, after.channel)
            except Exception as e:
                print(f"[StreamNotif] Error in on_voice_state_update: {e}")
        return  # Only care about the bot itself below

    # ── Bot self-disconnect / reconnect handling (unchanged) ───────────────

    before_name = before.channel.name if before.channel else "None"
    after_name  = after.channel.name  if after.channel  else "None"
    _vlog.info(f"on_voice_state_update  before=#{before_name}  after=#{after_name}")

    # Bot left a channel (not moved to another one)
    if before.channel is None or after.channel is not None:
        return

    guild_id = str(member.guild.id)
    gp = player_manager.get(guild_id)

    if gp.intentional_disconnect:
        gp.intentional_disconnect = False
        _vlog.info(f"Intentional disconnect from #{before.channel.name} — not rejoining")
        return

    # Unexpected disconnect — check cooldown (don't retry more than once per 30s)
    now = time.time()
    if now - gp._last_reconnect_attempt < 30:
        _vlog.info(f"Unexpected disconnect from #{before.channel.name} — cooldown active, skipping")
        return

    gp._last_reconnect_attempt = now
    channel_id = str(before.channel.id)
    track_name = gp.current.title[:50] if gp.current else "Nothing"
    _vlog.info(f"Unexpected disconnect from #{before.channel.name} — scheduling rejoin in 5s  track={track_name}")
    asyncio.create_task(_rejoin_and_resume(guild_id, channel_id, gp.current, gp.started_at))
    asyncio.create_task(send_owner_dm(
        f"⚠️ **[VOICE DISCONNECTED]**\n"
        f"Bot was unexpectedly kicked from **#{before.channel.name}**.\n"
        f"Now playing: {track_name}\n"
        f"Attempting to rejoin automatically in 5s..."
    ))


async def _backfill_gallery_channel_ids():
    """One-time backfill: resolve channel_name → channel_id for pre-v2 gallery items.
    Runs in the FastAPI loop (scheduled from on_ready via fire_in_fastapi).
    """
    from database import AsyncSessionLocal
    from models import GalleryItem
    from sqlalchemy import select as sa_select
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            sa_select(GalleryItem).where(
                GalleryItem.channel_id == "",
                GalleryItem.channel_name != "",
            )
        )
        items = result.scalars().all()
        if not items:
            print("[Gallery] Backfill: nothing to update")
            return
        # Build (guild_id, channel_name) → channel_id lookup from bot's guilds
        ch_map: dict[tuple[str, str], str] = {}
        for guild in bot.guilds:
            for ch in guild.channels:
                ch_map[(str(guild.id), ch.name)] = str(ch.id)
        count = 0
        for item in items:
            cid = ch_map.get((item.guild_id, item.channel_name))
            if cid:
                item.channel_id = cid
                count += 1
        if count:
            await db.commit()
            print(f"[Gallery] Backfilled channel_id for {count} items")
        else:
            print(f"[Gallery] Backfill: {len(items)} items with channel_name but no match found")


@bot.event
async def on_ready():
    global _bot_started_at, _scheduler_started
    _bot_started_at = time.time()
    if not _scheduler_started:
        _scheduler_started = True
        asyncio.create_task(_scheduler_loop())
        print("[Bot] Scheduler started")
    _vlog.info(f"on_ready  user={bot.user}  guilds={[g.name for g in bot.guilds]}")
    print(f"[Bot] Logged in as {bot.user} ({bot.user.id})")
    url = settings.FRONTEND_URL
    await bot.change_presence(
        status=discord.Status.online,
        activity=discord.Activity(
            type=discord.ActivityType.listening,
            name=url,
        ),
    )

    # Backfill channel_id for old gallery items that only have channel_name
    import bot_runner as _br
    _br.fire_in_fastapi(_backfill_gallery_channel_ids())

    # Save any active voice sessions before clearing — on_ready can fire on
    # reconnect (fresh IDENTIFY), not just on first startup.
    saved: dict[str, dict] = {}
    for guild in bot.guilds:
        gp = player_manager.get(str(guild.id))
        # If we remember a channel and had something playing, plan to rejoin
        if gp.last_voice_channel_id and gp.current:
            saved[str(guild.id)] = {
                "channel_id": gp.last_voice_channel_id,
                "current": gp.current,
                "started_at": gp.started_at,
            }
            _vlog.info(f"  on_ready: will rejoin guild={guild.id} channel={gp.last_voice_channel_id} track={gp.current.title[:40]}")

    await _clear_all_voice()

    for guild_id, state in saved.items():
        asyncio.create_task(_rejoin_and_resume(guild_id, state["channel_id"], state["current"], state["started_at"]))


@bot.event
async def on_resumed():
    """Gateway RESUME — discord.py 2.x handles voice-WS reconnection internally
    via reconnect=True on VoiceClient.connect().  Tearing down voice on every
    RESUME caused ~30 artificial disconnects per 48 h; no 4006 was ever observed
    in logs (the original 4006 comment was AI-scaffolded in the initial commit
    with no real-world validation — confirmed by git archaeology 2026-05-30).

    Default: log state and let discord.py manage voice-WS reconnection silently.
    Emergency rollback: set RESUME_TEARDOWN=1 in the process environment to
    restore the old save-clear-rejoin path (e.g. if 4006 codes appear in
    voice_events.log from discord.voice_client DEBUG output)."""

    if os.environ.get("RESUME_TEARDOWN") == "1":
        # ── Legacy rollback path (activate only if 4006 observed in logs) ────
        _vlog.info("on_resumed — RESUME_TEARDOWN=1: legacy teardown+rejoin path")
        saved: dict[str, dict] = {}
        for guild in bot.guilds:
            gp = player_manager.get(str(guild.id))
            vc_connected = gp.voice_client and gp.voice_client.is_connected()
            _vlog.info(f"  guild={guild.name}  vc_connected={vc_connected}  last_channel={gp.last_voice_channel_id}  current={gp.current.title[:30] if gp.current else 'None'}")
            if vc_connected:
                saved[str(guild.id)] = {
                    "channel_id": str(gp.voice_client.channel.id),
                    "current": gp.current,
                    "started_at": gp.started_at,
                }
            elif gp.last_voice_channel_id and gp.current:
                _vlog.info(f"  vc already gone, using last_voice_channel_id={gp.last_voice_channel_id}")
                saved[str(guild.id)] = {
                    "channel_id": gp.last_voice_channel_id,
                    "current": gp.current,
                    "started_at": gp.started_at,
                }
        await _clear_all_voice()
        for guild_id, state in saved.items():
            _vlog.info(f"  scheduling rejoin for guild={guild_id} channel={state['channel_id']}")
            asyncio.create_task(_rejoin_and_resume(guild_id, state["channel_id"], state["current"], state["started_at"]))
        return

    # ── Normal path: discord.py reconnect=True handles voice-WS silently ─────
    _vlog.info("on_resumed — no teardown; discord.py voice-WS reconnect active")
    for guild in bot.guilds:
        gp = player_manager.get(str(guild.id))
        vc_connected = gp.voice_client and gp.voice_client.is_connected()
        _vlog.info(f"  guild={guild.name}  vc_connected={vc_connected}  current={gp.current.title[:30] if gp.current else 'None'}")


async def _rejoin_and_resume(guild_id: str, channel_id: str, track, started_at: float):
    """Rejoin a voice channel and resume playback after a gateway reconnect."""
    await asyncio.sleep(5.0)  # Let Discord settle

    _vlog.info(f"_rejoin_and_resume  guild={guild_id}  channel={channel_id}  track={track.title[:40] if track else 'None'}")
    success, msg = await join_channel(guild_id, channel_id)
    _vlog.info(f"  join_channel result: success={success}  msg={msg}")
    if not success:
        asyncio.create_task(send_owner_dm(
            f"❌ **[REJOIN FAILED]**\n"
            f"Could not rejoin voice channel after disconnect.\n"
            f"Reason: {msg[:200]}"
        ))
        return

    if track:
        position = max(0.0, time.time() - started_at) if started_at else 0.0
        if track.duration and position >= track.duration - 5:
            position = 0.0
        _vlog.info(f"  resuming at {int(position)}s")
        gp = player_manager.get(guild_id)
        gp.current = track
        gp.started_at = started_at
        try:
            await seek_to(guild_id, position)
        except Exception as e:
            _vlog.info(f"  resume failed: {e}")


async def _clear_all_voice():
    """Disconnect from all voice channels and wipe internal voice client cache."""
    # Mark all guilds as intentionally disconnecting so on_voice_state_update
    # doesn't trigger auto-rejoin while we're doing this deliberately.
    for guild in bot.guilds:
        player_manager.get(str(guild.id)).intentional_disconnect = True

    for vc in list(bot.voice_clients):
        try:
            await vc.disconnect(force=True)
        except Exception:
            pass

    internal = getattr(bot, "_connection", None)
    if internal:
        getattr(internal, "_voice_clients", {}).clear()

    for guild in bot.guilds:
        gp = player_manager.get(str(guild.id))
        gp.voice_client = None

    print("[Bot] Voice state cleared")


async def play_track(guild_id: str, track: Track):
    gp = player_manager.get(guild_id)

    if not gp.voice_client or not gp.voice_client.is_connected():
        return

    if not track.stream_url:
        try:
            track.stream_url, _ = await get_stream_url(track.video_id)
        except Exception as e:
            _vlog.info(f"yt-dlp failed for {track.video_id}: {e}")
            asyncio.create_task(send_owner_dm(
                f"⚠️ **[STREAM FETCH FAILED]**\n"
                f"yt-dlp could not get stream URL for:\n"
                f"**{track.title[:80]}**\n"
                f"Error: {str(e)[:150]}"
            ))
            return

    # When called directly (not via _on_song_end), save the outgoing track to history.
    # _on_song_end clears gp.current before calling us, so this only fires on manual plays.
    if gp.current and gp.current.video_id != track.video_id:
        gp.history.append(gp.current)
        if len(gp.history) > 50:
            gp.history.pop(0)

    # Increment generation BEFORE stop() so the old after_play sees a mismatched
    # generation and won't fire _on_song_end while we're setting up the new track.
    gp._play_generation += 1
    gen = gp._play_generation

    if gp.voice_client.is_playing() or gp.voice_client.is_paused():
        gp.voice_client.stop()

    gp.current = track
    gp.is_paused = False
    gp.started_at = time.time()

    source = discord.FFmpegPCMAudio(track.stream_url, **_ffmpeg_opts_for(track.stream_url))
    source = discord.PCMVolumeTransformer(source, volume=gp.volume)

    def after_play(error):
        if error:
            print(f"[Bot] Playback error: {error}")
        if gp._play_generation != gen:
            return
        import bot_runner
        asyncio.run_coroutine_threadsafe(_on_song_end(guild_id), bot_runner.get_bot_loop())

    gp.voice_client.play(source, after=after_play)
    _set_encoder_bitrate(gp.voice_client)
    await gp.broadcast("now_playing")

    # Queue management after track starts.
    if gp.autoplay:
        if gp.playlist_context and len(gp.queue) == 0:
            # This is the last song in the playlist — kick off recommendation
            # pre-fetch NOW (concurrently) so the queue is ready before the
            # song finishes, giving seamless continuous playback.
            asyncio.create_task(_prefetch_playlist_end_extend(guild_id))
        elif not gp.playlist_context and len(gp.queue) < 10:
            asyncio.create_task(_prefetch_recs(guild_id))


async def _prefetch_next_stream(guild_id: str):
    """Pre-fetch stream URL for the next queued track so skip is near-instant."""
    gp = player_manager.get(guild_id)
    if gp.queue and not gp.queue[0].stream_url:
        try:
            gp.queue[0].stream_url, _ = await get_stream_url(gp.queue[0].video_id)
        except Exception:
            pass


async def seek_to(guild_id: str, position: float):
    gp = player_manager.get(guild_id)
    if not gp.voice_client or not gp.current:
        return

    track = gp.current
    duration = track.duration or 1

    # Try to get a fresh URL; fall back to the cached one if yt-dlp fails.
    try:
        print(f"[Seek] Fetching fresh URL for {track.video_id} (pos={int(position)}s, duration={duration}s)")
        stream_url, filesize = await get_stream_url(track.video_id)
        has_range_param = "&range=" in stream_url
        print(f"[Seek] Got URL (has_range_param={has_range_param}, filesize={filesize}): {stream_url[:120]}...")
        # If the URL has a range= parameter (YouTube DASH), rewrite it to the correct byte offset.
        if has_range_param and filesize > 0:
            byte_offset = int(position / duration * filesize)
            import re as _re
            stream_url = _re.sub(r'[&?]range=\d+-\d*', lambda m: m.group(0)[0] + f"range={byte_offset}-", stream_url)
            print(f"[Seek] Rewrote URL range param → byte_offset={byte_offset}")
        track.stream_url = stream_url
    except Exception as e:
        print(f"[Seek] Failed to fetch fresh URL ({e}), using cached URL")
        if not track.stream_url:
            return

    # Increment generation BEFORE stop() so the old after_play sees a mismatched
    # generation and won't fire _on_song_end while we're setting up the seek source.
    gp._play_generation += 1
    gen = gp._play_generation

    if gp.voice_client.is_playing() or gp.voice_client.is_paused():
        gp.voice_client.stop()

    gp.is_paused = False

    def make_after_play(g, label):
        def after_play(error):
            if error:
                print(f"[Bot] after_play error ({label}): {error}", flush=True)
            else:
                print(f"[Bot] after_play OK ({label}), gen={gp._play_generation} expected={g} match={gp._play_generation == g}", flush=True)
            if gp._play_generation != g:
                return
            import bot_runner
            asyncio.run_coroutine_threadsafe(_on_song_end(guild_id), bot_runner.get_bot_loop())
        return after_play

    if position > 0:
        seek_opts = {
            # No -reconnect_streamed: that flag marks streams as non-seekable,
            # which makes -ss fall back to decoding from position 0.
            "before_options": (
                f"-reconnect 1 -reconnect_delay_max 5"
                f" -ss {int(position)}"
            ),
            "options": "-vn",
        }
        print(f"[Seek] Starting FFmpegPCMAudio with -ss {int(position)} (no reconnect_streamed)")
        source = discord.FFmpegPCMAudio(track.stream_url, **seek_opts)
        source = discord.PCMVolumeTransformer(source, volume=gp.volume)
        gp.voice_client.play(source, after=make_after_play(gen, f"seek@{int(position)}"))
        _set_encoder_bitrate(gp.voice_client)
        gp.started_at = time.time() - position
        print(f"[Seek] voice_client.play() called, is_playing={gp.voice_client.is_playing()}")
    else:
        source = discord.FFmpegPCMAudio(track.stream_url, **{
            "before_options": "-reconnect 1 -reconnect_delay_max 5",
            "options": "-vn",
        })
        source = discord.PCMVolumeTransformer(source, volume=gp.volume)
        gp.voice_client.play(source, after=make_after_play(gen, "seek@0"))
        _set_encoder_bitrate(gp.voice_client)
        gp.started_at = time.time()

    await gp.broadcast("now_playing")

    # If the seek produced no audio within 2 s (stream doesn't support range seeking),
    # fall back to restarting the track from the beginning.
    if position > 0:
        asyncio.create_task(_verify_seek(guild_id, gen, track))


async def _verify_seek(guild_id: str, gen: int, track: Track):
    """After 2 s, check if seek produced audio. If not, restart from beginning."""
    await asyncio.sleep(2.0)
    gp = player_manager.get(guild_id)
    if gp._play_generation != gen:
        return  # State already moved on
    if gp.voice_client and not gp.voice_client.is_playing():
        print("[Bot] Seek produced no audio — restarting from beginning")
        gp._play_generation += 1
        new_gen = gp._play_generation
        source = discord.FFmpegPCMAudio(track.stream_url, **_ffmpeg_opts_for(track.stream_url))
        source = discord.PCMVolumeTransformer(source, volume=gp.volume)

        def after_play(error):
            if error:
                print(f"[Bot] Playback error: {error}")
            if gp._play_generation != new_gen:
                return
            import bot_runner
            asyncio.run_coroutine_threadsafe(_on_song_end(guild_id), bot_runner.get_bot_loop())

        gp.voice_client.play(source, after=after_play)
        _set_encoder_bitrate(gp.voice_client)
        gp.started_at = time.time()
        await gp.broadcast("now_playing")


async def _prefetch_recs(guild_id: str):
    gp = player_manager.get(guild_id)
    if not gp.current or not gp.autoplay:
        return
    # While a curated playlist is active, don't inject radio recs into the queue.
    if gp.playlist_context:
        return
    if gp._prefetching_recs:
        return
    gp._prefetching_recs = True
    try:
        seed_id = gp.current.video_id
        recs = await get_recommendations(seed_id, max_results=50)
        # Re-check after the await: playlist context may have been set while
        # we were fetching, or autoplay may have been toggled off.
        if gp.playlist_context or not gp.autoplay:
            return
        added = False
        for rec in recs:
            vid = rec.get("video_id", "")
            if not vid:
                continue
            if (not any(t.video_id == vid for t in gp.history[-10:]) and
                    not any(t.video_id == vid for t in gp.queue) and
                    (not gp.current or gp.current.video_id != vid)):
                new_track = Track(**{k: rec[k] for k in Track.__dataclass_fields__ if k in rec})
                gp.queue.append(new_track)
                added = True
        if added:
            await gp.broadcast("queue_updated")
            asyncio.create_task(_prefetch_next_stream(guild_id))
    except Exception:
        pass
    finally:
        gp._prefetching_recs = False


async def _gather_recs_for_seeds(
    seed_ids: list,
    playlist_vids: set,
    history_vids: set,
    cap: int = 50,
) -> list:
    """Fetch recommendations for multiple seeds CONCURRENTLY and deduplicate.

    Uses asyncio.gather so all yt-dlp calls run in parallel — fetching 10 seeds
    takes ~the same time as 1 instead of 10× sequential.
    """
    results = await asyncio.gather(
        *[get_recommendations(sid, max_results=50) for sid in seed_ids],
        return_exceptions=True,
    )
    seen: set = set()
    pool: list = []
    for batch in results:
        if isinstance(batch, Exception):
            continue
        for rec in batch:
            vid = rec.get("video_id", "")
            if not vid or vid in seen:
                continue
            if vid in history_vids:
                continue
            if vid in playlist_vids:
                continue
            seen.add(vid)
            pool.append(rec)
    random.shuffle(pool)
    return pool[:cap]


async def _prefetch_playlist_end_extend(guild_id: str):
    """Pre-fetch end-of-playlist recommendations while the LAST song is still playing.

    Triggered when play_track() detects playlist_context=True and queue is empty
    (meaning the last playlist track just started). Runs concurrently in the
    background so recommendations are queued before the song ends, ensuring
    seamless continuous playback with no stop gap.
    """
    gp = player_manager.get(guild_id)
    if not gp.playlist_context or not gp.playlist_seed_ids or not gp.autoplay:
        return
    if gp._prefetching_recs:
        return  # Already in progress

    gp._prefetching_recs = True
    try:
        k = min(max(1, len(gp.playlist_seed_ids) // 2), 10)
        seed_ids = random.sample(gp.playlist_seed_ids, k)
        playlist_vids = set(gp.playlist_seed_ids)
        history_vids = {t.video_id for t in gp.history[-20:]}

        print(f"[PlaylistExtend] Pre-fetching with {k} seeds (concurrent)…", flush=True)
        pool = await _gather_recs_for_seeds(seed_ids, playlist_vids, history_vids)

        # Re-check after the awaits: user may have switched away from the playlist.
        if not gp.playlist_context or not gp.autoplay:
            return

        if pool:
            for rec in pool:
                new_track = Track(**{k: rec[k] for k in Track.__dataclass_fields__ if k in rec})
                gp.queue.append(new_track)
            # Curated playlist is done — switch to radio mode for future _on_song_end calls.
            gp.playlist_context = False
            gp.playlist_seed_ids = []
            await gp.broadcast("queue_updated")
            print(f"[PlaylistExtend] Pre-fetched {len(pool)} tracks — queue ready.", flush=True)
        else:
            print("[PlaylistExtend] No recommendations found.", flush=True)
    except Exception as e:
        print(f"[PlaylistExtend] Error: {e}", flush=True)
    finally:
        gp._prefetching_recs = False


async def _on_song_end(guild_id: str):
    gp = player_manager.get(guild_id)
    current_title = gp.current.title[:30] if gp.current else "None"
    print(f"[SongEnd] Running, current={current_title}, queue_len={len(gp.queue)}", flush=True)

    old_track = gp.current
    if old_track:
        gp.history.append(old_track)
        if len(gp.history) > 50:
            gp.history.pop(0)

    # Clear current BEFORE calling play_track so it won't double-add to history
    gp.current = None

    next_track = gp.pop_next()

    if next_track:
        try:
            await play_track(guild_id, next_track)
        except Exception as e:
            print(f"[Bot] Error playing next track: {e}")
            await gp.broadcast("stopped")
            asyncio.create_task(send_owner_dm(
                f"⚠️ **[PLAYBACK ERROR]**\n"
                f"Failed to play next track.\n"
                f"Error: {str(e)[:200]}"
            ))
    elif gp.autoplay and (old_track or gp.playlist_seed_ids):
        # Queue empty — need recommendations to continue.
        #
        # Happy path: _prefetch_playlist_end_extend already started while the
        # last song was playing. If it's still in-flight, wait for it so we
        # don't duplicate work. This is what gives seamless gapless playback.
        if gp._prefetching_recs:
            print("[SongEnd] Pre-fetch in progress — waiting up to 20s…", flush=True)
            for _ in range(40):  # 40 × 0.5 s = 20 s max
                await asyncio.sleep(0.5)
                if not gp._prefetching_recs:
                    break
            next_track = gp.pop_next()
            if next_track:
                await play_track(guild_id, next_track)
            else:
                await gp.broadcast("stopped")
            return

        # Safety-net / fallback: pre-fetch wasn't triggered or failed
        # (e.g. a very short last track). Do the multi-seed fetch now.
        if gp.playlist_context and gp.playlist_seed_ids:
            k = min(max(1, len(gp.playlist_seed_ids) // 2), 10)
            seed_ids = random.sample(gp.playlist_seed_ids, k)
            playlist_vids = set(gp.playlist_seed_ids)
        else:
            seed_ids = [old_track.video_id] if old_track else []
            playlist_vids = set()

        history_vids = {t.video_id for t in gp.history[-20:]}
        pool = await _gather_recs_for_seeds(seed_ids, playlist_vids, history_vids)

        for rec in pool:
            new_track = Track(**{k: rec[k] for k in Track.__dataclass_fields__ if k in rec})
            gp.queue.append(new_track)

        # Done with curated playlist — switch to regular radio mode.
        gp.playlist_context = False
        gp.playlist_seed_ids = []

        next_track = gp.pop_next()
        if next_track:
            await play_track(guild_id, next_track)
        else:
            await gp.broadcast("stopped")
    else:
        await gp.broadcast("stopped")


async def join_channel(guild_id: str, channel_id: str) -> tuple[bool, str]:
    guild = bot.get_guild(int(guild_id))
    if not guild:
        return False, "Bot cannot see this server. Try kicking and re-inviting the bot."

    channel = guild.get_channel(int(channel_id))
    if not channel:
        return False, f"Channel not found (id={channel_id})"

    if not isinstance(channel, (discord.VoiceChannel, discord.StageChannel)):
        return False, f"'{channel.name}' is not a voice channel (type: {type(channel).__name__})"

    gp = player_manager.get(guild_id)

    # Check bot permissions in the channel before attempting to connect
    bot_member = guild.get_member(bot.user.id)
    if bot_member:
        perms = channel.permissions_for(bot_member)
        if not perms.connect:
            return False, f"Bot is missing the 'Connect' permission in #{channel.name}. Go to Discord server settings → {channel.name} → Edit Channel → Permissions and allow the bot to Connect."
        if not perms.speak:
            return False, f"Bot is missing the 'Speak' permission in #{channel.name}. Go to Discord server settings → {channel.name} → Edit Channel → Permissions and allow the bot to Speak."

    try:
        # Ensure we're starting clean for this guild
        if gp.voice_client:
            try:
                await gp.voice_client.disconnect(force=True)
            except Exception:
                pass
            gp.voice_client = None

        # Let Discord know we're leaving any current voice state
        await guild.change_voice_state(channel=None)
        await asyncio.sleep(1.0)

        gp.voice_client = await channel.connect(timeout=30.0, reconnect=True)
        gp.last_voice_channel_id = channel_id
        gp.intentional_disconnect = False
        await gp.broadcast("voice_updated")
        return True, "ok"
    except discord.errors.ConnectionClosed as e:
        gp.voice_client = None
        return False, f"Discord rejected the voice connection (code {e.code}). Make sure the bot has Connect + Speak permissions."
    except discord.errors.ClientException as e:
        gp.voice_client = None
        return False, f"Bot client error: {e}"
    except asyncio.TimeoutError:
        gp.voice_client = None
        return False, "TimeoutError: Discord did not respond to the voice join request in time. This usually means:\n1. The bot is stuck in a voice state — try kicking it from all channels in Discord and retrying.\n2. Or a network/firewall issue is blocking Discord UDP (ports 50000-65535)."
    except Exception as e:
        gp.voice_client = None
        return False, f"{type(e).__name__}: {e}"


async def pause(guild_id: str):
    gp = player_manager.get(guild_id)
    if gp.voice_client and gp.voice_client.is_playing():
        gp.voice_client.pause()
        gp.is_paused = True
        await gp.broadcast("paused")


async def resume(guild_id: str):
    gp = player_manager.get(guild_id)
    if gp.voice_client and gp.voice_client.is_paused():
        gp.voice_client.resume()
        gp.is_paused = False
        await gp.broadcast("resumed")


async def skip(guild_id: str):
    gp = player_manager.get(guild_id)
    if not gp.voice_client:
        print(f"[Skip] No voice client", flush=True)
        return
    playing = gp.voice_client.is_playing()
    paused = gp.voice_client.is_paused()
    connected = gp.voice_client.is_connected()
    current_title = gp.current.title[:30] if gp.current else "None"
    print(f"[Skip] is_playing={playing} is_paused={paused} connected={connected} current={current_title}", flush=True)
    if playing or paused:
        gp.voice_client.stop()
        print(f"[Skip] Called stop()", flush=True)
    elif gp.current:
        print(f"[Skip] Creating _on_song_end task (broken state)", flush=True)
        asyncio.create_task(_on_song_end(guild_id))


async def previous(guild_id: str):
    gp = player_manager.get(guild_id)
    prev_track = gp.go_previous()
    if prev_track:
        await play_track(guild_id, prev_track)


async def set_volume(guild_id: str, volume: float):
    gp = player_manager.get(guild_id)
    gp.volume = max(0.0, min(2.0, volume))
    if gp.voice_client and gp.voice_client.source:
        gp.voice_client.source.volume = gp.volume
    await gp.broadcast("volume_changed")


async def stop_and_disconnect(guild_id: str):
    gp = player_manager.get(guild_id)
    if gp.voice_client:
        gp.intentional_disconnect = True
        gp.voice_client.stop()
        await gp.voice_client.disconnect()
        gp.voice_client = None
    gp.current = None
    gp.queue.clear()
    await gp.broadcast("voice_updated")


async def get_voice_channels_async(guild_id: str) -> list[dict]:
    guild = bot.get_guild(int(guild_id))
    if not guild:
        return []
    return [
        {
            "id": str(ch.id),
            "name": ch.name,
            "members": len(ch.members),
            "member_names": [m.display_name for m in ch.members if not m.bot],
            "bitrate": ch.bitrate,
        }
        for ch in guild.voice_channels
    ]


async def get_guilds_async() -> list[dict]:
    return [
        {"id": str(g.id), "name": g.name, "icon": str(g.icon) if g.icon else None}
        for g in bot.guilds
    ]

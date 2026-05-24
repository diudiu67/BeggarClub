import asyncio
import glob
import logging
import time
import uuid
import discord
import discord.opus
from discord.ext import commands
from player import player_manager, Track
from youtube import get_stream_url, get_recommendations
from config import settings

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
    channel_ids = settings.gallery_channel_ids
    if not channel_ids or message.author.bot:
        return
    if message.channel.id not in channel_ids:
        return

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
    """Detect unexpected bot disconnects and automatically rejoin."""
    if member.id != bot.user.id:
        return  # Only care about the bot itself

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


@bot.event
async def on_ready():
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
    """Gateway RESUME carries stale voice session_ids which cause 4006.
    Save current voice state, clear it, then silently rejoin + resume."""
    _vlog.info("on_resumed — saving voice state before clearing")

    # Save which channel each guild was in and what was playing
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
            # Voice client already dropped before on_resumed fired — use saved channel
            _vlog.info(f"  vc already gone, using last_voice_channel_id={gp.last_voice_channel_id}")
            saved[str(guild.id)] = {
                "channel_id": gp.last_voice_channel_id,
                "current": gp.current,
                "started_at": gp.started_at,
            }

    await _clear_all_voice()

    # Rejoin and resume for every guild that was active
    for guild_id, state in saved.items():
        _vlog.info(f"  scheduling rejoin for guild={guild_id} channel={state['channel_id']}")
        asyncio.create_task(_rejoin_and_resume(guild_id, state["channel_id"], state["current"], state["started_at"]))


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

    source = discord.FFmpegPCMAudio(track.stream_url, **FFMPEG_OPTIONS)
    source = discord.PCMVolumeTransformer(source, volume=gp.volume)

    def after_play(error):
        if error:
            print(f"[Bot] Playback error: {error}")
        if gp._play_generation != gen:
            return
        import bot_runner
        asyncio.run_coroutine_threadsafe(_on_song_end(guild_id), bot_runner.get_bot_loop())

    gp.voice_client.play(source, after=after_play)
    await gp.broadcast("now_playing")

    # Keep Up Next topped up: refill whenever queue drops below 10
    if gp.autoplay and len(gp.queue) < 10:
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
        gp.started_at = time.time() - position
        print(f"[Seek] voice_client.play() called, is_playing={gp.voice_client.is_playing()}")
    else:
        source = discord.FFmpegPCMAudio(track.stream_url, **{
            "before_options": "-reconnect 1 -reconnect_delay_max 5",
            "options": "-vn",
        })
        source = discord.PCMVolumeTransformer(source, volume=gp.volume)
        gp.voice_client.play(source, after=make_after_play(gen, "seek@0"))
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
        source = discord.FFmpegPCMAudio(track.stream_url, **FFMPEG_OPTIONS)
        source = discord.PCMVolumeTransformer(source, volume=gp.volume)

        def after_play(error):
            if error:
                print(f"[Bot] Playback error: {error}")
            if gp._play_generation != new_gen:
                return
            import bot_runner
            asyncio.run_coroutine_threadsafe(_on_song_end(guild_id), bot_runner.get_bot_loop())

        gp.voice_client.play(source, after=after_play)
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
        # Queue empty — build a recommendation pool to continue playback.
        if gp.playlist_context and gp.playlist_seed_ids:
            # End of curated playlist: seed from up to half the playlist (capped at 10)
            # so recs are tied to the overall playlist vibe, not just the last song.
            import random as _rand
            k = min(max(1, len(gp.playlist_seed_ids) // 2), 10)
            seed_ids = _rand.sample(gp.playlist_seed_ids, k)
            playlist_vids = set(gp.playlist_seed_ids)
        else:
            seed_ids = [old_track.video_id] if old_track else []
            playlist_vids = set()

        seen_vids: set[str] = set()
        pool: list[dict] = []
        for sid in seed_ids:
            try:
                recs = await get_recommendations(sid, max_results=50)
            except Exception:
                continue
            for rec in recs:
                vid = rec.get("video_id", "")
                if not vid or vid in seen_vids:
                    continue
                if any(t.video_id == vid for t in gp.history[-20:]):
                    continue
                if vid in playlist_vids:
                    # Don't re-add songs the user already has in their playlist
                    continue
                seen_vids.add(vid)
                pool.append(rec)

        import random as _rand2
        _rand2.shuffle(pool)
        for rec in pool[:50]:
            new_track = Track(**{k: rec[k] for k in Track.__dataclass_fields__ if k in rec})
            gp.queue.append(new_track)

        # Done with curated playlist — switch to regular radio mode for future _on_song_end calls.
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
        }
        for ch in guild.voice_channels
    ]


async def get_guilds_async() -> list[dict]:
    return [
        {"id": str(g.id), "name": g.name, "icon": str(g.icon) if g.icon else None}
        for g in bot.guilds
    ]

import asyncio
import glob
import discord
import discord.opus
from discord.ext import commands
from player import player_manager, Track
from youtube import get_stream_url, get_recommendations
from config import settings


def _load_opus():
    if discord.opus.is_loaded():
        return
    # Try common names first (works on most systems)
    for name in ["opus", "libopus", "libopus-0", "libopus.so.0"]:
        try:
            discord.opus.load_opus(name)
            if discord.opus.is_loaded():
                print(f"[Bot] Opus loaded: {name}")
                return
        except Exception:
            continue
    # Windows: look for DLL in common locations
    import sys
    if sys.platform == "win32":
        win_paths = [
            r"C:\Windows\System32\opus.dll",
            r"C:\Windows\System32\libopus-0.dll",
        ]
        for path in win_paths:
            try:
                discord.opus.load_opus(path)
                if discord.opus.is_loaded():
                    print(f"[Bot] Opus loaded from {path}")
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

FFMPEG_OPTIONS = {
    "before_options": "-reconnect 1 -reconnect_streamed 1 -reconnect_delay_max 5",
    "options": "-vn",
}


@bot.event
async def on_ready():
    print(f"[Bot] Logged in as {bot.user} ({bot.user.id})")
    await _clear_all_voice()


@bot.event
async def on_resumed():
    """Gateway RESUME carries stale voice session_ids which cause 4006. Clear them."""
    print("[Bot] Gateway resumed — clearing stale voice state")
    await _clear_all_voice()


async def _clear_all_voice():
    """Disconnect from all voice channels and wipe internal voice client cache."""
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
        track.stream_url = await get_stream_url(track.video_id)

    if gp.voice_client.is_playing():
        gp.voice_client.stop()

    gp.current = track
    gp.is_paused = False

    source = discord.FFmpegPCMAudio(track.stream_url, **FFMPEG_OPTIONS)
    source = discord.PCMVolumeTransformer(source, volume=gp.volume)

    def after_play(error):
        if error:
            print(f"[Bot] Playback error: {error}")
        import bot_runner
        asyncio.run_coroutine_threadsafe(_on_song_end(guild_id), bot_runner.get_bot_loop())

    gp.voice_client.play(source, after=after_play)
    await gp.broadcast("now_playing")


async def _on_song_end(guild_id: str):
    gp = player_manager.get(guild_id)

    if gp.current:
        gp.history.append(gp.current)
        if len(gp.history) > 50:
            gp.history.pop(0)

    next_track = gp.pop_next()

    if next_track:
        await play_track(guild_id, next_track)
    elif gp.autoplay and gp.current:
        # Fetch recommendations based on last played song
        seed_id = gp.current.video_id
        recs = await get_recommendations(seed_id, max_results=5)
        for rec in recs:
            if not any(t.video_id == rec["video_id"] for t in gp.history[-10:]):
                new_track = Track(**{k: rec[k] for k in Track.__dataclass_fields__ if k in rec})
                gp.queue.append(new_track)
        next_track = gp.pop_next()
        if next_track:
            await play_track(guild_id, next_track)
        else:
            gp.current = None
            await gp.broadcast("stopped")
    else:
        gp.current = None
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
    if gp.voice_client and (gp.voice_client.is_playing() or gp.voice_client.is_paused()):
        gp.voice_client.stop()  # triggers after_play -> _on_song_end


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
    await gp.broadcast("volume_changed", {"volume": gp.volume})


async def stop_and_disconnect(guild_id: str):
    gp = player_manager.get(guild_id)
    if gp.voice_client:
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
        {"id": str(ch.id), "name": ch.name, "members": len(ch.members)}
        for ch in guild.voice_channels
    ]


async def get_guilds_async() -> list[dict]:
    return [
        {"id": str(g.id), "name": g.name, "icon": str(g.icon) if g.icon else None}
        for g in bot.guilds
    ]

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from player import player_manager, Track
from youtube import get_video_info, get_stream_url, get_recommendations
import bot as discord_bot
import bot_runner

router = APIRouter(prefix="/player", tags=["player"])


class PlayRequest(BaseModel):
    guild_id: str
    video_id: str
    title: str
    artist: str
    thumbnail: str
    duration: int
    play_now: bool = True
    requested_by: str = ""


class GuildRequest(BaseModel):
    guild_id: str


class VolumeRequest(BaseModel):
    guild_id: str
    volume: float


class SeekRequest(BaseModel):
    guild_id: str
    position: float


class QueueAddRequest(BaseModel):
    guild_id: str
    video_id: str
    title: str
    artist: str
    thumbnail: str
    duration: int
    requested_by: str = ""


class PlayBatchRequest(BaseModel):
    guild_id: str
    tracks: list[QueueAddRequest]


@router.get("/state/{guild_id}")
async def get_state(guild_id: str):
    gp = player_manager.get(guild_id)
    return gp.get_state()


@router.post("/play")
async def play(req: PlayRequest):
    gp = player_manager.get(req.guild_id)

    if not gp.voice_client or not gp.voice_client.is_connected():
        raise HTTPException(
            status_code=400,
            detail="Bot is not in a voice channel. Select a voice channel from the dropdown first."
        )

    track = Track(
        video_id=req.video_id,
        title=req.title,
        artist=req.artist,
        thumbnail=req.thumbnail,
        duration=req.duration,
    )

    try:
        if req.play_now:
            # Discard old queue so autoplay rebuilds around the new song.
            # Also clear playlist context — this is a manual/search/home play, not a curated playlist.
            gp.playlist_context = False
            gp.playlist_seed_ids = []
            gp.queue.clear()
            gp.queue.insert(0, track)
            next_track = gp.pop_next()
            if next_track:
                await bot_runner.run(discord_bot.play_track(req.guild_id, next_track))
        else:
            gp.enqueue(track)
            await gp.broadcast("queue_updated")
    except HTTPException:
        raise
    except Exception as e:
        gp.current = None
        print(f"[Player] play error: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail=f"Playback failed: {type(e).__name__}: {e}")

    return {"ok": True}


@router.post("/queue/add")
async def add_to_queue(req: QueueAddRequest):
    gp = player_manager.get(req.guild_id)
    track = Track(
        video_id=req.video_id,
        title=req.title,
        artist=req.artist,
        thumbnail=req.thumbnail,
        duration=req.duration,
    )
    gp.enqueue(track)
    await gp.broadcast("queue_updated")
    return {"ok": True, "queue_length": len(gp.queue)}


@router.delete("/queue/{guild_id}/{index}")
async def remove_from_queue(guild_id: str, index: int):
    gp = player_manager.get(guild_id)
    if index < 0 or index >= len(gp.queue):
        raise HTTPException(status_code=400, detail="Invalid queue index")
    gp.queue.pop(index)
    await gp.broadcast("queue_updated")
    return {"ok": True}


@router.post("/queue/skip-to")
async def skip_to_queue_index(req: GuildRequest, index: int):
    """Skip to a specific position in the queue without clearing playlist context.

    Drops everything before `index` then skips the current song so
    _on_song_end naturally plays gp.queue[0] (the target track).
    playlist_context is intentionally NOT touched — curated playlist stays intact.
    """
    gp = player_manager.get(req.guild_id)
    if index < 0 or index >= len(gp.queue):
        raise HTTPException(status_code=400, detail="Invalid queue index")
    # Trim everything before the target; target becomes the new head.
    gp.queue = gp.queue[index:]
    await bot_runner.run(discord_bot.skip(req.guild_id))
    return {"ok": True}


@router.post("/pause")
async def pause(req: GuildRequest):
    await bot_runner.run(discord_bot.pause(req.guild_id))
    return {"ok": True}


@router.post("/resume")
async def resume(req: GuildRequest):
    await bot_runner.run(discord_bot.resume(req.guild_id))
    return {"ok": True}


@router.post("/skip")
async def skip(req: GuildRequest):
    await bot_runner.run(discord_bot.skip(req.guild_id))
    return {"ok": True}


@router.post("/previous")
async def previous(req: GuildRequest):
    await bot_runner.run(discord_bot.previous(req.guild_id))
    return {"ok": True}


@router.post("/shuffle")
async def shuffle(req: GuildRequest):
    gp = player_manager.get(req.guild_id)
    gp.shuffle_queue()
    await gp.broadcast("queue_updated")
    return {"ok": True}


@router.post("/autoplay")
async def toggle_autoplay(req: GuildRequest):
    gp = player_manager.get(req.guild_id)
    gp.autoplay = not gp.autoplay
    await gp.broadcast("state_updated")
    return {"autoplay": gp.autoplay}


@router.post("/volume")
async def set_volume(req: VolumeRequest):
    await bot_runner.run(discord_bot.set_volume(req.guild_id, req.volume))
    return {"ok": True}


@router.post("/seek")
async def seek(req: SeekRequest):
    await bot_runner.run(discord_bot.seek_to(req.guild_id, req.position))
    return {"ok": True}


@router.get("/recommendations/{guild_id}")
async def recommendations(guild_id: str):
    gp = player_manager.get(guild_id)
    if not gp.current:
        return {"recommendations": []}
    recs = await get_recommendations(gp.current.video_id, max_results=50)
    return {"recommendations": recs}


@router.get("/history/{guild_id}")
async def get_history(guild_id: str):
    """Return the last 50 tracks played in this guild (most recent first)."""
    gp = player_manager.get(guild_id)
    return {"history": [t.to_dict() for t in reversed(gp.history)]}


@router.post("/play-batch")
async def play_batch(req: PlayBatchRequest):
    """Queue a batch of tracks at once (e.g. Home 'Play all'). Not a playlist context."""
    gp = player_manager.get(req.guild_id)

    if not gp.voice_client or not gp.voice_client.is_connected():
        raise HTTPException(
            status_code=400,
            detail="Bot is not in a voice channel. Select a voice channel from the dropdown first."
        )

    if not req.tracks:
        raise HTTPException(status_code=400, detail="No tracks provided.")

    gp.playlist_context = False
    gp.playlist_seed_ids = []
    gp.queue.clear()

    for t in req.tracks:
        gp.enqueue(Track(
            video_id=t.video_id,
            title=t.title,
            artist=t.artist,
            thumbnail=t.thumbnail,
            duration=t.duration,
            requested_by=t.requested_by,
        ))

    first = gp.pop_next()
    if first:
        try:
            await bot_runner.run(discord_bot.play_track(req.guild_id, first))
        except Exception as e:
            gp.current = None
            raise HTTPException(status_code=500, detail=f"Playback failed: {type(e).__name__}: {e}")

    return {"ok": True, "queued": len(req.tracks)}


@router.post("/stop")
async def stop(req: GuildRequest):
    await bot_runner.run(discord_bot.stop_and_disconnect(req.guild_id))
    return {"ok": True}

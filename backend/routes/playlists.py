from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from pydantic import BaseModel
from database import get_db
from models import Playlist, PlaylistSong
from player import player_manager, Track
import bot as discord_bot
import bot_runner

router = APIRouter(prefix="/playlists", tags=["playlists"])


class CreatePlaylistRequest(BaseModel):
    guild_id: str
    name: str


class AddSongRequest(BaseModel):
    video_id: str
    title: str
    artist: str
    thumbnail: str
    duration: int


class PlayPlaylistRequest(BaseModel):
    guild_id: str
    shuffle: bool = False


@router.get("")
async def list_playlists(guild_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Playlist).where(Playlist.guild_id == guild_id)
    )
    playlists = result.scalars().all()
    return {
        "playlists": [
            {"id": p.id, "name": p.name, "created_at": p.created_at.isoformat()}
            for p in playlists
        ]
    }


@router.post("")
async def create_playlist(req: CreatePlaylistRequest, db: AsyncSession = Depends(get_db)):
    playlist = Playlist(guild_id=req.guild_id, name=req.name)
    db.add(playlist)
    await db.commit()
    await db.refresh(playlist)
    return {"id": playlist.id, "name": playlist.name}


@router.get("/{playlist_id}")
async def get_playlist(playlist_id: int, db: AsyncSession = Depends(get_db)):
    playlist = await db.get(Playlist, playlist_id)
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")

    result = await db.execute(
        select(PlaylistSong)
        .where(PlaylistSong.playlist_id == playlist_id)
        .order_by(PlaylistSong.position)
    )
    songs = result.scalars().all()

    return {
        "id": playlist.id,
        "name": playlist.name,
        "guild_id": playlist.guild_id,
        "songs": [
            {
                "id": s.id,
                "video_id": s.video_id,
                "title": s.title,
                "artist": s.artist,
                "thumbnail": s.thumbnail,
                "duration": s.duration,
                "position": s.position,
            }
            for s in songs
        ],
    }


@router.delete("/{playlist_id}")
async def delete_playlist(playlist_id: int, db: AsyncSession = Depends(get_db)):
    playlist = await db.get(Playlist, playlist_id)
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")
    await db.delete(playlist)
    await db.commit()
    return {"ok": True}


@router.post("/{playlist_id}/songs")
async def add_song(playlist_id: int, req: AddSongRequest, db: AsyncSession = Depends(get_db)):
    playlist = await db.get(Playlist, playlist_id)
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")

    result = await db.execute(
        select(PlaylistSong).where(PlaylistSong.playlist_id == playlist_id)
    )
    count = len(result.scalars().all())

    song = PlaylistSong(
        playlist_id=playlist_id,
        video_id=req.video_id,
        title=req.title,
        artist=req.artist,
        thumbnail=req.thumbnail,
        duration=req.duration,
        position=count,
    )
    db.add(song)
    await db.commit()
    await db.refresh(song)
    return {"id": song.id, "position": song.position}


@router.delete("/{playlist_id}/songs/{song_id}")
async def remove_song(playlist_id: int, song_id: int, db: AsyncSession = Depends(get_db)):
    song = await db.get(PlaylistSong, song_id)
    if not song or song.playlist_id != playlist_id:
        raise HTTPException(status_code=404, detail="Song not found")
    await db.delete(song)
    await db.commit()
    return {"ok": True}


@router.post("/{playlist_id}/play")
async def play_playlist(playlist_id: int, req: PlayPlaylistRequest, db: AsyncSession = Depends(get_db)):
    playlist = await db.get(Playlist, playlist_id)
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")

    result = await db.execute(
        select(PlaylistSong)
        .where(PlaylistSong.playlist_id == playlist_id)
        .order_by(PlaylistSong.position)
    )
    songs = result.scalars().all()
    if not songs:
        raise HTTPException(status_code=400, detail="Playlist is empty")

    gp = player_manager.get(req.guild_id)
    gp.queue.clear()

    tracks = [
        Track(
            video_id=s.video_id,
            title=s.title,
            artist=s.artist,
            thumbnail=s.thumbnail,
            duration=s.duration,
        )
        for s in songs
    ]

    if req.shuffle:
        import random
        random.shuffle(tracks)

    for track in tracks:
        gp.enqueue(track)

    first = gp.pop_next()
    if first:
        await bot_runner.run(discord_bot.play_track(req.guild_id, first))

    return {"ok": True, "queued": len(tracks)}

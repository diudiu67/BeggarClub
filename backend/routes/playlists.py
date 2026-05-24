from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from pydantic import BaseModel
from pathlib import Path
from database import get_db
from models import Playlist, PlaylistSong
from player import player_manager, Track
import bot as discord_bot
import bot_runner
import time

PLAYLIST_ICONS_DIR = Path(__file__).parent.parent / "playlist_icons"
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_ICON_SIZE = 5 * 1024 * 1024  # 5 MB
MAX_PLAYLIST_SIZE = 500  # hard cap on songs per playlist

router = APIRouter(prefix="/playlists", tags=["playlists"])


class CreatePlaylistRequest(BaseModel):
    guild_id: str
    name: str


class UpdatePlaylistRequest(BaseModel):
    name: str | None = None
    icon: str | None = None
    color: str | None = None


class AddSongRequest(BaseModel):
    video_id: str
    title: str
    artist: str
    thumbnail: str
    duration: int


class PlayPlaylistRequest(BaseModel):
    guild_id: str
    shuffle: bool = False
    start_video_id: str | None = None  # if set, slice playlist starting from this song


@router.get("")
async def list_playlists(guild_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Playlist).where(Playlist.guild_id == guild_id)
    )
    playlists = result.scalars().all()
    return {
        "playlists": [
            {"id": p.id, "name": p.name, "icon": p.icon or "🎵", "color": p.color or "red", "created_at": p.created_at.isoformat()}
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
        "icon": playlist.icon or "🎵",
        "color": playlist.color or "red",
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


@router.patch("/{playlist_id}")
async def update_playlist(playlist_id: int, req: UpdatePlaylistRequest, db: AsyncSession = Depends(get_db)):
    playlist = await db.get(Playlist, playlist_id)
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")
    if req.name is not None:
        playlist.name = req.name
    if req.icon is not None:
        playlist.icon = req.icon
    if req.color is not None:
        playlist.color = req.color
    await db.commit()
    return {"ok": True}


@router.post("/{playlist_id}/icon")
async def upload_playlist_icon(playlist_id: int, file: UploadFile = File(...), db: AsyncSession = Depends(get_db)):
    playlist = await db.get(Playlist, playlist_id)
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")

    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, WebP and GIF images are allowed")

    content = await file.read()
    if len(content) > MAX_ICON_SIZE:
        raise HTTPException(status_code=400, detail="Image must be under 5 MB")

    ext = Path(file.filename or "icon.jpg").suffix.lower() or ".jpg"
    filename = f"playlist_{playlist_id}_{int(time.time())}{ext}"
    PLAYLIST_ICONS_DIR.mkdir(exist_ok=True)
    (PLAYLIST_ICONS_DIR / filename).write_bytes(content)

    # Delete old icon file if it was a previous upload
    if playlist.icon and playlist.icon.startswith("/playlist-icons/"):
        old_file = PLAYLIST_ICONS_DIR / playlist.icon.split("/")[-1]
        if old_file.exists():
            old_file.unlink(missing_ok=True)

    url = f"/playlist-icons/{filename}"
    playlist.icon = url
    await db.commit()
    return {"icon_url": url}


@router.post("/{playlist_id}/songs")
async def add_song(playlist_id: int, req: AddSongRequest, db: AsyncSession = Depends(get_db)):
    playlist = await db.get(Playlist, playlist_id)
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")

    result = await db.execute(
        select(PlaylistSong).where(PlaylistSong.playlist_id == playlist_id)
    )
    count = len(result.scalars().all())

    if count >= MAX_PLAYLIST_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"Playlist is full (max {MAX_PLAYLIST_SIZE} songs). Remove songs before adding more."
        )

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

    all_tracks = [
        Track(
            video_id=s.video_id,
            title=s.title,
            artist=s.artist,
            thumbnail=s.thumbnail,
            duration=s.duration,
        )
        for s in songs
    ]

    # Store the full (unshuffled) playlist as seeds for multi-seed auto-extend later.
    seed_ids = [t.video_id for t in all_tracks]

    if req.shuffle:
        import random
        random.shuffle(all_tracks)

    # Slice from start_video_id if provided.
    tracks = all_tracks
    if req.start_video_id:
        idx = next(
            (i for i, t in enumerate(all_tracks) if t.video_id == req.start_video_id),
            None,
        )
        if idx is not None:
            tracks = all_tracks[idx:]

    for track in tracks:
        gp.enqueue(track)

    # Mark playlist context so _prefetch_recs stays silent until the playlist ends.
    gp.playlist_context = True
    gp.playlist_seed_ids = seed_ids

    first = gp.pop_next()
    if first:
        await bot_runner.run(discord_bot.play_track(req.guild_id, first))

    return {"ok": True, "queued": len(tracks)}

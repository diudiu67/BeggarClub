import asyncio
import random
from dataclasses import dataclass, field
from typing import Optional
from fastapi import WebSocket


@dataclass
class Track:
    video_id: str
    title: str
    artist: str
    thumbnail: str
    duration: int
    stream_url: str = ""
    requested_by: str = ""

    def to_dict(self) -> dict:
        return {
            "video_id": self.video_id,
            "title": self.title,
            "artist": self.artist,
            "thumbnail": self.thumbnail,
            "duration": self.duration,
            "requested_by": self.requested_by,
        }


class GuildPlayer:
    def __init__(self, guild_id: str):
        self.guild_id = guild_id
        self.queue: list[Track] = []
        self.history: list[Track] = []
        self.current: Optional[Track] = None
        self.voice_client = None
        self.is_paused: bool = False
        self.autoplay: bool = True
        self.shuffle: bool = False
        self.volume: float = 0.5
        self.started_at: float = 0.0
        self._play_generation: int = 0
        self._prefetching_recs: bool = False
        self.ws_clients: set[WebSocket] = set()
        self._autoplay_fetcher = None

    @property
    def is_playing(self) -> bool:
        return (
            self.voice_client is not None
            and self.voice_client.is_playing()
        )

    def get_state(self) -> dict:
        vc = self.voice_client
        vc_connected = vc is not None and vc.is_connected()
        vc_channel = vc.channel if vc_connected and vc and hasattr(vc, "channel") else None
        return {
            "guild_id": self.guild_id,
            "current": self.current.to_dict() if self.current else None,
            "queue": [t.to_dict() for t in self.queue],
            "is_playing": self.is_playing,
            "is_paused": self.is_paused,
            "autoplay": self.autoplay,
            "shuffle": self.shuffle,
            "volume": self.volume,
            "voice_connected": vc_connected,
            "voice_channel_id": str(vc_channel.id) if vc_channel else None,
            "voice_channel_name": vc_channel.name if vc_channel else None,
            "started_at": self.started_at,
        }

    async def _send_to_all(self, payload: dict):
        dead = set()
        for ws in self.ws_clients:
            try:
                await ws.send_json(payload)
            except Exception:
                dead.add(ws)
        self.ws_clients -= dead

    async def broadcast(self, event: str, data: dict = None):
        if not self.ws_clients:
            return
        payload = {"event": event, "data": data or self.get_state()}

        import bot_runner
        fastapi_loop = bot_runner.get_fastapi_loop()
        try:
            current_loop = asyncio.get_running_loop()
        except RuntimeError:
            current_loop = None

        if fastapi_loop and current_loop is not fastapi_loop:
            # Called from bot's thread — schedule send on FastAPI's loop
            asyncio.run_coroutine_threadsafe(self._send_to_all(payload), fastapi_loop)
        else:
            await self._send_to_all(payload)

    def add_ws_client(self, ws: WebSocket):
        self.ws_clients.add(ws)

    def remove_ws_client(self, ws: WebSocket):
        self.ws_clients.discard(ws)

    def enqueue(self, track: Track):
        self.queue.append(track)

    def enqueue_front(self, track: Track):
        self.queue.insert(0, track)

    def shuffle_queue(self):
        random.shuffle(self.queue)

    def pop_next(self) -> Optional[Track]:
        if not self.queue:
            return None
        return self.queue.pop(0)

    def go_previous(self) -> Optional[Track]:
        if not self.history:
            return None
        track = self.history.pop()
        if self.current:
            self.queue.insert(0, self.current)
            self.current = None  # Clear so play_track won't re-add it to history
        return track


class PlayerManager:
    def __init__(self):
        self._players: dict[str, GuildPlayer] = {}

    def get(self, guild_id: str) -> GuildPlayer:
        if guild_id not in self._players:
            self._players[guild_id] = GuildPlayer(guild_id)
        return self._players[guild_id]

    def all_guild_ids(self) -> list[str]:
        return list(self._players.keys())


player_manager = PlayerManager()

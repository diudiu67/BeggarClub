import asyncio
import re
import yt_dlp
from googleapiclient.discovery import build
from config import settings

YDL_OPTIONS = {
    # Prefer WebM/Opus (itag 251, ~160 kbps) — higher quality than m4a/AAC 128 kbps.
    # WebM is a DASH stream (byte-range URLs) so bot.py uses stream-aware FFmpeg options
    # that omit -reconnect_streamed, which would cause IO error -10054 on DASH segments.
    # Falls back to m4a (itag 140, 128 kbps) if WebM is unavailable (e.g. age-gated).
    "format": (
        "bestaudio[ext=webm]"
        "/bestaudio[ext=m4a]"
        "/bestaudio"
        "/best"
    ),
    "quiet": True,
    "no_warnings": True,
    "source_address": "0.0.0.0",
    "noplaylist": True,
}

FFMPEG_OPTIONS = {
    "before_options": "-reconnect 1 -reconnect_streamed 1 -reconnect_delay_max 5",
    "options": "-vn",
}


def _get_youtube_client():
    return build("youtube", "v3", developerKey=settings.YOUTUBE_API_KEY)


def _extract_stream_url(video_id: str) -> tuple[str, int]:
    """Returns (stream_url, filesize_bytes). filesize may be 0 if unknown."""
    url = f"https://www.youtube.com/watch?v={video_id}"
    for client in [["android"], ["android_vr"], ["tv_embedded"], ["ios"], ["web"]]:
        opts = {
            **YDL_OPTIONS,
            "extractor_args": {"youtube": {"player_client": client}},
        }
        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(url, download=False)
                if "entries" in info:
                    info = info["entries"][0]
                stream_url = info.get("url", "")
                if stream_url:
                    filesize = info.get("filesize") or info.get("filesize_approx") or 0
                    return stream_url, int(filesize)
        except Exception:
            continue
    raise RuntimeError(f"yt-dlp could not extract stream URL for {video_id}")


async def get_stream_url(video_id: str) -> tuple[str, int]:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, _extract_stream_url, video_id)


def _search_ytdlp(query: str, max_results: int) -> list[dict]:
    """yt-dlp based search — no API quota consumed."""
    fetch_n = min(max_results * 3, 50)
    opts = {**YDL_OPTIONS, "extract_flat": True}
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(f"ytsearch{fetch_n}:{query}", download=False)
            results = []
            for e in (info.get("entries") or []):
                vid = e.get("id") or ""
                dur = e.get("duration") or 0
                title = e.get("title") or ""
                if not vid or dur < 60 or "#short" in title.lower():
                    continue
                thumb = e.get("thumbnail") or ""
                if not (isinstance(thumb, str) and thumb.startswith("http")):
                    thumb = f"https://i.ytimg.com/vi/{vid}/mqdefault.jpg"
                results.append({
                    "video_id": vid,
                    "title": title,
                    "artist": e.get("uploader") or e.get("channel") or "",
                    "thumbnail": thumb,
                    "duration": int(dur),
                    "view_count": e.get("view_count"),   # int or None
                    "album": e.get("album"),             # str or None
                })
                if len(results) >= max_results:
                    break
            return results
    except Exception:
        return []


async def search_youtube(query: str, max_results: int = 10) -> list[dict]:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, _search_ytdlp, query, max_results)


async def get_recommendations(video_id: str, max_results: int = 10) -> list[dict]:
    loop = asyncio.get_running_loop()

    def _extract_radio():
        radio_url = f"https://www.youtube.com/watch?v={video_id}&list=RD{video_id}"
        opts = {**YDL_OPTIONS, "noplaylist": False, "playlistend": max_results + 1, "extract_flat": True}
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(radio_url, download=False)
            entries = info.get("entries", [])[1:]
            return [
                {
                    "video_id": e.get("id", ""),
                    "title": e.get("title", "Unknown"),
                    "artist": e.get("uploader") or e.get("channel") or "",
                    "thumbnail": e.get("thumbnail", ""),
                    "duration": e.get("duration") or 0,
                }
                for e in entries[:max_results]
            ]

    try:
        results = await loop.run_in_executor(None, _extract_radio)
        # Ensure every entry has a valid thumbnail URL (flat extraction often returns empty/broken)
        for r in results:
            vid = r.get("video_id", "")
            t = r.get("thumbnail", "")
            if not (isinstance(t, str) and t.startswith("http")) and vid:
                r["thumbnail"] = f"https://i.ytimg.com/vi/{vid}/mqdefault.jpg"
        return results
    except Exception:
        return []


async def get_video_info(video_id: str) -> dict:
    loop = asyncio.get_running_loop()

    def _fetch():
        yt = _get_youtube_client()
        resp = yt.videos().list(part="snippet,contentDetails", id=video_id).execute()
        items = resp.get("items", [])
        if not items:
            return {}
        item = items[0]
        snippet = item["snippet"]
        return {
            "video_id": video_id,
            "title": snippet["title"],
            "artist": snippet["channelTitle"],
            "thumbnail": snippet["thumbnails"].get("medium", {}).get("url", ""),
            "duration": _parse_duration(item["contentDetails"]["duration"]),
        }

    return await loop.run_in_executor(None, _fetch)


def _parse_duration(iso: str) -> int:
    match = re.match(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", iso)
    if not match:
        return 0
    h, m, s = (int(x or 0) for x in match.groups())
    return h * 3600 + m * 60 + s

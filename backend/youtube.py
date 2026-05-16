import asyncio
import json
import tempfile
import os
import urllib.request
import yt_dlp
from googleapiclient.discovery import build
from config import settings

# Fallback services when yt-dlp is blocked by YouTube's IP filter on Railway
_PIPED_INSTANCES = [
    "https://pipedapi.kavin.rocks",
    "https://api.piped.projectsegfau.lt",
    "https://piped-api.garudalinux.org",
    "https://pipedapi.darkness.services",
    "https://api.piped.yt",
]

_INVIDIOUS_INSTANCES = [
    "https://inv.nadeko.net",
    "https://invidious.io.lol",
    "https://yt.artemislena.eu",
    "https://invidious.privacyredirect.com",
    "https://invidious.fdn.fr",
]

YDL_OPTIONS = {
    "format": "bestaudio/best",
    "quiet": True,
    "no_warnings": True,
    "source_address": "0.0.0.0",
    "noplaylist": True,
}

FFMPEG_OPTIONS = {
    "before_options": "-reconnect 1 -reconnect_streamed 1 -reconnect_delay_max 5",
    "options": "-vn",
}

_cookies_path: str | None = None


def _get_cookies_file() -> str | None:
    global _cookies_path
    if _cookies_path and os.path.exists(_cookies_path):
        return _cookies_path
    cookies = settings.YOUTUBE_COOKIES
    if not cookies:
        return None
    cookies = cookies.replace("\r\n", "\n").replace("\r", "\n")
    tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False, newline="\n")
    tmp.write(cookies)
    tmp.close()
    _cookies_path = tmp.name
    return _cookies_path


def _fetch_json(url: str, timeout: int = 6) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read())


def _get_youtube_client():
    return build("youtube", "v3", developerKey=settings.YOUTUBE_API_KEY)


# ---------------------------------------------------------------------------
# Stream URL extraction — four-stage fallback chain
# ---------------------------------------------------------------------------

def _try_ytdlp(video_id: str) -> str:
    url = f"https://www.youtube.com/watch?v={video_id}"
    cookies = _get_cookies_file()
    proxy = settings.YTDLP_PROXY or None
    clients = [["tv_embedded"], ["ios"]] if not cookies else [["web"], ["tv_embedded"]]
    last_err: Exception = RuntimeError("no clients tried")
    for client in clients:
        opts = {
            **YDL_OPTIONS,
            "extractor_args": {"youtube": {"player_client": client}},
        }
        if cookies:
            opts["cookiefile"] = cookies
        if proxy:
            opts["proxy"] = proxy
        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(url, download=False)
                if "entries" in info:
                    info = info["entries"][0]
                stream_url = info.get("url", "")
                if stream_url:
                    return stream_url
        except Exception as e:
            last_err = e
    raise RuntimeError(f"yt-dlp: {last_err}")


def _try_piped(video_id: str) -> str:
    for base in _PIPED_INSTANCES:
        try:
            data = _fetch_json(f"{base}/streams/{video_id}")
            streams = data.get("audioStreams", [])
            if streams:
                url = max(streams, key=lambda s: s.get("bitrate", 0)).get("url", "")
                if url:
                    return url
        except Exception:
            continue
    raise RuntimeError(f"Piped: all instances failed for {video_id}")


def _try_invidious(video_id: str) -> str:
    for base in _INVIDIOUS_INSTANCES:
        try:
            data = _fetch_json(f"{base}/api/v1/videos/{video_id}")
            streams = [f for f in data.get("adaptiveFormats", []) if f.get("type", "").startswith("audio/")]
            if not streams:
                streams = data.get("formatStreams", [])
            if streams:
                url = max(streams, key=lambda f: int(f.get("bitrate", 0))).get("url", "")
                if url:
                    return url
        except Exception:
            continue
    raise RuntimeError(f"Invidious: all instances failed for {video_id}")


def _try_soundcloud(video_id: str) -> str:
    """Last resort: look up song title via YouTube API, search SoundCloud with yt-dlp."""
    try:
        yt = _get_youtube_client()
        resp = yt.videos().list(part="snippet", id=video_id).execute()
        items = resp.get("items", [])
        snippet = items[0]["snippet"] if items else {}
        query = f"{snippet.get('title', '')} {snippet.get('channelTitle', '')}".strip() or video_id
    except Exception as e:
        print(f"[SC] YouTube lookup failed: {e}")
        query = video_id

    print(f"[SC] Searching SoundCloud: {query!r}")
    sc_opts = {
        "format": "bestaudio/best",
        "quiet": False,
        "no_warnings": False,
        "noplaylist": False,
    }
    proxy = settings.YTDLP_PROXY or None
    if proxy:
        sc_opts["proxy"] = proxy
    try:
        with yt_dlp.YoutubeDL(sc_opts) as ydl:
            info = ydl.extract_info(f"scsearch1:{query}", download=False)
            if info and "entries" in info and info["entries"]:
                entry = info["entries"][0]
                stream_url = entry.get("url", "")
                if not stream_url:
                    formats = entry.get("formats", [])
                    if formats:
                        stream_url = max(formats, key=lambda f: f.get("abr") or 0).get("url", "")
                if stream_url:
                    print(f"[SC] Got stream URL for: {entry.get('title', query)!r}")
                    return stream_url
        raise RuntimeError("No stream URL in SoundCloud result")
    except RuntimeError:
        raise
    except Exception as e:
        raise RuntimeError(f"SoundCloud search error: {e}")


async def get_stream_url(video_id: str) -> str:
    loop = asyncio.get_running_loop()
    for fn in (_try_ytdlp, _try_piped, _try_invidious, _try_soundcloud):
        try:
            return await loop.run_in_executor(None, fn, video_id)
        except Exception as e:
            print(f"[stream] {fn.__name__} failed: {e}")
            continue
    raise RuntimeError(f"All stream sources failed for {video_id}")


# ---------------------------------------------------------------------------
# YouTube Data API helpers
# ---------------------------------------------------------------------------

async def search_youtube(query: str, max_results: int = 10) -> list[dict]:
    loop = asyncio.get_running_loop()

    def _search():
        yt = _get_youtube_client()
        response = yt.search().list(
            q=query,
            part="snippet",
            maxResults=max_results,
            type="video",
            videoCategoryId="10",
        ).execute()

        results = []
        for item in response.get("items", []):
            video_id = item["id"]["videoId"]
            snippet = item["snippet"]
            results.append({
                "video_id": video_id,
                "title": snippet["title"],
                "artist": snippet["channelTitle"],
                "thumbnail": snippet["thumbnails"].get("medium", {}).get("url", ""),
                "duration": 0,
            })

        ids = ",".join(r["video_id"] for r in results)
        details = yt.videos().list(part="contentDetails", id=ids).execute()
        dur_map = {}
        for item in details.get("items", []):
            dur_map[item["id"]] = _parse_duration(item["contentDetails"]["duration"])
        for r in results:
            r["duration"] = dur_map.get(r["video_id"], 0)
        return results

    return await loop.run_in_executor(None, _search)


async def get_recommendations(video_id: str, max_results: int = 10) -> list[dict]:
    loop = asyncio.get_running_loop()

    def _extract_radio():
        radio_url = f"https://www.youtube.com/watch?v={video_id}&list=RD{video_id}"
        opts = {**YDL_OPTIONS, "noplaylist": False, "playlistend": max_results + 1, "extract_flat": True}
        cookies = _get_cookies_file()
        if cookies:
            opts["cookiefile"] = cookies
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(radio_url, download=False)
            entries = info.get("entries", [])[1:]
            return [
                {
                    "video_id": e.get("id", ""),
                    "title": e.get("title", "Unknown"),
                    "artist": e.get("uploader", ""),
                    "thumbnail": e.get("thumbnail", ""),
                    "duration": e.get("duration", 0),
                }
                for e in entries[:max_results]
            ]

    try:
        return await loop.run_in_executor(None, _extract_radio)
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
    import re
    match = re.match(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", iso)
    if not match:
        return 0
    h, m, s = (int(x or 0) for x in match.groups())
    return h * 3600 + m * 60 + s

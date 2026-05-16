import asyncio
import tempfile
import os
import yt_dlp
from googleapiclient.discovery import build
from config import settings

YDL_OPTIONS = {
    "format": "bestaudio[ext=webm]/bestaudio[ext=m4a]/bestaudio/best[height<=480]/best",
    "quiet": True,
    "no_warnings": True,
    "source_address": "0.0.0.0",
    "noplaylist": True,
    "ignoreerrors": False,
}

_cookies_path: str | None = None


def _get_cookies_file() -> str | None:
    global _cookies_path
    if _cookies_path and os.path.exists(_cookies_path):
        return _cookies_path
    cookies = settings.YOUTUBE_COOKIES
    if not cookies:
        return None
    # Normalize line endings — Railway may store \r\n
    cookies = cookies.replace("\r\n", "\n").replace("\r", "\n")
    tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False, newline="\n")
    tmp.write(cookies)
    tmp.close()
    _cookies_path = tmp.name
    return _cookies_path

FFMPEG_OPTIONS = {
    "before_options": "-reconnect 1 -reconnect_streamed 1 -reconnect_delay_max 5",
    "options": "-vn",
}


def _get_youtube_client():
    return build("youtube", "v3", developerKey=settings.YOUTUBE_API_KEY)


async def search_youtube(query: str, max_results: int = 10) -> list[dict]:
    loop = asyncio.get_running_loop()

    def _search():
        yt = _get_youtube_client()
        response = yt.search().list(
            q=query,
            part="snippet",
            maxResults=max_results,
            type="video",
            videoCategoryId="10",  # Music category
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

        # Fetch durations in a second call
        ids = ",".join(r["video_id"] for r in results)
        details = yt.videos().list(part="contentDetails", id=ids).execute()
        dur_map = {}
        for item in details.get("items", []):
            dur_map[item["id"]] = _parse_duration(item["contentDetails"]["duration"])

        for r in results:
            r["duration"] = dur_map.get(r["video_id"], 0)

        return results

    return await loop.run_in_executor(None, _search)


async def get_stream_url(video_id: str) -> str:
    loop = asyncio.get_running_loop()

    def _extract():
        url = f"https://www.youtube.com/watch?v={video_id}"
        cookies = _get_cookies_file()

        # Try clients in order of preference
        # With cookies: web (authenticated). Without: tv_embedded, then ios
        clients_to_try = (
            [["web"], ["web_creator"], ["tv_embedded"]]
            if cookies
            else [["tv_embedded"], ["ios"], ["mweb"]]
        )

        last_error: Exception = RuntimeError("no clients tried")
        for clients in clients_to_try:
            opts = {
                **YDL_OPTIONS,
                "extractor_args": {"youtube": {"player_client": clients}},
            }
            if cookies:
                opts["cookiefile"] = cookies
            try:
                with yt_dlp.YoutubeDL(opts) as ydl:
                    info = ydl.extract_info(url, download=False)
                    if "entries" in info:
                        info = info["entries"][0]
                    stream_url = info.get("url")
                    if stream_url:
                        return stream_url
            except Exception as e:
                last_error = e
                continue

        raise RuntimeError(f"yt-dlp failed all clients for {video_id}: {last_error}")

    return await loop.run_in_executor(None, _extract)


async def get_recommendations(video_id: str, max_results: int = 10) -> list[dict]:
    """
    Uses YouTube Music radio mix for recommendations.
    Falls back to yt-dlp related video extraction.
    """
    loop = asyncio.get_running_loop()

    def _extract_radio():
        radio_url = f"https://www.youtube.com/watch?v={video_id}&list=RD{video_id}"
        opts = {**YDL_OPTIONS, "noplaylist": False, "playlistend": max_results + 1, "extract_flat": True}
        cookies = _get_cookies_file()
        if cookies:
            opts["cookiefile"] = cookies
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(radio_url, download=False)
            entries = info.get("entries", [])[1:]  # skip the seed song
            results = []
            for entry in entries[:max_results]:
                results.append({
                    "video_id": entry.get("id", ""),
                    "title": entry.get("title", "Unknown"),
                    "artist": entry.get("uploader", ""),
                    "thumbnail": entry.get("thumbnail", ""),
                    "duration": entry.get("duration", 0),
                })
            return results

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
    """Parse ISO 8601 duration (PT#M#S) to seconds."""
    import re
    match = re.match(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", iso)
    if not match:
        return 0
    h, m, s = (int(x or 0) for x in match.groups())
    return h * 3600 + m * 60 + s

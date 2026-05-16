"""Quick yt-dlp test — run this to check if audio URL extraction works."""
import yt_dlp, sys

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

VIDEO_ID = "dQw4w9WgXcQ"  # Rick Astley — globally accessible test video

CLIENTS = ["tv_embedded", "mweb", "web_embedded"]

base_opts = {
    "format": "bestaudio/best",
    "quiet": True,
    "no_warnings": True,
    "noplaylist": True,
}

print(f"yt-dlp version: {yt_dlp.version.__version__}")
print(f"Testing video: {VIDEO_ID}\n")

for client in CLIENTS:
    opts = {**base_opts, "extractor_args": {"youtube": {"player_client": [client]}}}
    print(f"Trying client: {client} ...", end=" ", flush=True)
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(f"https://www.youtube.com/watch?v={VIDEO_ID}", download=False)
            if "entries" in info:
                info = info["entries"][0]
            url = info.get("url", "")
            if url:
                print(f"OK ({info.get('ext','?')}/{info.get('acodec','?')})")
                print(f"  URL: {url[:80]}...")
                break
            else:
                print("FAIL — no URL in response")
    except Exception as e:
        print(f"FAIL — {type(e).__name__}: {str(e)[:120]}")

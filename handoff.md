# 2026-05-25 — Homepage Genre Refresh

## Goal

Re-curate the homepage genre chips to match listening preferences (CN/Cantonese/JP/KR/EN, no Western R&B/Hip-Hop/Rock).

## What shipped

- **Removed 4 chips:** J-Rock, K-R&B, R&B, Hip-Hop
- **Added 3 chips:** Nightcore, Douyin/TikTok (combined), Indie
- **Net:** 14 → 13 chips; flex-wrap layout adapts (top row 7, bottom row 6)
- **`FEATURED_GENRES` re-indexed:** same 6 picks (Mandopop, K-Pop, J-Pop, Cantopop, Pop, Anime OST) — indices shifted because chips between them were removed
- **New queries** are multi-language and follow the same `official mv` / `single` / year keyword pattern as existing chips so `NON_MUSIC_FILTER` continues to work correctly

## File touched

| File | Change |
|------|--------|
| `frontend/src/pages/Home.tsx` | `GENRES` array (lines 31–46) and `FEATURED_GENRES` indices (lines 48–55) |

## Verification

- Frontend rebuilt cleanly (`npm run build` → 3.17 s, 1644 modules)
- ✅ New chips visible: Nightcore, Douyin/TikTok, Indie
- ✅ Removed chips gone: J-Rock, K-R&B, R&B, Hip-Hop
- ✅ Featured genre blocks below chips still load correctly
- No backend restart needed (frontend-only change)

---

# Previous: Playlist polish (2026-05-22 → 2026-05-25)

# Handoff

## Goal

Polish playlist functionality so curated playlists feel distinct from autoplay radio:

- **Row-click plays from here** — clicking song 15 of 30 plays songs 15→30 and then auto-extends; songs 1–14 are skipped this round.
- **No radio contamination during playlist** — `_prefetch_recs` is fully suppressed while `playlist_context = True`; the queue never grows mid-playlist with YouTube radio recs.
- **Gapless auto-extend at end of playlist** — the moment the last playlist song starts playing, a background task fires to pre-fetch ~50 similar recommendations in parallel (asyncio.gather, up to 10 seeds drawn from half the playlist). By the time the last song ends, the queue is already filled and playback continues without a gap.
- **"Play all" actually queues everything** — Home Quick Picks had a `forEach` that cleared the queue 12 times; now it hits a single `/player/play-batch` endpoint.
- **Skip within playlist doesn't break context** — clicking a song in the "Up Next" panel used to call `/player/play` (clears `playlist_context`); now it calls `/player/queue/skip-to` (trims queue, skips, leaves context intact).
- **500-song playlist cap** — backend enforces a hard limit; frontend surfaces the 400 reason as an alert instead of swallowing it silently.

---

## Current state

All features are shipped. Latest commit: `ed013e4` on `main`.

- Backend is running on `http://localhost:8080` — `GET /health` returns 200.
- Frontend is built (dist is up to date).
- `watchdog.ps1` was deleted and is currently unstaged — this is intentional (the file is no longer used).
- `restart_tracker.json` is untracked — it is a runtime file, ignore it.

---

## Files in play

### Backend

| File | Role |
|------|------|
| `backend/player.py` | Owns `GuildPlayer` state — added `playlist_context: bool`, `playlist_seed_ids: list[str]`, `_prefetching_recs: bool` |
| `backend/routes/playlists.py` | `play_playlist()` sets `playlist_context = True`, seeds `playlist_seed_ids`, supports `start_video_id` slice; `add_song()` enforces 500-song cap |
| `backend/routes/player.py` | `play()` clears `playlist_context`; new `POST /player/queue/skip-to` endpoint; new `POST /player/play-batch` endpoint |
| `backend/bot.py` | `_prefetch_recs` gates on `playlist_context`; new `_gather_recs_for_seeds()` (parallel gather); new `_prefetch_playlist_end_extend()` (fires when last playlist song starts); `_on_song_end` waits for in-flight pre-fetch before doing its own fallback fetch |

### Frontend

| File | Role |
|------|------|
| `frontend/src/lib/api.ts` | Extended `playPlaylist()` with optional `start_video_id`; added `playTracks()` (batch); added `skipToQueueIndex()` |
| `frontend/src/pages/PlaylistPage.tsx` | `handlePlay(track)` now calls `playPlaylist(..., track.video_id)` — slice path; `handleAddSong` surfaces error detail as alert |
| `frontend/src/components/PlayerOverlay.tsx` | `handlePlayUpNext` now calls `skipToQueueIndex()` instead of `playTrack()` |
| `frontend/src/pages/Home.tsx` | Quick Picks "Play all" calls `onPlayTracks(quickPicks)` prop instead of forEach |
| `frontend/src/App.tsx` | Wires `onPlayTracks` prop → `playTracks(selectedGuild.id, tracks)` |

---

## What's changed

1. **`playlist_context` flag + `playlist_seed_ids`** — Added to `GuildPlayer.__init__`. Set to `True`/populated by `play_playlist()`; cleared to `False`/`[]` by `/player/play`, `/player/play-batch`, and at the moment auto-extend completes.

2. **Row-click slice via `start_video_id`** — `PlayPlaylistRequest` gained `start_video_id: str | None`. `play_playlist()` stores all original seed IDs first, then slices the queue from the matching index. Shuffle is applied before slicing so seeds are always the full unshuffled set.

3. **`_prefetch_recs` gates on `playlist_context`** — Returns immediately when `playlist_context` is True, and re-checks after its `await get_recommendations(...)` call in case context was set while it was in-flight.

4. **Pre-fetch fires when last playlist song starts** — In `play_track()`, after queuing the next track: if `playlist_context` and `len(gp.queue) == 0`, spawn `_prefetch_playlist_end_extend()` as an async task.

5. **`_prefetch_playlist_end_extend()`** — New coroutine. Samples `min(len(seed_ids) // 2, 10)` seeds from `playlist_seed_ids`, calls `asyncio.gather(*[get_recommendations(sid) ...])` for all seeds in parallel, dedupes against last-20 history and against the original playlist songs, shuffles, appends up to 50 tracks to the queue, clears `playlist_context`.

6. **`_on_song_end` wait-for-prefetch** — When queue is empty and `_prefetching_recs` is True, waits up to 20 s (0.5 s × 40 polls) for the background task to finish before doing its own fallback fetch. This is the mechanism that makes playback gapless.

7. **`POST /player/queue/skip-to`** — Trims `gp.queue` to `gp.queue[index:]` then calls `discord_bot.skip()`. Does **not** touch `playlist_context`. Replaces the `removeFromQueue` + `playTrack(play_now=True)` pattern that was clearing context.

8. **`POST /player/play-batch`** — Accepts a list of tracks, clears `playlist_context`, bulk-enqueues, pops and plays the first. Used by Home "Play all".

9. **500-song cap** — `MAX_PLAYLIST_SIZE = 500` constant in `routes/playlists.py`. `add_song()` raises HTTP 400 with a human-readable detail when the limit is hit. `PlaylistPage.handleAddSong` surfaces `err.response.data.detail` as an `alert()`.

---

## What's failed

- **512 kbps audio encoder** — Attempted to bump Discord audio quality; Discord caps streams at 128 kbps so the higher bitrate is silently clamped. Not worth revisiting.
- **WebM DASH streams + `-reconnect_streamed 1`** — FFmpeg's `-reconnect_streamed 1` flag breaks WebM byte-range URLs (the DASH format yt-dlp prefers). Had to disable the flag for those formats or switch to the opus/m4a formats. Don't re-add the flag globally.
- **Duplicate FFmpeg `-ar`/`-ac` flags** — Adding quality flags that duplicated what discord.py already passes caused `Invalid option: ar` errors. discord.py owns those flags; don't add them in the options dict.
- **First "re-check after await" fix** — Thought the stale `_prefetch_recs` coroutines were the cause of queue clearing. They weren't. The real cause was `PlayerOverlay.handlePlayUpNext` calling `/player/play` (which clears `playlist_context`). The re-check is still useful as defence-in-depth but was not the root fix.
- **Windows `taskkill /F`** — Silently exits 0 on Python processes without actually killing them. Must use `ctypes.windll.kernel32.TerminateProcess(handle, 1)` to actually stop the backend. See `project_beggarclub.md` for the full restart procedure.

---

## What comes next

~~Smoke test the shipped features before declaring done:~~

All smoke tests passed on 2026-05-25. **This feature set is complete.**

1. ✅ **Row-click slice** — queue shows only songs 3→end, songs 1–2 gone
2. ✅ **End-of-playlist gapless extend** — queue fills with ~50 tracks before last song ends, no gap
3. ✅ **Quick Picks "Play all"** — all 12 tracks queued, first one playing
4. ✅ **500-cap enforcement** — "Playlist is full (max 500 songs)" alert shown correctly
5. ✅ **Home single-click regression** — radio recs fill queue normally, `playlist_context` stays False

Clean-restart procedure: `~/.claude/projects/D--Test/memory/project_beggarclub.md`.

import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  X, Play, Pause, SkipBack, SkipForward,
  Shuffle, Radio, Volume2, Music2, Plus, Loader2,
  ListPlus, Check, Home,
} from "lucide-react";
import type { PlayerState, Track, Playlist } from "../types";
import {
  pausePlayer, resumePlayer, skipTrack, previousTrack,
  shuffleQueue, toggleAutoplay, setVolume, seekTo,
  getRecommendations, playTrack, addToQueue, removeFromQueue,
  addSongToPlaylist,
} from "../lib/api";

interface Props {
  state: PlayerState;
  guildId: string;
  playlists: Playlist[];
  onClose: () => void;
  onRemoveFromQueue: (index: number) => void;
  onRefresh: () => void;
}

type Tab = "upnext" | "lyrics" | "related";
type ViewMode = "song" | "video";

function fmt(secs: number) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function PlayerOverlay({
  state, guildId, playlists, onClose, onRemoveFromQueue, onRefresh,
}: Props) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("upnext");
  const [viewMode, setViewMode] = useState<ViewMode>("song");
  const { current, queue, is_playing, is_paused, autoplay, shuffle, volume } = state;
  const [elapsed, setElapsed] = useState(0);
  const [localVolume, setLocalVolume] = useState(Math.sqrt(volume));
  const [seekDrag, setSeekDrag] = useState<number | null>(null);
  const [related, setRelated] = useState<Track[]>([]);
  const [relatedLoading, setRelatedLoading] = useState(false);
  const [showPlaylistMenu, setShowPlaylistMenu] = useState(false);
  const [addedToPlaylist, setAddedToPlaylist] = useState<number | null>(null);
  const playlistMenuRef = useRef<HTMLDivElement>(null);

  // Always-fresh ref so the YT sync interval can read current bot state
  const botStateRef = useRef({ is_playing, is_paused, started_at: state.started_at });
  useEffect(() => {
    botStateRef.current = { is_playing, is_paused, started_at: state.started_at };
  });

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (playlistMenuRef.current && !playlistMenuRef.current.contains(e.target as Node))
        setShowPlaylistMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleAddToPlaylist = (playlistId: number) => {
    if (!current) return;
    addSongToPlaylist(playlistId, current)
      .then(() => {
        setAddedToPlaylist(playlistId);
        setShowPlaylistMenu(false);
        setTimeout(() => setAddedToPlaylist(null), 2000);
      })
      .catch(console.error);
  };

  useEffect(() => { setLocalVolume(Math.sqrt(volume)); }, [volume]);

  // Reset to song view on track change
  useEffect(() => { setViewMode("song"); }, [current?.video_id]);

  // YouTube IFrame Player API — muted, synced to bot position
  useEffect(() => {
    if (viewMode !== "video" || !current || !state.started_at) return;

    const startedAt = state.started_at;
    const getBotTime = () => Math.max(0, Math.floor(Date.now() / 1000 - startedAt));

    let player: any = null;
    let syncInterval: ReturnType<typeof setInterval>;

    const createPlayer = () => {
      if (!document.getElementById("yt-video-player")) return;
      player = new (window as any).YT.Player("yt-video-player", {
        videoId: current.video_id,
        playerVars: { autoplay: 1, mute: 1, start: getBotTime(), rel: 0, controls: 1 },
        events: {
          onReady: (event: any) => {
            event.target.seekTo(getBotTime(), true);
            event.target.playVideo();
            // Re-sync every 3 s to prevent drift
            syncInterval = setInterval(() => {
              try {
                const { is_playing: playing, is_paused: paused, started_at: sa } = botStateRef.current;
                const botTime = sa ? Math.max(0, Math.floor(Date.now() / 1000 - sa)) : 0;
                const ytState = event.target.getPlayerState(); // 1=playing 2=paused
                if (!playing || paused) {
                  if (ytState === 1) event.target.pauseVideo();
                } else {
                  if (ytState !== 1) event.target.playVideo();
                  if (Math.abs(event.target.getCurrentTime() - botTime) > 2)
                    event.target.seekTo(botTime, true);
                }
              } catch (_) {}
            }, 3000);
          },
        },
      });
    };

    if ((window as any).YT?.Player) {
      createPlayer();
    } else {
      if (!document.getElementById("yt-iframe-api")) {
        const s = document.createElement("script");
        s.id = "yt-iframe-api";
        s.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(s);
      }
      (window as any).onYouTubeIframeAPIReady = createPlayer;
    }

    return () => {
      clearInterval(syncInterval);
      try { player?.destroy(); } catch (_) {}
    };
  }, [viewMode, current?.video_id]);

  useEffect(() => {
    if (!current || !state.started_at) { setElapsed(0); return; }
    setElapsed(Math.floor(Date.now() / 1000 - (state.started_at ?? 0)));
    if (!is_playing || is_paused) return;
    const id = setInterval(() => {
      setElapsed(Math.floor(Date.now() / 1000 - (state.started_at ?? 0)));
    }, 1000);
    return () => clearInterval(id);
  }, [current?.video_id, state.started_at, is_playing, is_paused]);

  useEffect(() => {
    if (tab !== "related" || !current) return;
    setRelatedLoading(true);
    getRecommendations(guildId)
      .then(setRelated)
      .catch(() => setRelated([]))
      .finally(() => setRelatedLoading(false));
  }, [tab, current?.video_id]);

  const displayElapsed = seekDrag !== null
    ? seekDrag
    : current ? Math.min(elapsed, current.duration) : 0;

  const handle = (fn: () => Promise<unknown>) => () => fn().then(onRefresh).catch(console.error);

  const handleSkip = () => skipTrack(guildId).catch(console.error);
  const handlePrev = () => previousTrack(guildId).catch(console.error);

  const handlePlayUpNext = (track: Track, index: number) => {
    removeFromQueue(guildId, index)
      .then(() => playTrack(guildId, track, true))
      .then(onRefresh)
      .catch(console.error);
  };

  const handleVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setLocalVolume(v);
    setVolume(guildId, v * v).catch(console.error);
  };

  const handleSeekRelease = (e: React.MouseEvent<HTMLInputElement> | React.TouchEvent<HTMLInputElement>) => {
    const pos = parseFloat((e.currentTarget as HTMLInputElement).value);
    setSeekDrag(null);
    seekTo(guildId, pos).catch(console.error);
  };

  const handlePlayRelated = (track: Track) => {
    playTrack(guildId, track, true).then(onRefresh).catch(console.error);
  };

  const handleQueueRelated = (track: Track) => {
    addToQueue(guildId, track).then(onRefresh).catch(console.error);
  };

  return (
    <div className="fixed inset-0 z-50 bg-yt-bg flex flex-col" style={{ bottom: "5rem" }}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-yt-border flex-shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={() => { onClose(); navigate("/"); }}
            className="text-yt-muted hover:text-yt-text transition-colors"
            title="Home"
          >
            <Home size={20} />
          </button>
          <div className="flex gap-6 text-sm font-medium">
            <button
              onClick={() => setViewMode("song")}
              className={`pb-1 transition-colors ${viewMode === "song" ? "text-yt-text border-b-2 border-yt-text" : "text-yt-muted hover:text-yt-text"}`}
            >
              Song
            </button>
            <button
              onClick={() => setViewMode("video")}
              className={`pb-1 transition-colors ${viewMode === "video" ? "text-yt-text border-b-2 border-yt-text" : "text-yt-muted hover:text-yt-text"}`}
            >
              Video
            </button>
          </div>
        </div>
        <button onClick={onClose} className="text-yt-muted hover:text-yt-text transition-colors">
          <X size={20} />
        </button>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left — album art + controls */}
        <div className="flex-1 flex flex-col items-center justify-center gap-6 px-8">
          {current ? (
            <>
              {viewMode === "video" ? (
                <>
                  <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl bg-black">
                    {/* 16:9 container — YT API fills the inner div with an iframe */}
                    <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
                      <div id="yt-video-player" className="absolute inset-0 w-full h-full" />
                    </div>
                  </div>
                  <p className="text-center text-xs text-gray-400 mt-2">
                    🔇 Muted — audio playing through Discord
                  </p>
                </>
              ) : (
                <img
                  src={current.thumbnail}
                  alt={current.title}
                  className="w-72 h-72 rounded-2xl object-cover shadow-2xl bg-yt-elevated"
                />
              )}
              <div className="text-center">
                <p className="text-xl font-bold text-yt-text truncate max-w-xs">{current.title}</p>
                <p className="text-sm text-yt-muted mt-1">{current.artist}</p>
                <div className="flex justify-center mt-3">
                  <div ref={playlistMenuRef} className="relative">
                    <button
                      onClick={() => setShowPlaylistMenu((v) => !v)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        addedToPlaylist !== null
                          ? "border-green-500 text-green-500"
                          : "border-yt-border text-yt-muted hover:text-yt-text hover:border-yt-text"
                      }`}
                      title="Add to playlist"
                    >
                      {addedToPlaylist !== null ? (
                        <><Check size={13} /> Added</>
                      ) : (
                        <><ListPlus size={13} /> Add to playlist</>
                      )}
                    </button>
                    {showPlaylistMenu && (
                      <div className="absolute z-20 left-1/2 -translate-x-1/2 bottom-full mb-2 bg-yt-bg border border-yt-border rounded-xl shadow-2xl py-1 min-w-48">
                        <p className="text-xs text-yt-muted px-3 py-1.5 border-b border-yt-border">Save to playlist</p>
                        {playlists.length === 0 ? (
                          <p className="text-xs text-yt-muted px-3 py-3 text-center">No playlists yet</p>
                        ) : (
                          playlists.map((pl) => (
                            <button
                              key={pl.id}
                              onClick={() => handleAddToPlaylist(pl.id)}
                              className="w-full text-left px-3 py-2 text-sm text-yt-text hover:bg-yt-elevated transition-colors"
                            >
                              {pl.name}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-6">
                <button
                  onClick={handle(() => shuffleQueue(guildId))}
                  className={`transition-colors ${shuffle ? "text-yt-red" : "text-yt-muted hover:text-yt-text"}`}
                  title="Shuffle"
                >
                  <Shuffle size={20} />
                </button>
                <button onClick={handlePrev} className="text-yt-muted hover:text-yt-text transition-colors">
                  <SkipBack size={26} />
                </button>
                <button
                  onClick={
                    is_paused
                      ? handle(() => resumePlayer(guildId))
                      : handle(() => pausePlayer(guildId))
                  }
                  className="w-14 h-14 rounded-full bg-gray-900 flex items-center justify-center hover:bg-gray-700 transition-colors"
                >
                  {is_playing && !is_paused ? (
                    <Pause size={24} fill="white" className="text-white" />
                  ) : (
                    <Play size={24} fill="white" className="text-white ml-0.5" />
                  )}
                </button>
                <button onClick={handleSkip} className="text-yt-muted hover:text-yt-text transition-colors">
                  <SkipForward size={26} />
                </button>
                <button
                  onClick={handle(() => toggleAutoplay(guildId))}
                  className={`transition-colors ${autoplay ? "text-yt-red" : "text-yt-muted hover:text-yt-text"}`}
                  title="Autoplay"
                >
                  <Radio size={20} />
                </button>
              </div>

              {/* Seekable progress bar */}
              <div className="flex items-center gap-2 w-full max-w-xs">
                <span className="text-xs text-yt-muted w-8 text-right">{fmt(displayElapsed)}</span>
                <input
                  type="range"
                  min="0"
                  max={current.duration}
                  step="1"
                  value={displayElapsed}
                  onChange={(e) => setSeekDrag(parseFloat(e.target.value))}
                  onMouseUp={handleSeekRelease}
                  onTouchEnd={handleSeekRelease}
                  className="flex-1 h-1 cursor-pointer"
                  style={{ accentColor: "#ff0033" }}
                />
                <span className="text-xs text-yt-muted w-8">{fmt(current.duration)}</span>
              </div>

              {/* Volume */}
              <div className="flex items-center gap-2">
                <Volume2 size={16} className="text-yt-muted" />
                <input
                  type="range" min="0" max="1" step="0.05"
                  value={localVolume}
                  onChange={handleVolume}
                  className="w-28"
                  style={{ accentColor: "#ff0033" }}
                />
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-4 text-yt-muted">
              <Music2 size={64} className="opacity-20" />
              <p className="text-sm">Nothing playing</p>
            </div>
          )}
        </div>

        {/* Right — queue / related panel */}
        <div className="w-96 flex-shrink-0 border-l border-yt-border flex flex-col">
          {/* Tabs */}
          <div className="flex border-b border-yt-border flex-shrink-0">
            {(["upnext", "lyrics", "related"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-3 text-xs font-semibold uppercase tracking-wider transition-colors ${
                  tab === t
                    ? "text-yt-text border-b-2 border-yt-text"
                    : "text-yt-muted hover:text-yt-text"
                }`}
              >
                {t === "upnext" ? "Up Next" : t === "lyrics" ? "Lyrics" : "Related"}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto">
            {tab === "upnext" && (
              queue.length === 0 ? (
                <p className="text-sm text-yt-muted text-center mt-10 px-4">Queue is empty</p>
              ) : (
                <ul className="p-3 space-y-1">
                  {queue.map((track, i) => (
                    <li
                      key={`${track.video_id}-${i}`}
                      onClick={() => handlePlayUpNext(track, i)}
                      className="group flex items-center gap-3 p-2 rounded-lg hover:bg-yt-elevated transition-colors cursor-pointer"
                    >
                      <img
                        src={track.thumbnail || `https://i.ytimg.com/vi/${track.video_id}/mqdefault.jpg`}
                        alt=""
                        className="w-10 h-10 rounded object-cover flex-shrink-0 bg-yt-elevated"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src =
                            `https://i.ytimg.com/vi/${track.video_id}/mqdefault.jpg`;
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-yt-text truncate">{track.title}</p>
                        <p className="text-xs text-yt-muted truncate">{track.artist}</p>
                      </div>
                      <span className="text-xs text-yt-muted flex-shrink-0">{fmt(track.duration)}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); onRemoveFromQueue(i); }}
                        className="text-yt-muted hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
                      >
                        <X size={13} />
                      </button>
                    </li>
                  ))}
                </ul>
              )
            )}

            {tab === "lyrics" && (
              <div className="flex items-center justify-center h-full text-yt-muted text-sm">
                Lyrics not available
              </div>
            )}

            {tab === "related" && (
              relatedLoading ? (
                <div className="flex items-center justify-center h-full gap-2 text-yt-muted text-sm">
                  <Loader2 size={16} className="animate-spin" /> Loading...
                </div>
              ) : related.length === 0 ? (
                <p className="text-sm text-yt-muted text-center mt-10 px-4">No related songs found</p>
              ) : (
                <ul className="p-3 space-y-1">
                  {related.map((track, i) => (
                    <li
                      key={`${track.video_id}-${i}`}
                      className="group flex items-center gap-3 p-2 rounded-lg hover:bg-yt-elevated transition-colors"
                    >
                      <img
                        src={track.thumbnail || `https://i.ytimg.com/vi/${track.video_id}/mqdefault.jpg`}
                        alt=""
                        className="w-10 h-10 rounded object-cover flex-shrink-0 bg-yt-elevated"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src =
                            `https://i.ytimg.com/vi/${track.video_id}/mqdefault.jpg`;
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-yt-text truncate">{track.title}</p>
                        <p className="text-xs text-yt-muted truncate">{track.artist}</p>
                      </div>
                      {track.duration > 0 && (
                        <span className="text-xs text-yt-muted flex-shrink-0">{fmt(track.duration)}</span>
                      )}
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0">
                        <button
                          onClick={() => handlePlayRelated(track)}
                          title="Play now"
                          className="p-1 rounded text-yt-muted hover:text-yt-text transition-colors"
                        >
                          <Play size={13} fill="currentColor" />
                        </button>
                        <button
                          onClick={() => handleQueueRelated(track)}
                          title="Add to queue"
                          className="p-1 rounded text-yt-muted hover:text-yt-text transition-colors"
                        >
                          <Plus size={13} />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

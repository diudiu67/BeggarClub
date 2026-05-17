import { useState, useEffect } from "react";
import {
  X, Play, Pause, SkipBack, SkipForward,
  Shuffle, Infinity, Volume2, Music2,
} from "lucide-react";
import type { PlayerState } from "../types";
import {
  pausePlayer, resumePlayer, skipTrack, previousTrack,
  shuffleQueue, toggleAutoplay, setVolume,
} from "../lib/api";

interface Props {
  state: PlayerState;
  guildId: string;
  onClose: () => void;
  onRemoveFromQueue: (index: number) => void;
  onRefresh: () => void;
}

type Tab = "upnext" | "lyrics" | "related";

function fmt(secs: number) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function PlayerOverlay({
  state, guildId, onClose, onRemoveFromQueue, onRefresh,
}: Props) {
  const [tab, setTab] = useState<Tab>("upnext");
  const { current, queue, is_playing, is_paused, autoplay, shuffle, volume } = state;
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!current || !state.started_at) { setElapsed(0); return; }
    setElapsed(Math.floor(Date.now() / 1000 - (state.started_at ?? 0)));
    if (!is_playing || is_paused) return;
    const id = setInterval(() => {
      setElapsed(Math.floor(Date.now() / 1000 - (state.started_at ?? 0)));
    }, 1000);
    return () => clearInterval(id);
  }, [current?.video_id, state.started_at, is_playing, is_paused]);

  const progress = current ? Math.min((elapsed / current.duration) * 100, 100) : 0;

  const handle = (fn: () => Promise<unknown>) => () => fn().then(onRefresh).catch(console.error);

  const handleVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    setVolume(guildId, parseFloat(e.target.value)).catch(console.error);
  };

  return (
    <div className="fixed inset-0 z-50 bg-yt-bg flex flex-col" style={{ bottom: "5rem" }}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-yt-border flex-shrink-0">
        <div className="flex gap-6 text-sm font-medium">
          <button className="text-white border-b-2 border-white pb-1">Song</button>
          <button className="text-yt-muted hover:text-white pb-1">Video</button>
        </div>
        <button onClick={onClose} className="text-yt-muted hover:text-white transition-colors">
          <X size={20} />
        </button>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left — album art + controls */}
        <div className="flex-1 flex flex-col items-center justify-center gap-6 px-8">
          {current ? (
            <>
              <img
                src={current.thumbnail}
                alt={current.title}
                className="w-72 h-72 rounded-2xl object-cover shadow-2xl bg-yt-elevated"
              />
              <div className="text-center">
                <p className="text-xl font-bold text-white truncate max-w-xs">{current.title}</p>
                <p className="text-sm text-yt-muted mt-1">{current.artist}</p>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-6">
                <button
                  onClick={handle(() => shuffleQueue(guildId))}
                  className={`transition-colors ${shuffle ? "text-yt-red" : "text-yt-muted hover:text-white"}`}
                  title="Shuffle"
                >
                  <Shuffle size={20} />
                </button>
                <button
                  onClick={handle(() => previousTrack(guildId))}
                  className="text-yt-muted hover:text-white transition-colors"
                >
                  <SkipBack size={26} />
                </button>
                <button
                  onClick={
                    is_paused
                      ? handle(() => resumePlayer(guildId))
                      : handle(() => pausePlayer(guildId))
                  }
                  className="w-14 h-14 rounded-full bg-white flex items-center justify-center hover:bg-gray-200 transition-colors"
                >
                  {is_playing && !is_paused ? (
                    <Pause size={24} fill="black" className="text-black" />
                  ) : (
                    <Play size={24} fill="black" className="text-black ml-0.5" />
                  )}
                </button>
                <button
                  onClick={handle(() => skipTrack(guildId))}
                  className="text-yt-muted hover:text-white transition-colors"
                >
                  <SkipForward size={26} />
                </button>
                <button
                  onClick={handle(() => toggleAutoplay(guildId))}
                  className={`transition-colors ${autoplay ? "text-yt-red" : "text-yt-muted hover:text-white"}`}
                  title="Autoplay"
                >
                  <Infinity size={20} />
                </button>
              </div>

              {/* Progress bar */}
              <div className="flex items-center gap-2 w-full max-w-xs">
                <span className="text-xs text-yt-muted w-8 text-right">{fmt(Math.min(elapsed, current.duration))}</span>
                <div className="flex-1 h-1 bg-yt-border rounded-full">
                  <div className="h-full bg-yt-red rounded-full transition-all duration-1000" style={{ width: `${progress}%` }} />
                </div>
                <span className="text-xs text-yt-muted w-8">{fmt(current.duration)}</span>
              </div>

              {/* Volume */}
              <div className="flex items-center gap-2">
                <Volume2 size={16} className="text-yt-muted" />
                <input
                  type="range" min="0" max="1" step="0.05"
                  value={volume} onChange={handleVolume}
                  className="w-28"
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

        {/* Right — queue panel */}
        <div className="w-96 flex-shrink-0 border-l border-yt-border flex flex-col">
          {/* Tabs */}
          <div className="flex border-b border-yt-border flex-shrink-0">
            {(["upnext", "lyrics", "related"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-3 text-xs font-semibold uppercase tracking-wider transition-colors ${
                  tab === t
                    ? "text-white border-b-2 border-white"
                    : "text-yt-muted hover:text-white"
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
                      className="group flex items-center gap-3 p-2 rounded-lg hover:bg-yt-surface transition-colors"
                    >
                      <img
                        src={track.thumbnail}
                        alt=""
                        className="w-10 h-10 rounded object-cover flex-shrink-0 bg-yt-elevated"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white truncate">{track.title}</p>
                        <p className="text-xs text-yt-muted truncate">{track.artist}</p>
                      </div>
                      <span className="text-xs text-yt-muted flex-shrink-0">{fmt(track.duration)}</span>
                      <button
                        onClick={() => onRemoveFromQueue(i)}
                        className="text-yt-muted hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
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
              <div className="flex items-center justify-center h-full text-yt-muted text-sm">
                Related songs coming soon
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect } from "react";
import {
  Play, Pause, SkipBack, SkipForward, Shuffle, Repeat,
  Volume2, ListMusic, Infinity,
} from "lucide-react";
import type { PlayerState } from "../types";
import {
  pausePlayer, resumePlayer, skipTrack, previousTrack,
  shuffleQueue, toggleAutoplay, setVolume,
} from "../lib/api";

interface Props {
  state: PlayerState;
  guildId: string;
  onToggleQueue: () => void;
  onOpenPlayer: () => void;
  onRefresh: () => void;
}

function formatDuration(secs: number) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function NowPlaying({ state, guildId, onToggleQueue, onOpenPlayer, onRefresh }: Props) {
  const { current, is_playing, is_paused, autoplay, shuffle, volume } = state;
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
    <div className="h-20 flex-shrink-0 bg-yt-surface border-t border-yt-border flex items-center px-4 gap-4">
      {/* Current track info */}
      <div className="flex items-center gap-3 w-64 flex-shrink-0">
        {current ? (
          <>
            <button onClick={onOpenPlayer} className="flex-shrink-0 group relative" title="Open player">
              <img
                src={current.thumbnail}
                alt={current.title}
                className="w-12 h-12 rounded object-cover bg-yt-elevated"
              />
              <div className="absolute inset-0 bg-black/40 rounded opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <span className="text-white text-xs">▲</span>
              </div>
            </button>
            <div className="min-w-0">
              <p className="text-sm font-medium text-white truncate">{current.title}</p>
              <p className="text-xs text-yt-muted truncate">{current.artist}</p>
            </div>
          </>
        ) : (
          <div className="w-12 h-12 rounded bg-yt-elevated flex-shrink-0 flex items-center justify-center text-yt-muted">
            🎵
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex-1 flex flex-col items-center gap-1">
        <div className="flex items-center gap-4">
          {/* Shuffle */}
          <button
            onClick={handle(() => shuffleQueue(guildId))}
            className={`transition-colors ${shuffle ? "text-yt-red" : "text-yt-muted hover:text-white"}`}
            title="Shuffle"
          >
            <Shuffle size={18} />
          </button>

          {/* Previous */}
          <button
            onClick={handle(() => previousTrack(guildId))}
            className="text-yt-muted hover:text-white transition-colors"
          >
            <SkipBack size={22} />
          </button>

          {/* Play / Pause */}
          <button
            onClick={
              is_paused
                ? handle(() => resumePlayer(guildId))
                : handle(() => pausePlayer(guildId))
            }
            className="w-10 h-10 rounded-full bg-white flex items-center justify-center hover:bg-gray-200 transition-colors"
          >
            {is_playing && !is_paused ? (
              <Pause size={20} fill="black" className="text-black" />
            ) : (
              <Play size={20} fill="black" className="text-black ml-0.5" />
            )}
          </button>

          {/* Skip */}
          <button
            onClick={handle(() => skipTrack(guildId))}
            className="text-yt-muted hover:text-white transition-colors"
          >
            <SkipForward size={22} />
          </button>

          {/* Autoplay */}
          <button
            onClick={handle(() => toggleAutoplay(guildId))}
            className={`transition-colors ${autoplay ? "text-yt-red" : "text-yt-muted hover:text-white"}`}
            title={autoplay ? "Autoplay on" : "Autoplay off"}
          >
            <Infinity size={18} />
          </button>
        </div>

        {/* Progress bar */}
        {current && (
          <div className="flex items-center gap-2 w-full max-w-sm">
            <span className="text-xs text-yt-muted w-8 text-right">{formatDuration(Math.min(elapsed, current.duration))}</span>
            <div className="flex-1 h-1 bg-yt-border rounded-full">
              <div className="h-full bg-yt-red rounded-full transition-all duration-1000" style={{ width: `${progress}%` }} />
            </div>
            <span className="text-xs text-yt-muted w-8">{formatDuration(current.duration)}</span>
          </div>
        )}
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-3 w-48 justify-end flex-shrink-0">
        {/* Queue toggle */}
        <button
          onClick={onToggleQueue}
          className="text-yt-muted hover:text-white transition-colors"
          title="Queue"
        >
          <ListMusic size={18} />
        </button>

        {/* Volume */}
        <div className="flex items-center gap-1.5">
          <Volume2 size={16} className="text-yt-muted flex-shrink-0" />
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={volume}
            onChange={handleVolume}
            className="w-20"
          />
        </div>
      </div>
    </div>
  );
}

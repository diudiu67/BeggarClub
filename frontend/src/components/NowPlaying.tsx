import { useState, useEffect } from "react";
import {
  Play, Pause, SkipBack, SkipForward, Shuffle,
  Volume2, ListMusic, Infinity,
} from "lucide-react";
import type { PlayerState } from "../types";
import {
  pausePlayer, resumePlayer, skipTrack, previousTrack,
  shuffleQueue, toggleAutoplay, setVolume, seekTo,
} from "../lib/api";

interface Props {
  state: PlayerState;
  guildId: string;
  onToggleQueue: () => void;
  onOpenPlayer: () => void;
  onRefresh: () => void;
}

function fmt(secs: number) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function NowPlaying({ state, guildId, onToggleQueue, onOpenPlayer, onRefresh }: Props) {
  const { current, is_playing, is_paused, autoplay, shuffle, volume } = state;
  const [elapsed, setElapsed] = useState(0);
  const [localVolume, setLocalVolume] = useState(Math.sqrt(volume));
  const [seekDrag, setSeekDrag] = useState<number | null>(null);

  useEffect(() => { setLocalVolume(Math.sqrt(volume)); }, [volume]);

  useEffect(() => {
    if (!current || !state.started_at) { setElapsed(0); return; }
    setElapsed(Math.floor(Date.now() / 1000 - (state.started_at ?? 0)));
    if (!is_playing || is_paused) return;
    const id = setInterval(() => {
      setElapsed(Math.floor(Date.now() / 1000 - (state.started_at ?? 0)));
    }, 1000);
    return () => clearInterval(id);
  }, [current?.video_id, state.started_at, is_playing, is_paused]);

  const displayElapsed = seekDrag !== null
    ? seekDrag
    : current ? Math.min(elapsed, current.duration) : 0;

  const handle = (fn: () => Promise<unknown>) => () => fn().then(onRefresh).catch(console.error);

  const handleSkip = () => skipTrack(guildId)
    .then(() => setTimeout(onRefresh, 300))
    .catch(console.error);
  const handlePrev = () => previousTrack(guildId)
    .then(() => setTimeout(onRefresh, 300))
    .catch(console.error);

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

  return (
    <div
      className="h-20 flex-shrink-0 bg-gray-900 border-t border-gray-700 flex items-center px-4 gap-4 cursor-pointer"
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button, input")) return;
        onOpenPlayer();
      }}
    >
      {/* Current track info */}
      <div className="flex items-center gap-3 w-64 flex-shrink-0">
        {current ? (
          <>
            <div className="flex-shrink-0 relative group">
              <img
                src={current.thumbnail}
                alt={current.title}
                className="w-12 h-12 rounded object-cover bg-gray-800"
              />
              <div className="absolute inset-0 bg-black/30 rounded opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <span className="text-white text-xs">▲</span>
              </div>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-100 truncate">{current.title}</p>
              <p className="text-xs text-gray-400 truncate">{current.artist}</p>
            </div>
          </>
        ) : (
          <div className="w-12 h-12 rounded bg-gray-800 flex-shrink-0 flex items-center justify-center text-gray-600">
            🎵
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex-1 flex flex-col items-center gap-1">
        <div className="flex items-center gap-4">
          <button
            onClick={handle(() => shuffleQueue(guildId))}
            className={`transition-colors ${shuffle ? "text-yellow-500" : "text-gray-500 hover:text-gray-200"}`}
            title="Shuffle"
          >
            <Shuffle size={18} />
          </button>

          <button onClick={handlePrev} className="text-gray-500 hover:text-gray-200 transition-colors">
            <SkipBack size={22} />
          </button>

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

          <button onClick={handleSkip} className="text-gray-500 hover:text-gray-200 transition-colors">
            <SkipForward size={22} />
          </button>

          <button
            onClick={handle(() => toggleAutoplay(guildId))}
            className={`transition-colors ${autoplay ? "text-yellow-500" : "text-gray-500 hover:text-gray-200"}`}
            title={autoplay ? "Autoplay on" : "Autoplay off"}
          >
            <Infinity size={18} />
          </button>
        </div>

        {/* Progress bar */}
        {current && (
          <div className="flex items-center gap-2 w-full max-w-sm">
            <span className="text-xs text-gray-500 w-8 text-right">{fmt(displayElapsed)}</span>
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
              style={{ accentColor: "#D4A437" }}
            />
            <span className="text-xs text-gray-500 w-8">{fmt(current.duration)}</span>
          </div>
        )}
      </div>

      {/* Right controls */}
      <div className="flex items-center gap-3 w-48 justify-end flex-shrink-0">
        <button
          onClick={onToggleQueue}
          className="text-gray-500 hover:text-gray-200 transition-colors"
          title="Queue"
        >
          <ListMusic size={18} />
        </button>

        <div className="flex items-center gap-1.5">
          <Volume2 size={16} className="text-gray-500 flex-shrink-0" />
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={localVolume}
            onChange={handleVolume}
            className="w-20"
            style={{ accentColor: "#D4A437" }}
          />
        </div>
      </div>
    </div>
  );
}

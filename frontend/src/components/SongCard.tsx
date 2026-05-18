import { useState, useRef, useEffect } from "react";
import { Play, Plus, ListPlus, Check } from "lucide-react";
import type { Track, Playlist } from "../types";

interface Props {
  track: Track;
  playlists: Playlist[];
  onPlay: (track: Track) => void;
  onAddToQueue: (track: Track) => void;
  onAddToPlaylist: (track: Track, playlistId: number) => void;
}

function formatDuration(secs: number) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function SongCard({ track, playlists, onPlay, onAddToQueue, onAddToPlaylist }: Props) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [added, setAdded] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node))
        setShowDropdown(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleAddToPlaylist = (playlistId: number) => {
    onAddToPlaylist(track, playlistId);
    setShowDropdown(false);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  return (
    <div className="group flex items-center gap-3 p-2 rounded-lg hover:bg-yt-elevated transition-colors cursor-pointer">
      {/* Thumbnail */}
      <div className="relative w-12 h-12 flex-shrink-0 rounded overflow-hidden bg-yt-elevated">
        {track.thumbnail ? (
          <img src={track.thumbnail} alt={track.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-yt-muted text-xl">🎵</div>
        )}
        <button
          onClick={() => onPlay(track)}
          className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Play size={20} fill="white" className="text-white" />
        </button>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0" onClick={() => onPlay(track)}>
        <p className="text-sm font-medium text-yt-text truncate">{track.title}</p>
        <p className="text-xs text-yt-muted truncate">{track.artist}</p>
      </div>

      {/* Duration */}
      <span className="text-xs text-yt-muted flex-shrink-0">{formatDuration(track.duration)}</span>

      {/* Actions — always visible on mobile, hover-reveal on desktop */}
      <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity flex-shrink-0">
        {/* Add to queue */}
        <button
          onClick={(e) => { e.stopPropagation(); onAddToQueue(track); }}
          title="Add to queue"
          className="p-1.5 rounded-full hover:bg-yt-surface text-yt-muted hover:text-yt-text transition-colors"
        >
          <Plus size={15} />
        </button>

        {/* Add to playlist */}
        {playlists.length > 0 && (
          <div ref={dropdownRef} className="relative">
            <button
              onClick={(e) => { e.stopPropagation(); setShowDropdown((v) => !v); }}
              title="Add to playlist"
              className={`p-1.5 rounded-full hover:bg-yt-surface transition-colors ${
                added
                  ? "text-green-500"
                  : "text-yt-muted hover:text-yt-text"
              }`}
            >
              {added ? <Check size={15} /> : <ListPlus size={15} />}
            </button>

            {showDropdown && (
              <div className="absolute right-0 top-full mt-1 w-44 bg-yt-bg border border-yt-border rounded-lg shadow-xl z-50">
                <p className="text-xs text-yt-muted px-3 py-2 border-b border-yt-border">Save to playlist</p>
                {playlists.map((pl) => (
                  <button
                    key={pl.id}
                    onClick={(e) => { e.stopPropagation(); handleAddToPlaylist(pl.id); }}
                    className="w-full text-left px-3 py-2 text-sm text-yt-text hover:bg-yt-elevated transition-colors"
                  >
                    {pl.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

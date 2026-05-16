import { Play, Plus, ListPlus } from "lucide-react";
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
  return (
    <div className="group flex items-center gap-3 p-2 rounded-lg hover:bg-yt-surface transition-colors cursor-pointer">
      {/* Thumbnail */}
      <div className="relative w-12 h-12 flex-shrink-0 rounded overflow-hidden bg-yt-elevated">
        {track.thumbnail ? (
          <img src={track.thumbnail} alt={track.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-yt-muted text-xl">🎵</div>
        )}
        <button
          onClick={() => onPlay(track)}
          className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Play size={20} fill="white" className="text-white" />
        </button>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0" onClick={() => onPlay(track)}>
        <p className="text-sm font-medium text-white truncate">{track.title}</p>
        <p className="text-xs text-yt-muted truncate">{track.artist}</p>
      </div>

      {/* Duration */}
      <span className="text-xs text-yt-muted flex-shrink-0">{formatDuration(track.duration)}</span>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => { e.stopPropagation(); onAddToQueue(track); }}
          title="Add to queue"
          className="p-1.5 rounded-full hover:bg-yt-elevated text-yt-muted hover:text-white transition-colors"
        >
          <Plus size={15} />
        </button>

        {playlists.length > 0 && (
          <div className="relative group/pl">
            <button
              title="Add to playlist"
              className="p-1.5 rounded-full hover:bg-yt-elevated text-yt-muted hover:text-white transition-colors"
            >
              <ListPlus size={15} />
            </button>
            {/* Playlist dropdown */}
            <div className="absolute right-0 top-full mt-1 w-40 bg-yt-elevated border border-yt-border rounded-lg shadow-xl z-50 hidden group-hover/pl:block">
              {playlists.map((pl) => (
                <button
                  key={pl.id}
                  onClick={(e) => { e.stopPropagation(); onAddToPlaylist(track, pl.id); }}
                  className="w-full text-left px-3 py-2 text-sm text-yt-muted hover:text-white hover:bg-yt-surface transition-colors rounded"
                >
                  {pl.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

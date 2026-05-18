import { X, GripVertical } from "lucide-react";
import type { Track } from "../types";

interface Props {
  queue: Track[];
  onRemove: (index: number) => void;
  onClose: () => void;
}

function formatDuration(secs: number) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function Queue({ queue, onRemove, onClose }: Props) {
  return (
    <aside className="w-72 flex-shrink-0 bg-yt-surface border-l border-yt-border flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-yt-border">
        <h2 className="text-sm font-semibold text-yt-text">Queue</h2>
        <button onClick={onClose} className="text-yt-muted hover:text-yt-text transition-colors">
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {queue.length === 0 ? (
          <p className="text-sm text-yt-muted text-center mt-8 px-4">Queue is empty</p>
        ) : (
          <ul className="p-2 space-y-1">
            {queue.map((track, i) => (
              <li key={`${track.video_id}-${i}`} className="group flex items-center gap-2 p-2 rounded hover:bg-yt-elevated transition-colors">
                <GripVertical size={14} className="text-yt-border flex-shrink-0" />
                <img
                  src={track.thumbnail}
                  alt=""
                  className="w-9 h-9 rounded object-cover flex-shrink-0 bg-yt-elevated"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-yt-text truncate">{track.title}</p>
                  <p className="text-xs text-yt-muted truncate">{track.artist}</p>
                </div>
                <span className="text-xs text-yt-muted flex-shrink-0">{formatDuration(track.duration)}</span>
                <button
                  onClick={() => onRemove(i)}
                  className="text-yt-muted hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
                >
                  <X size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

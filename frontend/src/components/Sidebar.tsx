import { NavLink } from "react-router-dom";
import { Home, Search, ListMusic, Plus, Trash2 } from "lucide-react";
import type { Playlist } from "../types";

interface Props {
  playlists: Playlist[];
  onCreatePlaylist: () => void;
  onDeletePlaylist: (id: number) => void;
}

export default function Sidebar({ playlists, onCreatePlaylist, onDeletePlaylist }: Props) {
  const navClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
      isActive ? "bg-yt-elevated text-white" : "text-yt-muted hover:text-white hover:bg-yt-surface"
    }`;

  return (
    <aside className="w-56 flex-shrink-0 bg-yt-bg flex flex-col border-r border-yt-border overflow-y-auto">
      {/* Logo */}
      <div className="px-4 py-4 flex items-center gap-2">
        <span className="text-2xl">🎵</span>
        <span className="font-bold text-base tracking-tight">Discord Music</span>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-1 px-2">
        <NavLink to="/" end className={navClass}>
          <Home size={18} />
          Home
        </NavLink>
        <NavLink to="/search" className={navClass}>
          <Search size={18} />
          Search
        </NavLink>
      </nav>

      {/* Library */}
      <div className="mt-6 px-2">
        <div className="flex items-center justify-between px-2 mb-2">
          <span className="text-xs font-semibold text-yt-muted uppercase tracking-wider flex items-center gap-1.5">
            <ListMusic size={14} /> Library
          </span>
          <button
            onClick={onCreatePlaylist}
            className="text-yt-muted hover:text-white transition-colors"
            title="New playlist"
          >
            <Plus size={16} />
          </button>
        </div>

        <div className="flex flex-col gap-0.5">
          {playlists.length === 0 && (
            <p className="text-xs text-yt-muted px-2 py-2">No playlists yet</p>
          )}
          {playlists.map((pl) => (
            <div key={pl.id} className="group flex items-center gap-1 rounded-md hover:bg-yt-surface">
              <NavLink
                to={`/playlist/${pl.id}`}
                className={({ isActive }) =>
                  `flex-1 px-2 py-2 text-sm truncate ${isActive ? "text-white" : "text-yt-muted hover:text-white"}`
                }
              >
                {pl.name}
              </NavLink>
              <button
                onClick={() => onDeletePlaylist(pl.id)}
                className="pr-2 text-yt-muted opacity-0 group-hover:opacity-100 hover:text-red-400 transition-all"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

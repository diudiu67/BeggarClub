import { NavLink } from "react-router-dom";
import { ListMusic, Images, Plus, Trash2, X } from "lucide-react";
import type { Guild, VoiceChannel, Playlist } from "../types";
import iconUrl from "../assets/beggarclub_icon_light.svg?url";

type Mode = "music" | "gallery";

interface Props {
  mode: Mode;
  playlists: Playlist[];
  onCreatePlaylist: () => void;
  onDeletePlaylist: (id: number) => void;
  guilds: Guild[];
  selectedGuild: Guild | null;
  onSelectGuild: (guild: Guild) => void;
  voiceChannels: VoiceChannel[];
  selectedChannel: VoiceChannel | null;
  onJoinChannel: (channel: VoiceChannel) => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export default function Sidebar({
  mode,
  playlists, onCreatePlaylist, onDeletePlaylist,
  guilds, selectedGuild, onSelectGuild,
  voiceChannels, selectedChannel, onJoinChannel,
  mobileOpen, onMobileClose,
}: Props) {
  const members = selectedChannel?.member_names ?? [];

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={onMobileClose}
        />
      )}

      <aside
        className={`
          w-60 flex-shrink-0 flex flex-col border-r border-yt-border overflow-y-auto
          fixed md:static top-0 left-0 h-full z-50
          transition-transform duration-300
          ${mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
        `}
        style={{ background: "#F7F8F9" }}
      >

      {/* Mobile close button */}
      <button
        className="md:hidden absolute top-3 right-3 text-yt-muted hover:text-yt-text transition-colors"
        onClick={onMobileClose}
        aria-label="Close menu"
      >
        <X size={18} />
      </button>

      {/* Icon — clicking goes home */}
      <NavLink to="/" end className="flex justify-center pt-5 pb-2 focus:outline-none" onClick={onMobileClose}>
        <img
          src={iconUrl}
          alt="BeggarClub"
          className="select-none"
            style={{ width: "200px", height: "200px" }}
          draggable={false}
        />
      </NavLink>

      {/* Server + Voice channel controls */}
      <div className="px-3 space-y-2 mb-3">
        {/* Server selector */}
        <div>
          <label className="text-[10px] font-semibold text-yt-muted uppercase tracking-widest px-1 mb-1 block">
            Server
          </label>
          <select
            value={selectedGuild?.id || ""}
            onChange={(e) => {
              const g = guilds.find((g) => g.id === e.target.value);
              if (g) onSelectGuild(g);
            }}
            className="w-full bg-yt-surface text-yt-text text-sm border border-yt-border rounded-md px-2 py-1.5 outline-none focus:border-yt-muted cursor-pointer"
          >
            <option value="">Select server…</option>
            {guilds.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </div>

        {/* Voice channel selector */}
        {selectedGuild && (
          <div>
            <label className="text-[10px] font-semibold text-yt-muted uppercase tracking-widest px-1 mb-1 block">
              Voice Channel
            </label>
            <select
              value={selectedChannel?.id || ""}
              onChange={(e) => {
                const ch = voiceChannels.find((c) => c.id === e.target.value);
                if (ch) onJoinChannel(ch);
              }}
              className={`w-full text-sm border rounded-md px-2 py-1.5 outline-none cursor-pointer ${
                selectedChannel
                  ? "bg-green-50 border-green-400 text-green-800"
                  : "bg-red-50 border-red-400 text-red-700 animate-pulse"
              }`}
            >
              <option value="">
                {selectedChannel ? `🔊 ${selectedChannel.name}` : "⚠ Join a channel"}
              </option>
              {voiceChannels.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  🔊 {ch.name}{ch.members > 0 ? ` (${ch.members})` : ""}
                </option>
              ))}
            </select>

            {/* Member status */}
            {members.length > 0 && (
              <p className="text-[11px] text-yt-muted mt-1 px-1 truncate" title={members.join(", ")}>
                👥 {members.join(", ")}
              </p>
            )}

          </div>
        )}
      </div>

      {/* Divider */}
      <div className="mx-3 border-t border-yt-border mb-3" />

      {/* Library / Gallery Library */}
      <div className="px-2 flex-1">
        {mode === "music" ? (
          <>
            <div className="flex items-center justify-between px-2 mb-2">
              <span className="text-[10px] font-semibold text-yt-muted uppercase tracking-widest flex items-center gap-1.5">
                <ListMusic size={12} /> Library
              </span>
              <button
                onClick={onCreatePlaylist}
                className="text-yt-muted hover:text-yt-text transition-colors"
                title="New playlist"
              >
                <Plus size={15} />
              </button>
            </div>
            <div className="flex flex-col gap-0.5">
              {playlists.length === 0 && (
                <p className="text-xs text-yt-muted px-2 py-2">No playlists yet</p>
              )}
              {playlists.map((pl) => (
                <div key={pl.id} className="group flex items-center gap-1 rounded-md hover:bg-yt-elevated">
                  <NavLink
                    to={`/playlist/${pl.id}`}
                    className={({ isActive }) =>
                      `flex-1 px-2 py-2 text-sm truncate ${isActive ? "text-yt-text font-medium" : "text-yt-muted hover:text-yt-text"}`
                    }
                  >
                    {pl.name}
                  </NavLink>
                  <button
                    onClick={() => onDeletePlaylist(pl.id)}
                    className="pr-2 text-yt-muted opacity-0 group-hover:opacity-100 hover:text-red-500 transition-all"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center px-2 mb-2">
              <span className="text-[10px] font-semibold text-yt-muted uppercase tracking-widest flex items-center gap-1.5">
                <Images size={12} /> Gallery Library
              </span>
            </div>
            <p className="text-xs text-yt-muted px-2 py-2">No albums yet</p>
          </>
        )}
      </div>
      </aside>
    </>
  );
}

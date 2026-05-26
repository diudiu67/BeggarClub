import { NavLink } from "react-router-dom";
import { ListMusic, Images, Plus, Trash2, X, Star } from "lucide-react";
import type { Guild, VoiceChannel, Playlist, AppMode, GalleryChannel } from "../types";
import iconUrl from "../assets/beggarclub_icon_light.svg?url";

type Mode = AppMode;

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
  // Gallery
  galleryChannels: GalleryChannel[];
  selectedGalleryChannel: string | null;
  onSelectGalleryChannel: (channelId: string | null) => void;
  // Strategy
  selectedStrategyCategory: string | null;
  onSelectStrategyCategory: (cat: string | null) => void;
}

const STRATEGY_CATEGORIES = [
  { id: "strategy", label: "Strategy/攻略", emoji: "📋" },
  { id: "guildwar", label: "Guild War/百業戰", emoji: "⚔️" },
] as const;

export default function Sidebar({
  mode,
  playlists, onCreatePlaylist, onDeletePlaylist,
  guilds, selectedGuild, onSelectGuild,
  voiceChannels, selectedChannel, onJoinChannel,
  mobileOpen, onMobileClose,
  galleryChannels, selectedGalleryChannel, onSelectGalleryChannel,
  selectedStrategyCategory, onSelectStrategyCategory,
}: Props) {
  const members = selectedChannel?.member_names ?? [];

  const navItem = (isActive: boolean) =>
    `flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer text-left ${
      isActive ? "bg-yt-elevated text-yt-text font-medium" : "text-yt-muted hover:bg-yt-elevated hover:text-yt-text"
    }`;

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

      {/* Server + Voice channel controls — only on music mode */}
      {mode === "music" && (
        <div className="px-3 space-y-2 mb-3">
          {/* Server selector — only shown when bot is in multiple servers */}
          {guilds.length > 1 && (
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
          )}

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

              {members.length > 0 && (
                <p className="text-[11px] text-yt-muted mt-1 px-1 truncate" title={members.join(", ")}>
                  👥 {members.join(", ")}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Divider */}
      {mode === "music" && <div className="mx-3 border-t border-yt-border mb-3" />}

      {/* Library / Gallery Library / Strategy */}
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
        ) : mode === "gallery" ? (
          <>
            <div className="flex items-center px-2 mb-2">
              <span className="text-[10px] font-semibold text-yt-muted uppercase tracking-widest flex items-center gap-1.5">
                <Images size={12} /> Gallery Library
              </span>
            </div>

            {/* Home (starred) */}
            <button
              onClick={() => onSelectGalleryChannel(null)}
              className={navItem(selectedGalleryChannel === null)}
            >
              <Star size={13} className={selectedGalleryChannel === null ? "text-yellow-400" : ""} />
              <span className="flex-1 truncate">Home</span>
            </button>

            {/* Channel list */}
            {galleryChannels.map((ch) => (
              <button
                key={ch.channel_id}
                onClick={() => onSelectGalleryChannel(ch.channel_id)}
                className={navItem(selectedGalleryChannel === ch.channel_id)}
              >
                <span className="text-yt-muted text-xs">#</span>
                <span className="flex-1 truncate">{ch.channel_name}</span>
                <span className="text-[10px] text-yt-muted flex-shrink-0">{ch.item_count}</span>
              </button>
            ))}

            {galleryChannels.length === 0 && (
              <p className="text-xs text-yt-muted px-2 py-2">No channels configured</p>
            )}
          </>
        ) : mode === "strategy" ? (
          <>
            <div className="flex items-center px-2 mb-2">
              <span className="text-[10px] font-semibold text-yt-muted uppercase tracking-widest">
                Strategy
              </span>
            </div>

            {/* All (no filter) */}
            <button
              onClick={() => onSelectStrategyCategory(null)}
              className={navItem(selectedStrategyCategory === null)}
            >
              <span className="text-base leading-none">🏠</span>
              <span className="flex-1 truncate">Home</span>
            </button>

            {STRATEGY_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => onSelectStrategyCategory(cat.id)}
                className={navItem(selectedStrategyCategory === cat.id)}
              >
                <span className="text-base leading-none">{cat.emoji}</span>
                <span className="flex-1 truncate">{cat.label}</span>
              </button>
            ))}
          </>
        ) : (
          /* Admin or other — no sidebar content */
          null
        )}
      </div>
      </aside>
    </>
  );
}

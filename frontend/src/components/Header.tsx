import { Search } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Guild, VoiceChannel } from "../types";

interface Props {
  guilds: Guild[];
  selectedGuild: Guild | null;
  voiceChannels: VoiceChannel[];
  selectedChannel: VoiceChannel | null;
  onSelectGuild: (guild: Guild) => void;
  onJoinChannel: (channel: VoiceChannel) => void;
}

export default function Header({
  guilds,
  selectedGuild,
  voiceChannels,
  selectedChannel,
  onSelectGuild,
  onJoinChannel,
}: Props) {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      navigate(`/search?q=${encodeURIComponent(query.trim())}`);
    }
  };

  return (
    <header className="h-14 flex-shrink-0 flex items-center gap-4 px-4 bg-yt-bg border-b border-yt-border">
      {/* Search */}
      <form onSubmit={handleSearch} className="flex-1 max-w-xl">
        <div className="flex items-center bg-yt-surface border border-yt-border rounded-full px-4 py-1.5 gap-2 focus-within:border-yt-muted">
          <Search size={16} className="text-yt-muted flex-shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search songs, artists..."
            className="bg-transparent text-sm text-white placeholder-yt-muted outline-none w-full"
          />
        </div>
      </form>

      {/* Guild selector */}
      <select
        value={selectedGuild?.id || ""}
        onChange={(e) => {
          const g = guilds.find((g) => g.id === e.target.value);
          if (g) onSelectGuild(g);
        }}
        className="bg-yt-surface text-sm text-white border border-yt-border rounded-md px-2 py-1.5 outline-none"
      >
        <option value="">Select server</option>
        {guilds.map((g) => (
          <option key={g.id} value={g.id}>{g.name}</option>
        ))}
      </select>

      {/* Voice channel selector */}
      {selectedGuild && (
        <div className="flex items-center gap-2">
          <select
            value={selectedChannel?.id || ""}
            onChange={(e) => {
              const ch = voiceChannels.find((c) => c.id === e.target.value);
              if (ch) onJoinChannel(ch);
            }}
            className={`text-sm text-white border rounded-md px-2 py-1.5 outline-none ${
              selectedChannel
                ? "bg-green-900 border-green-600"
                : "bg-red-900 border-red-600 animate-pulse"
            }`}
          >
            <option value="">{selectedChannel ? `🔊 ${selectedChannel.name}` : "⚠ Join voice channel"}</option>
            {voiceChannels.map((ch) => (
              <option key={ch.id} value={ch.id}>
                🔊 {ch.name} {ch.members > 0 ? `(${ch.members})` : ""}
              </option>
            ))}
          </select>
        </div>
      )}
    </header>
  );
}

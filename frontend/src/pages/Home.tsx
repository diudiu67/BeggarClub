import { useNavigate } from "react-router-dom";
import { Plus, Music2 } from "lucide-react";
import type { Playlist } from "../types";

interface Props {
  playlists: Playlist[];
  guildId: string | null;
  onCreatePlaylist: () => void;
}

const MOODS = [
  { label: "Relax", query: "relaxing music" },
  { label: "Commute", query: "commute playlist music" },
  { label: "Sleep", query: "sleep music ambient" },
  { label: "Energize", query: "energetic workout music" },
  { label: "Sad", query: "sad songs emotional" },
  { label: "Feel good", query: "feel good happy music" },
  { label: "Romance", query: "romantic love songs" },
  { label: "Party", query: "party music hits" },
  { label: "Focus", query: "focus study music" },
];

const GENRES = [
  { label: "J-Pop", query: "jpop music", color: "from-pink-600 to-rose-800" },
  { label: "Anime", query: "anime opening music", color: "from-violet-600 to-purple-900" },
  { label: "Lo-fi", query: "lofi hip hop chill beats", color: "from-blue-600 to-indigo-900" },
  { label: "K-Pop", query: "kpop music hits", color: "from-sky-500 to-cyan-800" },
  { label: "Nightcore", query: "nightcore music", color: "from-indigo-500 to-blue-900" },
  { label: "Rock", query: "rock music classic", color: "from-red-700 to-rose-950" },
  { label: "Jazz", query: "jazz music chill", color: "from-amber-600 to-yellow-900" },
  { label: "Classical", query: "classical music piano", color: "from-emerald-600 to-green-900" },
  { label: "Hip-Hop", query: "hip hop rap music", color: "from-zinc-500 to-zinc-900" },
  { label: "Pop", query: "pop music hits 2024", color: "from-orange-500 to-red-800" },
];

export default function Home({ playlists, guildId, onCreatePlaylist }: Props) {
  const navigate = useNavigate();

  const search = (q: string) => navigate(`/search?q=${encodeURIComponent(q)}`);

  return (
    <div className="p-6 space-y-8 max-w-5xl">
      {/* Mood chips */}
      <section>
        <div className="flex flex-wrap gap-2">
          {MOODS.map((m) => (
            <button
              key={m.label}
              onClick={() => search(m.query)}
              className="px-4 py-1.5 rounded-full bg-yt-elevated text-sm font-medium text-white hover:bg-yt-border transition-colors"
            >
              {m.label}
            </button>
          ))}
        </div>
      </section>

      {/* Your Library */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Your Library</h2>
          {guildId && (
            <button
              onClick={onCreatePlaylist}
              className="flex items-center gap-1.5 text-sm text-yt-muted hover:text-white transition-colors"
            >
              <Plus size={16} /> New playlist
            </button>
          )}
        </div>

        {playlists.length === 0 ? (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-yt-surface text-yt-muted text-sm">
            <Music2 size={20} className="opacity-40" />
            {guildId
              ? "No playlists yet — create one to get started."
              : "Select a server to see your playlists."}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {playlists.map((pl) => (
              <button
                key={pl.id}
                onClick={() => navigate(`/playlist/${pl.id}`)}
                className="bg-yt-surface hover:bg-yt-elevated rounded-xl p-4 text-left transition-colors"
              >
                <div className="w-full aspect-square rounded-lg bg-yt-elevated flex items-center justify-center mb-3">
                  <Music2 size={32} className="text-yt-muted opacity-40" />
                </div>
                <p className="text-sm font-semibold truncate">{pl.name}</p>
                <p className="text-xs text-yt-muted mt-0.5">Playlist</p>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Browse by genre */}
      <section>
        <h2 className="text-lg font-bold mb-4">Browse by genre</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {GENRES.map((g) => (
            <button
              key={g.label}
              onClick={() => search(g.query)}
              className={`bg-gradient-to-br ${g.color} rounded-xl p-4 text-left h-20 relative overflow-hidden hover:scale-105 transition-transform`}
            >
              <span className="text-sm font-bold text-white">{g.label}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

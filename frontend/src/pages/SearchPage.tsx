import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import type { Track, Playlist } from "../types";
import { searchTracks, playTrack, addToQueue, addSongToPlaylist } from "../lib/api";
import SongCard from "../components/SongCard";

interface Props {
  guildId: string | null;
  playlists: Playlist[];
  onRefresh: () => void;
}

export default function SearchPage({ guildId, playlists, onRefresh }: Props) {
  const [params] = useSearchParams();
  const query = params.get("q") || "";
  const [results, setResults] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!query) return;
    setLoading(true);
    setError("");
    searchTracks(query)
      .then(setResults)
      .catch(() => setError("Search failed. Check your YouTube API key."))
      .finally(() => setLoading(false));
  }, [query]);

  const handlePlay = (track: Track) => {
    if (!guildId) return alert("Select a server first.");
    playTrack(guildId, track, true)
      .then(onRefresh)
      .catch((err) => {
        const detail = err?.response?.data?.detail;
        alert(detail || `Play failed (${err?.response?.status ?? "network error"}). Join a voice channel first.`);
      });
  };

  const handleQueue = (track: Track) => {
    if (!guildId) return alert("Select a server first.");
    addToQueue(guildId, track)
      .then(onRefresh)
      .catch((err) => {
        const detail = err?.response?.data?.detail;
        alert(detail || `Failed to add to queue (${err?.response?.status ?? "network error"}).`);
      });
  };

  const handleAddToPlaylist = (track: Track, playlistId: number) => {
    addSongToPlaylist(playlistId, track).catch(console.error);
  };

  return (
    <div className="p-6">
      <h2 className="text-lg font-semibold text-yt-text mb-4">
        {query ? `Results for "${query}"` : "Search"}
      </h2>

      {loading && (
        <div className="flex items-center gap-2 text-yt-muted">
          <Loader2 size={18} className="animate-spin" /> Searching...
        </div>
      )}

      {error && <p className="text-red-500 text-sm">{error}</p>}

      {!loading && results.length === 0 && query && !error && (
        <p className="text-yt-muted text-sm">No results found.</p>
      )}

      <div className="flex flex-col gap-1">
        {results.map((track) => (
          <SongCard
            key={track.video_id}
            track={track}
            playlists={playlists}
            onPlay={handlePlay}
            onAddToQueue={handleQueue}
            onAddToPlaylist={handleAddToPlaylist}
          />
        ))}
      </div>
    </div>
  );
}

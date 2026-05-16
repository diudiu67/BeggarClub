import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Play, Shuffle, Loader2, Trash2 } from "lucide-react";
import type { PlaylistDetail, Playlist, Track } from "../types";
import {
  getPlaylist, playPlaylist, playTrack, addToQueue,
  addSongToPlaylist, removeSongFromPlaylist,
} from "../lib/api";
import SongCard from "../components/SongCard";

interface Props {
  guildId: string | null;
  playlists: Playlist[];
  onRefresh: () => void;
}

function formatDuration(secs: number) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function PlaylistPage({ guildId, playlists, onRefresh }: Props) {
  const { id } = useParams<{ id: string }>();
  const [playlist, setPlaylist] = useState<PlaylistDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    if (!id) return;
    setLoading(true);
    getPlaylist(parseInt(id))
      .then(setPlaylist)
      .finally(() => setLoading(false));
  };

  useEffect(load, [id]);

  const handlePlayAll = (shuffle = false) => {
    if (!guildId || !id) return alert("Select a server first.");
    playPlaylist(parseInt(id), guildId, shuffle)
      .then(onRefresh)
      .catch((err) => {
        const detail = err?.response?.data?.detail;
        alert(detail || `Play failed (${err?.response?.status ?? "network error"}). Join a voice channel first.`);
      });
  };

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
        alert(detail || `Failed to add to queue.`);
      });
  };

  const handleAddToPlaylist = (track: Track, playlistId: number) => {
    addSongToPlaylist(playlistId, track).then(load).catch(console.error);
  };

  const handleRemoveSong = (songId: number) => {
    if (!id) return;
    removeSongFromPlaylist(parseInt(id), songId).then(load).catch(console.error);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-yt-muted p-6">
        <Loader2 size={18} className="animate-spin" /> Loading playlist...
      </div>
    );
  }

  if (!playlist) return <p className="p-6 text-yt-muted">Playlist not found.</p>;

  const totalDuration = playlist.songs.reduce((acc, s) => acc + s.duration, 0);

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-end gap-6 mb-6">
        <div className="w-40 h-40 rounded-xl bg-gradient-to-br from-yt-red to-pink-700 flex items-center justify-center text-5xl flex-shrink-0">
          🎵
        </div>
        <div>
          <p className="text-xs text-yt-muted uppercase tracking-widest mb-1">Playlist</p>
          <h1 className="text-3xl font-bold text-white mb-2">{playlist.name}</h1>
          <p className="text-sm text-yt-muted">
            {playlist.songs.length} songs · {formatDuration(totalDuration)}
          </p>
          <div className="flex items-center gap-3 mt-4">
            <button
              onClick={() => handlePlayAll(false)}
              className="flex items-center gap-2 bg-yt-red hover:bg-red-600 text-white px-5 py-2 rounded-full text-sm font-semibold transition-colors"
            >
              <Play size={16} fill="white" /> Play
            </button>
            <button
              onClick={() => handlePlayAll(true)}
              className="flex items-center gap-2 bg-yt-elevated hover:bg-yt-border text-white px-5 py-2 rounded-full text-sm font-semibold transition-colors"
            >
              <Shuffle size={16} /> Shuffle
            </button>
          </div>
        </div>
      </div>

      {/* Songs */}
      {playlist.songs.length === 0 ? (
        <p className="text-yt-muted text-sm">
          No songs yet. Search for songs and add them to this playlist.
        </p>
      ) : (
        <div className="flex flex-col gap-0.5">
          {playlist.songs.map((song) => (
            <div key={song.id} className="group relative">
              <SongCard
                track={song}
                playlists={playlists.filter((p) => p.id !== playlist.id)}
                onPlay={handlePlay}
                onAddToQueue={handleQueue}
                onAddToPlaylist={handleAddToPlaylist}
              />
              <button
                onClick={() => handleRemoveSong(song.id)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-yt-muted hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all p-1"
                title="Remove from playlist"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

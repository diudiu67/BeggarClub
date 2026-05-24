import { useEffect, useState, useRef } from "react";
import { useParams } from "react-router-dom";
import { Play, Shuffle, Loader2, Trash2, Plus, Search, X, Check, Camera } from "lucide-react";
import type { PlaylistDetail, Playlist, Track } from "../types";
import {
  getPlaylist, playPlaylist, addToQueue,
  addSongToPlaylist, removeSongFromPlaylist, searchTracks, updatePlaylist, uploadPlaylistIcon,
} from "../lib/api";
import SongCard from "../components/SongCard";
import { getGradient } from "../lib/playlistTheme";

interface Props {
  guildId: string | null;
  playlists: Playlist[];
  onRefresh: () => void;
}

function isImageUrl(icon: string): boolean {
  return icon.startsWith("/") || icon.startsWith("http") || icon.startsWith("blob:");
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

  // Image upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [iconUploading, setIconUploading] = useState(false);

  const handleIconClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id || !playlist) return;
    e.target.value = ""; // reset so same file can be re-picked

    const formData = new FormData();
    formData.append("file", file);

    // Optimistic preview using object URL
    const objectUrl = URL.createObjectURL(file);
    setPlaylist((prev) => prev ? { ...prev, icon: objectUrl } : prev);

    setIconUploading(true);
    try {
      const { icon_url } = await uploadPlaylistIcon(parseInt(id), formData);
      URL.revokeObjectURL(objectUrl);
      setPlaylist((prev) => prev ? { ...prev, icon: icon_url } : prev);
    } catch (err) {
      console.error(err);
      URL.revokeObjectURL(objectUrl);
      // Revert on failure
      setPlaylist((prev) => prev ? { ...prev, icon: playlist.icon } : prev);
    } finally {
      setIconUploading(false);
    }
  };

  // Inline add-song search
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Track[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = () => {
    if (!id) return;
    setLoading(true);
    getPlaylist(parseInt(id))
      .then(setPlaylist)
      .finally(() => setLoading(false));
  };

  useEffect(load, [id]);

  // Debounced search as user types
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    setSearchLoading(true);
    const timer = setTimeout(() => {
      searchTracks(searchQuery)
        .then((r) => setSearchResults(r.slice(0, 8)))
        .catch(() => setSearchResults([]))
        .finally(() => setSearchLoading(false));
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Close dropdown on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowSearch(false);
        setSearchQuery("");
        setSearchResults([]);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Focus input when search opens
  useEffect(() => {
    if (showSearch) setTimeout(() => inputRef.current?.focus(), 50);
  }, [showSearch]);

  const handleAddSong = (track: Track) => {
    if (!id || addedIds.has(track.video_id)) return;
    addSongToPlaylist(parseInt(id), track)
      .then(() => {
        load();
        setAddedIds((prev) => new Set([...prev, track.video_id]));
        setTimeout(() => {
          setAddedIds((prev) => {
            const next = new Set(prev);
            next.delete(track.video_id);
            return next;
          });
        }, 2000);
      })
      .catch((err) => {
        const detail = err?.response?.data?.detail;
        alert(detail || "Failed to add song.");
      });
  };

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
    if (!guildId || !id) return alert("Select a server first.");
    // Play the playlist starting from this song (slice from here to end, then auto-extend).
    playPlaylist(parseInt(id), guildId, false, track.video_id)
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
        {/* Clickable icon — opens file picker */}
        <div className="relative flex-shrink-0">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            onClick={handleIconClick}
            disabled={iconUploading}
            className="w-40 h-40 rounded-xl flex items-center justify-center text-5xl group relative overflow-hidden"
            style={{ background: isImageUrl(playlist.icon) ? undefined : getGradient(playlist.color) }}
            title="Change photo"
          >
            {isImageUrl(playlist.icon) ? (
              <img
                src={playlist.icon}
                alt="Playlist icon"
                className="w-full h-full object-cover rounded-xl"
              />
            ) : (
              playlist.icon
            )}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1">
              {iconUploading
                ? <Loader2 size={24} className="text-white animate-spin" />
                : <>
                    <Camera size={24} className="text-white" />
                    <span className="text-white text-xs font-medium">Change photo</span>
                  </>
              }
            </div>
          </button>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-yt-muted uppercase tracking-widest mb-1">Playlist</p>
          <h1 className="text-3xl font-bold text-yt-text mb-2">{playlist.name}</h1>
          <p className="text-sm text-yt-muted">
            {playlist.songs.length} songs · {formatDuration(totalDuration)}
          </p>
          <div className="flex items-center gap-3 mt-4 flex-wrap">
            <button
              onClick={() => handlePlayAll(false)}
              className="flex items-center gap-2 bg-yt-red hover:bg-red-600 text-white px-5 py-2 rounded-full text-sm font-semibold transition-colors"
            >
              <Play size={16} fill="white" /> Play
            </button>
            <button
              onClick={() => handlePlayAll(true)}
              className="flex items-center gap-2 bg-yt-elevated hover:bg-yt-border text-yt-text px-5 py-2 rounded-full text-sm font-semibold transition-colors"
            >
              <Shuffle size={16} /> Shuffle
            </button>

            {/* Add song inline search */}
            <div ref={searchContainerRef} className="relative">
              {!showSearch ? (
                <button
                  onClick={() => setShowSearch(true)}
                  className="flex items-center gap-1.5 text-sm text-yt-muted hover:text-yt-text border border-yt-border hover:border-yt-text rounded-full px-4 py-2 transition-colors"
                >
                  <Plus size={14} /> Add song
                </button>
              ) : (
                <div className="flex items-center gap-2 bg-yt-elevated border border-yt-border rounded-full px-3 py-2 w-64">
                  <Search size={14} className="text-yt-muted flex-shrink-0" />
                  <input
                    ref={inputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search to add…"
                    className="flex-1 bg-transparent text-sm text-yt-text outline-none placeholder:text-yt-muted"
                  />
                  {searchLoading
                    ? <Loader2 size={13} className="animate-spin text-yt-muted flex-shrink-0" />
                    : <button onClick={() => { setShowSearch(false); setSearchQuery(""); setSearchResults([]); }}>
                        <X size={13} className="text-yt-muted hover:text-yt-text transition-colors" />
                      </button>
                  }
                </div>
              )}

              {/* Dropdown results */}
              {showSearch && searchResults.length > 0 && (
                <div className="absolute left-0 top-full mt-2 w-96 max-w-[calc(100vw-3rem)] bg-yt-bg border border-yt-border rounded-2xl shadow-2xl z-50 overflow-hidden">
                  <p className="text-xs text-yt-muted px-4 py-2 border-b border-yt-border">
                    Click a song to add it to the playlist
                  </p>
                  <div className="max-h-72 overflow-y-auto">
                    {searchResults.map((track) => {
                      const isAdded = addedIds.has(track.video_id);
                      return (
                        <div
                          key={track.video_id}
                          onClick={() => handleAddSong(track)}
                          className="flex items-center gap-3 px-3 py-2.5 hover:bg-yt-elevated cursor-pointer transition-colors"
                        >
                          <img
                            src={track.thumbnail}
                            alt={track.title}
                            className="w-9 h-9 rounded object-cover flex-shrink-0 bg-yt-elevated"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src =
                                `https://i.ytimg.com/vi/${track.video_id}/mqdefault.jpg`;
                            }}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-yt-text truncate">{track.title}</p>
                            <p className="text-xs text-yt-muted truncate">{track.artist}</p>
                          </div>
                          <span className="text-xs text-yt-muted flex-shrink-0 mr-1">
                            {formatDuration(track.duration)}
                          </span>
                          <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center transition-colors ${
                            isAdded
                              ? "bg-green-500 text-white"
                              : "bg-yt-elevated text-yt-muted hover:bg-yt-border"
                          }`}>
                            {isAdded ? <Check size={13} /> : <Plus size={13} />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Songs */}
      {playlist.songs.length === 0 ? (
        <p className="text-yt-muted text-sm">
          No songs yet. Use the "Add song" button above to search and add songs.
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
                className="absolute right-2 top-1/2 -translate-y-1/2 text-yt-muted hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all p-1"
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

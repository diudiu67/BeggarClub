import { useState, useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import type { Guild, VoiceChannel, Playlist, PlayerState } from "./types";
import {
  getGuilds, getVoiceChannels, joinChannel,
  getPlaylists, createPlaylist, deletePlaylist,
  removeFromQueue,
} from "./lib/api";
import { usePlayer } from "./hooks/usePlayer";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import NowPlaying from "./components/NowPlaying";
import Queue from "./components/Queue";
import PlayerOverlay from "./components/PlayerOverlay";
import Home from "./pages/Home";
import SearchPage from "./pages/SearchPage";
import PlaylistPage from "./pages/PlaylistPage";

export default function App() {
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [selectedGuild, setSelectedGuild] = useState<Guild | null>(null);
  const [voiceChannels, setVoiceChannels] = useState<VoiceChannel[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<VoiceChannel | null>(null);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [showQueue, setShowQueue] = useState(false);
  const [showPlayer, setShowPlayer] = useState(false);

  const { state, refresh } = usePlayer(selectedGuild?.id ?? null);

  // Sync selectedChannel with server-side voice state.
  // When the backend restarts or the bot gets kicked, voice_connected becomes false
  // and we clear the UI indicator so the user knows to re-join.
  useEffect(() => {
    if (state && !state.voice_connected) {
      setSelectedChannel(null);
    }
  }, [state?.voice_connected]);

  // Load guilds on mount and restore saved guild
  useEffect(() => {
    getGuilds().then((g) => {
      setGuilds(g);
      const savedId = localStorage.getItem("selectedGuildId");
      if (savedId) {
        const saved = g.find((x) => x.id === savedId);
        if (saved) setSelectedGuild(saved);
      }
    }).catch(console.error);
  }, []);

  // Load voice channels when guild changes
  useEffect(() => {
    if (!selectedGuild) return;
    setSelectedChannel(null);
    getVoiceChannels(selectedGuild.id).then(setVoiceChannels).catch(console.error);
    loadPlaylists(selectedGuild.id);
  }, [selectedGuild]);

  const loadPlaylists = (guildId: string) => {
    getPlaylists(guildId).then(setPlaylists).catch(console.error);
  };

  const handleSelectGuild = (guild: Guild) => {
    setSelectedGuild(guild);
    localStorage.setItem("selectedGuildId", guild.id);
  };

  const handleJoinChannel = async (channel: VoiceChannel) => {
    if (!selectedGuild) return;
    try {
      await joinChannel(selectedGuild.id, channel.id);
      setSelectedChannel(channel);
    } catch (err: any) {
      const detail = err?.response?.data?.detail || "Could not join voice channel.";
      alert(`Failed to join voice channel:\n${detail}`);
      setSelectedChannel(null);
    }
  };

  const handleCreatePlaylist = async () => {
    if (!selectedGuild) return alert("Select a server first.");
    const name = prompt("Playlist name:");
    if (!name?.trim()) return;
    await createPlaylist(selectedGuild.id, name.trim());
    loadPlaylists(selectedGuild.id);
  };

  const handleDeletePlaylist = async (id: number) => {
    if (!confirm("Delete this playlist?")) return;
    await deletePlaylist(id);
    if (selectedGuild) loadPlaylists(selectedGuild.id);
  };

  const handleRemoveFromQueue = (index: number) => {
    if (!selectedGuild) return;
    removeFromQueue(selectedGuild.id, index).then(refresh).catch(console.error);
  };

  const emptyState: PlayerState = {
    guild_id: selectedGuild?.id ?? "",
    current: null,
    queue: [],
    is_playing: false,
    is_paused: false,
    autoplay: true,
    shuffle: false,
    volume: 1,
    voice_connected: false,
  };

  const playerState = state ?? emptyState;

  return (
    <div className="h-screen flex flex-col bg-yt-bg text-white overflow-hidden">
      {/* Header */}
      <Header
        guilds={guilds}
        selectedGuild={selectedGuild}
        voiceChannels={voiceChannels}
        selectedChannel={selectedChannel}
        onSelectGuild={handleSelectGuild}
        onJoinChannel={handleJoinChannel}
      />

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <Sidebar
          playlists={playlists}
          onCreatePlaylist={handleCreatePlaylist}
          onDeletePlaylist={handleDeletePlaylist}
        />

        {/* Main content */}
        <main className="flex-1 overflow-y-auto bg-yt-bg">
          <Routes>
            <Route
              path="/"
              element={
                <Home
                  playlists={playlists}
                  guildId={selectedGuild?.id ?? null}
                  onCreatePlaylist={handleCreatePlaylist}
                />
              }
            />
            <Route
              path="/search"
              element={
                <SearchPage
                  guildId={selectedGuild?.id ?? null}
                  playlists={playlists}
                  onRefresh={refresh}
                />
              }
            />
            <Route
              path="/playlist/:id"
              element={
                <PlaylistPage
                  guildId={selectedGuild?.id ?? null}
                  playlists={playlists}
                  onRefresh={refresh}
                />
              }
            />
          </Routes>
        </main>

        {/* Queue panel */}
        {showQueue && !showPlayer && (
          <Queue
            queue={playerState.queue}
            onRemove={handleRemoveFromQueue}
            onClose={() => setShowQueue(false)}
          />
        )}
      </div>

      {/* Full player overlay */}
      {showPlayer && (
        <PlayerOverlay
          state={playerState}
          guildId={selectedGuild?.id ?? ""}
          onClose={() => setShowPlayer(false)}
          onRemoveFromQueue={handleRemoveFromQueue}
          onRefresh={refresh}
        />
      )}

      {/* Now Playing bar */}
      <NowPlaying
        state={playerState}
        guildId={selectedGuild?.id ?? ""}
        onToggleQueue={() => setShowQueue((v) => !v)}
        onOpenPlayer={() => setShowPlayer(true)}
        onRefresh={refresh}
      />
    </div>
  );
}

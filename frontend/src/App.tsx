import { useState, useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import type { Guild, VoiceChannel, Playlist, PlayerState, AppMode, GalleryChannel } from "./types";
import SplashScreen from "./components/SplashScreen";
import {
  getGuilds, getVoiceChannels, joinChannel,
  getPlaylists, createPlaylist, deletePlaylist,
  removeFromQueue, playTrack, playTracks,
  getGalleryChannels,
} from "./lib/api";
import { usePlayer } from "./hooks/usePlayer";
import { useNotifications } from "./hooks/useNotifications";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import SearchBar from "./components/SearchBar";
import NowPlaying from "./components/NowPlaying";
import Queue from "./components/Queue";
import PlayerOverlay from "./components/PlayerOverlay";
import NotificationToast from "./components/NotificationToast";
import Home from "./pages/Home";
import SearchPage from "./pages/SearchPage";
import PlaylistPage from "./pages/PlaylistPage";
import GalleryPage from "./pages/GalleryPage";
import AdminPage from "./pages/AdminPage";
import StrategyPage from "./pages/StrategyPage";

type Mode = AppMode;

export default function App() {
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [selectedGuild, setSelectedGuild] = useState<Guild | null>(null);
  const [voiceChannels, setVoiceChannels] = useState<VoiceChannel[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<VoiceChannel | null>(null);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [mode, setMode] = useState<Mode>("strategy");
  const [showQueue, setShowQueue] = useState(false);
  const [showPlayer, setShowPlayer] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [showSidebar, setShowSidebar] = useState(false);

  // Gallery state
  const [galleryChannels, setGalleryChannels] = useState<GalleryChannel[]>([]);
  const [selectedGalleryChannel, setSelectedGalleryChannel] = useState<string | null>(null);

  // Strategy state
  const [selectedStrategyCategory, setSelectedStrategyCategory] = useState<string | null>(null);
  const [initialStrategyMsgId, setInitialStrategyMsgId] = useState<string | null>(null);

  const { state, refresh } = usePlayer(selectedGuild?.id ?? null);
  useNotifications();

  // Clear selected channel when bot disconnects
  useEffect(() => {
    if (state && !state.voice_connected) {
      setSelectedChannel(null);
    }
  }, [state?.voice_connected]);

  // Restore selected channel on page load / reconnect
  useEffect(() => {
    if (!state?.voice_connected || !state.voice_channel_id) return;
    setSelectedChannel((prev) => {
      if (prev?.id === state.voice_channel_id) return prev;
      const match = voiceChannels.find((c) => c.id === state.voice_channel_id);
      return match ?? prev;
    });
  }, [state?.voice_channel_id, state?.voice_connected, voiceChannels]);

  // Read URL params on mount — handle deep links like ?mode=strategy&msg=12345
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paramMode = params.get("mode");
    const paramMsg = params.get("msg");
    if (paramMode === "music" || paramMode === "gallery" || paramMode === "admin") {
      setMode(paramMode as Mode);
    } else if (paramMode === "strategy") {
      setMode("strategy");
      if (paramMsg) setInitialStrategyMsgId(paramMsg);
    }
  }, []);

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

  // Load gallery channels when switching to gallery mode or guild changes
  useEffect(() => {
    if (mode === "gallery") {
      getGalleryChannels(selectedGuild?.id ?? "").then(setGalleryChannels).catch(console.error);
    }
  }, [mode, selectedGuild]);

  const loadPlaylists = (guildId: string) => {
    getPlaylists(guildId).then(setPlaylists).catch(console.error);
  };

  const handleSelectGuild = (guild: Guild) => {
    setSelectedGuild(guild);
    localStorage.setItem("selectedGuildId", guild.id);
  };

  const handleJoinChannel = async (channel: VoiceChannel) => {
    if (!selectedGuild) return;
    if ((playerState.is_playing || playerState.is_paused) && playerState.current) {
      const ok = confirm(
        `"${playerState.current.title}" is currently playing.\n\nSwitch to "${channel.name}" and stop playback?`
      );
      if (!ok) return;
    }
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
    volume: 0.5,
    voice_connected: false,
  };

  const playerState = state ?? emptyState;

  return (
    <div className="h-dvh flex flex-col bg-yt-bg text-yt-text overflow-hidden">
      {showSplash && <SplashScreen onDone={() => setShowSplash(false)} />}

      {/* In-app toast notifications */}
      <NotificationToast />

      {/* Header */}
      <Header mode={mode} onSetMode={setMode} onToggleSidebar={() => setShowSidebar((v) => !v)} />

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <Sidebar
          mode={mode}
          playlists={playlists}
          onCreatePlaylist={handleCreatePlaylist}
          onDeletePlaylist={handleDeletePlaylist}
          guilds={guilds}
          selectedGuild={selectedGuild}
          onSelectGuild={handleSelectGuild}
          voiceChannels={voiceChannels}
          selectedChannel={selectedChannel}
          onJoinChannel={handleJoinChannel}
          mobileOpen={showSidebar}
          onMobileClose={() => setShowSidebar(false)}
          galleryChannels={galleryChannels}
          selectedGalleryChannel={selectedGalleryChannel}
          onSelectGalleryChannel={setSelectedGalleryChannel}
          selectedStrategyCategory={selectedStrategyCategory}
          onSelectStrategyCategory={setSelectedStrategyCategory}
        />

        {/* Main content */}
        <main className="flex-1 overflow-y-auto bg-yt-bg flex flex-col">
          {mode === "music" ? (
            <>
              {/* Sticky search bar */}
              <div className="sticky top-0 z-10 bg-yt-bg border-b border-yt-border px-6 py-2 flex-shrink-0">
                <SearchBar />
              </div>
              <Routes>
                <Route
                  path="/"
                  element={
                    <Home
                      playlists={playlists}
                      guildId={selectedGuild?.id ?? null}
                      onCreatePlaylist={handleCreatePlaylist}
                      onPlayTrack={(track) => {
                        if (selectedGuild) playTrack(selectedGuild.id, track).then(refresh).catch(console.error);
                      }}
                      onPlayTracks={(tracks) => {
                        if (selectedGuild) playTracks(selectedGuild.id, tracks).then(refresh).catch(console.error);
                      }}
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
            </>
          ) : mode === "gallery" ? (
            <GalleryPage
              guildId={selectedGuild?.id ?? null}
              selectedChannel={selectedGalleryChannel}
            />
          ) : mode === "admin" ? (
            <AdminPage guildId={selectedGuild?.id ?? null} />
          ) : (
            <StrategyPage
              guildId={selectedGuild?.id ?? null}
              selectedCategory={selectedStrategyCategory}
              initialMsgId={initialStrategyMsgId}
              onInitialMsgHandled={() => setInitialStrategyMsgId(null)}
              onSelectCategory={setSelectedStrategyCategory}
            />
          )}
        </main>

        {/* Queue panel (music only) */}
        {mode === "music" && showQueue && !showPlayer && (
          <Queue
            queue={playerState.queue}
            onRemove={handleRemoveFromQueue}
            onClose={() => setShowQueue(false)}
          />
        )}
      </div>

      {/* Full player overlay (music only) */}
      {mode === "music" && showPlayer && (
        <PlayerOverlay
          state={playerState}
          guildId={selectedGuild?.id ?? ""}
          playlists={playlists}
          onClose={() => setShowPlayer(false)}
          onRemoveFromQueue={handleRemoveFromQueue}
          onRefresh={refresh}
        />
      )}

      {/* Now Playing bar (music only) */}
      {mode === "music" && (
        <NowPlaying
          state={playerState}
          guildId={selectedGuild?.id ?? ""}
          onToggleQueue={() => setShowQueue((v) => !v)}
          onOpenPlayer={() => setShowPlayer(true)}
          onRefresh={refresh}
        />
      )}
    </div>
  );
}

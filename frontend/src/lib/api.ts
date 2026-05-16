import axios from "axios";
import type { Track, Playlist, PlaylistDetail } from "../types";

const WEB_SECRET = import.meta.env.VITE_WEB_SECRET || "changeme";

const api = axios.create({
  baseURL: "/api",
  headers: { "x-secret": WEB_SECRET },
});

// Search
export const searchTracks = (q: string) =>
  api.get<{ results: Track[] }>("/search", { params: { q } }).then((r) => r.data.results);

// Guilds
export const getGuilds = () =>
  api.get<{ guilds: { id: string; name: string; icon: string | null }[] }>("/guilds").then((r) => r.data.guilds);

export const getVoiceChannels = (guildId: string) =>
  api.get<{ channels: { id: string; name: string; members: number }[] }>(`/guilds/${guildId}/channels`).then((r) => r.data.channels);

export const joinChannel = (guild_id: string, channel_id: string) =>
  api.post("/guilds/join", { guild_id, channel_id });

// Player
export const getPlayerState = (guildId: string) =>
  api.get(`/player/state/${guildId}`).then((r) => r.data);

export const playTrack = (guild_id: string, track: Track, play_now = true) =>
  api.post("/player/play", { guild_id, ...track, play_now });

export const addToQueue = (guild_id: string, track: Track) =>
  api.post("/player/queue/add", { guild_id, ...track });

export const removeFromQueue = (guild_id: string, index: number) =>
  api.delete(`/player/queue/${guild_id}/${index}`);

export const pausePlayer = (guild_id: string) =>
  api.post("/player/pause", { guild_id });

export const resumePlayer = (guild_id: string) =>
  api.post("/player/resume", { guild_id });

export const skipTrack = (guild_id: string) =>
  api.post("/player/skip", { guild_id });

export const previousTrack = (guild_id: string) =>
  api.post("/player/previous", { guild_id });

export const shuffleQueue = (guild_id: string) =>
  api.post("/player/shuffle", { guild_id });

export const toggleAutoplay = (guild_id: string) =>
  api.post("/player/autoplay", { guild_id });

export const setVolume = (guild_id: string, volume: number) =>
  api.post("/player/volume", { guild_id, volume });

export const stopPlayer = (guild_id: string) =>
  api.post("/player/stop", { guild_id });

// Playlists
export const getPlaylists = (guild_id: string) =>
  api.get<{ playlists: Playlist[] }>("/playlists", { params: { guild_id } }).then((r) => r.data.playlists);

export const createPlaylist = (guild_id: string, name: string) =>
  api.post<{ id: number; name: string }>("/playlists", { guild_id, name }).then((r) => r.data);

export const deletePlaylist = (id: number) =>
  api.delete(`/playlists/${id}`);

export const getPlaylist = (id: number) =>
  api.get<PlaylistDetail>(`/playlists/${id}`).then((r) => r.data);

export const addSongToPlaylist = (playlistId: number, track: Track) =>
  api.post(`/playlists/${playlistId}/songs`, track);

export const removeSongFromPlaylist = (playlistId: number, songId: number) =>
  api.delete(`/playlists/${playlistId}/songs/${songId}`);

export const playPlaylist = (playlistId: number, guild_id: string, shuffle = false) =>
  api.post(`/playlists/${playlistId}/play`, { guild_id, shuffle });

export interface Track {
  video_id: string;
  title: string;
  artist: string;
  thumbnail: string;
  duration: number;
}

export interface Playlist {
  id: number;
  name: string;
  created_at: string;
}

export interface PlaylistDetail extends Playlist {
  guild_id: string;
  songs: PlaylistSong[];
}

export interface PlaylistSong extends Track {
  id: number;
  position: number;
}

export interface PlayerState {
  guild_id: string;
  current: Track | null;
  queue: Track[];
  is_playing: boolean;
  is_paused: boolean;
  autoplay: boolean;
  shuffle: boolean;
  volume: number;
  voice_connected: boolean;
  started_at?: number;
}

export interface Guild {
  id: string;
  name: string;
  icon: string | null;
}

export interface VoiceChannel {
  id: string;
  name: string;
  members: number;
}

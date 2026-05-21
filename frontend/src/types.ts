export interface Track {
  video_id: string;
  title: string;
  artist: string;
  thumbnail: string;
  duration: number;
  view_count?: number;
  album?: string;
}

export interface Playlist {
  id: number;
  name: string;
  icon: string;
  color: string;
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
  voice_channel_id?: string | null;
  voice_channel_name?: string | null;
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
  member_names?: string[];
}

export interface GalleryItem {
  id: number;
  public_url: string;
  original_name: string;
  media_type: "image" | "video";
  uploader: string;
  caption: string;
  source: "discord" | "web";
  channel_name: string;
  guild_id: string;
  created_at: string;
}

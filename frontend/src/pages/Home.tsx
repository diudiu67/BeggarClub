import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Music2, Plus, Play } from "lucide-react";
import type { Playlist, Track } from "../types";
import { searchTracks } from "../lib/api";

interface Props {
  playlists: Playlist[];
  guildId: string | null;
  onCreatePlaylist: () => void;
  onPlayTrack: (track: Track) => void;
}

const MOODS = [
  { label: "Relax", query: "relaxing chinese mandarin music" },
  { label: "Sad", query: "sad emotional chinese japanese songs" },
  { label: "Feel good", query: "feel good happy kpop cpop" },
  { label: "Romance", query: "romantic chinese japanese love songs" },
  { label: "Energize", query: "energetic kpop jpop upbeat" },
  { label: "Focus", query: "lofi japanese study music" },
  { label: "Party", query: "kpop party hits dance" },
  { label: "Sleep", query: "soft chinese japanese sleep music" },
  { label: "Commute", query: "mandarin pop commute playlist" },
  { label: "Nostalgic", query: "classic chinese cantopop 90s" },
];

const GENRES = [
  // Chinese
  { label: "Mandopop", query: "mandarin pop music hits 华语流行", color: "from-red-500 to-rose-800" },
  { label: "Cantopop", query: "cantonese pop music 粤语歌曲", color: "from-orange-500 to-red-800" },
  { label: "C-Drama OST", query: "chinese drama ost soundtrack 华剧主题曲", color: "from-pink-500 to-fuchsia-800" },
  { label: "Chinese Indie", query: "chinese indie folk music 华语独立", color: "from-rose-400 to-pink-800" },
  // Japanese
  { label: "J-Pop", query: "jpop music hits 日本流行音楽", color: "from-violet-500 to-purple-800" },
  { label: "Anime OST", query: "anime opening ending songs soundtrack", color: "from-indigo-500 to-violet-800" },
  { label: "City Pop", query: "japanese city pop 80s シティポップ", color: "from-blue-400 to-indigo-700" },
  { label: "J-Rock", query: "japanese rock music visual kei", color: "from-slate-500 to-gray-900" },
  // Korean
  { label: "K-Pop", query: "kpop music hits 2024 케이팝", color: "from-sky-400 to-blue-700" },
  { label: "K-R&B", query: "korean rnb soul music 한국 알앤비", color: "from-cyan-500 to-teal-800" },
  { label: "K-Drama OST", query: "korean drama ost 드라마 주제곡", color: "from-teal-400 to-cyan-800" },
  // English
  { label: "Pop", query: "english pop music hits 2024", color: "from-amber-400 to-orange-700" },
  { label: "R&B", query: "rnb soul music english hits", color: "from-yellow-500 to-amber-800" },
  { label: "Hip-Hop", query: "hip hop rap english music", color: "from-zinc-500 to-zinc-900" },
];

const QUICK_PICK_QUERIES = [
  "周杰伦 陈奕迅 林俊杰 歌曲 MV",
  "华语流行 抖音热歌 2024 单曲",
  "IVE aespa NewJeans BLACKPINK official mv",
  "YOASOBI 米津玄師 藤井風 Official MV",
  "Taylor Swift Sabrina Carpenter Billie Eilish official mv 2024",
  "张惠妹 邓紫棋 王菲 经典歌曲",
  "BTS Stray Kids Tomorrow X Together official mv",
  "ado 優里 なとり official mv 2024",
];

const PLAYLIST_TITLE_FILTER = /\b(top\s*\d+|playlist|compilation|best of|greatest hits|collection|nonstop|mix|vol\.|part \d)/i;

// Matches titles that explicitly call out "MV", "M/V", "Music Video", "Official Video", "PV", etc.
const MV_TITLE_PATTERN = /(official\s*(m\/?v|music\s*video|video)|music\s*video|\bm\/v\b|\bpv\b|官方\s*mv|뮤직\s*비디오)/i;

function isLikelySingleTrack(track: Track): boolean {
  if (track.duration < 60) return false;
  if (track.duration > 600) return false;
  if (PLAYLIST_TITLE_FILTER.test(track.title)) return false;
  return true;
}

function isLikelyMV(track: Track): boolean {
  if (!isLikelySingleTrack(track)) return false;
  return MV_TITLE_PATTERN.test(track.title);
}

function ScrollRow({
  title, children, onMore,
}: {
  title: string;
  children: React.ReactNode;
  onMore?: () => void;
}) {
  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-4 px-6">
        <h2 className="text-lg font-bold text-yt-text">{title}</h2>
        {onMore && (
          <button
            onClick={onMore}
            className="text-sm text-yt-muted hover:text-yt-text transition-colors"
          >
            More
          </button>
        )}
      </div>
      <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-1 px-6">
        {children}
      </div>
    </section>
  );
}

function TrackCard({ track, onPlay }: { track: Track; onPlay: () => void }) {
  return (
    <div
      className="flex items-center gap-3 p-2 rounded-lg hover:bg-yt-elevated transition-colors cursor-pointer group"
      onClick={onPlay}
    >
      <div className="relative flex-shrink-0">
        <img
          src={track.thumbnail}
          alt={track.title}
          className="w-12 h-12 rounded object-cover"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-black/40 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <Play size={16} className="text-white fill-white" />
        </div>
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-yt-text truncate leading-tight">{track.title}</p>
        <p className="text-xs text-yt-muted truncate mt-0.5">{track.artist}</p>
      </div>
    </div>
  );
}

function RightSection({
  title,
  tracks,
  onPlayTrack,
}: {
  title: string;
  tracks: Track[];
  onPlayTrack: (t: Track) => void;
}) {
  if (tracks.length === 0) return (
    <section className="mb-8">
      <h2 className="text-lg font-bold text-yt-text mb-4 px-6">{title}</h2>
      <div className="flex flex-col gap-1 px-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-2">
            <div className="w-12 h-12 rounded bg-yt-elevated flex-shrink-0 animate-pulse" />
            <div className="flex-1 space-y-2">
              <div className="h-3 bg-yt-elevated rounded animate-pulse w-3/4" />
              <div className="h-2 bg-yt-elevated rounded animate-pulse w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
  return (
    <section className="mb-8">
      <h2 className="text-lg font-bold text-yt-text mb-4 px-6">{title}</h2>
      <div className="flex flex-col gap-1 px-4">
        {tracks.map((track) => (
          <TrackCard key={track.video_id} track={track} onPlay={() => onPlayTrack(track)} />
        ))}
      </div>
    </section>
  );
}

export default function Home({ playlists, guildId, onCreatePlaylist, onPlayTrack }: Props) {
  const navigate = useNavigate();
  const search = (q: string) => navigate(`/search?q=${encodeURIComponent(q)}`);
  const [quickPicks, setQuickPicks] = useState<Track[]>([]);
  const [quickPicksLoading, setQuickPicksLoading] = useState(true);
  const [newReleased, setNewReleased] = useState<Track[]>([]);
  const [trending, setTrending] = useState<Track[]>([]);
  const [mvForYou, setMvForYou] = useState<Track[]>([]);

  useEffect(() => {
    const shuffled = [...QUICK_PICK_QUERIES].sort(() => Math.random() - 0.5);
    const [q1, q2] = shuffled;
    Promise.all([searchTracks(q1), searchTracks(q2)])
      .then(([r1, r2]) => {
        const merged = [...r1, ...r2]
          .filter(isLikelySingleTrack)
          .filter((t, i, arr) => arr.findIndex((x) => x.video_id === t.video_id) === i);
        setQuickPicks(merged.sort(() => Math.random() - 0.5).slice(0, 12));
      })
      .catch(() => {})
      .finally(() => setQuickPicksLoading(false));
  }, []);

  useEffect(() => {
    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
    delay(500)
      .then(() => searchTracks("aespa IVE NewJeans BLACKPINK official mv 2025 new single"))
      .then((r) => setNewReleased(r.filter(isLikelySingleTrack).slice(0, 6)))
      .catch(() => {});
    delay(900)
      .then(() => searchTracks("YOASOBI ado 米津玄師 Official MV 2024 2025 hit song"))
      .then((r) => setTrending(r.filter(isLikelySingleTrack).slice(0, 6)))
      .catch(() => {});
    delay(1300)
      .then(() => Promise.all([
        searchTracks("aespa NewJeans IVE BLACKPINK official music video MV 2024 2025"),
        searchTracks("周杰伦 YOASOBI 米津玄師 Taylor Swift official music video MV"),
      ]))
      .then(([r1, r2]) => {
        const merged = [...r1, ...r2]
          .filter(isLikelyMV)
          .filter((t, i, arr) => arr.findIndex((x) => x.video_id === t.video_id) === i);
        setMvForYou(merged.slice(0, 6));
      })
      .catch(() => {});
  }, []);

  const qpCols = [
    quickPicks.slice(0, 4),
    quickPicks.slice(4, 8),
    quickPicks.slice(8, 12),
  ].filter((col) => col.length > 0);

  return (
    <div className="flex flex-col md:flex-row min-h-full">
      {/* Left column */}
      <div className="flex-1 min-w-0 py-6">
        {/* Mood chips */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2 mb-8 px-6">
          {MOODS.map((m) => (
            <button
              key={m.label}
              onClick={() => search(m.query)}
              className="flex-shrink-0 px-5 py-1.5 rounded-full bg-yt-elevated text-sm font-medium text-yt-text hover:bg-yt-border transition-colors"
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Your Library */}
        <ScrollRow title="Your Library">
          {playlists.map((pl) => (
            <button
              key={pl.id}
              onClick={() => navigate(`/playlist/${pl.id}`)}
              className="flex-shrink-0 w-40 text-left group"
            >
              <div className="w-40 h-40 rounded-xl bg-yt-elevated flex items-center justify-center mb-2 group-hover:bg-yt-border transition-colors">
                <Music2 size={36} className="text-yt-muted opacity-40" />
              </div>
              <p className="text-sm font-semibold text-yt-text truncate">{pl.name}</p>
              <p className="text-xs text-yt-muted mt-0.5">Playlist</p>
            </button>
          ))}
          <button
            onClick={onCreatePlaylist}
            className="flex-shrink-0 w-40 text-left group"
          >
            <div className="w-40 h-40 rounded-xl bg-yt-elevated flex items-center justify-center mb-2 group-hover:bg-yt-border transition-colors">
              <Plus size={32} className="text-yt-muted" />
            </div>
            <p className="text-sm text-yt-muted">New playlist</p>
          </button>
        </ScrollRow>

        {/* Quick picks */}
        {(quickPicksLoading || quickPicks.length > 0) && (
          <section className="mb-8">
            <div className="mb-4 px-6">
              <h2 className="text-lg font-bold text-yt-text">Quick picks</h2>
            </div>
            {quickPicksLoading ? (
              <div className="flex gap-2 px-6">
                {[0, 1, 2].map((ci) => (
                  <div key={ci} className="flex-shrink-0 w-72 flex flex-col gap-1">
                    {[0, 1, 2, 3].map((i) => (
                      <div key={i} className="flex items-center gap-3 p-2">
                        <div className="w-12 h-12 rounded bg-yt-elevated flex-shrink-0 animate-pulse" />
                        <div className="flex-1 space-y-2">
                          <div className="h-3 bg-yt-elevated rounded animate-pulse w-3/4" />
                          <div className="h-2 bg-yt-elevated rounded animate-pulse w-1/2" />
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <>
                <div className="flex gap-2 overflow-x-auto scrollbar-hide px-6">
                  {qpCols.map((col, ci) => (
                    <div key={ci} className="flex-shrink-0 w-72 flex flex-col gap-1">
                      {col.map((track) => (
                        <TrackCard
                          key={track.video_id}
                          track={track}
                          onPlay={() => onPlayTrack(track)}
                        />
                      ))}
                    </div>
                  ))}
                </div>
                <div className="flex justify-start mt-2 px-6">
                  <button
                    onClick={() => search(QUICK_PICK_QUERIES[0])}
                    className="text-sm text-yt-muted hover:text-yt-text transition-colors"
                  >
                    Play all
                  </button>
                </div>
              </>
            )}
          </section>
        )}

        {/* Browse by genre */}
        <section className="mb-8">
          <div className="mb-4 px-6">
            <h2 className="text-lg font-bold text-yt-text">Browse by genre</h2>
          </div>
          <div className="overflow-x-auto scrollbar-hide px-6">
            <div className="grid grid-rows-2 grid-flow-col gap-2 w-max">
              {GENRES.map((g) => (
                <button
                  key={g.label}
                  onClick={() => search(g.query)}
                  className={`w-32 h-14 rounded-xl bg-gradient-to-br ${g.color} flex items-center justify-center hover:scale-105 transition-transform`}
                >
                  <span className="text-xs font-bold text-white drop-shadow text-center leading-tight px-1">{g.label}</span>
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* Divider — vertical on desktop, horizontal on mobile */}
      <div className="hidden md:block w-px bg-yt-border flex-shrink-0" />
      <div className="block md:hidden mx-6 border-t border-yt-border" />

      {/* Right column */}
      <div className="flex-1 min-w-0 py-6">
        <RightSection title="New Released" tracks={newReleased} onPlayTrack={onPlayTrack} />
        <RightSection title="Trending Song" tracks={trending} onPlayTrack={onPlayTrack} />
        <RightSection title="Music Videos for You" tracks={mvForYou} onPlayTrack={onPlayTrack} />
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Music2, Play, Plus } from "lucide-react";
import type { Playlist, Track } from "../types";
import { getPlayHistory, searchTracks } from "../lib/api";
import { getGradient } from "../lib/playlistTheme";

interface Props {
  playlists: Playlist[];
  guildId: string | null;
  onCreatePlaylist: () => void;
  onPlayTrack: (track: Track) => void;
}

// ─── Mood chips ───────────────────────────────────────────────────────────────
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

// ─── Genres — each has a display label and search query ──────────────────────
const GENRES = [
  { label: "Mandopop",     query: "mandarin pop music hits 华语流行" },
  { label: "Cantopop",     query: "cantonese pop music 粤语歌曲" },
  { label: "C-Drama OST",  query: "chinese drama ost soundtrack 华剧主题曲" },
  { label: "Chinese Indie",query: "chinese indie folk music 华语独立" },
  { label: "J-Pop",        query: "jpop music hits 日本流行音楽" },
  { label: "Anime OST",    query: "anime opening ending songs soundtrack" },
  { label: "City Pop",     query: "japanese city pop 80s シティポップ" },
  { label: "J-Rock",       query: "japanese rock music visual kei" },
  { label: "K-Pop",        query: "kpop music hits 2024 케이팝" },
  { label: "K-R&B",        query: "korean rnb soul music 한국 알앤비" },
  { label: "K-Drama OST",  query: "korean drama ost 드라마 주제곡" },
  { label: "Pop",          query: "english pop music hits 2024" },
  { label: "R&B",          query: "rnb soul music english hits" },
  { label: "Hip-Hop",      query: "hip hop rap english music" },
];

// ─── Quick picks fallback pools ───────────────────────────────────────────────
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

const NEW_RELEASE_POOLS = [
  "aespa 에스파 official mv 2025 new comeback single",
  "NewJeans 뉴진스 official mv 2025 new release",
  "IVE 아이브 official mv 2025 new comeback",
  "LE SSERAFIM official mv 2025 new single",
  "BLACKPINK ROSÉ LISA solo official mv 2025",
  "BTS Jin Jungkook Jimin solo official mv 2025",
  "Stray Kids new release official mv 2025",
  "TWICE official mv 2025 comeback new song",
  "YOASOBI new song official mv 2025",
  "ado new release official mv 2025",
  "米津玄師 Kenshi Yonezu new song official mv 2025",
  "藤井風 Fujii Kaze new release official mv 2025",
  "周杰伦 Jay Chou new song official mv 2025",
  "邓紫棋 G.E.M. new release official mv 2025",
  "Taylor Swift new release official mv 2025",
  "Sabrina Carpenter new song official video 2025",
  "Billie Eilish new release official mv 2025",
  "Olivia Rodrigo new song official mv 2025",
];

const TRENDING_POOLS = [
  "kpop most streamed chart top hits 2024 trending",
  "NewJeans aespa IVE trending most streamed 2024",
  "BTS Stray Kids SEVENTEEN trending most played 2024",
  "BLACKPINK TWICE MAMAMOO trending most played 2024",
  "jpop trending Billboard Japan top chart 2024",
  "ado YOASOBI 米津玄師 藤井風 trending most played 2024",
  "cpop mandopop trending most played 2024 chart",
  "华语流行 trending 2024 most popular songs 排行榜",
  "抖音热歌 2024 most played trending chart 华语",
  "pop music trending chart most played 2024 hit songs",
];

const MV_POOLS = [
  "kpop official music video 2024 most viewed YouTube",
  "NewJeans aespa IVE official MV most viewed 2024",
  "BLACKPINK official music video most viewed 2024",
  "BTS official music video most viewed 2024 2025",
  "jpop official music video 2024 most viewed YouTube",
  "YOASOBI official MV most viewed 2024 2025",
  "ado official MV most viewed 2024 YouTube",
  "米津玄師 Kenshi Yonezu official MV most viewed 2024",
  "周杰伦 official MV most viewed 2024 华语",
  "Taylor Swift Billie Eilish official MV most viewed 2024",
  "Sabrina Carpenter Olivia Rodrigo official music video 2024",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function pickRandom<T>(arr: T[], n: number): T[] {
  return [...arr].sort(() => Math.random() - 0.5).slice(0, n);
}

/** Format duration seconds → "3:45" */
function fmtDur(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Format a raw YouTube view count into "3.1B plays", "460M plays", "307K plays" */
function formatPlays(count?: number): string {
  if (!count || count < 1000) return "";
  if (count >= 1_000_000_000) return `${(count / 1_000_000_000).toFixed(1)}B plays`;
  if (count >= 1_000_000)     return `${(count / 1_000_000).toFixed(count >= 100_000_000 ? 0 : 1)}M plays`;
  return `${Math.round(count / 1_000)}K plays`;
}

/**
 * Filters out:
 *  - Playlists/compilations (top N, nonstop, best of, etc.)
 *  - Comparison / chart / statistics videos (vs, dynamic graph, bar race, etc.)
 *  - Non-music content (reaction, interview, behind the scenes, etc.)
 */
const NON_MUSIC_FILTER = /\b(top\s*\d+|playlist|compilation|best\s+of|greatest\s+hits|collection|nonstop|megamix|vol\.|part\s+\d+|\bvs\.?\b|versus\b|dynamic\s+graph|bar\s+(?:chart|race)|statistics\b|reaction\b|interview\b|behind\s+the\s+scenes|making\s+of|documentary\b|ranked\s+(?:chart|race)|#shorts?)\b/i;
const MV_TITLE_PATTERN = /(official\s*(m\/?v|music\s*video|video)|music\s*video|\bm\/v\b|\bpv\b|官方\s*mv|뮤직\s*비디오)/i;

function isLikelySingleTrack(track: Track): boolean {
  if (track.duration < 120) return false;  // minimum 2 minutes
  if (track.duration > 600) return false;  // maximum 10 minutes
  if (NON_MUSIC_FILTER.test(track.title)) return false;
  return true;
}
function isLikelyMV(track: Track): boolean {
  return isLikelySingleTrack(track) && MV_TITLE_PATTERN.test(track.title);
}

// ─── Shared TrackCard ─────────────────────────────────────────────────────────
function TrackCard({ track, onPlay }: { track: Track; onPlay: () => void }) {
  const plays = formatPlays(track.view_count);
  // Duration is always available; plays and album are optional extras from yt-dlp
  const sub = [track.artist, fmtDur(track.duration), plays, track.album].filter(Boolean).join(" · ");
  return (
    <div
      className="flex items-center gap-3 p-2 rounded-lg hover:bg-yt-elevated transition-colors cursor-pointer group"
      onClick={onPlay}
    >
      <div className="relative flex-shrink-0">
        <img
          src={track.thumbnail}
          alt={track.title}
          className="w-12 h-12 rounded object-cover bg-yt-elevated"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-black/40 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <Play size={16} className="text-white fill-white" />
        </div>
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-yt-text truncate leading-tight">{track.title}</p>
        {sub && <p className="text-xs text-yt-muted truncate mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Skeleton row ─────────────────────────────────────────────────────────────
function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 p-2">
      <div className="w-12 h-12 rounded bg-yt-elevated flex-shrink-0 animate-pulse" />
      <div className="flex-1 space-y-2">
        <div className="h-3 bg-yt-elevated rounded animate-pulse w-3/4" />
        <div className="h-2 bg-yt-elevated rounded animate-pulse w-1/2" />
      </div>
    </div>
  );
}

// ─── Section: horizontal scroll row (Library) ─────────────────────────────────
function ScrollRow({ title, children, onMore }: { title: string; children: React.ReactNode; onMore?: () => void }) {
  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-4 px-6">
        <h2 className="text-lg font-bold text-yt-text">{title}</h2>
        {onMore && (
          <button onClick={onMore} className="text-sm text-yt-muted hover:text-yt-text transition-colors">
            More
          </button>
        )}
      </div>
      <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-1 px-6">{children}</div>
    </section>
  );
}

// ─── Section: right-column list (New Released, Trending, MVs) ────────────────
function RightSection({ title, tracks, onPlayTrack }: { title: string; tracks: Track[]; onPlayTrack: (t: Track) => void }) {
  if (tracks.length === 0) {
    return (
      <section className="mb-8">
        <h2 className="text-lg font-bold text-yt-text mb-4 px-6">{title}</h2>
        <div className="flex flex-col gap-1 px-4">
          {[...Array(5)].map((_, i) => <SkeletonRow key={i} />)}
        </div>
      </section>
    );
  }
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

// ─── Genre section — vertical, one block per genre ───────────────────────────

/** Which genres to feature on the home page (picks a spread across languages) */
const FEATURED_GENRES = [
  GENRES[0],  // Mandopop
  GENRES[8],  // K-Pop
  GENRES[4],  // J-Pop
  GENRES[1],  // Cantopop
  GENRES[11], // Pop
  GENRES[5],  // Anime OST
];

/** One genre block: loads its own songs independently, no shared dedup state */
function GenreBlock({
  genre,
  loadDelay,
  onPlayTrack,
}: {
  genre: { label: string; query: string };
  loadDelay: number;
  onPlayTrack: (t: Track) => void;
}) {
  const navigate = useNavigate();
  const [songs, setSongs] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      searchTracks(genre.query)
        .then((results) => {
          if (cancelled) return;
          const filtered = results
            .filter(isLikelySingleTrack)
            .filter((t, i, arr) => arr.findIndex((x) => x.video_id === t.video_id) === i)
            .slice(0, 5);
          setSongs(filtered);
        })
        .catch(() => { if (!cancelled) setFailed(true); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, loadDelay);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [genre.query, loadDelay]);

  return (
    <section className="mb-8">
      {/* Header: 【Genre】 ··· View all */}
      <div className="flex items-center justify-between mb-3 px-6">
        <h3 className="text-base font-bold text-yt-text">
          【{genre.label}】
        </h3>
        <button
          onClick={() => navigate(`/search?q=${encodeURIComponent(genre.query)}`)}
          className="text-xs text-yt-muted hover:text-yt-text transition-colors"
        >
          View all
        </button>
      </div>

      {/* Song list */}
      <div className="flex flex-col gap-1 px-4">
        {loading ? (
          [0, 1, 2, 3, 4].map((i) => <SkeletonRow key={i} />)
        ) : failed || songs.length === 0 ? (
          <p className="text-xs text-yt-muted px-2 py-3">No results</p>
        ) : (
          songs.map((track) => (
            <TrackCard key={track.video_id} track={track} onPlay={() => onPlayTrack(track)} />
          ))
        )}
      </div>
    </section>
  );
}

function GenreSection({ onPlayTrack }: { onPlayTrack: (t: Track) => void }) {
  return (
    <section>
      <div className="mb-4 px-6">
        <h2 className="text-lg font-bold text-yt-text">Browse by genre</h2>
      </div>
      {FEATURED_GENRES.map((genre, i) => (
        <GenreBlock
          key={genre.label}
          genre={genre}
          loadDelay={i * 400}   // stagger requests 400ms apart
          onPlayTrack={onPlayTrack}
        />
      ))}
    </section>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Home({ playlists, guildId, onCreatePlaylist, onPlayTrack }: Props) {
  const navigate = useNavigate();
  const search = (q: string) => navigate(`/search?q=${encodeURIComponent(q)}`);

  const [quickPicks, setQuickPicks]         = useState<Track[]>([]);
  const [quickPicksLoading, setQPLoading]   = useState(true);
  const [newReleased, setNewReleased]       = useState<Track[]>([]);
  const [trending, setTrending]             = useState<Track[]>([]);
  const [mvForYou, setMvForYou]             = useState<Track[]>([]);

  // Global dedup — shared across all sections so the same song never appears twice
  const seenIds = useRef<Set<string>>(new Set());

  const addSeen = (tracks: Track[]): Track[] => {
    const fresh = tracks.filter((t) => !seenIds.current.has(t.video_id));
    fresh.forEach((t) => seenIds.current.add(t.video_id));
    return fresh;
  };

  // ── Quick Picks: history-based if possible, random fallback ─────────────────
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        // Try play history for personalised picks
        if (guildId) {
          const history = await getPlayHistory(guildId);
          if (history.length >= 3) {
            const recentArtists = [...new Set(history.slice(0, 15).map((t) => t.artist))].slice(0, 4);
            const queries = recentArtists.map((a) => `${a} popular songs official mv`);
            const results = await Promise.all(queries.map((q) => searchTracks(q)));
            const recentIds = new Set(history.slice(0, 5).map((t) => t.video_id));
            const merged = results
              .flat()
              .filter(isLikelySingleTrack)
              .filter((t) => !recentIds.has(t.video_id))
              .filter((t, i, arr) => arr.findIndex((x) => x.video_id === t.video_id) === i);
            if (!cancelled) {
              setQuickPicks(addSeen(merged.sort(() => Math.random() - 0.5).slice(0, 12)));
              setQPLoading(false);
              return;
            }
          }
        }
      } catch (_) { /* fallback below */ }

      // Fallback: random pool
      if (!cancelled) {
        const [q1, q2] = pickRandom(QUICK_PICK_QUERIES, 2);
        const [r1, r2] = await Promise.all([searchTracks(q1), searchTracks(q2)]);
        const merged = [...r1, ...r2]
          .filter(isLikelySingleTrack)
          .filter((t, i, arr) => arr.findIndex((x) => x.video_id === t.video_id) === i);
        if (!cancelled) {
          setQuickPicks(addSeen(merged.sort(() => Math.random() - 0.5).slice(0, 12)));
          setQPLoading(false);
        }
      }
    }

    load().catch(() => { if (!cancelled) setQPLoading(false); });
    return () => { cancelled = true; };
  }, [guildId]);

  // ── Right-column sections: New Released · Trending · MVs ─────────────────
  useEffect(() => {
    const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

    const [nq1, nq2] = pickRandom(NEW_RELEASE_POOLS, 2);
    delay(400)
      .then(() => Promise.all([searchTracks(nq1), searchTracks(nq2)]))
      .then(([r1, r2]) => {
        const merged = [...r1, ...r2]
          .filter(isLikelySingleTrack)
          .filter((t, i, arr) => arr.findIndex((x) => x.video_id === t.video_id) === i);
        setNewReleased(addSeen(merged.sort(() => Math.random() - 0.5).slice(0, 6)));
      })
      .catch(() => {});

    const [tq1, tq2] = pickRandom(TRENDING_POOLS, 2);
    delay(800)
      .then(() => Promise.all([searchTracks(tq1), searchTracks(tq2)]))
      .then(([r1, r2]) => {
        const merged = [...r1, ...r2]
          .filter(isLikelySingleTrack)
          .filter((t, i, arr) => arr.findIndex((x) => x.video_id === t.video_id) === i);
        setTrending(addSeen(merged.sort(() => Math.random() - 0.5).slice(0, 6)));
      })
      .catch(() => {});

    const [mq1, mq2] = pickRandom(MV_POOLS, 2);
    delay(1200)
      .then(() => Promise.all([searchTracks(mq1), searchTracks(mq2)]))
      .then(([r1, r2]) => {
        const merged = [...r1, ...r2]
          .filter(isLikelyMV)
          .filter((t, i, arr) => arr.findIndex((x) => x.video_id === t.video_id) === i);
        setMvForYou(addSeen(merged.sort(() => Math.random() - 0.5).slice(0, 6)));
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
      {/* ── Left column ─────────────────────────────────────────────────────── */}
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
            <button key={pl.id} onClick={() => navigate(`/playlist/${pl.id}`)} className="flex-shrink-0 w-40 text-left group">
              <div
                className="w-40 h-40 rounded-xl flex items-center justify-center mb-2 text-4xl transition-opacity group-hover:opacity-80 overflow-hidden"
                style={{ background: (pl.icon && (pl.icon.startsWith("/") || pl.icon.startsWith("http"))) ? undefined : getGradient(pl.color) }}
              >
                {pl.icon && (pl.icon.startsWith("/") || pl.icon.startsWith("http")) ? (
                  <img src={pl.icon} alt={pl.name} className="w-full h-full object-cover" />
                ) : (
                  pl.icon || <Music2 size={36} className="text-white opacity-60" />
                )}
              </div>
              <p className="text-sm font-semibold text-yt-text truncate">{pl.name}</p>
              <p className="text-xs text-yt-muted mt-0.5">Playlist</p>
            </button>
          ))}
          <button onClick={onCreatePlaylist} className="flex-shrink-0 w-40 text-left group">
            <div className="w-40 h-40 rounded-xl bg-yt-elevated flex items-center justify-center mb-2 group-hover:bg-yt-border transition-colors">
              <Plus size={32} className="text-yt-muted" />
            </div>
            <p className="text-sm text-yt-muted">New playlist</p>
          </button>
        </ScrollRow>

        {/* Quick Picks */}
        {(quickPicksLoading || quickPicks.length > 0) && (
          <section className="mb-8">
            <div className="mb-4 px-6">
              <h2 className="text-lg font-bold text-yt-text">Quick picks</h2>
              {guildId && !quickPicksLoading && (
                <p className="text-xs text-yt-muted mt-0.5">Based on your recent plays</p>
              )}
            </div>
            {quickPicksLoading ? (
              <div className="flex gap-2 px-6">
                {[0, 1, 2].map((ci) => (
                  <div key={ci} className="flex-shrink-0 w-72 flex flex-col gap-1">
                    {[0, 1, 2, 3].map((i) => <SkeletonRow key={i} />)}
                  </div>
                ))}
              </div>
            ) : (
              <>
                <div className="flex gap-2 overflow-x-auto scrollbar-hide px-6">
                  {qpCols.map((col, ci) => (
                    <div key={ci} className="flex-shrink-0 w-72 flex flex-col gap-1">
                      {col.map((track) => (
                        <TrackCard key={track.video_id} track={track} onPlay={() => onPlayTrack(track)} />
                      ))}
                    </div>
                  ))}
                </div>
                <div className="flex justify-start mt-2 px-6">
                  <button
                    onClick={() => quickPicks.forEach((t) => onPlayTrack(t))}
                    className="text-sm text-yt-muted hover:text-yt-text transition-colors"
                  >
                    Play all
                  </button>
                </div>
              </>
            )}
          </section>
        )}

        {/* Genre section — vertical, one block per genre */}
        <GenreSection onPlayTrack={onPlayTrack} />
      </div>

      {/* Divider */}
      <div className="hidden md:block w-px bg-yt-border flex-shrink-0" />
      <div className="block md:hidden mx-6 border-t border-yt-border" />

      {/* ── Right column ────────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 py-6">
        <RightSection title="New Released"         tracks={newReleased} onPlayTrack={onPlayTrack} />
        <RightSection title="Trending Song"        tracks={trending}    onPlayTrack={onPlayTrack} />
        <RightSection title="Music Videos for You" tracks={mvForYou}    onPlayTrack={onPlayTrack} />
      </div>
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Music2, Play, Plus, RefreshCw } from "lucide-react";
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
  { label: "Relax",     query: "relaxing chinese mandarin music" },
  { label: "Sad",       query: "sad emotional chinese japanese songs" },
  { label: "Feel good", query: "feel good happy kpop cpop" },
  { label: "Romance",   query: "romantic chinese japanese love songs" },
  { label: "Energize",  query: "energetic kpop jpop upbeat" },
  { label: "Focus",     query: "lofi japanese study music" },
  { label: "Party",     query: "kpop party hits dance" },
  { label: "Sleep",     query: "soft chinese japanese sleep music" },
  { label: "Commute",   query: "mandarin pop commute playlist" },
  { label: "Nostalgic", query: "classic chinese cantopop 90s" },
];

// ─── Genres ───────────────────────────────────────────────────────────────────
const GENRES = [
  { label: "Mandopop",      query: "华语流行 official mv single 国语 MV" },
  { label: "Cantopop",      query: "cantonese pop 粤语 official mv single 2024" },
  { label: "C-Drama OST",   query: "chinese drama ost 华剧 主题曲 official mv" },
  { label: "Chinese Indie",  query: "chinese indie folk 华语独立 official mv" },
  { label: "J-Pop",         query: "jpop official mv single 日本 2024 人気" },
  { label: "Anime OST",     query: "anime opening ending official mv 2024 single" },
  { label: "City Pop",      query: "japanese city pop official mv シティポップ" },
  { label: "J-Rock",        query: "japanese rock band official mv single 2024" },
  { label: "K-Pop",         query: "kpop idol official mv single 2024 케이팝" },
  { label: "K-R&B",         query: "korean rnb soul official mv single 한국" },
  { label: "K-Drama OST",   query: "korean drama ost official mv 드라마 주제곡" },
  { label: "Pop",           query: "pop artist official music video single 2024" },
  { label: "R&B",           query: "rnb soul official music video single 2024" },
  { label: "Hip-Hop",       query: "hiphop rap official music video single 2024" },
];

const FEATURED_GENRES = [
  GENRES[0],  // Mandopop
  GENRES[8],  // K-Pop
  GENRES[4],  // J-Pop
  GENRES[1],  // Cantopop
  GENRES[11], // Pop
  GENRES[5],  // Anime OST
];

// ─── Query pools ──────────────────────────────────────────────────────────────
const QUICK_PICK_QUERIES = [
  "周杰伦 陈奕迅 林俊杰 歌曲 MV",
  "IVE aespa NewJeans BLACKPINK official mv single",
  "YOASOBI 米津玄師 藤井風 Official MV single",
  "Taylor Swift Sabrina Carpenter Billie Eilish official mv 2024",
  "张惠妹 邓紫棋 王菲 经典歌曲 official mv",
  "BTS Stray Kids Tomorrow X Together official mv single",
  "ado 優里 なとり official mv single 2024",
];

const NEW_RELEASE_POOLS = [
  "aespa 에스파 official mv 2025 new single",
  "NewJeans 뉴진스 official mv 2025 new single",
  "IVE 아이브 official mv 2025 new single",
  "LE SSERAFIM official mv 2025 new single",
  "BLACKPINK ROSÉ LISA solo official mv 2025",
  "BTS Jin Jungkook Jimin solo official mv 2025",
  "Stray Kids new single official mv 2025",
  "TWICE official mv 2025 new song",
  "YOASOBI new song official mv 2025",
  "ado new single official mv 2025",
  "米津玄師 Kenshi Yonezu new song official mv 2025",
  "藤井風 Fujii Kaze new single official mv 2025",
  "周杰伦 Jay Chou new song official mv 2025",
  "邓紫棋 G.E.M. new single official mv 2025",
  "Taylor Swift new single official mv 2025",
  "Sabrina Carpenter new song official video 2025",
  "Billie Eilish new single official mv 2025",
];

// Trending — use artist-level queries that return actual songs, not compilations
const TRENDING_POOLS = [
  "NewJeans IVE aespa official mv single 2024",
  "BLACKPINK ROSÉ Bruno Mars official mv single 2024",
  "BTS Jung Kook Jimin official mv single 2024",
  "Stray Kids TXT SEVENTEEN official mv single 2024",
  "LE SSERAFIM TWICE MAMAMOO official mv 2024",
  "YOASOBI ado official mv single 2024",
  "米津玄師 藤井風 Official髭男dism official mv 2024",
  "周杰伦 邓紫棋 陈奕迅 official mv single 2024",
  "薛之谦 华晨宇 林俊杰 official mv single 2024",
  "Taylor Swift Sabrina Carpenter official video single 2024",
  "Billie Eilish Olivia Rodrigo official mv single 2024",
  "Ariana Grande Dua Lipa official mv single 2024",
];

// MVs — specific artist MV queries (not "most viewed" compilations)
const MV_POOLS = [
  "NewJeans aespa IVE official music video 2024",
  "BLACKPINK official music video 2023 2024",
  "BTS Stray Kids official music video 2024",
  "YOASOBI ado official music video 2024",
  "米津玄師 Kenshi Yonezu official music video 2024",
  "藤井風 Fujii Kaze official music video 2024",
  "周杰伦 Jay Chou official music video MV",
  "邓紫棋 G.E.M. official music video MV",
  "Taylor Swift Billie Eilish official music video 2024",
  "Sabrina Carpenter Olivia Rodrigo official music video 2024",
  "Ariana Grande Dua Lipa official music video 2024",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function pickRandom<T>(arr: T[], n: number): T[] {
  return [...arr].sort(() => Math.random() - 0.5).slice(0, n);
}

function fmtDur(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatPlays(count?: number): string {
  if (!count || count < 1000) return "";
  if (count >= 1_000_000_000) return `${(count / 1_000_000_000).toFixed(1)}B plays`;
  if (count >= 1_000_000)     return `${(count / 1_000_000).toFixed(count >= 100_000_000 ? 0 : 1)}M plays`;
  return `${Math.round(count / 1_000)}K plays`;
}

/**
 * Combined filter — blocks:
 *  • Playlists / compilations
 *  • Chart / stats / comparison videos
 *  • Non-music content (reaction, interview, etc.)
 *  • "Most viewed" chart-style titles
 */
const NON_MUSIC_FILTER = new RegExp(
  [
    "top\\s*\\d+",          // top 10, top 100
    "top\\s+songs?",        // Top Songs 2024
    "top\\s+charts?",       // Top Charts
    "best\\s+new\\s+music", // Best New Music Hits
    "new\\s+music\\s+hits?",// New Music Hits
    "latest\\s+(?:music\\s+)?releases?", // Latest Music Releases
    "trending\\s+songs?(?!\\s+i\\s+love)", // Trending Songs (but not "trending songs I love" edge case)
    "most\\s+viewed",       // Most Viewed Music Videos ...
    "playlist",
    "compilation",
    "best\\s+of",
    "greatest\\s+hits",
    "collection",
    "nonstop",
    "megamix",
    "vol\\.",
    "part\\s+\\d+",
    "\\bvs\\.?\\b",         // vs / vs.
    "versus\\b",
    "dynamic\\s+graph",
    "bar\\s+(?:chart|race)",
    "statistics\\b",
    "reaction\\b",
    "interview\\b",
    "behind\\s+the\\s+scenes",
    "making\\s+of",
    "documentary\\b",
    "ranked\\s+(?:chart|race)",
    "#shorts?",
  ].join("|"),
  "i"
);

const MV_TITLE_PATTERN = /(official\s*(m\/?v|music\s*video|video)|music\s*video|\bm\/v\b|\bpv\b|官方\s*mv|뮤직\s*비디오)/i;

/** Main filter: 2–7 min, no compilation/non-music titles */
function isLikelySingleTrack(t: Track): boolean {
  if (t.duration < 120) return false;
  if (t.duration > 420) return false; // 7 min max
  return !NON_MUSIC_FILTER.test(t.title);
}

/** Genre filter: slightly looser (1.5–8 min) to allow longer OST tracks */
function isGenreSong(t: Track): boolean {
  if (t.duration < 90)  return false;
  if (t.duration > 480) return false; // 8 min max
  return !NON_MUSIC_FILTER.test(t.title);
}

function isLikelyMV(t: Track): boolean {
  return isLikelySingleTrack(t) && MV_TITLE_PATTERN.test(t.title);
}

/** Dedup by video_id AND by normalised title prefix (catches near-identical uploads) */
function dedupTracks(tracks: Track[]): Track[] {
  const ids   = new Set<string>();
  const titles = new Set<string>();
  return tracks.filter((t) => {
    const titleKey = t.title.toLowerCase().replace(/\s+/g, " ").slice(0, 50);
    if (ids.has(t.video_id) || titles.has(titleKey)) return false;
    ids.add(t.video_id);
    titles.add(titleKey);
    return true;
  });
}

// ─── Shared UI components ─────────────────────────────────────────────────────
function RefreshButton({ onClick, loading }: { onClick: () => void; loading?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      title="Refresh"
      className="p-1 rounded text-yt-muted hover:text-yt-text transition-colors disabled:opacity-40"
    >
      <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
    </button>
  );
}

function TrackCard({ track, onPlay }: { track: Track; onPlay: () => void }) {
  const plays = formatPlays(track.view_count);
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

function ScrollRow({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-4 px-6">
        <h2 className="text-lg font-bold text-yt-text">{title}</h2>
      </div>
      <div className="flex gap-4 overflow-x-auto scrollbar-hide pb-1 px-6">{children}</div>
    </section>
  );
}

// ─── Right-column section (New Released / Trending / MVs) ────────────────────
interface RightSectionProps {
  title: string;
  tracks: Track[];
  loading: boolean;
  onRefresh: () => void;
  onPlayTrack: (t: Track) => void;
}
function RightSection({ title, tracks, loading, onRefresh, onPlayTrack }: RightSectionProps) {
  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-4 px-6">
        <h2 className="text-lg font-bold text-yt-text">{title}</h2>
        <RefreshButton onClick={onRefresh} loading={loading} />
      </div>
      <div className="flex flex-col gap-1 px-4">
        {loading
          ? [0, 1, 2, 3, 4].map((i) => <SkeletonRow key={i} />)
          : tracks.length === 0
          ? <p className="text-xs text-yt-muted px-2 py-4">No results — try refreshing</p>
          : tracks.map((t) => (
              <TrackCard key={t.video_id} track={t} onPlay={() => onPlayTrack(t)} />
            ))}
      </div>
    </section>
  );
}

// ─── Genre section ────────────────────────────────────────────────────────────
function GenreBlock({
  genre,
  loadDelay,
  onPlayTrack,
}: {
  genre: { label: string; query: string };
  loadDelay: number;
  onPlayTrack: (t: Track) => void;
}) {
  const navigate  = useNavigate();
  const [songs, setSongs]     = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefresh] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setSongs([]);
    setLoading(true);

    const timer = setTimeout(async () => {
      try {
        // Primary search
        const r1 = await searchTracks(genre.query);
        let filtered = dedupTracks(r1.filter(isGenreSong)).slice(0, 5);

        // Fallback: if < 5 results, try a broader version of the query
        if (filtered.length < 5 && !cancelled) {
          const fallbackQ = `${genre.label} official music video single`;
          const r2 = await searchTracks(fallbackQ);
          const combined = dedupTracks([...filtered, ...r2.filter(isGenreSong)]);
          filtered = combined.slice(0, 5);
        }

        if (!cancelled) setSongs(filtered);
      } catch (_) {}

      if (!cancelled) setLoading(false);
    }, loadDelay);

    return () => { cancelled = true; clearTimeout(timer); };
  }, [genre.query, loadDelay, refreshKey]);

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-3 px-6">
        <h3 className="text-base font-bold text-yt-text">【{genre.label}】</h3>
        <div className="flex items-center gap-2">
          <RefreshButton onClick={() => setRefresh((k) => k + 1)} loading={loading} />
          <button
            onClick={() => navigate(`/search?q=${encodeURIComponent(genre.query)}`)}
            className="text-xs text-yt-muted hover:text-yt-text transition-colors"
          >
            View all
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1 px-4">
        {loading
          ? [0, 1, 2, 3, 4].map((i) => <SkeletonRow key={i} />)
          : songs.length === 0
          ? <p className="text-xs text-yt-muted px-2 py-3">No results — try refreshing</p>
          : songs.map((t) => (
              <TrackCard key={t.video_id} track={t} onPlay={() => onPlayTrack(t)} />
            ))}
      </div>
    </section>
  );
}

function GenreSection({ onPlayTrack }: { onPlayTrack: (t: Track) => void }) {
  const navigate = useNavigate();
  return (
    <section>
      {/* Header */}
      <div className="mb-3 px-6">
        <h2 className="text-lg font-bold text-yt-text">Browse by genre</h2>
      </div>

      {/* Quick genre navigation chips */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide px-6 mb-6 pb-1">
        {GENRES.map((g) => (
          <button
            key={g.label}
            onClick={() => navigate(`/search?q=${encodeURIComponent(g.query)}`)}
            className="flex-shrink-0 px-4 py-1.5 rounded-full bg-yt-elevated text-sm text-yt-muted hover:bg-yt-border hover:text-yt-text transition-colors"
          >
            {g.label}
          </button>
        ))}
      </div>

      {/* Featured genre blocks — staggered 400ms apart */}
      {FEATURED_GENRES.map((genre, i) => (
        <GenreBlock
          key={genre.label}
          genre={genre}
          loadDelay={i * 400}
          onPlayTrack={onPlayTrack}
        />
      ))}
    </section>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Home({ playlists, guildId, onCreatePlaylist, onPlayTrack }: Props) {
  const navigate = useNavigate();
  const search   = (q: string) => navigate(`/search?q=${encodeURIComponent(q)}`);

  // ── Quick Picks ────────────────────────────────────────────────────────────
  const [quickPicks,    setQuickPicks]    = useState<Track[]>([]);
  const [qpLoading,     setQpLoading]     = useState(true);
  const [qpRefreshKey,  setQpRefresh]     = useState(0);

  // ── New Released ───────────────────────────────────────────────────────────
  const [newReleased,   setNewReleased]   = useState<Track[]>([]);
  const [nrLoading,     setNrLoading]     = useState(true);
  const [nrRefreshKey,  setNrRefresh]     = useState(0);

  // ── Trending ───────────────────────────────────────────────────────────────
  const [trending,      setTrending]      = useState<Track[]>([]);
  const [trendLoading,  setTrendLoading]  = useState(true);
  const [trendRefresh,  setTrendRefresh]  = useState(0);

  // ── Music Videos ───────────────────────────────────────────────────────────
  const [mvForYou,      setMvForYou]      = useState<Track[]>([]);
  const [mvLoading,     setMvLoading]     = useState(true);
  const [mvRefreshKey,  setMvRefresh]     = useState(0);

  // Global dedup across Quick Picks + right column (genres are excluded)
  const seenIds = useRef<Set<string>>(new Set());
  const addSeen = useCallback((tracks: Track[]) => {
    const fresh = tracks.filter((t) => !seenIds.current.has(t.video_id));
    fresh.forEach((t) => seenIds.current.add(t.video_id));
    return fresh;
  }, []);

  // ── Quick Picks effect ─────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setQpLoading(true);

    async function load() {
      try {
        if (guildId) {
          const history = await getPlayHistory(guildId);
          if (history.length >= 3) {
            const artists  = [...new Set(history.slice(0, 15).map((t) => t.artist))].slice(0, 4);
            const queries  = artists.map((a) => `${a} official mv single`);
            const results  = await Promise.all(queries.map((q) => searchTracks(q)));
            const recentIds = new Set(history.slice(0, 5).map((t) => t.video_id));
            const merged   = dedupTracks(
              results.flat()
                .filter(isLikelySingleTrack)
                .filter((t) => !recentIds.has(t.video_id))
            );
            if (!cancelled) {
              setQuickPicks(addSeen(merged.sort(() => Math.random() - 0.5).slice(0, 12)));
              setQpLoading(false);
              return;
            }
          }
        }
      } catch (_) {}

      // Fallback
      if (!cancelled) {
        const [q1, q2] = pickRandom(QUICK_PICK_QUERIES, 2);
        const [r1, r2] = await Promise.all([searchTracks(q1), searchTracks(q2)]);
        const merged   = dedupTracks([...r1, ...r2].filter(isLikelySingleTrack));
        if (!cancelled) {
          setQuickPicks(addSeen(merged.sort(() => Math.random() - 0.5).slice(0, 12)));
          setQpLoading(false);
        }
      }
    }

    load().catch(() => { if (!cancelled) setQpLoading(false); });
    return () => { cancelled = true; };
  }, [guildId, qpRefreshKey, addSeen]);

  // ── New Released effect ───────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setNrLoading(true);
    setNewReleased([]);

    const [q1, q2] = pickRandom(NEW_RELEASE_POOLS, 2);
    Promise.all([searchTracks(q1), searchTracks(q2)])
      .then(([r1, r2]) => {
        if (cancelled) return;
        const merged = dedupTracks([...r1, ...r2].filter(isLikelySingleTrack));
        setNewReleased(addSeen(merged.sort(() => Math.random() - 0.5).slice(0, 5)));
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setNrLoading(false); });

    return () => { cancelled = true; };
  }, [nrRefreshKey, addSeen]);

  // ── Trending effect ───────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setTrendLoading(true);
    setTrending([]);

    const [q1, q2] = pickRandom(TRENDING_POOLS, 2);
    Promise.all([searchTracks(q1), searchTracks(q2)])
      .then(([r1, r2]) => {
        if (cancelled) return;
        const merged = dedupTracks([...r1, ...r2].filter(isLikelySingleTrack));
        setTrending(addSeen(merged.sort(() => Math.random() - 0.5).slice(0, 5)));
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setTrendLoading(false); });

    return () => { cancelled = true; };
  }, [trendRefresh, addSeen]);

  // ── Music Videos effect ───────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setMvLoading(true);
    setMvForYou([]);

    const [q1, q2] = pickRandom(MV_POOLS, 2);
    Promise.all([searchTracks(q1), searchTracks(q2)])
      .then(([r1, r2]) => {
        if (cancelled) return;
        const merged = dedupTracks([...r1, ...r2].filter(isLikelyMV));
        setMvForYou(addSeen(merged.sort(() => Math.random() - 0.5).slice(0, 5)));
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setMvLoading(false); });

    return () => { cancelled = true; };
  }, [mvRefreshKey, addSeen]);

  const qpCols = [
    quickPicks.slice(0, 4),
    quickPicks.slice(4, 8),
    quickPicks.slice(8, 12),
  ].filter((col) => col.length > 0);

  return (
    <div className="flex flex-col md:flex-row min-h-full">

      {/* ── Left column ───────────────────────────────────────────────────── */}
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
        {(qpLoading || quickPicks.length > 0) && (
          <section className="mb-8">
            <div className="flex items-center justify-between mb-4 px-6">
              <div>
                <h2 className="text-lg font-bold text-yt-text">Quick picks</h2>
                {guildId && !qpLoading && (
                  <p className="text-xs text-yt-muted mt-0.5">Based on your recent plays</p>
                )}
              </div>
              <RefreshButton onClick={() => { seenIds.current.clear(); setQpRefresh((k) => k + 1); }} loading={qpLoading} />
            </div>

            {qpLoading ? (
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
                      {col.map((t) => (
                        <TrackCard key={t.video_id} track={t} onPlay={() => onPlayTrack(t)} />
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

        {/* Genre section */}
        <GenreSection onPlayTrack={onPlayTrack} />
      </div>

      {/* Divider */}
      <div className="hidden md:block w-px bg-yt-border flex-shrink-0" />
      <div className="block md:hidden mx-6 border-t border-yt-border" />

      {/* ── Right column ──────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 py-6">
        <RightSection
          title="New Released"
          tracks={newReleased}
          loading={nrLoading}
          onRefresh={() => { seenIds.current.clear(); setNrRefresh((k) => k + 1); }}
          onPlayTrack={onPlayTrack}
        />
        <RightSection
          title="Trending Song"
          tracks={trending}
          loading={trendLoading}
          onRefresh={() => { seenIds.current.clear(); setTrendRefresh((k) => k + 1); }}
          onPlayTrack={onPlayTrack}
        />
        <RightSection
          title="Music Videos for You"
          tracks={mvForYou}
          loading={mvLoading}
          onRefresh={() => { seenIds.current.clear(); setMvRefresh((k) => k + 1); }}
          onPlayTrack={onPlayTrack}
        />
      </div>

    </div>
  );
}

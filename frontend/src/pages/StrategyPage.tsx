import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import {
  getStrategyPosts, createStrategyPost, moveStrategyPost, deleteStrategyPost,
  pinStrategyPost, editStrategyPost, type StrategyPost,
} from "../lib/strategy";
import { isAdminLoggedIn } from "../lib/admin";
import { Trash2, ChevronUp, ChevronDown, ExternalLink, X, Plus, ImagePlus, ChevronLeft, ChevronRight, Play, Pencil, Search, ArrowUp, ArrowDown } from "lucide-react";
import MarkdownEditor from "../components/MarkdownEditor";

const CATEGORIES = [
  { id: "strategy", label: "Strategy/攻略", emoji: "📋" },
  { id: "guildwar", label: "Guild War/百業戰", emoji: "⚔️" },
] as const;

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  if (m > 0) return `${m}m ago`;
  return "just now";
}

// ─── Post card ────────────────────────────────────────────────────────────────

function PostCard({
  post, isAdmin, isFirst, isLast, manualSort, onMoveUp, onMoveDown, onDelete, onUpdate,
}: {
  post: StrategyPost;
  isAdmin: boolean;
  isFirst: boolean;
  isLast: boolean;
  manualSort: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  onUpdate: (updated: StrategyPost) => void;
}) {
  const mediaList = post.media ?? [];
  // Pre-process Discord __underline__ → <u> so react-markdown renders it correctly
  // (CommonMark treats __text__ as bold; we need underline here)
  const renderedContent = (post.content || "").replace(/__([^_\n]+?)__/g, "<u>$1</u>");
  const images = mediaList.filter((m) => m.media_type === "image");
  const videos = mediaList.filter((m) => m.media_type === "video");

  // Lightbox state (local to each card)
  const [lightboxItem, setLightboxItem] = useState<{ url: string; type: "image" | "video" } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pinning, setPinning] = useState(false);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [saving, setSaving] = useState(false);

  const closeLightbox = () => { setLightboxItem(null); setZoom(1); };

  const handlePin = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (pinning) return;
    setPinning(true);
    try {
      const updated = await pinStrategyPost(post.id);
      onUpdate(updated);
    } catch (err) { console.error(err); }
    setPinning(false);
  };

  const startEdit = () => {
    setEditText(post.content);
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setEditText("");
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const updated = await editStrategyPost(post.id, editText);
      onUpdate(updated);
      setEditing(false);
    } catch (err) { console.error(err); }
    setSaving(false);
  };

  return (
    <div id={`post-${post.id}`} className="bg-yt-surface rounded-2xl overflow-hidden shadow-sm border border-yt-border snap-start snap-always transition-all duration-300">
      {/* Author header */}
      <div className="flex items-center gap-3 px-5 pt-4 pb-3">
        {post.author_avatar ? (
          <img src={post.author_avatar} alt={post.author_name}
            className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
        ) : (
          <div className="w-9 h-9 rounded-full bg-yt-elevated flex items-center justify-center text-sm text-yt-muted flex-shrink-0">
            {post.author_name.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-yt-text truncate">{post.author_name}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-xs text-yt-muted">{timeAgo(post.created_at)}</p>
            {/* Source badge */}
            {post.source === "web" ? (
              <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-600 border border-blue-500/30">
                Web
              </span>
            ) : (
              <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-600 border border-indigo-500/30">
                Discord
              </span>
            )}
          </div>
        </div>
        {/* Pinned indicator */}
        {post.pinned && (
          <span className="text-yellow-400 text-sm" title="Pinned to Home">📌</span>
        )}
      </div>

      {/* Content — markdown editor in edit mode, rendered markdown otherwise */}
      {editing ? (
        <div className="px-5 pb-3">
          <MarkdownEditor value={editText} onChange={setEditText} autoFocus minRows={8} />
          {post.source === "discord" && (
            <p className="text-[11px] text-yt-muted mt-1 italic">
              This post came from Discord — your edit updates the web copy only. The Discord message won't change.
            </p>
          )}
          <div className="flex gap-2 mt-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="text-xs bg-yt-elevated hover:bg-yt-border text-yt-text px-3 py-1.5 rounded-lg font-semibold transition-colors disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              onClick={cancelEdit}
              disabled={saving}
              className="text-xs text-yt-muted hover:text-yt-text transition-colors px-2 py-1.5"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : post.content ? (
        <div className="px-5 pb-3 strategy-md">
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
            {renderedContent}
          </ReactMarkdown>
        </div>
      ) : null}

      {/* Media — left-aligned, no forced full-width, no black background */}
      {images.length === 1 && (
        <div className="px-5 pb-2">
          <img
            src={images[0].public_url}
            alt=""
            className="block max-h-96 max-w-full object-contain cursor-pointer rounded-lg"
            onClick={() => setLightboxItem({ url: images[0].public_url, type: "image" })}
          />
        </div>
      )}
      {images.length > 1 && (
        <div className="px-5 pb-2">
          <div className="grid gap-0.5 grid-cols-2 max-w-sm">
            {images.slice(0, 4).map((m, i) => (
              <img
                key={i}
                src={m.public_url}
                alt=""
                className="aspect-square object-cover w-full cursor-pointer rounded-sm"
                onClick={() => setLightboxItem({ url: m.public_url, type: "image" })}
              />
            ))}
          </div>
        </div>
      )}
      {videos.length > 0 && (
        <div className="px-5 pb-2">
          <div
            className="relative inline-block cursor-pointer group rounded-lg overflow-hidden"
            onClick={() => setLightboxItem({ url: videos[0].public_url, type: "video" })}
          >
            <video
              src={videos[0].public_url}
              preload="metadata"
              className="block max-h-80 max-w-full object-contain"
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors">
              <div className="w-12 h-12 rounded-full bg-black/60 flex items-center justify-center">
                <Play size={20} className="text-white ml-1" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-yt-border">
        {post.message_url ? (
          <a href={post.message_url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-yt-muted hover:text-yt-text transition-colors">
            <ExternalLink size={12} />
            View in Discord
          </a>
        ) : <span />}

        {isAdmin && !editing && (
          <div className="flex items-center gap-1">
            {/* Edit button */}
            <button
              onClick={startEdit}
              className="text-yt-muted hover:text-yt-text transition-colors p-1"
              title="Edit post"
            >
              <Pencil size={14} />
            </button>
            {/* Pin button */}
            <button
              onClick={handlePin}
              disabled={pinning}
              className={`p-1 rounded transition-colors text-base leading-none disabled:opacity-50 ${post.pinned ? "text-yellow-400" : "text-yt-muted hover:text-yellow-400"}`}
              title={post.pinned ? "Unpin from Home" : "Pin to Home"}
            >
              📌
            </button>
            {manualSort && (
              <>
                <button onClick={onMoveUp} disabled={isFirst}
                  className="text-yt-muted hover:text-yt-text transition-colors disabled:opacity-20 p-1" title="Move up">
                  <ChevronUp size={14} />
                </button>
                <button onClick={onMoveDown} disabled={isLast}
                  className="text-yt-muted hover:text-yt-text transition-colors disabled:opacity-20 p-1" title="Move down">
                  <ChevronDown size={14} />
                </button>
              </>
            )}
            <button onClick={onDelete}
              className="text-yt-muted hover:text-red-400 transition-colors p-1" title="Delete">
              <Trash2 size={14} />
            </button>
          </div>
        )}
        {/* While in edit mode, admin controls are replaced by Save/Cancel above the textarea */}
        {isAdmin && editing && <span />}
      </div>

      {/* Lightbox — fixed overlay, breaks out of overflow:hidden via viewport positioning */}
      {lightboxItem && (
        <div
          className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center"
          onClick={closeLightbox}
        >
          {/* Close button */}
          <button
            className="absolute top-4 right-4 text-white/70 hover:text-white z-10"
            onClick={closeLightbox}
          >
            <X size={24} />
          </button>

          {/* Media content */}
          <div onClick={(e) => e.stopPropagation()}>
            {lightboxItem.type === "image" ? (
              <img
                src={lightboxItem.url}
                alt=""
                className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg select-none"
                style={{ transform: `scale(${zoom})`, transition: "transform 0.15s ease" }}
                onWheel={(e) => {
                  e.preventDefault();
                  setZoom((z) => Math.max(0.5, Math.min(5, z - e.deltaY * 0.001)));
                }}
              />
            ) : (
              <video
                src={lightboxItem.url}
                className="max-w-[90vw] max-h-[90vh] rounded-lg"
                controls
                autoPlay
              />
            )}
          </div>

          {/* Zoom hint */}
          {lightboxItem.type === "image" && zoom === 1 && (
            <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/40 text-xs select-none">
              Scroll to zoom
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Media thumbnail row (inside create form) ─────────────────────────────────

interface PreviewItem {
  file: File;
  objectUrl: string;
  isVideo: boolean;
}

function MediaPreviewGrid({
  items,
  onRemove,
  onMoveLeft,
  onMoveRight,
}: {
  items: PreviewItem[];
  onRemove: (i: number) => void;
  onMoveLeft: (i: number) => void;
  onMoveRight: (i: number) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map((item, i) => (
        <div key={item.objectUrl} className="relative group aspect-square rounded-lg overflow-hidden bg-yt-elevated">
          {item.isVideo ? (
            <video src={item.objectUrl} className="w-full h-full object-cover opacity-80" muted preload="metadata" />
          ) : (
            <img src={item.objectUrl} alt="" className="w-full h-full object-cover" />
          )}
          {/* Overlay controls */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex flex-col justify-between p-1 opacity-0 group-hover:opacity-100">
            {/* Top row: left / right / remove */}
            <div className="flex justify-between items-start">
              <div className="flex gap-0.5">
                <button
                  type="button"
                  onClick={() => onMoveLeft(i)}
                  disabled={i === 0}
                  className="bg-black/60 text-white rounded p-0.5 disabled:opacity-30 hover:bg-black/80 transition-colors"
                  title="Move left"
                >
                  <ChevronLeft size={12} />
                </button>
                <button
                  type="button"
                  onClick={() => onMoveRight(i)}
                  disabled={i === items.length - 1}
                  className="bg-black/60 text-white rounded p-0.5 disabled:opacity-30 hover:bg-black/80 transition-colors"
                  title="Move right"
                >
                  <ChevronRight size={12} />
                </button>
              </div>
              <button
                type="button"
                onClick={() => onRemove(i)}
                className="bg-black/60 text-white rounded p-0.5 hover:bg-red-600 transition-colors"
                title="Remove"
              >
                <X size={12} />
              </button>
            </div>
            {/* Bottom: video label */}
            {item.isVideo && (
              <span className="text-[9px] text-white/80 self-start bg-black/50 px-1 rounded">VIDEO</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

interface Props {
  guildId: string | null;
  selectedCategory: string | null;
  // Deep link support
  initialMsgId?: string | null;
  onInitialMsgHandled?: () => void;
  onSelectCategory?: (cat: string | null) => void;
}

export default function StrategyPage({
  guildId,
  selectedCategory,
  initialMsgId,
  onInitialMsgHandled,
  onSelectCategory,
}: Props) {
  const [posts, setPosts] = useState<StrategyPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formText, setFormText] = useState("");
  const [formCategory, setFormCategory] = useState<"strategy" | "guildwar">("strategy");
  const [previews, setPreviews] = useState<PreviewItem[]>([]);
  const [error, setError] = useState("");
  const [pendingScrollId, setPendingScrollId] = useState<number | null>(null);
  const [homeTab, setHomeTab] = useState<"strategy" | "guildwar">("strategy");

  // ── Filter / sort state (persisted in localStorage) ──────────────────────────
  type SortKey = "manual" | "date" | "author";
  type SortDir = "asc" | "desc";

  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>(
    () => (localStorage.getItem("strategySortKey") as SortKey) || "manual"
  );
  const [sortDir, setSortDir] = useState<SortDir>(
    () => (localStorage.getItem("strategySortDir") as SortDir) || "desc"
  );
  const [mediaOnly, setMediaOnly] = useState<boolean>(
    () => localStorage.getItem("strategyMediaOnly") === "1"
  );

  // Clean up stale source-filter key left by Round 13 (harmless if already gone)
  useEffect(() => { localStorage.removeItem("strategySourceFilter"); }, []);
  useEffect(() => { localStorage.setItem("strategySortKey", sortKey); }, [sortKey]);
  useEffect(() => { localStorage.setItem("strategySortDir", sortDir); }, [sortDir]);
  useEffect(() => { localStorage.setItem("strategyMediaOnly", mediaOnly ? "1" : "0"); }, [mediaOnly]);

  const fileRef = useRef<HTMLInputElement>(null);
  const isAdmin = isAdminLoggedIn();

  // Revoke object URLs on cleanup
  useEffect(() => {
    return () => { previews.forEach((p) => URL.revokeObjectURL(p.objectUrl)); };
  }, [previews]);

  const load = async () => {
    if (!guildId) { setLoading(false); return; }
    setLoading(true);
    try {
      // Always fetch all posts (no category filter) so we can do client-side filtering
      // for home (pinned) and deep link navigation
      const data = await getStrategyPosts(guildId, selectedCategory ?? undefined);
      setPosts(data);
      setError("");
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [guildId, selectedCategory]);

  // ── Deep link: set scroll target when initialMsgId + posts are ready ────────

  useEffect(() => {
    if (!initialMsgId || posts.length === 0) return;
    const target = posts.find((p) => p.message_id === initialMsgId);
    if (!target) return;
    // Store scroll target and switch to the post's category so it's visible
    setPendingScrollId(target.id);
    onSelectCategory?.(target.category);
    onInitialMsgHandled?.();
  }, [initialMsgId, posts]);

  // ── Scroll to pending post once it's rendered ────────────────────────────────

  useEffect(() => {
    if (pendingScrollId === null || posts.length === 0) return;
    // Use rAF to ensure DOM has updated after category change + re-render
    requestAnimationFrame(() => {
      const el = document.getElementById(`post-${pendingScrollId}`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      el.classList.add("ring-2", "ring-yellow-400", "ring-offset-2");
      setTimeout(() => {
        el.classList.remove("ring-2", "ring-yellow-400", "ring-offset-2");
      }, 2500);
      setPendingScrollId(null);
    });
  }, [pendingScrollId, posts]);

  // ── File helpers ────────────────────────────────────────────────────────────

  const resetFileInput = () => {
    if (fileRef.current) fileRef.current.value = "";
  };

  const addFiles = (files: File[]) => {
    const newItems: PreviewItem[] = files
      .filter((f) => f.type.startsWith("image/") || f.type.startsWith("video/"))
      .map((f) => ({
        file: f,
        objectUrl: URL.createObjectURL(f),
        isVideo: f.type.startsWith("video/"),
      }));
    setPreviews((prev) => [...prev, ...newItems]);
    resetFileInput();
  };

  const removePreview = (i: number) => {
    setPreviews((prev) => {
      URL.revokeObjectURL(prev[i].objectUrl);
      return prev.filter((_, j) => j !== i);
    });
    resetFileInput();
  };

  const movePreview = (i: number, dir: -1 | 1) => {
    setPreviews((prev) => {
      const next = [...prev];
      const j = i + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const closeForm = () => {
    setShowForm(false);
    setFormText("");
    previews.forEach((p) => URL.revokeObjectURL(p.objectUrl));
    setPreviews([]);
    resetFileInput();
    setError("");
  };

  // ── Submit ──────────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guildId) return;
    if (!formText.trim() && previews.length === 0) return setError("Add text or media.");
    setSubmitting(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("guild_id", guildId);
      fd.append("category", formCategory);
      fd.append("content", formText.trim());
      previews.forEach((p) => fd.append("files", p.file));
      await createStrategyPost(fd);
      closeForm();
      await load();
    } catch (e: any) { setError(e.message); }
    setSubmitting(false);
  };

  // ── Reorder / delete / pin posts ───────────────────────────────────────────

  const handleMove = async (post: StrategyPost, dir: -1 | 1) => {
    const idx = posts.indexOf(post);
    const target = posts[idx + dir];
    if (!target) return;
    try {
      await moveStrategyPost(post.id, target.position);
      await moveStrategyPost(target.id, post.position);
      await load();
    } catch (e: any) { alert(e.message); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this post?")) return;
    try { await deleteStrategyPost(id); await load(); } catch (e: any) { alert(e.message); }
  };

  const handleUpdate = (updated: StrategyPost) => {
    setPosts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  };

  // ── Filter / sort pipeline ────────────────────────────────────────────────────
  const applyFiltersAndSort = (input: StrategyPost[]): StrategyPost[] => {
    let arr = input;

    if (mediaOnly) {
      arr = arr.filter((p) => (p.media?.length ?? 0) > 0);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      arr = arr.filter(
        (p) =>
          p.content.toLowerCase().includes(q) ||
          p.author_name.toLowerCase().includes(q)
      );
    }

    const dir = sortDir === "asc" ? 1 : -1;
    return [...arr].sort((a, b) => {
      if (sortKey === "date") {
        return dir * (new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      }
      if (sortKey === "author") {
        return dir * a.author_name.localeCompare(b.author_name);
      }
      // manual — server-supplied position; tiebreak on created_at
      const dp = a.position - b.position;
      if (dp !== 0) return dir * dp;
      return dir * (new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    });
  };

  const postsForCategory = (cat: string) =>
    applyFiltersAndSort(posts.filter((p) => p.category === cat));

  // Homepage: filtered + sorted pinned posts for the active home tab
  const isHome = selectedCategory === null;
  const rawPinnedPosts = isHome ? posts.filter((p) => p.pinned && p.category === homeTab) : [];
  const pinnedPosts = applyFiltersAndSort(rawPinnedPosts);
  const tabHasPosts = isHome && posts.some((p) => p.category === homeTab);
  const showPinBanner = isHome && rawPinnedPosts.length === 0 && tabHasPosts;
  const filtersActive = search.trim() !== "" || mediaOnly;
  const noFilterResults = filtersActive && pinnedPosts.length === 0 && rawPinnedPosts.length > 0;

  if (!guildId) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-yt-muted select-none">
        <p className="text-sm">Select a server first.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">

      {/* ── Sticky header panel (title + toolbar + home tabs — never scrolls away) ── */}
      <div className="flex-shrink-0 bg-yt-bg border-b border-yt-border px-6 pt-4 pb-3 flex flex-col gap-2 z-10">

        {/* Row 1: page title + "New Post" button */}
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-yt-text">
            {selectedCategory
              ? CATEGORIES.find((c) => c.id === selectedCategory)?.label ?? "Strategy"
              : "Strategy"}
          </h1>
          {isAdmin && (
            <button
              onClick={() => setShowForm((v) => !v)}
              className="flex items-center gap-1.5 bg-yt-elevated hover:bg-yt-border text-yt-text text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
            >
              <Plus size={13} /> New Post
            </button>
          )}
        </div>

        {/* Row 2: filter / sort toolbar */}
        {!loading && (
          <div className="flex flex-wrap items-center gap-2 bg-yt-surface border border-yt-border rounded-xl px-3 py-2">
            {/* Text search */}
            <div className="flex items-center gap-1.5 flex-1 min-w-[160px]">
              <Search size={13} className="text-yt-muted flex-shrink-0" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search posts…"
                className="flex-1 bg-transparent text-sm text-yt-text placeholder:text-yt-muted outline-none"
              />
              {search && (
                <button onClick={() => setSearch("")} className="text-yt-muted hover:text-yt-text flex-shrink-0">
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Media only toggle */}
            <label className="flex items-center gap-1.5 text-xs text-yt-muted cursor-pointer select-none">
              <input
                type="checkbox"
                checked={mediaOnly}
                onChange={(e) => setMediaOnly(e.target.checked)}
                className="accent-current"
              />
              Media only
            </label>

            {/* Sort key */}
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="bg-yt-elevated text-yt-text text-xs rounded-lg px-2 py-1 outline-none border border-yt-border cursor-pointer"
            >
              <option value="manual">Manual</option>
              <option value="date">Date</option>
              <option value="author">Author</option>
            </select>

            {/* Sort direction */}
            <button
              onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
              className="flex items-center gap-1 bg-yt-elevated hover:bg-yt-border text-yt-text text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors"
              title={sortDir === "asc" ? "Ascending" : "Descending"}
            >
              {sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
              {sortDir === "asc" ? "Asc" : "Desc"}
            </button>
          </div>
        )}

        {/* Row 3: home category tab pills (home view only) */}
        {!loading && isHome && (
          <div className="flex gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                onClick={() => setHomeTab(c.id as "strategy" | "guildwar")}
                className={`flex items-center gap-1.5 text-xs font-semibold px-4 py-1.5 rounded-full transition-all ${
                  homeTab === c.id
                    ? "bg-yt-text text-yt-bg shadow"
                    : "bg-yt-elevated text-yt-muted hover:bg-yt-border hover:text-yt-text"
                }`}
              >
                {c.emoji} {c.label}
              </button>
            ))}
          </div>
        )}

      </div>

      {/* ── Scrollable posts area ── */}
      <div className={`flex-1 overflow-y-auto px-6 py-4 ${showForm ? "" : "snap-y snap-mandatory scroll-pt-4"}`}>

        {/* Global error */}
        {error && !showForm && <p className="text-xs text-red-400">{error}</p>}

        {/* Create form (admin only) */}
        {isAdmin && showForm && (
          <form onSubmit={handleSubmit} className="bg-yt-surface rounded-2xl p-5 flex flex-col gap-3 border border-yt-border mb-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-yt-muted uppercase tracking-widest">New Post</p>
              <button type="button" onClick={closeForm} className="text-yt-muted hover:text-yt-text">
                <X size={14} />
              </button>
            </div>

            {/* Category */}
            <div className="flex gap-4">
              {CATEGORIES.map((c) => (
                <label key={c.id} className="flex items-center gap-1.5 text-xs text-yt-muted cursor-pointer">
                  <input
                    type="radio"
                    name="formCategory"
                    value={c.id}
                    checked={formCategory === c.id}
                    onChange={() => setFormCategory(c.id as "strategy" | "guildwar")}
                  />
                  {c.emoji} {c.label}
                </label>
              ))}
            </div>

            {/* Media previews — shown ABOVE the text area */}
            <MediaPreviewGrid
              items={previews}
              onRemove={removePreview}
              onMoveLeft={(i) => movePreview(i, -1)}
              onMoveRight={(i) => movePreview(i, 1)}
            />

            {/* Markdown editor */}
            <MarkdownEditor
              value={formText}
              onChange={setFormText}
              placeholder="Write your post… **bold**, *italic*, __underline__"
              minRows={8}
            />

            {/* Add media button */}
            <div>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex items-center gap-1.5 text-xs text-yt-muted hover:text-yt-text transition-colors border border-yt-border hover:border-yt-muted rounded-lg px-3 py-1.5"
              >
                <ImagePlus size={13} />
                {previews.length > 0 ? `${previews.length} file${previews.length > 1 ? "s" : ""} · Add more` : "Add photos / videos"}
              </button>
              <input
                ref={fileRef}
                type="file"
                multiple
                accept="image/*,video/*"
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  if (files.length > 0) addFiles(files);
                }}
              />
            </div>

            {error && <p className="text-xs text-red-400">{error}</p>}

            <button
              type="submit"
              disabled={submitting || (!formText.trim() && previews.length === 0)}
              className="bg-yt-elevated hover:bg-yt-border text-yt-text text-sm font-semibold py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              {submitting ? "Posting…" : "Post"}
            </button>
          </form>
        )}

        {/* Feed */}
        {loading ? (
          <p className="text-xs text-yt-muted">Loading…</p>
        ) : isHome ? (
          /* Home view — pinned posts (tab switcher is now in the sticky panel above) */
          <>
            {showPinBanner && (
              <div className="flex items-center gap-2 text-sm text-yt-muted bg-yt-surface border border-yt-border rounded-lg px-4 py-3">
                <span>📌</span>
                <span>Pin posts to feature them here — use the 📌 button on any post</span>
              </div>
            )}
            {posts.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-3 text-yt-muted mt-20 select-none">
                <p className="text-sm opacity-50">No strategy posts yet</p>
                <p className="text-xs opacity-40">Post in a Discord strategy channel to see it here</p>
              </div>
            )}
            {!tabHasPosts && posts.length > 0 && rawPinnedPosts.length === 0 && !filtersActive && (
              <div className="flex flex-col items-center justify-center gap-2 text-yt-muted py-12 select-none">
                <p className="text-sm opacity-50">No posts in this section yet</p>
              </div>
            )}
            {noFilterResults && (
              <p className="text-xs text-yt-muted italic py-4">No posts match the current filters.</p>
            )}
            {pinnedPosts.length > 0 && (
              <CategoryFeed
                posts={pinnedPosts}
                isAdmin={isAdmin}
                manualSort={sortKey === "manual"}
                onMoveUp={(p) => handleMove(p, -1)}
                onMoveDown={(p) => handleMove(p, 1)}
                onDelete={(id) => handleDelete(id)}
                onUpdate={handleUpdate}
              />
            )}
          </>
        ) : (
          /* Category view */
          (() => {
            const catPosts = postsForCategory(selectedCategory!);
            const rawCatPosts = posts.filter((p) => p.category === selectedCategory);
            const catNoResults = filtersActive && catPosts.length === 0 && rawCatPosts.length > 0;
            return catNoResults ? (
              <p className="text-xs text-yt-muted italic py-4">No posts match the current filters.</p>
            ) : (
              <CategoryFeed
                posts={catPosts}
                isAdmin={isAdmin}
                manualSort={sortKey === "manual"}
                onMoveUp={(p) => handleMove(p, -1)}
                onMoveDown={(p) => handleMove(p, 1)}
                onDelete={(id) => handleDelete(id)}
                onUpdate={handleUpdate}
              />
            );
          })()
        )}
      </div>
    </div>
  );
}

function CategoryFeed({ posts, isAdmin, manualSort = true, onMoveUp, onMoveDown, onDelete, onUpdate }: {
  posts: StrategyPost[];
  isAdmin: boolean;
  manualSort?: boolean;
  onMoveUp: (p: StrategyPost) => void;
  onMoveDown: (p: StrategyPost) => void;
  onDelete: (id: number) => void;
  onUpdate: (updated: StrategyPost) => void;
}) {
  if (posts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 text-yt-muted py-12 select-none">
        <p className="text-sm opacity-50">No posts in this category yet</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {posts.map((post, i) => (
        <PostCard
          key={post.id}
          post={post}
          isAdmin={isAdmin}
          isFirst={i === 0}
          isLast={i === posts.length - 1}
          manualSort={manualSort}
          onMoveUp={() => onMoveUp(post)}
          onMoveDown={() => onMoveDown(post)}
          onDelete={() => onDelete(post.id)}
          onUpdate={onUpdate}
        />
      ))}
    </div>
  );
}

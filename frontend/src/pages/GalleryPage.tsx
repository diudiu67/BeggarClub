import { useState, useEffect, useRef, useCallback } from "react";
import { Upload, X, ChevronLeft, ChevronRight, Trash2, Play } from "lucide-react";
import type { GalleryItem } from "../types";
import { getGalleryItems, uploadGalleryItem, deleteGalleryItem } from "../lib/api";

interface Props {
  guildId: string | null;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function GalleryPage({ guildId }: Props) {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [lightbox, setLightbox] = useState<number | null>(null); // index into items
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [caption, setCaption] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    getGalleryItems(guildId ?? "").then(setItems).catch(console.error);
  }, [guildId]);

  useEffect(() => { load(); }, [load]);

  const handleUpload = async () => {
    if (!pendingFile) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", pendingFile);
      fd.append("caption", caption);
      fd.append("guild_id", guildId ?? "");
      await uploadGalleryItem(fd);
      setShowUpload(false);
      setPendingFile(null);
      setCaption("");
      load();
    } catch (e) {
      alert("Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this item?")) return;
    await deleteGalleryItem(id);
    setLightbox(null);
    load();
  };

  const moveLightbox = (dir: 1 | -1) => {
    if (lightbox === null) return;
    const next = lightbox + dir;
    if (next >= 0 && next < items.length) setLightbox(next);
  };

  // Keyboard navigation for lightbox
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (lightbox === null) return;
      if (e.key === "ArrowRight") moveLightbox(1);
      if (e.key === "ArrowLeft") moveLightbox(-1);
      if (e.key === "Escape") setLightbox(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox, items.length]);

  const onDropFile = (file: File) => {
    setPendingFile(file);
    setShowUpload(true);
  };

  const currentItem = lightbox !== null ? items[lightbox] : null;

  return (
    <div className="flex-1 p-6">
      {/* Header row */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-yt-text">Gallery</h2>
        <button
          onClick={() => setShowUpload(true)}
          className="flex items-center gap-2 bg-yt-text text-white text-sm font-medium px-4 py-2 rounded-full hover:opacity-80 transition-opacity"
        >
          <Upload size={15} /> Upload
        </button>
      </div>

      {/* Empty state */}
      {items.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-3 text-yt-muted mt-20 select-none">
          <Upload size={48} className="opacity-20" />
          <p className="text-sm opacity-50">No photos or videos yet</p>
          <p className="text-xs opacity-40">Upload from here or post media in a watched Discord channel</p>
        </div>
      )}

      {/* Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
        {items.map((item, idx) => (
          <div
            key={item.id}
            className="relative group cursor-pointer rounded-xl overflow-hidden bg-yt-surface aspect-square"
            onClick={() => setLightbox(idx)}
          >
            {item.media_type === "image" ? (
              <img
                src={item.public_url}
                alt={item.original_name}
                className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                loading="lazy"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gray-900">
                <video
                  src={item.public_url}
                  className="w-full h-full object-cover opacity-70"
                  preload="metadata"
                  muted
                />
                <Play size={32} className="absolute text-white opacity-80" />
              </div>
            )}
            {/* Hover overlay */}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
            <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
              <p className="text-white text-[11px] font-medium truncate">{item.uploader}</p>
              <p className="text-white/70 text-[10px]">{formatDate(item.created_at)}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Lightbox */}
      {currentItem && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
          onClick={() => setLightbox(null)}
        >
          {/* Prev */}
          {lightbox! > 0 && (
            <button
              className="absolute left-4 p-2 text-white/70 hover:text-white"
              onClick={(e) => { e.stopPropagation(); moveLightbox(-1); }}
            >
              <ChevronLeft size={36} />
            </button>
          )}

          {/* Media */}
          <div className="max-w-4xl max-h-[80vh] flex flex-col items-center gap-4" onClick={(e) => e.stopPropagation()}>
            {currentItem.media_type === "image" ? (
              <img
                src={currentItem.public_url}
                alt={currentItem.original_name}
                className="max-w-full max-h-[70vh] rounded-lg object-contain"
              />
            ) : (
              <video
                src={currentItem.public_url}
                className="max-w-full max-h-[70vh] rounded-lg"
                controls
                autoPlay
              />
            )}
            <div className="flex items-center justify-between w-full px-1">
              <div>
                <p className="text-white text-sm font-medium">{currentItem.uploader}</p>
                <p className="text-white/50 text-xs">
                  {formatDate(currentItem.created_at)}
                  {currentItem.channel_name && ` · #${currentItem.channel_name}`}
                  {" · "}<span className="capitalize">{currentItem.source}</span>
                </p>
                {currentItem.caption && (
                  <p className="text-white/70 text-sm mt-1">{currentItem.caption}</p>
                )}
              </div>
              <button
                onClick={() => handleDelete(currentItem.id)}
                className="text-white/40 hover:text-red-400 transition-colors ml-4"
              >
                <Trash2 size={18} />
              </button>
            </div>
          </div>

          {/* Next */}
          {lightbox! < items.length - 1 && (
            <button
              className="absolute right-4 p-2 text-white/70 hover:text-white"
              onClick={(e) => { e.stopPropagation(); moveLightbox(1); }}
            >
              <ChevronRight size={36} />
            </button>
          )}

          {/* Close */}
          <button
            className="absolute top-4 right-4 text-white/70 hover:text-white"
            onClick={() => setLightbox(null)}
          >
            <X size={24} />
          </button>
        </div>
      )}

      {/* Upload modal */}
      {showUpload && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center"
          onClick={() => { setShowUpload(false); setPendingFile(null); setCaption(""); }}
        >
          <div
            className="bg-yt-bg rounded-2xl p-6 w-full max-w-md shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-yt-text">Upload photo or video</h3>
              <button onClick={() => { setShowUpload(false); setPendingFile(null); setCaption(""); }}>
                <X size={18} className="text-yt-muted hover:text-yt-text" />
              </button>
            </div>

            {/* Drop zone */}
            <div
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors mb-4 ${
                dragOver ? "border-yt-text bg-yt-elevated" : "border-yt-border hover:border-yt-muted"
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const f = e.dataTransfer.files[0];
                if (f) setPendingFile(f);
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) setPendingFile(f); }}
              />
              {pendingFile ? (
                <p className="text-yt-text text-sm font-medium truncate">{pendingFile.name}</p>
              ) : (
                <>
                  <Upload size={28} className="mx-auto text-yt-muted mb-2 opacity-50" />
                  <p className="text-sm text-yt-muted">Drag & drop or click to browse</p>
                  <p className="text-xs text-yt-muted opacity-60 mt-1">Images & videos up to 100 MB</p>
                </>
              )}
            </div>

            <input
              type="text"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Add a caption… (optional)"
              className="w-full bg-yt-surface border border-yt-border rounded-lg px-3 py-2 text-sm text-yt-text placeholder-yt-muted outline-none focus:border-yt-muted mb-4"
            />

            <button
              onClick={handleUpload}
              disabled={!pendingFile || uploading}
              className="w-full bg-yt-text text-white text-sm font-semibold py-2.5 rounded-full disabled:opacity-40 hover:opacity-80 transition-opacity"
            >
              {uploading ? "Uploading…" : "Upload"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

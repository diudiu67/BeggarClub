import { useEffect, useRef } from "react";
import {
  Bold, Italic, Underline, Strikethrough, Code,
  Heading1, Heading2, List, ListOrdered, Quote, Link,
} from "lucide-react";

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  minRows?: number;
  maxHeightPx?: number;
  autoFocus?: boolean;
  className?: string;
}

// ─── Toolbar button ────────────────────────────────────────────────────────────

function ToolBtn({
  icon, title, onClick,
}: {
  icon: React.ReactNode;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="flex items-center justify-center w-7 h-7 rounded hover:bg-yt-border text-yt-muted hover:text-yt-text transition-colors text-xs font-semibold flex-shrink-0"
    >
      {icon}
    </button>
  );
}

function Divider() {
  return <div className="w-px h-5 bg-yt-border mx-0.5 flex-shrink-0" />;
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function MarkdownEditor({
  value,
  onChange,
  placeholder = "Write your post…",
  minRows = 8,
  maxHeightPx = 600,
  autoFocus = false,
  className = "",
}: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null);

  // ── Auto-resize ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, maxHeightPx) + "px";
  }, [value, maxHeightPx]);

  // ── Focus on mount if requested ──────────────────────────────────────────────
  useEffect(() => {
    if (autoFocus) taRef.current?.focus();
  }, [autoFocus]);

  // ── Keyboard shortcuts ───────────────────────────────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && e.key === "b") { e.preventDefault(); wrap("**"); }
    if (ctrl && e.key === "i") { e.preventDefault(); wrap("*"); }
    if (ctrl && e.key === "u") { e.preventDefault(); wrap("__"); }
  };

  // ── Wrap selection with before/after tokens ──────────────────────────────────
  const wrap = (token: string, after?: string) => {
    const ta = taRef.current;
    if (!ta) return;
    const before = token;
    const aft = after ?? token;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = value.slice(start, end);

    let newValue: string;
    let newStart: number;
    let newEnd: number;

    if (selected.length > 0) {
      // Wrap the selection
      newValue = value.slice(0, start) + before + selected + aft + value.slice(end);
      newStart = start + before.length;
      newEnd = end + before.length;
    } else {
      // Insert tokens and put caret between them
      newValue = value.slice(0, start) + before + aft + value.slice(end);
      newStart = newEnd = start + before.length;
    }

    onChange(newValue);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(newStart, newEnd);
    });
  };

  // ── Prefix each selected line ────────────────────────────────────────────────
  const linePrefix = (prefix: string) => {
    const ta = taRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;

    // Find the start of the first line in the selection
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    // Get all selected line endings
    const selectedText = value.slice(lineStart, end);
    const prefixed = selectedText
      .split("\n")
      .map((line) => prefix + line)
      .join("\n");

    const newValue = value.slice(0, lineStart) + prefixed + value.slice(end);
    const newEnd = lineStart + prefixed.length;

    onChange(newValue);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(lineStart, newEnd);
    });
  };

  // ── Link insertion ────────────────────────────────────────────────────────────
  const insertLink = () => {
    const ta = taRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = value.slice(start, end) || "text";
    const linkText = `[${selected}](url)`;
    const newValue = value.slice(0, start) + linkText + value.slice(end);
    // Place selection over "url" so user can type the URL immediately
    const urlStart = start + selected.length + 3; // past "[text]("
    const urlEnd = urlStart + 3;                  // "url"

    onChange(newValue);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(urlStart, urlEnd);
    });
  };

  // ── Compute initial min-height from minRows ───────────────────────────────────
  const minHeight = `${minRows * 1.5}rem`; // 1.5rem per row ≈ line-height at text-sm

  return (
    <div className={`flex flex-col ${className}`}>
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 flex-wrap border border-yt-border rounded-t-lg bg-yt-elevated px-2 py-1">
        <ToolBtn icon={<Bold size={13} />}         title="Bold (Ctrl+B)"        onClick={() => wrap("**")} />
        <ToolBtn icon={<Italic size={13} />}       title="Italic (Ctrl+I)"      onClick={() => wrap("*")} />
        <ToolBtn icon={<Underline size={13} />}    title="Underline (Ctrl+U)"   onClick={() => wrap("__")} />
        <ToolBtn icon={<Strikethrough size={13} />}title="Strikethrough"        onClick={() => wrap("~~")} />
        <ToolBtn icon={<Code size={13} />}         title="Inline code"          onClick={() => wrap("`")} />
        <Divider />
        <ToolBtn icon={<Heading1 size={13} />}     title="Heading 1"            onClick={() => linePrefix("# ")} />
        <ToolBtn icon={<Heading2 size={13} />}     title="Heading 2"            onClick={() => linePrefix("## ")} />
        <Divider />
        <ToolBtn icon={<List size={13} />}         title="Bulleted list"        onClick={() => linePrefix("- ")} />
        <ToolBtn icon={<ListOrdered size={13} />}  title="Numbered list"        onClick={() => linePrefix("1. ")} />
        <ToolBtn icon={<Quote size={13} />}        title="Quote"                onClick={() => linePrefix("> ")} />
        <Divider />
        <ToolBtn icon={<Link size={13} />}         title="Link"                 onClick={insertLink} />
      </div>

      {/* Textarea */}
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full bg-yt-elevated border border-yt-border border-t-0 rounded-b-lg px-3 py-2 text-sm text-yt-text outline-none focus:border-yt-muted resize-none overflow-y-auto font-mono"
        style={{ minHeight }}
      />
    </div>
  );
}

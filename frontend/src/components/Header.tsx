import { Music2, Images } from "lucide-react";

type Mode = "music" | "gallery";

interface Props {
  mode: Mode;
  onSetMode: (mode: Mode) => void;
}

export default function Header({ mode, onSetMode }: Props) {
  return (
    <header className="h-12 flex-shrink-0 flex bg-yt-bg border-b border-yt-border">
      <button
        onClick={() => onSetMode("music")}
        className={`flex-1 flex items-center justify-center gap-2 text-sm font-semibold transition-colors border-b-2 ${
          mode === "music"
            ? "border-yt-text text-yt-text"
            : "border-transparent text-yt-muted hover:text-yt-text"
        }`}
      >
        <Music2 size={16} />
        Music
      </button>
      <div className="w-px bg-yt-border my-2" />
      <button
        onClick={() => onSetMode("gallery")}
        className={`flex-1 flex items-center justify-center gap-2 text-sm font-semibold transition-colors border-b-2 ${
          mode === "gallery"
            ? "border-yt-text text-yt-text"
            : "border-transparent text-yt-muted hover:text-yt-text"
        }`}
      >
        <Images size={16} />
        Gallery
      </button>
    </header>
  );
}

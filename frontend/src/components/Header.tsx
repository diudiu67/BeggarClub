import { Music2, Images, ShieldCheck, TrendingUp, Menu } from "lucide-react";
import type { AppMode } from "../types";

interface Props {
  mode: AppMode;
  onSetMode: (mode: AppMode) => void;
  onToggleSidebar: () => void;
}

const ADMIN_TAB = {
  id: "admin" as AppMode,
  label: "Admin",
  sub: null as string | null,
  icon: <ShieldCheck size={14} />,
};

const MAIN_TABS: { id: AppMode; label: string; sub: string; icon: React.ReactNode }[] = [
  { id: "music",    label: "Music",    sub: "音乐", icon: <Music2 size={14} /> },
  { id: "gallery",  label: "Gallery",  sub: "相册", icon: <Images size={14} /> },
  { id: "strategy", label: "Strategy", sub: "攻略", icon: <TrendingUp size={14} /> },
];

export default function Header({ mode, onSetMode, onToggleSidebar }: Props) {
  const pill = (active: boolean) =>
    `flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition-all duration-200 ease-out cursor-pointer select-none whitespace-nowrap ${
      active
        ? "bg-yt-text text-yt-bg shadow-lg shadow-black/20 scale-105"
        : "bg-transparent text-yt-muted border border-transparent hover:bg-yt-elevated hover:text-yt-text hover:-translate-y-0.5 hover:shadow-md"
    }`;

  return (
    <header className="flex-shrink-0 flex items-center gap-2 px-3 py-2 bg-yt-bg border-b border-yt-border">
      {/* Hamburger — mobile only */}
      <button
        onClick={onToggleSidebar}
        className="md:hidden text-yt-muted hover:text-yt-text transition-colors flex-shrink-0 p-1"
        aria-label="Open menu"
      >
        <Menu size={20} />
      </button>

      {/* Admin tab */}
      <button onClick={() => onSetMode(ADMIN_TAB.id)} className={pill(mode === ADMIN_TAB.id)}>
        {ADMIN_TAB.icon}
        <span>{ADMIN_TAB.label}</span>
      </button>

      {/* Thin separator */}
      <div className="w-px h-5 bg-yt-border mx-1 flex-shrink-0" />

      {/* Main tabs */}
      {MAIN_TABS.map((tab) => (
        <button key={tab.id} onClick={() => onSetMode(tab.id)} className={pill(mode === tab.id)}>
          {tab.icon}
          <span>{tab.label}</span>
          <span className="hidden sm:inline text-[11px] opacity-70 border-l border-current/30 pl-2">
            {tab.sub}
          </span>
        </button>
      ))}
    </header>
  );
}

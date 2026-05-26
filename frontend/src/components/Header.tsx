import { Music2, Images, ShieldCheck, TrendingUp, Menu } from "lucide-react";
import type { AppMode } from "../types";

interface Props {
  mode: AppMode;
  onSetMode: (mode: AppMode) => void;
  onToggleSidebar: () => void;
}

const ADMIN_TAB = { id: "admin" as AppMode, label: "Admin", icon: <ShieldCheck size={15} /> };

const MAIN_TABS: { id: AppMode; label: string; icon: React.ReactNode }[] = [
  { id: "music",    label: "Music",    icon: <Music2 size={15} /> },
  { id: "gallery",  label: "Gallery",  icon: <Images size={15} /> },
  { id: "strategy", label: "Strategy", icon: <TrendingUp size={15} /> },
];

export default function Header({ mode, onSetMode, onToggleSidebar }: Props) {
  const tabBase = "flex items-center justify-center gap-1.5 text-sm font-semibold transition-colors border-b-2 h-full";
  const activeClass = "border-yt-text text-yt-text";
  const inactiveClass = "border-transparent text-yt-muted hover:text-yt-text";

  return (
    <header className="h-12 flex-shrink-0 flex bg-yt-bg border-b border-yt-border">
      {/* Hamburger — mobile only */}
      <button
        onClick={onToggleSidebar}
        className="md:hidden px-4 text-yt-muted hover:text-yt-text transition-colors flex-shrink-0"
        aria-label="Open menu"
      >
        <Menu size={20} />
      </button>

      {/* Admin tab — compact, far left */}
      <button
        onClick={() => onSetMode(ADMIN_TAB.id)}
        className={`flex-shrink-0 px-4 ${tabBase} ${mode === ADMIN_TAB.id ? activeClass : inactiveClass}`}
      >
        {ADMIN_TAB.icon}
        {ADMIN_TAB.label}
      </button>

      {/* Divider between Admin and the main tabs */}
      <div className="w-px bg-yt-border my-2" />

      {/* Main tabs — equal flex-1 */}
      {MAIN_TABS.map((tab, i) => (
        <div key={tab.id} className="flex items-stretch flex-1">
          {i > 0 && <div className="w-px bg-yt-border my-2" />}
          <button
            onClick={() => onSetMode(tab.id)}
            className={`flex-1 ${tabBase} ${mode === tab.id ? activeClass : inactiveClass}`}
          >
            {tab.icon}
            {tab.label}
          </button>
        </div>
      ))}
    </header>
  );
}

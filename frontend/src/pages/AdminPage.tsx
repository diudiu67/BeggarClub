import { useState } from "react";
import { adminLogin, adminLogout, isAdminLoggedIn } from "../lib/admin";
import { LogIn, LogOut } from "lucide-react";
import AdminHome from "./admin/AdminHome";
import PollsPage from "./admin/PollsPage";
import BirthdaysPage from "./admin/BirthdaysPage";
import RemindersPage from "./admin/RemindersPage";

type View = "home" | "polls" | "birthdays" | "reminders";

// ─── Login form ───────────────────────────────────────────────────────────────

function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const [pw, setPw] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const ok = await adminLogin(pw);
    setLoading(false);
    if (ok) {
      onSuccess();
    } else {
      setError("Wrong password.");
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4">
      <div className="flex items-center gap-2 text-yt-muted mb-2">
        <LogIn size={20} />
        <span className="text-sm font-semibold uppercase tracking-widest">Admin Access</span>
      </div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 w-72">
        <input
          type="password"
          placeholder="Password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          className="bg-yt-surface border border-yt-border rounded-lg px-4 py-2 text-sm text-yt-text outline-none focus:border-yt-muted"
          autoFocus
        />
        {error && <p className="text-red-400 text-xs text-center">{error}</p>}
        <button
          type="submit"
          disabled={loading || !pw}
          className="bg-yt-elevated hover:bg-yt-border text-yt-text text-sm font-semibold py-2 rounded-lg transition-colors disabled:opacity-50"
        >
          {loading ? "Checking…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}

// ─── Shell ────────────────────────────────────────────────────────────────────

interface Props {
  guildId: string | null;
}

export default function AdminPage({ guildId }: Props) {
  const [loggedIn, setLoggedIn] = useState(isAdminLoggedIn());
  const [view, setView] = useState<View>("home");

  const handleLogout = () => {
    adminLogout();
    setLoggedIn(false);
    setView("home");
  };

  if (!loggedIn) {
    return <LoginForm onSuccess={() => setLoggedIn(true)} />;
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 pt-6 pb-0 max-w-2xl mx-auto w-full">
        <h1 className="text-lg font-bold text-yt-text">Admin</h1>
        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 text-xs text-yt-muted hover:text-yt-text transition-colors"
        >
          <LogOut size={13} />
          Sign out
        </button>
      </div>

      {/* Content */}
      {view === "home" && <AdminHome onNavigate={setView} />}
      {view === "polls" && <PollsPage guildId={guildId} onBack={() => setView("home")} />}
      {view === "birthdays" && <BirthdaysPage guildId={guildId} onBack={() => setView("home")} />}
      {view === "reminders" && <RemindersPage guildId={guildId} onBack={() => setView("home")} />}
    </div>
  );
}

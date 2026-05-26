import { useState, useEffect, useCallback, useRef } from "react";
import {
  getStatus, getNotificationsConfig, toggleNotifications, testNotification,
  type BotStatus, type NotificationsConfig,
} from "../../lib/admin";
import { Bell, BellOff, Send, Server, Cpu, Clock, Radio, BarChart2, Cake, AlarmClock } from "lucide-react";

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

function Card({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-yt-surface rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-center gap-2 text-yt-muted text-xs font-semibold uppercase tracking-widest">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

function StreamNotifCard() {
  const [config, setConfig] = useState<NotificationsConfig | null>(null);
  const [testing, setTesting] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [testMsg, setTestMsg] = useState("");

  useEffect(() => {
    getNotificationsConfig().then(setConfig).catch(console.error);
  }, []);

  const handleToggle = async () => {
    if (!config) return;
    setToggling(true);
    try {
      await toggleNotifications(!config.stream_notifications_enabled);
      setConfig((c) => c ? { ...c, stream_notifications_enabled: !c.stream_notifications_enabled } : c);
    } catch (e: any) { alert(e.message); }
    setToggling(false);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestMsg("");
    try {
      await testNotification();
      setTestMsg("✅ Test sent — watch for the in-app toast.");
    } catch (e: any) { setTestMsg(`❌ ${e.message}`); }
    setTesting(false);
  };

  const enabled = config?.stream_notifications_enabled ?? true;

  return (
    <Card title="Stream Notifications" icon={<Radio size={14} />}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-yt-text font-medium">Go Live detection</p>
          <p className="text-xs text-yt-muted mt-0.5">
            {config
              ? `Posts to #${config.notification_channel_name ?? config.notification_channel_id ?? "unset"}`
              : "Loading…"}
          </p>
        </div>
        <button
          onClick={handleToggle}
          disabled={toggling || !config}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
            enabled
              ? "bg-green-500/20 text-green-400 hover:bg-green-500/30"
              : "bg-yt-elevated text-yt-muted hover:bg-yt-border"
          }`}
        >
          {enabled ? <Bell size={12} /> : <BellOff size={12} />}
          {enabled ? "Enabled" : "Disabled"}
        </button>
      </div>
      <button
        onClick={handleTest}
        disabled={testing}
        className="flex items-center gap-2 text-xs text-yt-muted hover:text-yt-text transition-colors self-start"
      >
        <Send size={12} />
        {testing ? "Sending…" : "Send test notification"}
      </button>
      {testMsg && <p className="text-xs text-yt-muted">{testMsg}</p>}
    </Card>
  );
}

function BotStatusCard() {
  const [status, setStatus] = useState<BotStatus | null>(null);
  const [uptime, setUptime] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const s = await getStatus();
      setStatus(s);
      setUptime(s.uptime_seconds);
    } catch (e) { console.error("Failed to fetch bot status:", e); }
  }, []);

  useEffect(() => {
    fetchStatus();
    const poll = setInterval(fetchStatus, 5000);
    return () => clearInterval(poll);
  }, [fetchStatus]);

  useEffect(() => {
    intervalRef.current = setInterval(() => setUptime((u) => u + 1), 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  return (
    <Card title="Bot Status" icon={<Server size={14} />}>
      {!status ? (
        <p className="text-xs text-yt-muted">Loading…</p>
      ) : (
        <div className="flex flex-col gap-2 text-sm">
          <div className="flex items-center gap-2 text-yt-muted text-xs">
            <Clock size={12} />
            <span>Uptime: <span className="text-yt-text">{formatUptime(uptime)}</span></span>
          </div>
          <div className="flex items-center gap-2 text-yt-muted text-xs">
            <Cpu size={12} />
            <span>Memory: <span className="text-yt-text">{status.memory_mb} MB</span></span>
            <span className="ml-2">Python <span className="text-yt-text">{status.python_version}</span></span>
          </div>
          {status.bot_user && (
            <p className="text-xs text-yt-muted">
              Bot: <span className="text-yt-text">{status.bot_user}</span>
            </p>
          )}
          <div className="mt-1 flex flex-col gap-1">
            {status.connected_guilds.map((g) => (
              <div key={g.id} className="flex items-center justify-between text-xs bg-yt-elevated rounded-lg px-3 py-2">
                <span className="text-yt-text font-medium">{g.name}</span>
                <span className="text-yt-muted">
                  {g.voice_channel ? `🔊 ${g.voice_channel}` : "Not in VC"}
                  {g.now_playing ? ` · ${g.now_playing.slice(0, 30)}…` : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

const UTILITY_CARDS = [
  { id: "polls",     icon: <BarChart2 size={22} />, label: "Polls",     desc: "Create & schedule Discord polls" },
  { id: "birthdays", icon: <Cake size={22} />,      label: "Birthdays", desc: "Daily birthday wishes via bot" },
  { id: "reminders", icon: <AlarmClock size={22} />, label: "Reminders", desc: "One-off & recurring channel posts" },
] as const;

interface Props {
  onNavigate: (view: "polls" | "birthdays" | "reminders") => void;
}

export default function AdminHome({ onNavigate }: Props) {
  return (
    <div className="p-6 flex flex-col gap-4 max-w-2xl mx-auto w-full">
      <StreamNotifCard />
      <BotStatusCard />

      {/* Engagement Utilities */}
      <div className="bg-yt-surface rounded-xl p-5 flex flex-col gap-3">
        <div className="flex items-center gap-2 text-yt-muted text-xs font-semibold uppercase tracking-widest">
          <span className="text-xs">✦</span>
          Engagement Utilities
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {UTILITY_CARDS.map(({ id, icon, label, desc }) => (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              className="flex flex-col items-start gap-2 bg-yt-elevated hover:bg-yt-border rounded-xl px-4 py-4 transition-colors text-left group"
            >
              <span className="text-yt-muted group-hover:text-yt-text transition-colors">{icon}</span>
              <div>
                <p className="text-sm text-yt-text font-semibold">{label}</p>
                <p className="text-[11px] text-yt-muted mt-0.5">{desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

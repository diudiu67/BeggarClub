import { useState, useEffect } from "react";
import {
  listReminders, createReminder, updateReminder, toggleReminder, deleteReminder,
  type ReminderEntry, type CreateReminderPayload,
} from "../../lib/admin/reminders";
import { listAdminChannels, type AdminChannel } from "../../lib/admin";
import { ChevronLeft, Plus, Trash2, Pause, Play, X } from "lucide-react";

const WEEKDAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function recurrenceLabel(r: string | null): string {
  if (!r) return "One-off";
  if (r.startsWith("daily:")) return `Daily ${r.slice(6)}`;
  if (r.startsWith("weekly:")) {
    const [, wd, time] = r.split(":");
    return `Weekly ${WEEKDAY_NAMES[Number(wd)]} ${time}`;
  }
  if (r.startsWith("monthly:")) {
    const [, day, time] = r.split(":");
    return `Monthly day ${day} ${time}`;
  }
  return r;
}

function timeUntil(dateStr: string): string {
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff < 0) return "overdue";
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `in ${d}d ${h % 24}h`;
  if (h > 0) return `in ${h}h ${m % 60}m`;
  return `in ${m}m`;
}

type RecurrenceType = "once" | "daily" | "weekly" | "monthly";

interface Props {
  guildId: string | null;
  onBack: () => void;
}

export default function RemindersPage({ guildId, onBack }: Props) {
  const [reminders, setReminders] = useState<ReminderEntry[]>([]);
  const [channels, setChannels] = useState<AdminChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [channelId, setChannelId] = useState("");
  const [text, setText] = useState("");
  const [recType, setRecType] = useState<RecurrenceType>("once");
  const [scheduledFor, setScheduledFor] = useState("");
  const [dailyTime, setDailyTime] = useState("09:00");
  const [weeklyDay, setWeeklyDay] = useState(0);
  const [weeklyTime, setWeeklyTime] = useState("09:00");
  const [monthlyDay, setMonthlyDay] = useState(1);
  const [monthlyTime, setMonthlyTime] = useState("09:00");

  const load = async () => {
    if (!guildId) return;
    setLoading(true);
    try {
      const [rems, chs] = await Promise.all([listReminders(guildId), listAdminChannels()]);
      setReminders(rems);
      setChannels(chs);
      if (!channelId && chs.length > 0) setChannelId(chs[0].id);
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [guildId]);

  function buildRecurrence(): string | null {
    if (recType === "daily") return `daily:${dailyTime}`;
    if (recType === "weekly") return `weekly:${weeklyDay}:${weeklyTime}`;
    if (recType === "monthly") return `monthly:${monthlyDay}:${monthlyTime}`;
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guildId || !channelId) return;
    setSubmitting(true);
    setError("");
    try {
      const recurrence = buildRecurrence();
      const payload: CreateReminderPayload = {
        guild_id: guildId,
        channel_id: channelId,
        text: text.trim(),
        recurrence,
        scheduled_for: recType === "once" && scheduledFor ? new Date(scheduledFor).toISOString() : null,
      };
      await createReminder(payload);
      setShowForm(false);
      setText(""); setScheduledFor("");
      await load();
    } catch (e: any) { setError(e.message); }
    setSubmitting(false);
  };

  const handleToggle = async (id: number) => {
    try { await toggleReminder(id); await load(); } catch (e: any) { alert(e.message); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this reminder?")) return;
    try { await deleteReminder(id); await load(); } catch (e: any) { alert(e.message); }
  };

  if (!guildId) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-yt-muted">
        <p className="text-sm">Select a server first.</p>
      </div>
    );
  }

  const active = reminders.filter((r) => r.active);
  const paused = reminders.filter((r) => !r.active);

  return (
    <div className="p-6 flex flex-col gap-4 max-w-2xl mx-auto w-full">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-yt-muted hover:text-yt-text transition-colors">
          <ChevronLeft size={14} /> Admin Home
        </button>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-1.5 bg-yt-elevated hover:bg-yt-border text-yt-text text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
        >
          <Plus size={13} /> New Reminder
        </button>
      </div>

      <h1 className="text-lg font-bold text-yt-text -mt-2">Reminders ⏰</h1>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {/* Create form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-yt-surface rounded-xl p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-yt-muted uppercase tracking-widest">New Reminder</p>
            <button type="button" onClick={() => setShowForm(false)} className="text-yt-muted hover:text-yt-text"><X size={14} /></button>
          </div>

          {/* Channel */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-yt-muted">Channel</label>
            <select
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
              className="bg-yt-elevated border border-yt-border rounded-lg px-3 py-2 text-sm text-yt-text outline-none focus:border-yt-muted"
              required
            >
              {channels.map((ch) => <option key={ch.id} value={ch.id}>#{ch.name}</option>)}
            </select>
          </div>

          {/* Message */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-yt-muted">Message</label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Don't forget to…"
              rows={3}
              className="bg-yt-elevated border border-yt-border rounded-lg px-3 py-2 text-sm text-yt-text outline-none focus:border-yt-muted resize-none"
              required
            />
          </div>

          {/* Recurrence type */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-yt-muted">Schedule type</label>
            <div className="flex flex-wrap gap-3">
              {(["once", "daily", "weekly", "monthly"] as const).map((t) => (
                <label key={t} className="flex items-center gap-1.5 text-xs text-yt-muted cursor-pointer capitalize">
                  <input type="radio" name="recType" value={t} checked={recType === t} onChange={() => setRecType(t)} />
                  {t === "once" ? "One-off" : t.charAt(0).toUpperCase() + t.slice(1)}
                </label>
              ))}
            </div>
          </div>

          {/* Conditional time fields */}
          {recType === "once" && (
            <div className="flex flex-col gap-1">
              <label className="text-xs text-yt-muted">Send at</label>
              <input
                type="datetime-local"
                value={scheduledFor}
                onChange={(e) => setScheduledFor(e.target.value)}
                className="bg-yt-elevated border border-yt-border rounded-lg px-3 py-2 text-sm text-yt-text outline-none focus:border-yt-muted"
                required
              />
            </div>
          )}
          {recType === "daily" && (
            <div className="flex flex-col gap-1">
              <label className="text-xs text-yt-muted">Time (UTC)</label>
              <input
                type="time"
                value={dailyTime}
                onChange={(e) => setDailyTime(e.target.value)}
                className="bg-yt-elevated border border-yt-border rounded-lg px-3 py-2 text-sm text-yt-text outline-none focus:border-yt-muted w-40"
              />
            </div>
          )}
          {recType === "weekly" && (
            <div className="flex gap-3 flex-wrap">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-yt-muted">Day</label>
                <select
                  value={weeklyDay}
                  onChange={(e) => setWeeklyDay(Number(e.target.value))}
                  className="bg-yt-elevated border border-yt-border rounded-lg px-3 py-2 text-sm text-yt-text outline-none focus:border-yt-muted"
                >
                  {WEEKDAY_NAMES.map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-yt-muted">Time (UTC)</label>
                <input
                  type="time"
                  value={weeklyTime}
                  onChange={(e) => setWeeklyTime(e.target.value)}
                  className="bg-yt-elevated border border-yt-border rounded-lg px-3 py-2 text-sm text-yt-text outline-none focus:border-yt-muted"
                />
              </div>
            </div>
          )}
          {recType === "monthly" && (
            <div className="flex gap-3 flex-wrap">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-yt-muted">Day of month</label>
                <select
                  value={monthlyDay}
                  onChange={(e) => setMonthlyDay(Number(e.target.value))}
                  className="bg-yt-elevated border border-yt-border rounded-lg px-3 py-2 text-sm text-yt-text outline-none focus:border-yt-muted"
                >
                  {Array.from({ length: 28 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-yt-muted">Time (UTC)</label>
                <input
                  type="time"
                  value={monthlyTime}
                  onChange={(e) => setMonthlyTime(e.target.value)}
                  className="bg-yt-elevated border border-yt-border rounded-lg px-3 py-2 text-sm text-yt-text outline-none focus:border-yt-muted"
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !channelId || !text.trim()}
            className="bg-yt-elevated hover:bg-yt-border text-yt-text text-sm font-semibold py-2 rounded-lg transition-colors disabled:opacity-50 mt-1"
          >
            {submitting ? "Creating…" : "Create Reminder"}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-xs text-yt-muted">Loading…</p>
      ) : (
        <>
          {active.length > 0 && (
            <section>
              <p className="text-xs font-semibold text-yt-muted uppercase tracking-widest mb-2">Active ({active.length})</p>
              <div className="flex flex-col gap-2">
                {active.map((r) => <ReminderCard key={r.id} reminder={r} channels={channels} onToggle={() => handleToggle(r.id)} onDelete={() => handleDelete(r.id)} />)}
              </div>
            </section>
          )}
          {paused.length > 0 && (
            <section>
              <p className="text-xs font-semibold text-yt-muted uppercase tracking-widest mb-2">Paused ({paused.length})</p>
              <div className="flex flex-col gap-2">
                {paused.map((r) => <ReminderCard key={r.id} reminder={r} channels={channels} onToggle={() => handleToggle(r.id)} onDelete={() => handleDelete(r.id)} />)}
              </div>
            </section>
          )}
          {reminders.length === 0 && !showForm && (
            <p className="text-xs text-yt-muted text-center py-8">No reminders yet. Create one above.</p>
          )}
        </>
      )}
    </div>
  );
}

function ReminderCard({ reminder, channels, onToggle, onDelete }: {
  reminder: ReminderEntry;
  channels: AdminChannel[];
  onToggle: () => void;
  onDelete: () => void;
}) {
  const ch = channels.find((c) => c.id === reminder.channel_id);
  const chName = ch ? `#${ch.name}` : `#${reminder.channel_id}`;

  return (
    <div className={`bg-yt-surface rounded-xl px-4 py-3 flex items-start gap-3 ${!reminder.active ? "opacity-60" : ""}`}>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-yt-text leading-snug">{reminder.text}</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
          <span className="text-[10px] text-yt-muted">{chName}</span>
          <span className="text-[10px] bg-yt-elevated px-1.5 py-0.5 rounded-full text-yt-muted">
            {recurrenceLabel(reminder.recurrence)}
          </span>
          {reminder.active && (
            <span className="text-[10px] text-yt-muted">
              {timeUntil(reminder.next_run_at)}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
        <button onClick={onToggle} title={reminder.active ? "Pause" : "Resume"}
          className="text-yt-muted hover:text-yt-text transition-colors">
          {reminder.active ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <button onClick={onDelete} title="Delete"
          className="text-yt-muted hover:text-red-400 transition-colors">
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

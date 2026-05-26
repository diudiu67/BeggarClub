import { useState, useEffect, useRef } from "react";
import { listPolls, createPoll, endPoll, deletePoll, type PollData, type CreatePollPayload } from "../../lib/admin/polls";
import { listAdminChannels, type AdminChannel } from "../../lib/admin";
import { ChevronLeft, Plus, X, Trash2, StopCircle, RefreshCw } from "lucide-react";

const DISCORD_HOUR_OPTIONS = [1, 4, 8, 24, 72, 168, 336];
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function snap(seconds: number): number {
  const hours = seconds / 3600;
  const allowed = DISCORD_HOUR_OPTIONS;
  let best = allowed[0];
  for (const h of allowed) {
    if (Math.abs(h - hours) < Math.abs(best - hours)) best = h;
  }
  return best * 3600;
}

function statusColor(status: PollData["status"]) {
  if (status === "active") return "bg-green-500/20 text-green-400";
  if (status === "scheduled") return "bg-blue-500/20 text-blue-400";
  return "bg-yt-elevated text-yt-muted";
}

function TallyBar({ label, count, total }: { label: string; count: number; total: number }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex justify-between text-xs text-yt-muted">
        <span>{label}</span>
        <span>{count} ({pct}%)</span>
      </div>
      <div className="h-1.5 bg-yt-elevated rounded-full overflow-hidden">
        <div className="h-full bg-yt-muted rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function PollCard({ poll, onEnd, onDelete }: { poll: PollData; onEnd: () => void; onDelete: () => void }) {
  const tallies = poll.tallies ?? poll.final_results ?? {};
  const total = Object.values(tallies).reduce((a, b) => a + b, 0);
  const [expanded, setExpanded] = useState(poll.status !== "ended");

  return (
    <div className="bg-yt-elevated rounded-xl p-4 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${statusColor(poll.status)}`}>
              {poll.status}
            </span>
            <span className="text-[10px] text-yt-muted uppercase">{poll.poll_type}</span>
          </div>
          <p className="text-sm font-semibold text-yt-text mt-1 truncate">{poll.question}</p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {poll.status === "active" && (
            <button onClick={onEnd} title="End poll" className="text-yt-muted hover:text-yellow-400 transition-colors">
              <StopCircle size={15} />
            </button>
          )}
          <button onClick={onDelete} title="Delete" className="text-yt-muted hover:text-red-400 transition-colors">
            <Trash2 size={15} />
          </button>
          <button onClick={() => setExpanded((v) => !v)} className="text-yt-muted hover:text-yt-text transition-colors text-xs px-1">
            {expanded ? "▲" : "▼"}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="flex flex-col gap-1.5 mt-1">
          {poll.options.map((opt, i) => (
            <TallyBar key={i} label={opt} count={tallies[String(i)] ?? 0} total={total} />
          ))}
          <p className="text-[10px] text-yt-muted mt-1">
            {poll.scheduled_for && poll.status === "scheduled" && (
              <>Scheduled: {new Date(poll.scheduled_for).toLocaleString()} · </>
            )}
            {poll.ends_at && poll.status === "active" && (
              <>Ends: {new Date(poll.ends_at).toLocaleString()} · </>
            )}
            Duration: {DISCORD_HOUR_OPTIONS.find((h) => h * 3600 >= poll.duration_seconds) ?? Math.round(poll.duration_seconds / 3600)}h
            {" "}· {total} vote{total !== 1 ? "s" : ""}
          </p>
        </div>
      )}
    </div>
  );
}

interface Props {
  guildId: string | null;
  onBack: () => void;
}

export default function PollsPage({ guildId, onBack }: Props) {
  const [polls, setPolls] = useState<PollData[]>([]);
  const [channels, setChannels] = useState<AdminChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Form state
  const [channelId, setChannelId] = useState("");
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [pollType, setPollType] = useState<"native" | "reaction">("native");
  const [durationHours, setDurationHours] = useState(24);
  const [multiSelect, setMultiSelect] = useState(false);
  const [anonymous, setAnonymous] = useState(false);
  const [timing, setTiming] = useState<"immediate" | "scheduled">("immediate");
  const [scheduledFor, setScheduledFor] = useState("");

  const load = async () => {
    if (!guildId) return;
    try {
      const [p, ch] = await Promise.all([listPolls(guildId), listAdminChannels()]);
      setPolls(p);
      setChannels(ch);
      if (!channelId && ch.length > 0) setChannelId(ch[0].id);
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  };

  useEffect(() => {
    load();
    refreshRef.current = setInterval(load, 15000);
    return () => { if (refreshRef.current) clearInterval(refreshRef.current); };
  }, [guildId]);

  const handleEnd = async (id: number) => {
    if (!confirm("End this poll now?")) return;
    try { await endPoll(id); await load(); } catch (e: any) { alert(e.message); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this poll?")) return;
    try { await deletePoll(id); await load(); } catch (e: any) { alert(e.message); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guildId) return;
    const validOpts = options.filter((o) => o.trim());
    if (validOpts.length < 2) return setError("At least 2 options required.");
    setSubmitting(true);
    setError("");
    try {
      const payload: CreatePollPayload = {
        guild_id: guildId,
        channel_id: channelId,
        question: question.trim(),
        options: validOpts,
        poll_type: pollType,
        duration_seconds: snap(durationHours * 3600),
        multi_select: multiSelect,
        anonymous,
        scheduled_for: timing === "scheduled" && scheduledFor ? new Date(scheduledFor).toISOString() : null,
      };
      await createPoll(payload);
      setShowForm(false);
      setQuestion("");
      setOptions(["", ""]);
      await load();
    } catch (e: any) { setError(e.message); }
    setSubmitting(false);
  };

  const active = polls.filter((p) => p.status === "active");
  const scheduled = polls.filter((p) => p.status === "scheduled");
  const ended = polls.filter((p) => p.status === "ended");

  if (!guildId) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-yt-muted">
        <p className="text-sm">Select a server first.</p>
      </div>
    );
  }

  return (
    <div className="p-6 flex flex-col gap-4 max-w-2xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-yt-muted hover:text-yt-text transition-colors">
          <ChevronLeft size={14} /> Admin Home
        </button>
        <div className="flex items-center gap-2">
          <button onClick={load} className="text-yt-muted hover:text-yt-text transition-colors" title="Refresh">
            <RefreshCw size={14} />
          </button>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="flex items-center gap-1.5 bg-yt-elevated hover:bg-yt-border text-yt-text text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
          >
            <Plus size={13} /> New Poll
          </button>
        </div>
      </div>

      <h1 className="text-lg font-bold text-yt-text -mt-2">Polls</h1>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {/* Create form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-yt-surface rounded-xl p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-yt-muted uppercase tracking-widest">New Poll</p>
            <button type="button" onClick={() => setShowForm(false)} className="text-yt-muted hover:text-yt-text">
              <X size={14} />
            </button>
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

          {/* Question */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-yt-muted">Question</label>
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="What do you think about…"
              className="bg-yt-elevated border border-yt-border rounded-lg px-3 py-2 text-sm text-yt-text outline-none focus:border-yt-muted"
              required
            />
          </div>

          {/* Options */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-yt-muted">Options (2–10)</label>
            {options.map((opt, i) => (
              <div key={i} className="flex gap-2">
                <input
                  value={opt}
                  onChange={(e) => { const o = [...options]; o[i] = e.target.value; setOptions(o); }}
                  placeholder={`Option ${i + 1}`}
                  maxLength={55}
                  className="flex-1 bg-yt-elevated border border-yt-border rounded-lg px-3 py-1.5 text-sm text-yt-text outline-none focus:border-yt-muted"
                />
                {options.length > 2 && (
                  <button type="button" onClick={() => setOptions(options.filter((_, j) => j !== i))}
                    className="text-yt-muted hover:text-red-400 transition-colors">
                    <X size={13} />
                  </button>
                )}
              </div>
            ))}
            {options.length < 10 && (
              <button type="button" onClick={() => setOptions([...options, ""])}
                className="text-xs text-yt-muted hover:text-yt-text transition-colors self-start mt-0.5">
                + Add option
              </button>
            )}
          </div>

          {/* Type + extras */}
          <div className="flex gap-3 flex-wrap">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-yt-muted">Type</label>
              <select
                value={pollType}
                onChange={(e) => setPollType(e.target.value as "native" | "reaction")}
                className="bg-yt-elevated border border-yt-border rounded-lg px-3 py-2 text-sm text-yt-text outline-none focus:border-yt-muted"
              >
                <option value="native">Native Discord Poll</option>
                <option value="reaction">Reaction Poll</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-yt-muted">Duration</label>
              <select
                value={durationHours}
                onChange={(e) => setDurationHours(Number(e.target.value))}
                className="bg-yt-elevated border border-yt-border rounded-lg px-3 py-2 text-sm text-yt-text outline-none focus:border-yt-muted"
              >
                {DISCORD_HOUR_OPTIONS.map((h) => (
                  <option key={h} value={h}>{h < 24 ? `${h}h` : `${h / 24}d`}</option>
                ))}
              </select>
            </div>
          </div>

          {pollType === "native" && (
            <label className="flex items-center gap-2 text-xs text-yt-muted cursor-pointer">
              <input type="checkbox" checked={multiSelect} onChange={(e) => setMultiSelect(e.target.checked)} className="rounded" />
              Allow multiple answers
            </label>
          )}
          {pollType === "reaction" && (
            <label className="flex items-center gap-2 text-xs text-yt-muted cursor-pointer">
              <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} className="rounded" />
              Anonymous (no voter names shown)
            </label>
          )}

          {/* Timing */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-yt-muted">When to post</label>
            <div className="flex gap-3">
              {(["immediate", "scheduled"] as const).map((t) => (
                <label key={t} className="flex items-center gap-1.5 text-xs text-yt-muted cursor-pointer">
                  <input type="radio" name="timing" value={t} checked={timing === t} onChange={() => setTiming(t)} />
                  {t === "immediate" ? "Post immediately" : "Schedule for…"}
                </label>
              ))}
            </div>
            {timing === "scheduled" && (
              <input
                type="datetime-local"
                value={scheduledFor}
                onChange={(e) => setScheduledFor(e.target.value)}
                className="bg-yt-elevated border border-yt-border rounded-lg px-3 py-2 text-sm text-yt-text outline-none focus:border-yt-muted mt-1"
                required
              />
            )}
          </div>

          <button
            type="submit"
            disabled={submitting || !channelId || !question.trim()}
            className="bg-yt-elevated hover:bg-yt-border text-yt-text text-sm font-semibold py-2 rounded-lg transition-colors disabled:opacity-50 mt-1"
          >
            {submitting ? "Creating…" : "Create Poll"}
          </button>
        </form>
      )}

      {loading ? (
        <p className="text-xs text-yt-muted">Loading…</p>
      ) : (
        <>
          {scheduled.length > 0 && (
            <section>
              <p className="text-xs font-semibold text-yt-muted uppercase tracking-widest mb-2">Scheduled ({scheduled.length})</p>
              <div className="flex flex-col gap-2">
                {scheduled.map((p) => <PollCard key={p.id} poll={p} onEnd={() => handleEnd(p.id)} onDelete={() => handleDelete(p.id)} />)}
              </div>
            </section>
          )}
          {active.length > 0 && (
            <section>
              <p className="text-xs font-semibold text-yt-muted uppercase tracking-widest mb-2">Active ({active.length})</p>
              <div className="flex flex-col gap-2">
                {active.map((p) => <PollCard key={p.id} poll={p} onEnd={() => handleEnd(p.id)} onDelete={() => handleDelete(p.id)} />)}
              </div>
            </section>
          )}
          {ended.length > 0 && (
            <section>
              <p className="text-xs font-semibold text-yt-muted uppercase tracking-widest mb-2">Ended ({ended.length})</p>
              <div className="flex flex-col gap-2">
                {ended.map((p) => <PollCard key={p.id} poll={p} onEnd={() => handleEnd(p.id)} onDelete={() => handleDelete(p.id)} />)}
              </div>
            </section>
          )}
          {polls.length === 0 && !showForm && (
            <p className="text-xs text-yt-muted text-center py-8">No polls yet. Create one above.</p>
          )}
        </>
      )}
    </div>
  );
}

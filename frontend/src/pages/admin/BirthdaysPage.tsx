import { useState, useEffect } from "react";
import {
  listBirthdays, addBirthday, updateBirthday, deleteBirthday,
  getBirthdayConfig, saveBirthdayConfig,
  type BirthdayEntry, type BirthdayConfig,
} from "../../lib/admin/birthdays";
import { listAdminChannels, type AdminChannel } from "../../lib/admin";
import { ChevronLeft, Plus, Trash2, Edit2, Check, X } from "lucide-react";

const MONTHS = [
  "Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec",
];

function daysInMonth(month: number): number {
  // month is 1-based; use a non-leap year baseline; allow 29 for Feb
  return [0, 31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month] ?? 31;
}

function dayOptions(month: number): number[] {
  return Array.from({ length: daysInMonth(month) }, (_, i) => i + 1);
}

function plural(n: number, word: string) {
  return `${n} ${word}${n !== 1 ? "s" : ""}`;
}

interface EditRow { display_name: string; birth_month: number; birth_day: number }

interface Props {
  guildId: string | null;
  onBack: () => void;
}

export default function BirthdaysPage({ guildId, onBack }: Props) {
  const [birthdays, setBirthdays] = useState<BirthdayEntry[]>([]);
  const [channels, setChannels] = useState<AdminChannel[]>([]);
  const [config, setConfig] = useState<BirthdayConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingConfig, setSavingConfig] = useState(false);
  const [configMsg, setConfigMsg] = useState("");

  // Config form
  const [cfgChannel, setCfgChannel] = useState("");
  const [cfgHour, setCfgHour] = useState(9);
  const [cfgTemplate, setCfgTemplate] = useState("🎂 Happy Birthday {mention}! Wishing you a wonderful day! 🎉");

  // Add form
  const [showAdd, setShowAdd] = useState(false);
  const [addUserId, setAddUserId] = useState("");
  const [addName, setAddName] = useState("");
  const [addMonth, setAddMonth] = useState(1);
  const [addDay, setAddDay] = useState(1);
  const [adding, setAdding] = useState(false);

  // Inline edit
  const [editId, setEditId] = useState<number | null>(null);
  const [editRow, setEditRow] = useState<EditRow>({ display_name: "", birth_month: 1, birth_day: 1 });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!guildId) return;
    setLoading(true);
    try {
      const [bds, chs, cfg] = await Promise.all([
        listBirthdays(guildId),
        listAdminChannels(),
        getBirthdayConfig(guildId).catch(() => null),
      ]);
      setBirthdays(bds);
      setChannels(chs);
      if (cfg) {
        setConfig(cfg);
        setCfgChannel(cfg.channel_id);
        setCfgHour(cfg.post_hour);
        setCfgTemplate(cfg.message_template);
      } else if (chs.length > 0) {
        setCfgChannel(chs[0].id);
      }
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [guildId]);

  const handleSaveConfig = async () => {
    if (!guildId || !cfgChannel) return;
    setSavingConfig(true);
    setConfigMsg("");
    try {
      await saveBirthdayConfig({ guild_id: guildId, channel_id: cfgChannel, post_hour: cfgHour, message_template: cfgTemplate });
      setConfigMsg("✅ Saved");
    } catch (e: any) { setConfigMsg(`❌ ${e.message}`); }
    setSavingConfig(false);
    setTimeout(() => setConfigMsg(""), 3000);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guildId) return;
    setAdding(true);
    setError("");
    try {
      await addBirthday({ guild_id: guildId, user_id: addUserId.trim(), display_name: addName.trim(), birth_month: addMonth, birth_day: addDay });
      setShowAdd(false);
      setAddUserId(""); setAddName(""); setAddMonth(1); setAddDay(1);
      await load();
    } catch (e: any) { setError(e.message); }
    setAdding(false);
  };

  const startEdit = (b: BirthdayEntry) => {
    setEditId(b.id);
    setEditRow({ display_name: b.display_name, birth_month: b.birth_month, birth_day: b.birth_day });
  };

  const handleSaveEdit = async () => {
    if (editId === null) return;
    setSaving(true);
    try {
      await updateBirthday(editId, editRow);
      setEditId(null);
      await load();
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Remove this birthday?")) return;
    try { await deleteBirthday(id); await load(); } catch (e: any) { alert(e.message); }
  };

  if (!guildId) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-yt-muted">
        <p className="text-sm">Select a server first.</p>
      </div>
    );
  }

  return (
    <div className="p-6 flex flex-col gap-4 max-w-2xl mx-auto w-full">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-yt-muted hover:text-yt-text transition-colors">
          <ChevronLeft size={14} /> Admin Home
        </button>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="flex items-center gap-1.5 bg-yt-elevated hover:bg-yt-border text-yt-text text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
        >
          <Plus size={13} /> Add Birthday
        </button>
      </div>

      <h1 className="text-lg font-bold text-yt-text -mt-2">Birthdays 🎂</h1>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {/* Config card */}
      <div className="bg-yt-surface rounded-xl p-5 flex flex-col gap-3">
        <p className="text-xs font-semibold text-yt-muted uppercase tracking-widest">Configuration</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-yt-muted">Post channel</label>
            <select
              value={cfgChannel}
              onChange={(e) => setCfgChannel(e.target.value)}
              className="bg-yt-elevated border border-yt-border rounded-lg px-3 py-2 text-sm text-yt-text outline-none focus:border-yt-muted"
            >
              {channels.map((ch) => <option key={ch.id} value={ch.id}>#{ch.name}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-yt-muted">Post hour (UTC)</label>
            <select
              value={cfgHour}
              onChange={(e) => setCfgHour(Number(e.target.value))}
              className="bg-yt-elevated border border-yt-border rounded-lg px-3 py-2 text-sm text-yt-text outline-none focus:border-yt-muted"
            >
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>{String(i).padStart(2, "0")}:00</option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-yt-muted">Message template — use <code className="bg-yt-elevated px-1 rounded">{"{mention}"}</code> for the birthday person</label>
          <input
            value={cfgTemplate}
            onChange={(e) => setCfgTemplate(e.target.value)}
            className="bg-yt-elevated border border-yt-border rounded-lg px-3 py-2 text-sm text-yt-text outline-none focus:border-yt-muted"
          />
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleSaveConfig}
            disabled={savingConfig}
            className="bg-yt-elevated hover:bg-yt-border text-yt-text text-xs font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            {savingConfig ? "Saving…" : "Save Config"}
          </button>
          {configMsg && <span className="text-xs text-yt-muted">{configMsg}</span>}
        </div>
      </div>

      {/* Add form */}
      {showAdd && (
        <form onSubmit={handleAdd} className="bg-yt-surface rounded-xl p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-yt-muted uppercase tracking-widest">Add Birthday</p>
            <button type="button" onClick={() => setShowAdd(false)} className="text-yt-muted hover:text-yt-text"><X size={14} /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-yt-muted">Discord User ID</label>
              <input
                value={addUserId}
                onChange={(e) => setAddUserId(e.target.value)}
                placeholder="123456789012345678"
                className="bg-yt-elevated border border-yt-border rounded-lg px-3 py-2 text-sm text-yt-text outline-none focus:border-yt-muted"
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-yt-muted">Display Name</label>
              <input
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder="@username or nickname"
                className="bg-yt-elevated border border-yt-border rounded-lg px-3 py-2 text-sm text-yt-text outline-none focus:border-yt-muted"
                required
              />
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-xs text-yt-muted">Month</label>
              <select
                value={addMonth}
                onChange={(e) => { const m = Number(e.target.value); setAddMonth(m); if (addDay > daysInMonth(m)) setAddDay(1); }}
                className="bg-yt-elevated border border-yt-border rounded-lg px-3 py-2 text-sm text-yt-text outline-none focus:border-yt-muted"
              >
                {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-xs text-yt-muted">Day</label>
              <select
                value={addDay}
                onChange={(e) => setAddDay(Number(e.target.value))}
                className="bg-yt-elevated border border-yt-border rounded-lg px-3 py-2 text-sm text-yt-text outline-none focus:border-yt-muted"
              >
                {dayOptions(addMonth).map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>
          <button
            type="submit"
            disabled={adding}
            className="bg-yt-elevated hover:bg-yt-border text-yt-text text-sm font-semibold py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            {adding ? "Adding…" : "Add Birthday"}
          </button>
        </form>
      )}

      {/* Birthday list */}
      {loading ? (
        <p className="text-xs text-yt-muted">Loading…</p>
      ) : birthdays.length === 0 ? (
        <p className="text-xs text-yt-muted text-center py-8">No birthdays yet. Add one above.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {birthdays.map((b) => (
            <div key={b.id} className="bg-yt-surface rounded-xl px-4 py-3 flex items-center gap-3">
              {editId === b.id ? (
                <>
                  <div className="flex-1 flex gap-2 flex-wrap items-center">
                    <input
                      value={editRow.display_name}
                      onChange={(e) => setEditRow((r) => ({ ...r, display_name: e.target.value }))}
                      className="bg-yt-elevated border border-yt-border rounded-lg px-2 py-1 text-sm text-yt-text outline-none focus:border-yt-muted w-40"
                    />
                    <select
                      value={editRow.birth_month}
                      onChange={(e) => { const m = Number(e.target.value); setEditRow((r) => ({ ...r, birth_month: m, birth_day: Math.min(r.birth_day, daysInMonth(m)) })); }}
                      className="bg-yt-elevated border border-yt-border rounded-lg px-2 py-1 text-sm text-yt-text outline-none"
                    >
                      {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                    </select>
                    <select
                      value={editRow.birth_day}
                      onChange={(e) => setEditRow((r) => ({ ...r, birth_day: Number(e.target.value) }))}
                      className="bg-yt-elevated border border-yt-border rounded-lg px-2 py-1 text-sm text-yt-text outline-none"
                    >
                      {dayOptions(editRow.birth_month).map((d) => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <button onClick={handleSaveEdit} disabled={saving} className="text-green-400 hover:text-green-300 transition-colors"><Check size={15} /></button>
                  <button onClick={() => setEditId(null)} className="text-yt-muted hover:text-yt-text transition-colors"><X size={15} /></button>
                </>
              ) : (
                <>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-yt-text font-medium truncate">{b.display_name}</p>
                    <p className="text-xs text-yt-muted">
                      {MONTHS[b.birth_month - 1]} {b.birth_day}
                      {b.days_until === 0
                        ? " · 🎂 Today!"
                        : ` · in ${plural(b.days_until, "day")}`}
                    </p>
                  </div>
                  <button onClick={() => startEdit(b)} className="text-yt-muted hover:text-yt-text transition-colors"><Edit2 size={14} /></button>
                  <button onClick={() => handleDelete(b.id)} className="text-yt-muted hover:text-red-400 transition-colors"><Trash2 size={14} /></button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

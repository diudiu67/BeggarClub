const BASE = "/api/admin/reminders";
const STORAGE_KEY = "admin_secret";

function headers(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-Admin-Secret": localStorage.getItem(STORAGE_KEY) ?? "",
  };
}

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...headers(), ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(body.detail ?? "Request failed");
  }
  return res.json();
}

export interface ReminderEntry {
  id: number;
  guild_id: string;
  channel_id: string;
  text: string;
  recurrence: string | null;
  next_run_at: string;
  last_run_at: string | null;
  created_at: string;
  active: boolean;
}

export interface CreateReminderPayload {
  guild_id: string;
  channel_id: string;
  text: string;
  recurrence?: string | null;
  scheduled_for?: string | null;
}

export interface UpdateReminderPayload {
  channel_id?: string;
  text?: string;
  recurrence?: string | null;
  next_run_at?: string;
}

export async function listReminders(guildId: string): Promise<ReminderEntry[]> {
  return req(`?guild_id=${encodeURIComponent(guildId)}`);
}

export async function createReminder(
  payload: CreateReminderPayload
): Promise<ReminderEntry> {
  return req("", { method: "POST", body: JSON.stringify(payload) });
}

export async function updateReminder(
  id: number,
  payload: UpdateReminderPayload
): Promise<ReminderEntry> {
  return req(`/${id}`, { method: "PUT", body: JSON.stringify(payload) });
}

export async function toggleReminder(id: number): Promise<ReminderEntry> {
  return req(`/${id}/toggle`, { method: "PATCH" });
}

export async function deleteReminder(id: number): Promise<void> {
  await req(`/${id}`, { method: "DELETE" });
}

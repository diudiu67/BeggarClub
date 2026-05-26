const BASE = "/api/admin/birthdays";
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

export interface BirthdayEntry {
  id: number;
  guild_id: string;
  user_id: string;
  display_name: string;
  birth_month: number;
  birth_day: number;
  next_birthday: string | null;
  days_until: number;
}

export interface BirthdayConfig {
  channel_id: string;
  post_hour: number;
  message_template: string;
}

export async function listBirthdays(guildId: string): Promise<BirthdayEntry[]> {
  return req(`?guild_id=${encodeURIComponent(guildId)}`);
}

export async function addBirthday(payload: {
  guild_id: string;
  user_id: string;
  display_name: string;
  birth_month: number;
  birth_day: number;
}): Promise<BirthdayEntry> {
  return req("", { method: "POST", body: JSON.stringify(payload) });
}

export async function updateBirthday(
  id: number,
  payload: { display_name?: string; birth_month?: number; birth_day?: number }
): Promise<BirthdayEntry> {
  return req(`/${id}`, { method: "PUT", body: JSON.stringify(payload) });
}

export async function deleteBirthday(id: number): Promise<void> {
  await req(`/${id}`, { method: "DELETE" });
}

export async function getBirthdayConfig(guildId: string): Promise<BirthdayConfig> {
  return req(`/config?guild_id=${encodeURIComponent(guildId)}`);
}

export async function saveBirthdayConfig(payload: {
  guild_id: string;
  channel_id: string;
  post_hour: number;
  message_template: string;
}): Promise<void> {
  await req("/config", { method: "PUT", body: JSON.stringify(payload) });
}

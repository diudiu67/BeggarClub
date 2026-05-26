const BASE = "/api/admin";
const STORAGE_KEY = "admin_secret";

function getSecret(): string {
  return localStorage.getItem(STORAGE_KEY) ?? "";
}

function headers(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-Admin-Secret": getSecret(),
  };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
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

export async function adminLogin(password: string): Promise<boolean> {
  try {
    await fetch(`${BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    }).then(async (res) => {
      if (!res.ok) throw new Error("Wrong password");
    });
    localStorage.setItem(STORAGE_KEY, password);
    return true;
  } catch {
    return false;
  }
}

export function adminLogout() {
  localStorage.removeItem(STORAGE_KEY);
}

export function isAdminLoggedIn(): boolean {
  return !!getSecret();
}

export interface BotStatus {
  uptime_seconds: number;
  connected_guilds: { id: string; name: string; voice_channel: string | null; now_playing: string | null }[];
  memory_mb: number;
  python_version: string;
  platform: string;
  bot_user: string | null;
}

export async function getStatus(): Promise<BotStatus> {
  return request("/status");
}

export interface NotificationsConfig {
  stream_notifications_enabled: boolean;
  notification_channel_id: string | null;
  notification_channel_name: string | null;
}

export async function getNotificationsConfig(): Promise<NotificationsConfig> {
  return request("/notifications/config");
}

export async function toggleNotifications(enabled: boolean): Promise<void> {
  await request("/notifications/toggle", {
    method: "POST",
    body: JSON.stringify({ enabled }),
  });
}

export async function testNotification(): Promise<void> {
  await request("/notifications/test", { method: "POST" });
}

export interface AdminChannel {
  id: string;
  name: string;
}

export async function listAdminChannels(): Promise<AdminChannel[]> {
  return request("/channels");
}

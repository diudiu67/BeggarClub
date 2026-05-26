const BASE = "/api/strategy";
const STORAGE_KEY = "admin_secret";

function adminHeaders(): Record<string, string> {
  return {
    "X-Admin-Secret": localStorage.getItem(STORAGE_KEY) ?? "",
  };
}

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(body.detail ?? "Request failed");
  }
  return res.json();
}

export interface StrategyPost {
  id: number;
  guild_id: string;
  message_id: string;
  category: "strategy" | "guildwar";
  author_name: string;
  author_avatar: string;
  content: string;
  media: { public_url: string; r2_key: string; media_type: string }[];
  position: number;
  message_url: string;
  created_at: string;
  pinned: boolean;
}

export async function getStrategyPosts(
  guildId: string,
  category?: string
): Promise<StrategyPost[]> {
  const params = new URLSearchParams({ guild_id: guildId });
  if (category) params.set("category", category);
  return req(`/posts?${params}`);
}

export async function createStrategyPost(
  formData: FormData
): Promise<StrategyPost> {
  const res = await fetch(`${BASE}/posts`, {
    method: "POST",
    headers: adminHeaders(),
    body: formData,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(body.detail ?? "Request failed");
  }
  return res.json();
}

export async function moveStrategyPost(
  id: number,
  position: number
): Promise<void> {
  const res = await fetch(`${BASE}/posts/${id}/position`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...adminHeaders() },
    body: JSON.stringify({ position }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(body.detail ?? "Request failed");
  }
}

export async function deleteStrategyPost(id: number): Promise<void> {
  const res = await fetch(`${BASE}/posts/${id}`, {
    method: "DELETE",
    headers: adminHeaders(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(body.detail ?? "Request failed");
  }
}

export async function pinStrategyPost(id: number): Promise<StrategyPost> {
  const res = await fetch(`${BASE}/posts/${id}/pin`, {
    method: "PATCH",
    headers: adminHeaders(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(body.detail ?? "Request failed");
  }
  return res.json();
}

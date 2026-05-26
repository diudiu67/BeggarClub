const BASE = "/api/admin/polls";
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

export interface PollData {
  id: number;
  guild_id: string;
  channel_id: string;
  message_id: string | null;
  question: string;
  options: string[];
  poll_type: "native" | "reaction";
  duration_seconds: number;
  multi_select: boolean;
  anonymous: boolean;
  scheduled_for: string | null;
  dispatched_at: string | null;
  created_at: string;
  ends_at: string | null;
  ended_at: string | null;
  final_results: Record<string, number> | null;
  tallies: Record<string, number> | null;
  status: "active" | "scheduled" | "ended";
}

export interface CreatePollPayload {
  guild_id: string;
  channel_id: string;
  question: string;
  options: string[];
  poll_type: "native" | "reaction";
  duration_seconds: number;
  multi_select?: boolean;
  anonymous?: boolean;
  scheduled_for?: string | null;
}

export async function listPolls(guildId: string, status = "all"): Promise<PollData[]> {
  return req(`?guild_id=${encodeURIComponent(guildId)}&status=${status}`);
}

export async function createPoll(payload: CreatePollPayload): Promise<PollData> {
  return req("", { method: "POST", body: JSON.stringify(payload) });
}

export async function getPoll(id: number): Promise<PollData> {
  return req(`/${id}`);
}

export async function endPoll(id: number): Promise<void> {
  await req(`/${id}/end`, { method: "POST" });
}

export async function deletePoll(id: number): Promise<void> {
  await req(`/${id}`, { method: "DELETE" });
}

import type { PlayerState } from "../types";

type StateListener = (state: PlayerState) => void;
type NotificationListener = (payload: NotificationPayload) => void;

export interface NotificationPayload {
  type: string;
  is_test?: boolean;
  user_id: string;
  user_name: string;
  user_avatar: string;
  channel_name: string;
  started_at: string;
}

// Events that carry PlayerState — all others are routed to notification listeners
const STATE_EVENTS = new Set([
  "state",
  "now_playing",
  "queue_updated",
  "stopped",
  "paused",
  "resumed",
  "volume_changed",
  "voice_updated",
  "state_updated",
]);

class MusicWebSocket {
  private ws: WebSocket | null = null;
  private guildId: string = "";
  private listeners: Set<StateListener> = new Set();
  private notificationListeners: Set<NotificationListener> = new Set();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  connect(guildId: string, secret: string) {
    if (this.ws) this.ws.close();
    this.guildId = guildId;

    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const host = window.location.host;
    this.ws = new WebSocket(`${protocol}://${host}/ws/${guildId}?secret=${encodeURIComponent(secret)}`);

    this.ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (STATE_EVENTS.has(msg.event)) {
        // Existing music player listeners — behaviour unchanged
        this.listeners.forEach((fn) => fn(msg.data as PlayerState));
      } else if (msg.event === "notification") {
        this.notificationListeners.forEach((fn) => fn(msg.data as NotificationPayload));
      }
    };

    this.ws.onclose = () => {
      this.reconnectTimer = setTimeout(() => this.connect(guildId, secret), 3000);
    };
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
  }

  /** Subscribe to player state updates (music tab). */
  subscribe(fn: StateListener): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  /** Subscribe to server-management notification events (stream start, etc.). */
  subscribeNotifications(fn: NotificationListener): () => void {
    this.notificationListeners.add(fn);
    return () => { this.notificationListeners.delete(fn); };
  }
}

export const musicWS = new MusicWebSocket();

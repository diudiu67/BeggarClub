import type { PlayerState } from "../types";

type Listener = (state: PlayerState) => void;

class MusicWebSocket {
  private ws: WebSocket | null = null;
  private guildId: string = "";
  private listeners: Set<Listener> = new Set();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  connect(guildId: string, secret: string) {
    if (this.ws) this.ws.close();
    this.guildId = guildId;

    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const host = window.location.host;
    this.ws = new WebSocket(`${protocol}://${host}/ws/${guildId}?secret=${secret}`);

    this.ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      this.listeners.forEach((fn) => fn(msg.data as PlayerState));
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

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

export const musicWS = new MusicWebSocket();

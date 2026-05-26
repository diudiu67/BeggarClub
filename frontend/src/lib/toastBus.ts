import type { NotificationPayload } from "./ws";

type Listener = (payload: NotificationPayload) => void;
const _listeners = new Set<Listener>();

export const toastBus = {
  push(payload: NotificationPayload): void {
    _listeners.forEach((fn) => fn(payload));
  },
  subscribe(fn: Listener): () => void {
    _listeners.add(fn);
    return () => { _listeners.delete(fn); };
  },
};

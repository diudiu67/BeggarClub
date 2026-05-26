import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { toastBus } from "../lib/toastBus";
import type { NotificationPayload } from "../lib/ws";

interface ToastItem extends NotificationPayload {
  toastId: number;
}

let _nextId = 1;

export default function NotificationToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    return toastBus.subscribe((payload) => {
      const id = _nextId++;
      const item: ToastItem = { ...payload, toastId: id };
      setToasts((prev) => [item, ...prev]);
      // Auto-dismiss after 5 s
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.toastId !== id));
      }, 5000);
    });
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 w-full max-w-sm px-4 pointer-events-none">
      {toasts.map((toast) => {
        const isTest = toast.is_test;
        const title = isTest ? "🔔 Test notification" : `🔴 ${toast.user_name} is streaming`;
        const body = isTest ? "Stream notifications are working correctly" : `in #${toast.channel_name}`;

        return (
          <div
            key={toast.toastId}
            className="pointer-events-auto flex items-start gap-3 bg-white border border-yt-border rounded-xl shadow-lg px-4 py-3 animate-slide-down"
          >
            {/* Avatar */}
            {toast.user_avatar ? (
              <img
                src={toast.user_avatar}
                alt=""
                className="w-10 h-10 rounded-full flex-shrink-0 object-cover"
              />
            ) : (
              <div className="w-10 h-10 rounded-full flex-shrink-0 bg-yt-elevated flex items-center justify-center text-yt-muted text-lg">
                🔔
              </div>
            )}

            {/* Content */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-yt-text leading-tight">{title}</p>
              <p className="text-xs text-yt-muted mt-0.5 leading-tight">{body}</p>
            </div>

            {/* Dismiss */}
            <button
              onClick={() =>
                setToasts((prev) => prev.filter((t) => t.toastId !== toast.toastId))
              }
              className="flex-shrink-0 text-yt-muted hover:text-yt-text transition-colors"
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

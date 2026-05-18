import { useState, useEffect, useCallback } from "react";
import type { PlayerState } from "../types";
import { musicWS } from "../lib/ws";
import { getPlayerState } from "../lib/api";

const WEB_SECRET = import.meta.env.VITE_WEB_SECRET || "changeme";

export function usePlayer(guildId: string | null) {
  const [state, setState] = useState<PlayerState | null>(null);

  useEffect(() => {
    if (!guildId) return;

    getPlayerState(guildId).then(setState).catch(() => {});

    musicWS.connect(guildId, WEB_SECRET);
    const unsub = musicWS.subscribe((newState) => setState(newState));

    // Polling fallback: if a WebSocket event is missed (skip/prev race condition),
    // the poll catches up within 3 seconds.
    const pollId = setInterval(() => {
      getPlayerState(guildId).then(setState).catch(() => {});
    }, 3000);

    return () => {
      unsub();
      musicWS.disconnect();
      clearInterval(pollId);
    };
  }, [guildId]);

  const refresh = useCallback(() => {
    if (!guildId) return;
    getPlayerState(guildId).then(setState).catch(() => {});
  }, [guildId]);

  return { state, refresh };
}

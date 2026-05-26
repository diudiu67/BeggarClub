import { useEffect } from "react";
import { musicWS } from "../lib/ws";
import { toastBus } from "../lib/toastBus";

export function useNotifications() {
  useEffect(() => {
    // Route WS notification events to the in-app toast bus (no browser push API)
    return musicWS.subscribeNotifications((payload) => toastBus.push(payload));
  }, []);
}

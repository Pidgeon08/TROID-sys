import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import api from "../services/api";
import { useRealtime } from "./useRealtime";

const POLL_MS = 5000;

// Whether this tab is the one running the backup or restore (Backup & Restore sets it), so
// that tab isn't covered by the "paused" screen while the admin's other tabs are.
let runningHere = false;
const listeners = new Set();

export function setPauseRunningHere(value) {
  runningHere = value;
  listeners.forEach((listener) => listener());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Whether the system is paused for a backup or restore: { active, kind, started_by,
 * started_at, user_id }, asked every few seconds and straight away when the realtime relay
 * says it changed. `runningHere` is true in the tab that started it.
 */
export function useSystemPause() {
  const [pause, setPause] = useState({ active: false });
  const here = useSyncExternalStore(subscribe, () => runningHere);

  const refresh = useCallback(() => {
    api.pauseStatus()
      .then((status) => setPause(status && typeof status === "object" ? status : { active: false }))
      .catch(() => {}); // keep showing the last answer while the server can't be reached
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  useRealtime(useCallback((message) => {
    if (message?.type === "system.pause") refresh();
  }, [refresh]));

  return { pause, runningHere: here, refresh };
}

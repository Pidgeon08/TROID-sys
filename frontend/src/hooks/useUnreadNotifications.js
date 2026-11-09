import { useEffect, useState } from "react";
import api from "../services/api";

const POLL_INTERVAL = 30000;
const CHANGED_EVENT = "troid:notifications-changed";

// Call after marking notifications read, so every dot on the page updates at once.
export function notifyNotificationsChanged() {
  window.dispatchEvent(new Event(CHANGED_EVENT));
}

export function useUnreadNotifications(userId) {
  const [unread, setUnread] = useState([]);

  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false;
    const refresh = () => {
      api.notifications(userId)
        .then((list) => {
          if (!cancelled && Array.isArray(list)) setUnread(list.filter((n) => !n.is_read));
        })
        .catch(() => {});
    };
    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL);
    window.addEventListener(CHANGED_EVENT, refresh);
    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener(CHANGED_EVENT, refresh);
    };
  }, [userId]);

  return unread;
}

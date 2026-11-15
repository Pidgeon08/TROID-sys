import { useSyncExternalStore } from "react";
import api from "../services/api";
import { subscribeRealtime } from "./useRealtime";

// The backend announces changes through the realtime relay as they happen; polling is only
// the fallback for when the relay can't be reached.
const POLL_INTERVAL = 30000;
const CHANGED_EVENT = "troid:notifications-changed";
const EMPTY = [];

// Call after marking notifications read, so every dot on the page updates at once.
export function notifyNotificationsChanged() {
  window.dispatchEvent(new Event(CHANGED_EVENT));
}

// One store per signed-in user, shared by the bell, the sidebar and the request lists,
// so they fetch once between them and always agree.
const stores = new Map();

function storeFor(userId) {
  const existing = stores.get(userId);
  if (existing) return existing;

  const listeners = new Set();
  let unread = EMPTY;
  let latest = 0;
  let stop = null;

  const refresh = () => {
    const ticket = ++latest;
    api.notifications(userId)
      .then((list) => {
        // Only the newest answer counts, in case two fetches cross.
        if (ticket !== latest || !Array.isArray(list)) return;
        unread = list.filter((n) => !n.is_read);
        listeners.forEach((listener) => listener());
      })
      .catch(() => {});
  };

  const start = () => {
    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL);
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    let connectedBefore = false;
    const unsubscribe = subscribeRealtime((message) => {
      if (message?.type === "realtime.connected") {
        // A reconnect may have missed some announcements.
        if (connectedBefore) refresh();
        connectedBefore = true;
      } else if (message?.type === "notifications.changed" && message.payload?.recipients?.includes(Number(userId))) {
        refresh();
      }
    });
    window.addEventListener(CHANGED_EVENT, refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      unsubscribe();
      window.removeEventListener(CHANGED_EVENT, refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  };

  const store = {
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1) stop = start();
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          stop?.();
          stop = null;
          stores.delete(userId);
        }
      };
    },
    getSnapshot: () => unread,
  };
  stores.set(userId, store);
  return store;
}

const subscribeNothing = () => () => {};
const getNothing = () => EMPTY;

/** The signed-in user's unread notifications, kept up to date as they arrive. */
export function useUnreadNotifications(userId) {
  const store = userId ? storeFor(userId) : null;
  return useSyncExternalStore(store ? store.subscribe : subscribeNothing, store ? store.getSnapshot : getNothing);
}

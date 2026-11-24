import { useSyncExternalStore } from "react";
import api from "../services/api";
import { LIVE, subscribeLive } from "./useLiveUpdates";
import { chimeFor, markHeard } from "../utils/notificationSound";

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
  let loaded = false;
  let stop = null;

  const refresh = () => {
    const ticket = ++latest;
    api.notifications(userId)
      .then((list) => {
        // Only the newest answer counts, in case two fetches cross.
        if (ticket !== latest || !Array.isArray(list)) return;
        const before = new Set(unread.map((n) => n.id));
        unread = list.filter((n) => !n.is_read);
        const newest = Math.max(0, ...unread.map((n) => n.id));
        // The ones already waiting when the page opened make no sound; new arrivals chime.
        if (!loaded) markHeard(newest);
        else if (unread.some((n) => !before.has(n.id))) chimeFor(newest);
        loaded = true;
        listeners.forEach((listener) => listener());
      })
      .catch(() => {});
  };

  // Fetched again whenever the live check (useLiveUpdates) sees the unread ones change,
  // within a few seconds, or at once through the realtime relay.
  const start = () => {
    refresh();
    const unsubscribe = subscribeLive([LIVE.notifications], refresh);
    window.addEventListener(CHANGED_EVENT, refresh);
    return () => {
      unsubscribe();
      window.removeEventListener(CHANGED_EVENT, refresh);
    };
  };

  const store = {
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1) stop = start();
      return () => {
        listeners.delete(listener);
        // The store is kept (only its checking stops), so a component that unmounts and mounts
        // again, as React's development mode does, finds the same store and its answers.
        if (listeners.size === 0) {
          stop?.();
          stop = null;
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

import { useEffect, useRef, useSyncExternalStore } from 'react';
import api from '../services/api';
import { sessionUserId } from '../services/session';
import { subscribeRealtime } from './useRealtime';

// How often open pages ask whether anything changed (GET /api/live/, a few small numbers).
// The realtime relay, when it can be reached, makes them ask at once instead of waiting.
const VISIBLE_MS = 5000;
const HIDDEN_MS = 15000;

/**
 * The kinds of data a page can follow (backend/troid_api/live.py), plus "notifications",
 * which moves when the signed-in user's unread notifications change.
 */
export const LIVE = {
  requests: 'requests',
  schedules: 'schedules',
  areas: 'areas',
  fleet: 'fleet',
  users: 'users',
  records: 'records',
  detections: 'detections',
  audit: 'audit',
  notifications: 'notifications',
};

// How many changes this tab has seen per topic. Pages only compare it with its last value.
let counters = {};
let known = null;
let knownNotifications = null;
const listeners = new Set();
let stop = null;
let checking = false;
let checkAgain = false;

async function check() {
  if (checking) {
    checkAgain = true;
    return;
  }
  checking = true;
  try {
    const data = await api.liveVersions(sessionUserId());
    const versions = data?.versions || {};
    const notifications = JSON.stringify(data?.notifications ?? null);
    const next = { ...counters };
    let changed = false;
    if (known) {
      Object.entries(versions).forEach(([topic, version]) => {
        if (known[topic] !== version) {
          next[topic] = (next[topic] || 0) + 1;
          changed = true;
        }
      });
    }
    if (knownNotifications !== null && notifications !== knownNotifications) {
      next.notifications = (next.notifications || 0) + 1;
      changed = true;
    }
    known = versions;
    knownNotifications = notifications;
    if (changed) {
      counters = next;
      listeners.forEach((listener) => listener());
    }
  } catch {
    // Offline or signed out: try again on the next tick.
  } finally {
    checking = false;
    if (checkAgain) {
      checkAgain = false;
      check();
    }
  }
}

function start() {
  check();
  let timer = null;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      check();
      schedule();
    }, document.visibilityState === 'visible' ? VISIBLE_MS : HIDDEN_MS);
  };
  schedule();
  const onVisible = () => {
    if (document.visibilityState === 'visible') check();
    schedule();
  };
  const unsubscribe = subscribeRealtime((message) => {
    const type = message?.type;
    if (type === 'data.changed' || type === 'notifications.changed' || type === 'realtime.connected') check();
  });
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('focus', onVisible);
  return () => {
    clearTimeout(timer);
    unsubscribe();
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('focus', onVisible);
    known = null;
    knownNotifications = null;
  };
}

function subscribe(listener) {
  listeners.add(listener);
  if (listeners.size === 1) stop = start();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      stop?.();
      stop = null;
    }
  };
}

const changesTo = (topics) => topics.reduce((sum, topic) => sum + (counters[topic] || 0), 0);

/** Calls `onChange` whenever one of these topics changes. Returns a function that stops it. */
export function subscribeLive(topics, onChange) {
  let last = changesTo(topics);
  return subscribe(() => {
    const now = changesTo(topics);
    if (now !== last) {
      last = now;
      onChange();
    }
  });
}

/** Checks for changes now, e.g. right after this page saved something. */
export function checkLiveNow() {
  if (listeners.size > 0) check();
}

/**
 * A number that moves on whenever one of these topics changes anywhere, for a page to add to
 * its loading effect's dependencies so it loads again: `useEffect(load, [id, live])`.
 */
export function useLiveVersion(...topics) {
  const key = topics.join(',');
  return useSyncExternalStore(subscribe, () => changesTo(key.split(',')));
}

/** Calls `onChange` whenever one of these topics changes (not when the page first opens). */
export function useLiveRefresh(topics, onChange) {
  const live = useLiveVersion(...topics);
  const onChangeRef = useRef(onChange);
  const first = useRef(live);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  useEffect(() => {
    if (live !== first.current) onChangeRef.current?.();
  }, [live]);
}

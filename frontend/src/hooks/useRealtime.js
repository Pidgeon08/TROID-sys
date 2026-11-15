import { useEffect, useRef } from 'react';

// Matches backend/.env's default REALTIME_WORKER_URL (http://127.0.0.1:8787)
// unless overridden for a deployed Worker, e.g. wss://troid-realtime.<sub>.workers.dev/ws
const REALTIME_WS_URL = import.meta.env.VITE_REALTIME_WS_URL || 'ws://127.0.0.1:8787/ws';

// One connection per tab, shared by everything listening (the notification bell, the sidebar,
// the live maps), opened while anything listens and closed when the last listener leaves.
const listeners = new Set();
let socket = null;
let reconnectTimer = null;
let retryDelay = 1000;

function connect() {
  clearTimeout(reconnectTimer);
  socket = new WebSocket(REALTIME_WS_URL);
  const current = socket;

  current.onmessage = (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      return; // ignore malformed messages
    }
    listeners.forEach((listener) => {
      try {
        listener(message);
      } catch (err) {
        console.error('Realtime listener failed:', err);
      }
    });
  };

  current.onopen = () => {
    retryDelay = 1000;
    // Anything missed while disconnected is fetched again by whoever cares.
    listeners.forEach((listener) => listener({ type: 'realtime.connected', payload: {} }));
  };

  current.onclose = () => {
    if (socket !== current || listeners.size === 0) return;
    reconnectTimer = setTimeout(connect, retryDelay);
    retryDelay = Math.min(retryDelay * 2, 30000);
  };

  current.onerror = () => current.close();
}

/**
 * Calls `listener({ type, payload })` for every event the backend pushes through the
 * Cloudflare Worker relay (see cloudflare-ws/): boat.heartbeat, boat.detection, boat.status,
 * boat.offline (backend/troid_api/mqtt_client.py) and notifications.changed
 * (backend/troid_api/realtime.py). Returns a function that stops listening.
 */
export function subscribeRealtime(listener) {
  listeners.add(listener);
  if (!socket) connect();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && socket) {
      clearTimeout(reconnectTimer);
      const closing = socket;
      socket = null;
      closing.close();
    }
  };
}

/**
 * Hook form of subscribeRealtime. A live-update nice-to-have, not a source of truth —
 * callers keep their polling/fetch as the fallback in case the Worker isn't reachable.
 */
export function useRealtime(onMessage) {
  const onMessageRef = useRef(onMessage);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => subscribeRealtime((message) => onMessageRef.current?.(message)), []);
}

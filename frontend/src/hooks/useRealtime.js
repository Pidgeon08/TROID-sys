import { useEffect, useRef } from 'react';

// Matches backend/.env's default REALTIME_WORKER_URL (http://127.0.0.1:8787)
// unless overridden for a deployed Worker, e.g. wss://troid-realtime.<sub>.workers.dev/ws
const REALTIME_WS_URL = import.meta.env.VITE_REALTIME_WS_URL || 'ws://127.0.0.1:8787/ws';

/**
 * Subscribes to the Cloudflare Worker realtime relay (see cloudflare-ws/).
 * Calls `onMessage({ type, payload })` for every event pushed by the backend
 * (boat.heartbeat, boat.detection, boat.status, boat.offline — see
 * backend/troid_api/mqtt_client.py). Reconnects automatically with backoff;
 * silently gives up retrying while the tab is unmounted.
 *
 * This is a live-update nice-to-have, not a source of truth — callers should
 * keep their existing polling/fetch as the fallback in case the Worker isn't
 * running or reachable.
 */
export function useRealtime(onMessage) {
  const onMessageRef = useRef(onMessage);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    let socket;
    let reconnectTimer;
    let closedByCleanup = false;
    let retryDelay = 1000;

    function connect() {
      socket = new WebSocket(REALTIME_WS_URL);

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          onMessageRef.current?.(message);
        } catch {
          // ignore malformed messages
        }
      };

      socket.onclose = () => {
        if (closedByCleanup) return;
        reconnectTimer = setTimeout(connect, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 30000);
      };

      socket.onerror = () => socket.close();

      socket.onopen = () => {
        retryDelay = 1000;
      };
    }

    connect();

    return () => {
      closedByCleanup = true;
      clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, []);
}

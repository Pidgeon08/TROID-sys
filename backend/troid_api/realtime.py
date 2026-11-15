"""Pushes live events to the Cloudflare Worker relay (see cloudflare-ws/),
which fans them out over WebSocket to connected dashboard clients.

Best-effort only: if the Worker is unreachable (not deployed/running yet,
network hiccup), callers should keep working off MQTT + REST/polling as
before, so failures here are logged and swallowed rather than raised.
"""

import threading

import requests
from django.conf import settings
from django.db import transaction

TIMEOUT_SECONDS = 3


def broadcast(event_type, payload):
    url = f"{settings.REALTIME_WORKER_URL.rstrip('/')}/broadcast"
    try:
        requests.post(
            url,
            json={"type": event_type, "payload": payload},
            headers={"Authorization": f"Bearer {settings.REALTIME_WORKER_SECRET}"},
            timeout=TIMEOUT_SECONDS,
        )
    except requests.RequestException as e:
        print(f"[REALTIME] Could not reach Worker at {url}: {e}")


def _start(event_type, payload):
    # On its own thread, so a slow or missing Worker never holds up the response.
    threading.Thread(target=broadcast, args=(event_type, payload), daemon=True).start()


def broadcast_after_commit(event_type, payload):
    """Broadcasts once the current database transaction is saved, so clients refetch saved data."""
    transaction.on_commit(lambda: _start(event_type, payload))


def notifications_changed(recipient_ids):
    """Tells these users' open pages to refetch their notifications.

    Every connected page receives every broadcast, so only user ids are sent, never
    the notifications themselves; each page fetches its own through the API.
    """
    ids = sorted({int(i) for i in recipient_ids if i})
    if ids:
        broadcast_after_commit('notifications.changed', {'recipients': ids})

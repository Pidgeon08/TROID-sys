"""Pushes live events to the Cloudflare Worker relay (see cloudflare-ws/),
which fans them out over WebSocket to connected dashboard clients.

Best-effort only: if the Worker is unreachable (not deployed/running yet,
network hiccup), callers should keep working off MQTT + REST/polling as
before, so failures here are logged and swallowed rather than raised.
"""

import requests
from django.conf import settings

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

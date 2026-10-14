"""Signed MQTT messages from the robots.

The broker is public: anyone can publish to troid/bot/<id>/... and read every
message. So a robot never sends its device key; it signs each message with it:

    payload = {"ts": <unix seconds>, ...data, "sig": <hex>}
    sig = HMAC-SHA256(device_key, "<topic>\\n" + canonical_json(payload without "sig"))

The topic is part of what is signed, so a heartbeat can't be replayed as a
detection. A message is accepted only if its signature matches the bot's
current key, its timestamp is close to the server's clock, and it is newer
than the last message accepted from that bot (so copies are rejected).

The robot side of this lives in bot/troid_monitor.py.
"""
import hashlib
import hmac
import json
import logging
import threading
import time

from .models import Boat

logger = logging.getLogger(__name__)

MAX_CLOCK_SKEW_SECONDS = 120

# Last accepted timestamp per bot. In memory: the server runs one worker process.
_last_ts = {}
_last_ts_lock = threading.Lock()


def canonical_json(payload):
    return json.dumps(payload, sort_keys=True, separators=(',', ':'))


def sign(device_key, topic, payload):
    message = f'{topic}\n{canonical_json(payload)}'.encode()
    return hmac.new(device_key.encode(), message, hashlib.sha256).hexdigest()


def verify_bot_message(topic, raw_payload, now=None):
    """Returns (boat, payload without "sig") for a genuine message, else None."""
    parts = topic.split('/')
    if len(parts) != 4 or parts[:2] != ['troid', 'bot'] or not parts[2].isdecimal():
        return _reject(topic, 'unexpected topic')
    try:
        payload = json.loads(raw_payload)
    except (TypeError, ValueError):
        return _reject(topic, 'not JSON')
    if not isinstance(payload, dict):
        return _reject(topic, 'not a JSON object')

    signature = payload.pop('sig', None)
    ts = payload.get('ts')
    if not isinstance(signature, str) or isinstance(ts, bool) or not isinstance(ts, (int, float)):
        return _reject(topic, 'missing signature or timestamp')

    boat = Boat.objects.filter(pk=int(parts[2]), archived=False).first()
    if not boat or not boat.device_key:
        return _reject(topic, 'unknown bot, archived, or no device key')
    if not hmac.compare_digest(sign(boat.device_key, topic, payload), signature):
        return _reject(topic, 'bad signature')

    now = time.time() if now is None else now
    if abs(now - ts) > MAX_CLOCK_SKEW_SECONDS:
        return _reject(topic, f'timestamp {ts} is too far from server time')
    with _last_ts_lock:
        if ts <= _last_ts.get(boat.id, float('-inf')):
            return _reject(topic, 'replayed (not newer than the last message)')
        _last_ts[boat.id] = ts
    return boat, payload


def _reject(topic, reason):
    logger.warning('[MQTT] Ignored message on %s: %s', topic, reason)
    return None

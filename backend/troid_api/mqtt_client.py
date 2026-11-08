import os
import threading
import time
import uuid
from zoneinfo import ZoneInfo
import paho.mqtt.client as mqtt
from django.utils import timezone
from .bot_auth import verify_bot_message
from .models import Boat, DeploymentSchedule, DetectionEvent, Request
from .realtime import broadcast

APP_TIMEZONE = ZoneInfo('Asia/Manila')   # same as views.py

# ==================== CONFIGURATION ====================
MQTT_BROKER = "broker.emqx.io"
MQTT_PORT = 1883
MQTT_USERNAME = ""
MQTT_PASSWORD = ""
# On Render the backend uses a FIXED client id with a persistent session: the
# free plan sleeps when idle, and while it sleeps the broker queues the bots'
# detections for this id and delivers them when it wakes. Locally a random id
# is used, so a dev server never steals the deployed backend's session.
MQTT_CLIENT_ID = os.environ.get('MQTT_CLIENT_ID') or (
    'troid_django_render_k7q2m9' if os.environ.get('RENDER')
    else f"troid_django_dev_{uuid.uuid4().hex[:8]}")
MQTT_PERSISTENT = bool(os.environ.get('MQTT_CLIENT_ID') or os.environ.get('RENDER'))

# Topics
TOPIC_HEARTBEAT = "troid/bot/+/heartbeat"
TOPIC_DETECTION = "troid/bot/+/detection"
TOPIC_STATUS = "troid/bot/+/status"

# ==================== GLOBAL CLIENT ====================
_client = None
_client_lock = threading.Lock()

def _on_connect(client, userdata, flags, rc):
    if rc == 0:
        print(f"[MQTT] Connected to broker (rc={rc})")
        client.subscribe(TOPIC_HEARTBEAT)
        client.subscribe(TOPIC_DETECTION, qos=1)   # qos 1: queued while we're asleep
        client.subscribe(TOPIC_STATUS)
        print("[MQTT] Subscribed to topics")
    else:
        print(f"[MQTT] Connection failed with code {rc}")

def _on_message(client, userdata, msg):
    try:
        # The broker is public, so only messages signed with the bot's device key count.
        verified = verify_bot_message(msg.topic, msg.payload)
        if verified is None:
            return
        boat, payload = verified
        bot_id = str(boat.id)

        print(f"[MQTT] Received on {msg.topic}: {payload}")

        if msg.topic.endswith('/heartbeat'):
            _handle_heartbeat(bot_id, payload)
        elif msg.topic.endswith('/detection'):
            _handle_detection(bot_id, payload)
        elif msg.topic.endswith('/status'):
            _handle_status(bot_id, payload)
    except Exception as e:
        print(f"[MQTT] Error processing message: {e}")

def _handle_heartbeat(bot_id, payload):
    try:
        boat = Boat.objects.get(id=int(bot_id))
        boat.last_seen = timezone.now()
        boat.is_online = True
        if 'battery' in payload:
            boat.battery_level = payload['battery']
        if 'is_active' in payload:
            boat.is_active = payload['is_active']
        boat.save()
        print(f"[MQTT] Updated Boat {bot_id}: online=True, battery={payload.get('battery')}, active={payload.get('is_active')}")
        broadcast('boat.heartbeat', {
            'boat_id': boat.id,
            'is_online': boat.is_online,
            'is_active': boat.is_active,
            'battery_level': boat.battery_level,
        })
    except Boat.DoesNotExist:
        print(f"[MQTT] Boat {bot_id} not found")
    except Exception as e:
        print(f"[MQTT] Heartbeat error: {e}")

def _handle_detection(bot_id, payload):
    try:
        boat = Boat.objects.get(id=int(bot_id))
        confidence = payload.get('confidence', 0.0)
        is_verified = payload.get('is_verified', False)

        if not is_verified:
            print(f"[MQTT] Skipping unverified detection for Boat {bot_id}")
            return

        lat, lng = payload.get('latitude'), payload.get('longitude')
        if lat is None or lng is None:
            print(f"[MQTT] Skipping detection without a location for Boat {bot_id}")
            return

        # Same as the log_detection view: keep the boat's last position and link
        # the detection to today's deployment request (the barangay heatmap filters on it).
        boat.last_latitude = lat
        boat.last_longitude = lng
        boat.save()
        linked_request = None
        today = timezone.now().astimezone(APP_TIMEZONE).strftime('%Y-%m-%d')
        schedule = DeploymentSchedule.objects.filter(bot=boat, day=today).order_by('-id').first()
        if schedule and schedule.request_id:
            linked_request = Request.objects.filter(request_id=schedule.request_id).first()

        detection = DetectionEvent.objects.create(
            boat=boat,
            request=linked_request,
            latitude=lat,
            longitude=lng,
            trash_count=payload.get('trash_count', 1),
            categories=payload.get('categories', {}),
            confidence=confidence,
            is_verified=is_verified
        )
        print(f"[MQTT] Logged VERIFIED detection for Boat {bot_id}: {payload.get('trash_count')} items, confidence={confidence}")
        print(f"[MQTT] Categories: {payload.get('categories', {})}")
        broadcast('boat.detection', {
            'boat_id': boat.id,
            'detection_id': detection.id,
            'latitude': detection.latitude,
            'longitude': detection.longitude,
            'trash_count': detection.trash_count,
            'categories': detection.categories,
            'confidence': detection.confidence,
        })
    except Exception as e:
        print(f"[MQTT] Detection error: {e}")

def _handle_status(bot_id, payload):
    try:
        boat = Boat.objects.get(id=int(bot_id))
        status = payload.get('status', '').lower()

        status_map = {
            'active': True,
            'idle': False,
            'charging': False,
            'offline': False,
        }

        boat.is_active = status_map.get(status, boat.is_active)

        if status == 'charging':
            boat.battery_level = payload.get('battery', boat.battery_level)

        boat.save()
        print(f"[MQTT] Status update for Boat {bot_id}: {status}")
        broadcast('boat.status', {
            'boat_id': boat.id,
            'is_active': boat.is_active,
            'battery_level': boat.battery_level,
        })
    except Exception as e:
        print(f"[MQTT] Status error: {e}")

def _run_client():
    global _client
    with _client_lock:
        # Once started, paho's loop thread reconnects by itself. Starting a second
        # client here would fight the first one over the same fixed client id.
        if _client is not None:
            return

        client_id = MQTT_CLIENT_ID if MQTT_PERSISTENT else f"{MQTT_CLIENT_ID}_{uuid.uuid4().hex[:6]}"
        client = mqtt.Client(client_id=client_id, clean_session=not MQTT_PERSISTENT)
        client.reconnect_delay_set(1, 60)
        client.on_connect = _on_connect
        client.on_message = _on_message

        if MQTT_USERNAME:
            client.username_pw_set(MQTT_USERNAME, MQTT_PASSWORD)

        try:
            print(f"[MQTT] Connecting to {MQTT_BROKER}:{MQTT_PORT} as {client_id}...")
            client.connect(MQTT_BROKER, MQTT_PORT, keepalive=60)
            client.loop_start()
            _client = client
            print("[MQTT] Client started")
        except Exception as e:
            print(f"[MQTT] Connection error: {e}")
            _client = None

def start_mqtt_client():
    def run():
        global _client
        retry_delay = 60
        while True:
            try:
                _run_client()
                retry_delay = 60
                time.sleep(30)
            except Exception as e:
                print(f"[MQTT] Unexpected error: {e}")
                _client = None
                print(f"[MQTT] Retrying in {retry_delay}s...")
                time.sleep(retry_delay)
                retry_delay = min(retry_delay * 2, 300)

    thread = threading.Thread(target=run, daemon=True)
    thread.start()
    return thread

def start_offline_checker():
    def check():
        while True:
            try:
                threshold = timezone.now() - Boat.OFFLINE_AFTER
                offline_bots = list(Boat.objects.filter(last_seen__lt=threshold, is_online=True))
                if offline_bots:
                    Boat.objects.filter(id__in=[b.id for b in offline_bots]).update(is_online=False)
                    print(f"[OFFLINE] Marked {len(offline_bots)} bots as offline")
                    for b in offline_bots:
                        broadcast('boat.offline', {'boat_id': b.id})
            except Exception as e:
                print(f"[OFFLINE] Check error: {e}")
            time.sleep(15)

    thread = threading.Thread(target=check, daemon=True)
    thread.start()
    return thread

import json
import threading
import time
import uuid
import paho.mqtt.client as mqtt
from django.utils import timezone
from .models import Boat, DetectionEvent

# ==================== CONFIGURATION ====================
MQTT_BROKER = "broker.emqx.io"
MQTT_PORT = 1883
MQTT_USERNAME = ""
MQTT_PASSWORD = ""
MQTT_CLIENT_ID = f"troid_django_{uuid.uuid4().hex[:8]}"

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
        client.subscribe(TOPIC_DETECTION)
        client.subscribe(TOPIC_STATUS)
        print(f"[MQTT] Subscribed to topics")
    else:
        print(f"[MQTT] Connection failed with code {rc}")

def _on_message(client, userdata, msg):
    try:
        topic_parts = msg.topic.split('/')
        bot_id = topic_parts[2]
        payload = json.loads(msg.payload.decode('utf-8'))

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

        DetectionEvent.objects.create(
            boat=boat,
            latitude=payload.get('latitude', 0.0),
            longitude=payload.get('longitude', 0.0),
            trash_count=payload.get('trash_count', 1),
            categories=payload.get('categories', {}),
            confidence=confidence,
            is_verified=is_verified
        )
        print(f"[MQTT] Logged VERIFIED detection for Boat {bot_id}: {payload.get('trash_count')} items, confidence={confidence}")
        print(f"[MQTT] Categories: {payload.get('categories', {})}")
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
    except Exception as e:
        print(f"[MQTT] Status error: {e}")

def _run_client():
    global _client
    with _client_lock:
        if _client is not None and _client.is_connected():
            return

        client_id = f"{MQTT_CLIENT_ID}_{uuid.uuid4().hex[:6]}"
        client = mqtt.Client(client_id=client_id, clean_session=True)
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
                threshold = timezone.now() - timezone.timedelta(seconds=15)
                offline_bots = Boat.objects.filter(last_seen__lt=threshold, is_online=True)
                count = offline_bots.update(is_online=False)
                if count > 0:
                    print(f"[OFFLINE] Marked {count} bots as offline")
            except Exception as e:
                print(f"[OFFLINE] Check error: {e}")
            time.sleep(15)

    thread = threading.Thread(target=check, daemon=True)
    thread.start()
    return thread

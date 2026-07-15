import json
import time
import paho.mqtt.client as mqtt

MQTT_BROKER = "broker.emqx.io"
MQTT_PORT = 1883
MQTT_CLIENT_ID = "troid_python_publisher"
BOT_ID = 1

def on_connect(client, userdata, flags, rc):
    if rc == 0:
        print(f"[PUBLISHER] Connected to broker (rc={rc})")
    else:
        print(f"[PUBLISHER] Connection failed with code {rc}")

def on_publish(client, userdata, mid):
    print(f"[PUBLISHER] Message {mid} published successfully")
    client.disconnect()

client = mqtt.Client(client_id=MQTT_CLIENT_ID)
client.on_connect = on_connect
client.on_publish = on_publish

print(f"[PUBLISHER] Connecting to {MQTT_BROKER}:{MQTT_PORT}...")
client.connect(MQTT_BROKER, MQTT_PORT, keepalive=60)

# Test heartbeat
topic = f"troid/bot/{BOT_ID}/heartbeat"
payload = json.dumps({
    "bot_id": BOT_ID,
    "battery": 85,
    "is_active": True
})
client.publish(topic, payload)
print(f"[PUBLISHER] Published heartbeat to {topic}")

# Test verified detection
topic = f"troid/bot/{BOT_ID}/detection"
payload = json.dumps({
    "bot_id": BOT_ID,
    "trash_count": 3,
    "latitude": 16.6325,
    "longitude": 120.3200,
    "confidence": 0.85,
    "is_verified": True,
    "categories": {"bottle": 2, "can": 1}
})
client.publish(topic, payload)
print(f"[PUBLISHER] Published VERIFIED detection to {topic}")

client.loop_forever()

#!/usr/bin/env python3
"""TROID robot monitor: tells the TROID system this robot is online.

Runs on the robot's Raspberry Pi as its own service, next to pi_relay.py (which
drives the motors and streams video). It never touches the motors, so driving
keeps working even if monitoring fails.

Every few seconds it publishes a signed heartbeat to troid/bot/<id>/heartbeat.
The TROID backend marks the bot Online while heartbeats arrive, and Offline
about 15 s after they stop. The broker is public, so the device key is never
sent: each message is signed with it (HMAC-SHA256), exactly as
backend/troid_api/bot_auth.py checks.

Settings (environment variables; the systemd unit reads /etc/troid/monitor.env):
    TROID_BOT_ID            bot number from the website, e.g. 4 for TRD-004
    TROID_BOT_KEY           device key from the website ("Connect robot")
    TROID_MQTT_BROKER       default broker.emqx.io
    TROID_MQTT_PORT         default 1883
    TROID_RELAY_STATUS_URL  default http://127.0.0.1:8000/status (pi_relay.py)

Run `python3 troid_monitor.py --once` to send a single heartbeat and exit.
"""
import hashlib
import hmac
import json
import logging
import os
import re
import signal
import sys
import time
import urllib.request

import paho.mqtt.client as mqtt

BOT_ID = os.environ.get('TROID_BOT_ID', '').strip()
BOT_KEY = os.environ.get('TROID_BOT_KEY', '').strip()
BROKER = os.environ.get('TROID_MQTT_BROKER', 'broker.emqx.io')
PORT = int(os.environ.get('TROID_MQTT_PORT', '1883'))
RELAY_STATUS_URL = os.environ.get('TROID_RELAY_STATUS_URL', 'http://127.0.0.1:8000/status')
# The backend marks a bot Offline after 15 s without a heartbeat.
HEARTBEAT_SECONDS = 5

log = logging.getLogger('troid_monitor')


# --- Signing (must match backend/troid_api/bot_auth.py) ---------------------

def canonical_json(payload):
    return json.dumps(payload, sort_keys=True, separators=(',', ':'))


def sign_message(device_key, topic, payload):
    message = f'{topic}\n{canonical_json(payload)}'.encode()
    return hmac.new(device_key.encode(), message, hashlib.sha256).hexdigest()


def build_message(kind, data):
    """Returns (topic, JSON text) for a signed message, e.g. kind='heartbeat'."""
    topic = f'troid/bot/{BOT_ID}/{kind}'
    # Millisecond timestamp: the backend only accepts each bot's messages in increasing order.
    payload = {'ts': round(time.time(), 3), **data}
    payload['sig'] = sign_message(BOT_KEY, topic, payload)
    return topic, json.dumps(payload)


def publish(client, kind, data):
    """Signs and sends a message. Detection code can reuse this for 'detection'."""
    topic, text = build_message(kind, data)
    return client.publish(topic, text, qos=0)


# --- Robot readings ----------------------------------------------------------

def read_battery():
    """Battery percentage, or None while no battery sensor (e.g. INA219) is fitted."""
    return None


def relay_running():
    """True while pi_relay.py answers, i.e. the robot is ready to drive."""
    try:
        with urllib.request.urlopen(RELAY_STATUS_URL, timeout=2) as response:
            return response.status == 200
    except Exception:
        return False


def heartbeat_data():
    data = {'is_active': relay_running()}
    battery = read_battery()
    if battery is not None:
        data['battery'] = round(battery, 1)
    return data


# --- MQTT --------------------------------------------------------------------

def make_client():
    client_id = f'troid-bot-{BOT_ID}-{os.getpid()}'
    try:  # paho-mqtt 2.x (pip)
        client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=client_id)
    except AttributeError:  # paho-mqtt 1.x (Raspberry Pi OS apt package)
        client = mqtt.Client(client_id=client_id)

    def on_connect(client, userdata, flags, reason_code, *rest):
        log.info('Connected to %s:%s (%s)', BROKER, PORT, reason_code)

    def on_disconnect(client, userdata, *args):
        log.warning('Disconnected from the broker; reconnecting')

    client.on_connect = on_connect
    client.on_disconnect = on_disconnect
    client.reconnect_delay_set(min_delay=1, max_delay=60)
    return client


def check_settings():
    problems = []
    if not BOT_ID.isdecimal():
        problems.append('TROID_BOT_ID must be the bot number from the website (e.g. 4 for TRD-004).')
    if not re.fullmatch(r'[0-9a-f]{64}', BOT_KEY):
        problems.append('TROID_BOT_KEY must be the 64-character device key from the website.')
    for problem in problems:
        log.error(problem)
    return not problems


def main():
    logging.basicConfig(level=logging.INFO, format='%(levelname)s %(message)s')
    if not check_settings():
        return 2
    once = '--once' in sys.argv[1:]

    client = make_client()
    client.connect_async(BROKER, PORT, keepalive=30)
    client.loop_start()

    running = True

    def stop(*_):
        nonlocal running
        running = False

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)

    log.info('Monitoring TRD-%03d; heartbeat every %ss', int(BOT_ID), HEARTBEAT_SECONDS)
    try:
        while running:
            if client.is_connected():
                data = heartbeat_data()
                publish(client, 'heartbeat', data).wait_for_publish(timeout=5)
                log.info('Heartbeat sent: %s', data)
                if once:
                    break
            time.sleep(HEARTBEAT_SECONDS if not once else 0.5)
    finally:
        client.on_disconnect = None  # Stopping on purpose; not a lost connection.
        client.disconnect()
        client.loop_stop()
    return 0


if __name__ == '__main__':
    sys.exit(main())

# Connecting a robot to the TROID system

`troid_monitor.py` runs on the robot's Raspberry Pi and sends a heartbeat every
5 seconds. While heartbeats arrive, the robot shows as **Online** on the
website's Bot Management page and in the TROID Companion app. About 15 seconds
after they stop, it shows **Offline**.

The script runs as its own service, next to `pi_relay.py` (driving and video),
and never touches the motors.

## 1. Register the robot on the website

1. **Bot Management → Add bot.** The robot gets a number, e.g. **TRD-004** (bot ID 4).
2. Select the bot, then **Connect robot**. The website shows the **Bot ID** and the
   **Device key**.
   - The key is shown only once. Copy it straight onto the Pi.
   - Creating a new key replaces the old one, and the old key stops working.
3. **Operator Management:** assign the operator to the robot, so the robot shows in
   that operator's app.

## 2. Install on the Raspberry Pi

```bash
sudo apt install python3-paho-mqtt          # or: pip install paho-mqtt
sudo mkdir -p /opt/troid /etc/troid
sudo cp troid_monitor.py /opt/troid/
sudo cp troid-monitor.service /etc/systemd/system/

# Settings: root-only, because the key lets anyone report as this robot.
sudo tee /etc/troid/monitor.env > /dev/null <<'EOF'
TROID_BOT_ID=4
TROID_BOT_KEY=<device key from the website>
EOF
sudo chmod 600 /etc/troid/monitor.env

sudo systemctl daemon-reload
sudo systemctl enable --now troid-monitor
```

Check it:

```bash
journalctl -u troid-monitor -f       # "Connected to broker.emqx.io" then "Heartbeat sent"
```

The robot should show **Online** on the website within a few seconds.

### If it stays Offline
- **Pi clock wrong:** the backend ignores messages more than 2 minutes away from its
  own clock. Run `timedatectl`; "System clock synchronized" must say **yes**, which
  needs internet through the SIM module.
- **Wrong ID or key:** the backend logs `[MQTT] Ignored message ... bad signature`.
  Create a new key on the website and update `/etc/troid/monitor.env`.
- **Server asleep:** on Render's free plan, the backend sleeps after about 15 minutes
  without website traffic. Open the website to wake it.

## Message format (for future robot code, e.g. trash detections)

The MQTT broker is public, so anyone can read and publish messages. The device
key is therefore **never sent**. Every message is signed with it instead:

```
topic:   troid/bot/<id>/heartbeat | detection | status
payload: {"ts": <unix seconds>, ...data..., "sig": "<hex>"}
sig  =   HMAC-SHA256(device_key, "<topic>\n" + JSON of the payload without "sig",
                     keys sorted, separators "," and ":")
```

The backend (`backend/troid_api/bot_auth.py`) ignores a message unless all of these hold:
- the signature matches the robot's current key,
- `ts` is within 2 minutes of the server's clock,
- `ts` is newer than the robot's last accepted message.

Use `publish(client, 'detection', {...})` from `troid_monitor.py` instead of signing by hand.

| Topic | Data | Effect |
|---|---|---|
| `heartbeat` | `is_active` (bool), `battery` (%, optional) | Online, Active/Idle, battery |
| `detection` | `latitude`, `longitude`, `trash_count`, `categories`, `confidence`, `is_verified` | Logs a verified trash detection |
| `status` | `status`: `active` / `idle` / `charging` / `offline` | Active/Idle |

**Battery:** `read_battery()` returns `None` until a sensor (e.g. INA219 on the Pi's
I2C pins) is fitted, so the battery shows "--". Make it return a percentage once a
sensor is in place.

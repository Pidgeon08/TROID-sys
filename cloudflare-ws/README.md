# troid-realtime

Cloudflare Worker + Durable Object that relays live boat events to the React
dashboard over WebSocket, so `Manage-bots.jsx` / `HeatmapView.jsx` update
instantly instead of waiting on their 5s polling interval.

MQTT and the REST API are unchanged — this only adds a push channel on top.

```
Boat --MQTT--> Django (mqtt_client.py) --HTTP POST /broadcast--> Worker --WS--> Browser
```

## Local dev

```
cd cloudflare-ws
npm install
cp .dev.vars.example .dev.vars   # SHARED_SECRET must match backend/.env's REALTIME_WORKER_SECRET
npm run dev
```

This starts the Worker on `http://127.0.0.1:8787`, matching the default
`REALTIME_WORKER_URL` in `backend/.env.example`.

## Deploy

```
npx wrangler login
wrangler secret put SHARED_SECRET
npm run deploy
```

Then set `REALTIME_WORKER_URL` in the backend's `.env` to the deployed
`https://troid-realtime.<your-subdomain>.workers.dev` URL, and point the
frontend's WebSocket URL (`VITE_REALTIME_WS_URL`) at
`wss://troid-realtime.<your-subdomain>.workers.dev/ws`.

## Message shape

Every broadcast is JSON: `{ "type": "boat.heartbeat" | "boat.detection" | "boat.status" | "boat.offline", "payload": {...} }`.
See `backend/troid_api/mqtt_client.py` for exactly what each payload contains.

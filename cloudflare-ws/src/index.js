/**
 * TROID realtime relay.
 *
 * Two routes:
 *   GET  /ws          — browser dashboards connect here over WebSocket
 *   POST /broadcast    — Django posts an event here after handling MQTT
 *                         messages; it gets fanned out to every open /ws
 *                         connection. Requires `Authorization: Bearer <secret>`
 *                         matching env.SHARED_SECRET.
 *
 * All connections are held by a single Durable Object instance so every
 * client sees every broadcast regardless of which Worker edge node handled
 * the request.
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const id = env.BROADCASTER.idFromName("global");
    const stub = env.BROADCASTER.get(id);

    if (url.pathname === "/ws") {
      return stub.fetch(request);
    }

    if (url.pathname === "/broadcast" && request.method === "POST") {
      const auth = request.headers.get("Authorization") || "";
      const expected = `Bearer ${env.SHARED_SECRET}`;
      if (auth !== expected) {
        return new Response("Unauthorized", { status: 401 });
      }
      return stub.fetch(request);
    }

    return new Response("Not found", { status: 404 });
  },
};

export class Broadcaster {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Set();
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/broadcast") {
      const body = await request.text();
      this.broadcast(body);
      return new Response("ok");
    }

    if (url.pathname === "/ws") {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("Expected WebSocket upgrade", { status: 426 });
      }

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      server.accept();
      this.sessions.add(server);

      server.addEventListener("close", () => this.sessions.delete(server));
      server.addEventListener("error", () => this.sessions.delete(server));
      // Clients don't need to send anything, but ignore messages if they do.
      server.addEventListener("message", () => {});

      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response("Not found", { status: 404 });
  }

  broadcast(message) {
    for (const session of this.sessions) {
      try {
        session.send(message);
      } catch (err) {
        this.sessions.delete(session);
      }
    }
  }
}

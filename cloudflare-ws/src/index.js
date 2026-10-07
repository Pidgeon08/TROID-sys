/**
 * TROID realtime relay.
 *
 * Routes:
 *   GET  /ws          — browser dashboards connect here over WebSocket
 *   POST /broadcast    — Django posts an event here after handling MQTT
 *                         messages; it gets fanned out to every open /ws
 *                         connection. Requires `Authorization: Bearer <secret>`
 *                         matching env.SHARED_SECRET.
 *   POST /send-email   — Django hands outgoing email here (Render's free plan
 *                         blocks SMTP); the Worker relays it to Gmail over
 *                         SMTPS. Same bearer auth. Body:
 *                         { from, to: [...], raw: base64 RFC 822 message }
 *
 * All connections are held by a single Durable Object instance so every
 * client sees every broadcast regardless of which Worker edge node handled
 * the request.
 */

import { connect } from "cloudflare:sockets";

const CRLF = "\r\n";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const id = env.BROADCASTER.idFromName("global");
    const stub = env.BROADCASTER.get(id);

    if (url.pathname === "/ws") {
      return stub.fetch(request);
    }

    const authorized =
      (request.headers.get("Authorization") || "") === `Bearer ${env.SHARED_SECRET}`;

    if (url.pathname === "/broadcast" && request.method === "POST") {
      if (!authorized) {
        return new Response("Unauthorized", { status: 401 });
      }
      return stub.fetch(request);
    }

    if (url.pathname === "/send-email" && request.method === "POST") {
      if (!authorized) {
        return new Response("Unauthorized", { status: 401 });
      }
      try {
        await sendViaSmtp(env, await request.json());
        return Response.json({ ok: true });
      } catch (err) {
        return Response.json({ ok: false, error: String(err.message || err) }, { status: 502 });
      }
    }

    return new Response("Not found", { status: 404 });
  },
};

/**
 * Minimal SMTP client over Cloudflare's TCP sockets. Gmail on port 465 with
 * implicit TLS, authenticated with SMTP_USER + SMTP_PASS (a Gmail app password).
 */
async function sendViaSmtp(env, { from, to, raw }) {
  if (!env.SMTP_USER || !env.SMTP_PASS) {
    throw new Error("SMTP_USER / SMTP_PASS secrets are not set on the Worker");
  }
  if (!from || !Array.isArray(to) || to.length === 0 || !raw) {
    throw new Error("Request needs from, to[] and raw");
  }

  const socket = connect(
    { hostname: env.SMTP_HOST || "smtp.gmail.com", port: Number(env.SMTP_PORT || 465) },
    { secureTransport: "on" },
  );
  const writer = socket.writable.getWriter();
  const reader = socket.readable.getReader();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let buffer = "";

  // Reads one (possibly multi-line) SMTP reply, e.g. "250-..." lines ending in "250 ...".
  async function readReply() {
    for (;;) {
      const lines = buffer.split(CRLF);
      for (let i = 0; i < lines.length - 1; i++) {
        if (/^\d{3}( |$)/.test(lines[i])) {
          buffer = lines.slice(i + 1).join(CRLF);
          return { code: Number(lines[i].slice(0, 3)), text: lines.slice(0, i + 1).join("\n") };
        }
      }
      const { value, done } = await reader.read();
      if (done) throw new Error(`SMTP connection closed unexpectedly: ${buffer}`);
      buffer += decoder.decode(value, { stream: true });
    }
  }

  async function command(line, expected, label) {
    if (line !== null) await writer.write(encoder.encode(line + CRLF));
    const reply = await readReply();
    if (!expected.includes(reply.code)) {
      throw new Error(`SMTP ${label} failed: ${reply.text}`);
    }
  }

  try {
    await command(null, [220], "greeting");
    await command("EHLO troid-realtime", [250], "EHLO");
    await command(`AUTH PLAIN ${btoa(`\u0000${env.SMTP_USER}\u0000${env.SMTP_PASS}`)}`, [235], "AUTH");
    await command(`MAIL FROM:<${from}>`, [250], "MAIL FROM");
    for (const rcpt of to) {
      await command(`RCPT TO:<${rcpt}>`, [250, 251], `RCPT TO ${rcpt}`);
    }
    await command("DATA", [354], "DATA");

    // raw is base64 of the message bytes. Work on it as a binary string so
    // non-ASCII bytes pass through untouched: normalise line endings to CRLF
    // and dot-stuff lines starting with "." as SMTP requires.
    let data = atob(raw).replace(/\r?\n/g, CRLF).replace(/^\./gm, "..");
    if (!data.endsWith(CRLF)) data += CRLF;
    await writer.write(Uint8Array.from(data, (c) => c.charCodeAt(0)));
    await command(".", [250], "message body");

    await writer.write(encoder.encode("QUIT" + CRLF));
  } finally {
    socket.close();
  }
}

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

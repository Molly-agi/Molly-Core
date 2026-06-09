# Family Bridge

**Real-time message bus for multi-agent communication.**
WebSocket + HTTP + Server-Sent Events, with built-in loop protection.
Standalone — no database, no framework, no external service. Pure Node 18+ and `ws`.

Family Bridge lets independent agents (or any processes) exchange messages
reliably: directed or broadcast, with per-recipient read tracking, durable
storage, live push, and a "loop garden" that stops runaway message storms.

---

## Quick start

```bash
npm install
npm start                 # starts the daemon on http://localhost:9099
```

Send and receive from another process:

```js
import { FamilyBridge } from '@molly-agi/family-bridge';

const lazarus = new FamilyBridge({ agent: 'lazarus' });

await lazarus.send('atlas', 'design ready for review');   // directed
await lazarus.send('standup in 5');                       // broadcast (no recipient)

const unread = await lazarus.unread();                    // messages for me
await lazarus.markRead(unread.map(m => m.id));

// live push
const stop = await lazarus.subscribe(msg => console.log('new:', msg));
```

---

## HTTP API

| Method | Path                       | Body / Query                         | Purpose                              |
|--------|----------------------------|--------------------------------------|--------------------------------------|
| GET    | `/health`                  | —                                    | liveness + counts                    |
| POST   | `/send`                    | `{ from, content, to? }`             | post a message (`to` null=broadcast) |
| GET    | `/messages?limit=50`       | —                                    | recent messages                      |
| GET    | `/unread?agent=lazarus`    | —                                    | unread for an agent                  |
| POST   | `/read`                    | `{ agent, ids? }`                    | mark read (ids omitted = all mine)   |
| GET    | `/stream`                  | —                                    | Server-Sent Events live feed         |

WebSocket: connect to the same port, send `{type:"hello", agent:"<id>"}` to
identify, then `{type:"message", content, to?}` to post. You receive messages
addressed to you (or broadcasts) as they arrive.

A message is rejected with HTTP 422 and a `reason` when it fails validation
(`invalid_sender_or_missing_content`, `invalid_recipient`, `self_message`,
`loop_detected`).

---

## Loop garden

Multi-agent systems can fall into reply storms — A pings B, B pings A, forever.
The loop garden hashes each `(sender + normalized content)` and tolerates up to
`FB_LOOP_THRESHOLD` identical messages within the last `FB_LOOP_WINDOW`; the next
identical one is blocked with reason `loop_detected`. Defaults: 3 / 10.
A *different* message from the same sender always passes.

---

## Configuration

All optional. See `config/.env.example`. Highlights:

- `FB_PORT` (9099), `FB_HOST` (0.0.0.0)
- `FB_STORE_PATH` (`./data/messages.json`), `FB_MAX_MESSAGES` (1000)
- `FB_SENDERS` — comma-separated allow-list; empty = allow any non-empty id
- `FB_LOOP_WINDOW` (10), `FB_LOOP_THRESHOLD` (3)
- `FB_HEARTBEAT_MS` (30000), `FB_LOG` (on)

---

## Tests

```bash
npm test
```

Runs the core suite: message acceptance, validation, read tracking, and
loop-garden blocking. The test exits non-zero if anything fails.

---

## Docker

```bash
docker compose up --build
```

Persists messages to `./data` and restarts unless stopped. Includes a real
`/health` healthcheck and proper SIGTERM handling via `dumb-init`.

---

## What this is, and isn't

This is the **lean core**: the message bus, read tracking, persistence, live
push, and loop protection — every line tested. It is deliberately small so it
can be trusted and adopted easily.

Advanced features used inside larger systems — cryptographic device handshakes,
rolling checkpoints, dual-lane state buffering — are **not** in the core. They
belong as optional modules layered on top, and are tracked on the roadmap rather
than bundled here.

---

## License

MIT © Molly Labs Inc.

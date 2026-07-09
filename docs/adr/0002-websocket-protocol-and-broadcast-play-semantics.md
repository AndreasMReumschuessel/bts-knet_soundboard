# ADR-0002 — WebSocket protocol & broadcast-play semantics

- **Date:** 2026-07-09
- **Status:** Accepted
- **Owner:** Architect
- **Supersedes:** none
- **Related:** ADR-0001 (stack), ADR-0003 (REST), ADR-0004 (caching)

## Context

The defining behavior of BTS Soundboard is: **when one client triggers a
sound, every connected client plays it synchronously.** Triggers come from
either a desktop global hotkey (ADR-0005) or an in-app "play" button in the
PWA. The backend is the authoritative source of WS protocol behavior; the
Frontend and Desktop both consume `packages/shared` for message types and
both implement the *same* client-side playback contract.

Two semantics must be pinned down unambiguously, because they are the most
common source of bugs in multi-client audio apps:

1. **Does the backend echo a `play` event back to the originator?**
2. **Does the originator play locally *immediately* on trigger, or only when
   it receives the broadcast?**

We also need to decide on reconnect/catalog-sync behavior and whether to use
rooms.

## Options considered

### Echo-to-originator
- **A. Broadcast to all INCLUDING originator; originator plays only via the
  broadcast path (no local immediate play).** (chosen)
- B. Broadcast to all EXCEPT originator; originator plays locally immediately.
- C. Broadcast to all including originator; originator ALSO plays locally
  immediately.

**Why A:** uniform timing (every client, including the originator, plays on
the same server-stamped `serverTimestamp`), zero double-play risk, and the
originator's code path is identical to every other client's. B introduces a
timing skew between the originator and the rest of the room (the originator
hears the sound ~1 RTT earlier) and forces two playback code paths. C causes
double-play on the originator. A is the simplest correct behavior and makes
"everyone is in sync" literally true.

**Cost of A:** the originator experiences round-trip latency before it hears
its own triggered sound (typically 20–80 ms on a LAN, more over WAN). For a
soundboard used alongside Discord this is imperceptible and is the right
trade for synchronization. Documented and accepted.

### The preview exception
"Preview" (a user auditioning a sound locally before broadcasting it) is the
**single, documented exception** to "clients never play locally." Preview is a
purely client-local code path: it plays via Web Audio on that device only and
**never** sends a WS message. This keeps the broadcast channel clean — only
intentional broadcasts go over WS.

### WS library / transport
See ADR-0001: `ws` on the server, native `WebSocket` in clients. No Socket.IO.

### Rooms / auth
- **Single shared room, no auth, v1** (chosen). Everyone connected to the
  server is in one broadcast group. Rooms + auth are a documented v2 follow-up.
- The message schema is designed so rooms can be added later **without
  rewriting the protocol**: an optional `room` field can be added to `play`
  and a `join`/`leave` C→S message pair can be introduced as new
  discriminated-union members. Existing messages stay valid.

### Reconnect & catalog sync
Native `WebSocket` has no auto-reconnect. Clients implement exponential
backoff reconnect. On (re)connect the client sends `request_sync`; the server
responds with a `sound_list` containing the full catalog metadata. This also
covers the initial connect. No replay of past `play` events (sounds are
ephemeral; missing one is fine).

## Decision

### Message schema (discriminated unions, keyed on `type`)

**Client → Server** (`ClientToServerMessage`):
| `type` | Fields |
|---|---|
| `play` | `soundId: string`, `triggeredBy?: string`, `clientTimestamp: number` (epoch ms) |
| `request_sync` | (none) |

**Server → Client** (`ServerToClientMessage`):
| `type` | Fields |
|---|---|
| `play` | `soundId: string`, `triggeredBy?: string`, `serverTimestamp: number` (epoch ms) |
| `sound_added` | `sound: SoundMetadata` |
| `sound_removed` | `soundId: string` |
| `sound_list` | `sounds: SoundMetadata[]` |
| `error` | `code: WsErrorCode`, `message: string` |

All schemas live in `packages/shared/src/ws.ts` and are Zod-validated. The
server validates every inbound C→S frame with `ClientToServerMessageSchema`;
clients validate every inbound S→C frame with `ServerToClientMessageSchema`.
Invalid inbound frames yield an `error` message (server→client) with
`code: "invalid_message"` and are otherwise ignored.

### Broadcast-play contract (authoritative)
1. A client (desktop hotkey OR web "play" button) that wants to broadcast a
   sound sends C→S `{ type: "play", soundId, triggeredBy?, clientTimestamp }`.
   **It does NOT play locally.**
2. The server validates the frame, looks up the sound, and broadcasts S→C
   `{ type: "play", soundId, triggeredBy?, serverTimestamp }` to **every**
   connected client **including the originator**. `serverTimestamp` is set by
   the server at broadcast time.
3. Every client — including the originator — plays the sound on receiving the
   S→C `play`. If the sound file is not cached locally, the client fetches it
   on demand (`GET /sounds/:id/file`) and then plays (ADR-0004). There is no
   separate "immediate local play" code path for broadcasts.
4. **Preview** is a separate, client-local code path: the client plays the
   sound via Web Audio on that device only and never sends a WS message.

### Connect / reconnect
- On connect and on each successful reconnect, the client sends
  `request_sync`. The server replies with `sound_list` (full catalog).
- Reconnect uses exponential backoff with jitter; no `play`-event replay.
- The server MAY rate-limit `play` per client (surface as `error`
  `code: "rate_limited"`); v1 leaves the exact limit to the backend agent.

### Unknown sound
If a C→S `play` references a `soundId` the server doesn't know, the server
sends an `error` (`code: "unknown_sound"`) to that client only and does not
broadcast.

## Consequences

- ✅ Uniform timing: all clients (including the originator) play on the same
  server-stamped instant; no double-play; one playback code path per client.
- ✅ Preview is cleanly separated and never pollutes the broadcast channel.
- ✅ Rooms/auth can be added in v2 as new union members + an optional `room`
  field without breaking v1 messages.
- ✅ `request_sync` + `sound_list` gives a single, replay-safe catalog-sync
  primitive used both on first connect and on reconnect.
- ⚠️ Originator hears its own triggered sound after one RTT. Accepted for
  sync; documented for the user.
- ⚠️ Clients must implement explicit reconnect + `request_sync` (native
  `WebSocket` has none). Backend agent owns server-side behavior; Frontend and
  Desktop own the client side, both consuming `packages/shared`.

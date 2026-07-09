# @bts-soundboard/server

Node/TypeScript backend for BTS Soundboard: a REST API for sound files
(list / metadata / file delivery / upload / delete) and a WebSocket server
that broadcasts `play` events to **all** connected clients (including the
originator) per ADR-0002.

## Tech choices

- **HTTP:** raw Node `http` with a small hand-rolled router (~6 routes).
  Express/Fastify would add more dependency than value at this surface size.
- **Multipart parsing:** [`busboy`](https://www.npmjs.com/package/busboy) —
  streaming, the de-facto Node multipart parser, with a hard `fileSize` limit
  wired to `MAX_UPLOAD_BYTES`.
- **MP3 duration:** [`mp3-duration`](https://www.npmjs.com/package/mp3-duration)
  — reads duration from the MP3 frame headers of the in-memory buffer (no
  second disk read). Falls back to `0` on parse failure; the file is still
  stored (clients decode via Web Audio regardless).
- **WebSocket:** [`ws`](https://www.npmjs.com/package/ws) attached to the same
  HTTP server on `WS_PATH` (`/ws`) — chosen in ADR-0001.
- **Validation:** Zod schemas imported from `@bts-soundboard/shared` for every
  inbound WS frame, every catalog entry read from disk, and (structurally)
  every REST response.

## Layout

```
src/
  index.ts              entrypoint: load config, ensure dirs, start HTTP + WS
  server.ts             http.createServer + hand-rolled route dispatch
  ws.ts                 WebSocketServer on /ws, broadcast-play, sound_list
  routes/
    health.ts           GET /health
    sounds.ts           GET /sounds, GET /sounds/:id, GET /sounds/:id/file
    upload.ts           POST /sounds (multipart)
    delete.ts           DELETE /sounds/:id
  storage/
    catalog.ts          in-memory Map + catalog.json (atomic write-through)
    files.ts            path-safe resolve, write/delete/stat, mp3 duration
  util/
    env.ts              BTS_SERVER_PORT / BTS_SOUNDS_DIR (defaults from shared)
    ids.ts              id regex + generation
    cors.ts             CORS headers + OPTIONS preflight
    http.ts             sendJson / sendError helpers
  types/
    mp3-duration.d.ts   ambient decl (the package ships no types)
```

## Scripts

```
pnpm -F @bts-soundboard/server dev        # tsx watch src/index.ts
pnpm -F @bts-soundboard/server build      # tsc -b
pnpm -F @bts-soundboard/server start      # node dist/index.js
pnpm -F @bts-soundboard/server typecheck  # tsc --noEmit -p tsconfig.json
```

Build `@bts-soundboard/shared` first (`pnpm build:shared`); the server consumes
its `dist` via the package `exports` map at runtime.

## Env

| Var | Default | Notes |
|---|---|---|
| `BTS_SERVER_PORT` | `DEFAULT_SERVER_PORT` (8080) | HTTP + WS port |
| `BTS_SOUNDS_DIR`  | `./data/sounds`               | sound files; `catalog.json` in its parent |

## REST endpoints

| Method | Path | Notes |
|---|---|---|
| `GET`    | `/health`          | `{ status, version, clients }` |
| `GET`    | `/sounds`          | `{ sounds: SoundMetadata[] }` |
| `GET`    | `/sounds/:id`      | `SoundMetadata` (400 bad id, 404 unknown) |
| `GET`    | `/sounds/:id/file` | binary, `Content-Type: audio/mpeg` (path-traversal-safe) |
| `POST`   | `/sounds`          | `multipart/form-data` → `{ sound }`; 415/413/400 on bad input |
| `DELETE` | `/sounds/:id`      | `{ soundId }`; broadcasts `sound_removed` |

## WS (`/ws`)

- On connect: server sends `sound_list` (full catalog metadata).
- On `request_sync`: server sends `sound_list`.
- On `play`: server validates, then broadcasts S→C `play` (with server-set
  `serverTimestamp`, `triggeredBy` forwarded, `clientTimestamp` dropped) to
  **all** clients including the originator. Unknown `soundId` → S→C `error`
  `unknown_sound` to sender only.
- Invalid frame → S→C `error` `code: "invalid_message"`.

WS carries metadata only — audio bytes move over REST `GET /sounds/:id/file`
(ADR-0002/0003).

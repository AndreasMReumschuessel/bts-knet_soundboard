# BTS Soundboard — Scaffold Plan (handoff to implementation agents)

- **Owner of this doc:** Architect
- **Audience:** Frontend (`apps/web`), Backend (`apps/server`), Desktop (`apps/desktop`), Orchestrator

This document is the contract for the implementation agents. It assumes the
Architect has already produced the monorepo skeleton, `packages/shared`, and
the ADRs (in `docs/adr/`). **Read the ADRs before writing code.** If an ADR gap
blocks your work, surface it to the Orchestrator — do not improvise.

---

## 1. Global conventions (all agents)

- **Language:** TypeScript, `strict` (see `tsconfig.base.json`). No `any`
  without a justifying comment. `noUncheckedIndexedAccess` is ON.
- **Module resolution:** `NodeNext` everywhere. Relative imports inside
  `packages/shared` MUST use `.js` extensions (ESM). Apps resolve the shared
  package via the `exports` map → `dist`, so **build shared first**
  (`pnpm build:shared`).
- **Shared types:** import from `@bts-soundboard/shared`. Never redefine a
  shared type inline. If you need a new type, request it via the Orchestrator.
- **Validation:** every inbound WS frame and every REST request/response body
  is validated with the Zod schemas from `packages/shared`.
- **Errors:** typed and surfaced, never swallowed.
- **Ports & URLs (defaults; overridable via env):**
  | Thing | Default | Env var |
  |---|---|---|
  | Web (Vite) | `http://localhost:5173` | `BTS_WEB_PORT` |
  | Backend REST | `http://localhost:8080` | `BTS_SERVER_PORT` |
  | Backend WS | `ws://localhost:8080/ws` | `BTS_WS_URL` |
  | WS sub-path | `/ws` | — (constant `WS_PATH`) |
  | Sounds dir | `./data/sounds` | `BTS_SOUNDS_DIR` |

  Constants live in `packages/shared/src/constants.ts`
  (`DEFAULT_SERVER_PORT`, `DEFAULT_WEB_PORT`, `WS_PATH`, `MAX_UPLOAD_BYTES`,
  `SUPPORTED_MIME`, etc.).

- **Backend is the source of WS protocol behavior.** Frontend and Desktop both
  consume `packages/shared` for message types and both implement the *same*
  client-side playback contract.

---

## 2. Non-negotiable rules (from ADR-0002)

1. **Clients MUST NOT play locally on a broadcast `play` trigger.** They play
   only when they receive the S→C `play` broadcast (including the originator).
2. **Preview is a separate client-local code path.** It plays via Web Audio on
   that device only and NEVER sends a WS message. It is the single documented
   exception to rule (1).
3. The backend echoes a C→S `play` back to ALL clients INCLUDING the
   originator, rewriting `clientTimestamp`→`serverTimestamp`.
4. On connect and on reconnect, clients send `request_sync`; the server
   replies with `sound_list` (full catalog metadata). No `play` replay.
5. WS carries **metadata only** — never audio bytes. Audio bytes move over REST
   (`GET /sounds/:id/file`).

---

## 3. Ownership map

| Agent | Owns | Does NOT touch |
|---|---|---|
| Architect | `packages/shared/**`, `docs/**`, root config (`package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `tsconfig.json`, `.gitignore`, `.editorconfig`, `.env.example`, `README.md`) | Any `apps/**/src` |
| Frontend | `apps/web/**` | `apps/server`, `apps/desktop`, `packages/shared` |
| Backend | `apps/server/**` | `apps/web`, `apps/desktop`, `packages/shared` |
| Desktop | `apps/desktop/**` | `apps/web`, `apps/server`, `packages/shared` |
| Reviewer | (read-only) | — |

If you believe an edit must cross a boundary, ask the Orchestrator.

---

## 4. `packages/shared` — exports the agents MUST use

Import path: `@bts-soundboard/shared` (or subpaths `/constants`, `/ws`,
`/rest`, `/sound`). Build first: `pnpm build:shared`.

**Constants** (`src/constants.ts`):
- `APP_NAME`, `APP_VERSION`
- `DEFAULT_SERVER_PORT` (8080), `DEFAULT_WEB_PORT` (5173), `WS_PATH` (`/ws`)
- `MAX_UPLOAD_BYTES` (25 MiB), `SUPPORTED_MIME` (`"audio/mpeg"`),
  `SUPPORTED_MIME_TYPES`
- `DEFAULT_MASTER_VOLUME` (1.0)
- `ClientMessageType`, `ServerMessageType`, `WsErrorCode` (const objects)
- Types: `ClientMessageTypeValue`, `ServerMessageTypeValue`, `WsErrorCodeValue`

**Sound metadata** (`src/sound.ts`):
- `SoundMetadataSchema`, `SoundMetadata`
- `SoundResponseSchema`, `SoundResponse`

**WS protocol** (`src/ws.ts`):
- `ClientToServerMessageSchema`, `ClientToServerMessage`
- `ServerToClientMessageSchema`, `ServerToClientMessage`
- `WsMessage`
- Per-type schemas: `PlayClientMessageSchema`, `RequestSyncClientMessageSchema`,
  `PlayServerMessageSchema`, `SoundAddedServerMessageSchema`,
  `SoundRemovedServerMessageSchema`, `SoundListServerMessageSchema`,
  `ErrorServerMessageSchema`
- `WsProtocolError` (class), `parseClientToServerMessage(data)`,
  `parseServerToClientMessage(data)`

**REST DTOs** (`src/rest.ts`):
- `SoundListResponseSchema`, `SoundListResponse`
- `UploadResponseSchema`, `UploadResponse`
- `DeleteSoundResponseSchema`, `DeleteSoundResponse`
- `HealthResponseSchema`, `HealthResponse`

---

## 5. Backend — `apps/server`

**Directory to create:** `apps/server/` with `package.json` (`@bts-soundboard/server`, `"type": "module"`), `tsconfig.json` (extends `../../tsconfig.base.json`, adds `references: [{ path: "../../packages/shared" }]`, `composite: true`, `rootDir`, `outDir`), `src/`, `data/sounds/` (gitignored runtime dir).

**Key files (agent decides exact layout):**
- WS server (`ws`) on `WS_PATH` (`/ws`), port `DEFAULT_SERVER_PORT` (or `BTS_SERVER_PORT`).
- REST routes (`GET /health`, `GET /sounds`, `GET /sounds/:id`, `GET /sounds/:id/file`, `POST /sounds`, `DELETE /sounds/:id`) per ADR-0003.
- Connection manager: on connect, send `sound_list`; on C→S `play`, validate then broadcast S→C `play` to ALL including originator; on `POST`/`DELETE`, broadcast `sound_added`/`sound_removed`.
- Storage: file root `BTS_SOUNDS_DIR` (default `./data/sounds`). **Path-traversal-safe** id handling (regex `^[A-Za-z0-9_-]{1,64}$` + resolved-path containment check). Duration/size computed on upload.
- Validate all inbound WS frames with `ClientToServerMessageSchema` / `parseClientToServerMessage`; on invalid, send S→C `error` `code: "invalid_message"`.

**Acceptance criteria:**
- `GET /health` returns `{ status: "ok", version, clients }`.
- Upload a `audio/mpeg` file via `POST /sounds` → stores file, returns `UploadResponse`, broadcasts `sound_added`.
- `GET /sounds/:id/file` streams the bytes with `Content-Type: audio/mpeg`; `..`/`/` in `:id` → 400; unknown id → 404.
- A C→S `play` is broadcast to every connected client including the sender, with a server-set `serverTimestamp`.
- New connections receive `sound_list` automatically and on `request_sync`.
- `BTS_WS_URL`/`BTS_SERVER_PORT` env respected; defaults from `@bts-soundboard/shared`.

---

## 6. Frontend — `apps/web` (React PWA, Vite)

**Directory to create:** `apps/web/` with `package.json` (`@bts-soundboard/web`, `"type": "module"`, deps: `react`, `react-dom`, `@bts-soundboard/shared`, devDeps: `vite`, `@vitejs/plugin-react`, `typescript`), `tsconfig.json` (extends `../../tsconfig.base.json`, `references: [{ path: "../../packages/shared" }]`), `vite.config.ts`, `index.html`, `src/`.

**Key responsibilities:**
- WS client: connect to `BTS_WS_URL` (default `ws://localhost:8080/ws`), exponential-backoff reconnect, send `request_sync` on (re)connect, validate every inbound frame with `ServerToClientMessageSchema` / `parseServerToClientMessage`.
- On S→C `play`: **do NOT play locally on trigger** — play only on receiving the broadcast. Lazy-fetch the file (`GET /sounds/:id/file`) via Cache API on miss, then play through Web Audio (shared `AudioContext` + master `GainNode`).
- Catalog UI: list sounds from `sound_list`; per-sound **Play** (sends C→S `play`, no local play) and **Preview** (local-only Web Audio, no WS).
- Caching: Cache API, key = file URL `${API_BASE}/sounds/${id}/file`; evict on `sound_removed`.
- Volume: master volume slider, persisted in `localStorage` (`bts:masterVolume`), applied to the master `GainNode`.
- PWA: manifest + service worker for offline shell + cached sounds.
- **No global hotkeys** (Android). The hotkey-assignment UI is hidden/disabled.

**Dev/prod wiring (Electron shares this build):**
- Dev: Vite at `http://localhost:5173`. Electron dev loads this URL.
- Prod: Vite build → `apps/web/dist`. Electron prod loads `apps/web/dist`.

**Acceptance criteria:**
- Connects to backend WS, receives `sound_list`, renders the catalog.
- Tapping **Play** sends C→S `play` and the sound plays on ALL clients (incl. self) when the broadcast returns — never immediately on tap.
- Tapping **Preview** plays locally only, sends nothing over WS.
- Sounds are cached; second play is instant and works offline (if cached).
- Master volume persists across reloads.

---

## 7. Desktop — `apps/desktop` (Electron)

**Directory to create:** `apps/desktop/` with `package.json` (`@bts-soundboard/desktop`, `"type": "module"`, devDeps: `electron`, `electron-builder`), `tsconfig.json` (extends `../../tsconfig.base.json`, `references: [{ path: "../../packages/shared" }]`), `electron-builder.yml`, `src/main.ts`, `src/preload.ts`.

**Key responsibilities:**
- `globalShortcut` hotkeys → emit C→S `play` `{ type: "play", soundId, triggeredBy, clientTimestamp }` (ADR-0005). **Does not play locally** — plays on the broadcast return.
- Hotkey map `{ soundId: accelerator }` persisted per-device in `userData` (e.g. `electron-store` key `hotkeyMap`). Register on launch, `unregisterAll()` on quit.
- Load the PWA: **dev** → `http://localhost:5173`; **prod** → `apps/web/dist`.
  - Detect dev via env (`NODE_ENV=development` or `BTS_DEV=1`); otherwise load the built file.
- WS URL via env `BTS_WS_URL` (default `ws://localhost:8080/ws`). The desktop agent decides whether the WS connection lives in the main process or the renderer, but the no-local-play-on-trigger rule holds regardless.
- Settings UI (renderer, part of the shared PWA) edits the hotkey map and IPCs the main process to re-register.
- Packaging: `electron-builder`, Windows NSIS target.
- **No hotkeys on the PWA build** — hotkey features exist only in the Electron app.

**Acceptance criteria:**
- A registered global hotkey fires while another app (e.g. Discord) is focused → emits C→S `play` → all clients (incl. this one) play on the broadcast return.
- Hotkey map persists across restarts; invalid accelerators are rejected with a typed error.
- Dev loads Vite URL; prod loads `apps/web/dist`.
- `BTS_WS_URL` respected.

---

## 8. Dev workflow

```bash
pnpm install
pnpm build:shared        # one-time / after changing packages/shared
pnpm dev                 # web + server + desktop in parallel
# or:
pnpm dev:server
pnpm dev:web
pnpm dev:desktop
pnpm typecheck          # tsc --noEmit across workspaces
pnpm build              # build everything
```

## 9. Open follow-ups (NOT built in v1)
- Rooms + auth (single shared room in v1).
- Per-sound volume (master only in v1; ADR-0006).
- Cache LRU/size cap (none in v1; ADR-0004).
- REST upload rate-limiting / auth (none in v1; ADR-0003).
- Background pre-fetch of new sounds on `sound_added` (off by default; ADR-0004).

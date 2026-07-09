# BTS Soundboard

A cross-platform **realtime soundboard**: one client triggers a sound and
**every connected client plays it** synchronously. Built for friends hanging
out in Discord who each keep the app open in the background / on another
screen.

- **React PWA** (`apps/web`) — runs in Android browsers and as the Electron
  renderer. Local sound caching (Cache API / IndexedDB), Web Audio playback,
  WebSocket client.
- **Electron** (`apps/desktop`) — Windows wrapper. OS-level global hotkeys via
  `globalShortcut`; a hotkey press emits a `play` event over WS.
- **Node/TS backend** (`apps/server`) — REST for sound files + WebSocket server
  that broadcasts `play` events to all connected clients.
- **Shared package** (`packages/shared`) — TypeScript types + Zod schemas. The
  single source of truth for all data contracts.

## Hotkey → play flow

```
Desktop globalShortcut fires
  → Electron emits `play` WS event to backend
  → backend broadcasts `play` to ALL clients (including originator)
  → each client plays the sound via Web Audio
```

Clients **never** play locally on a broadcast trigger — they play only when
they receive the broadcast, so timing is uniform and there's no double-play.
The single exception is **preview**, a client-local code path that never
touches the WS layer.

## Monorepo layout

```
apps/web        React PWA (Vite + React + TS)
apps/desktop    Electron wrapper (globalShortcut, electron-builder)
apps/server     Node/TS backend (REST + WS, Zod validation)
packages/shared TS types + Zod schemas (consumed by all three apps)
docs/adr/       Architecture Decision Records
docs/scaffold-plan.md   Handoff plan for implementation agents
```

Workspace tooling: **pnpm workspaces**. TypeScript strict mode everywhere.

## Develop (high level)

> The shared package must be built once before running the apps (it is the
> runtime dependency for the Node server and Electron main). The root
> `build:shared` script does this; `build` builds everything.

```bash
pnpm install
pnpm build:shared        # build packages/shared (one-time / after shared changes)
pnpm dev                 # run all apps in parallel (web + server + desktop)
# or individually:
pnpm dev:server
pnpm dev:web
pnpm dev:desktop
```

- Web dev server: `http://localhost:5173`
- Backend:      `http://localhost:8080` (REST) and `ws://localhost:8080/ws` (WS)
- Electron dev loads the Vite dev server URL; prod loads `apps/web/dist`.
- `BTS_WS_URL` (default `ws://localhost:8080/ws`) configures the WS endpoint.

See `docs/scaffold-plan.md` for the full handoff and `docs/adr/` for decisions.

## Status

Greenfield. The Architect has produced ADRs, the monorepo skeleton, and the
shared package. Implementation agents (Frontend, Backend, Desktop) build the
apps against those contracts.

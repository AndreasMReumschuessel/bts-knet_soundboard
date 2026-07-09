# 🎵 BTS Soundboard

A cross-platform **realtime soundboard** — one person triggers a sound, and
**every connected client plays it** at the same time. Built for groups of
friends hanging out in Discord who each keep the app running on a phone or
desktop.

![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)
![pnpm](https://img.shields.io/badge/pnpm-workspaces-F69220.svg)
![PWA](https://img.shields.io/badge/PWA-installable-5A0FC8.svg)

---

## ✨ Features

- **Realtime broadcast play** — when anyone triggers a sound, all connected
  clients play it simultaneously. No double-play, no desync.
- **Global hotkeys (desktop)** — assign OS-level hotkeys to any sound. Works
  while Discord, a game, or any other app is focused.
- **PWA on mobile** — installable on Android, works offline with cached sounds.
- **Upload & share** — upload MP3 files; they're automatically distributed to
  all connected clients.
- **Preview mode** — listen to a sound locally without broadcasting it to others.
- **Master volume** — per-device volume control, persisted across sessions.
- **Offline playback** — sounds are cached via the Cache API and service worker.

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Backend (Node)                    │
│         REST (sounds CRUD) + WebSocket (play)        │
│    Broadcasts play events to ALL connected clients   │
└──────────┬──────────────────────────┬───────────────┘
           │                          │
     WebSocket                  WebSocket
           │                          │
┌──────────▼──────────┐   ┌──────────▼──────────┐
│   Desktop (Electron)  │   │     PWA (Browser)    │
│  Global hotkeys → WS  │   │   Tap to play → WS    │
│  Renders the same PWA │   │   Works on Android    │
└───────────────────────┘   └──────────────────────┘
```

| Component | Location | Tech | Role |
|---|---|---|---|
| **Shared** | `packages/shared` | TypeScript, Zod | Types, schemas, constants — single source of truth |
| **Backend** | `apps/server` | Node.js, `ws`, `busboy` | REST API + WebSocket broadcast server |
| **Web PWA** | `apps/web` | React, Vite, Web Audio | UI, caching, audio playback, WS client |
| **Desktop** | `apps/desktop` | Electron, `globalShortcut` | OS-level hotkeys, wraps the PWA |

### The broadcast-play invariant

> **Clients never play locally on a broadcast trigger.** When you tap **Play**
> (or press a hotkey), a `play` *event* is sent to the backend — your client
> plays nothing yet. The backend broadcasts `play` to **all** clients
> (including you). Everyone plays on receipt. This ensures uniform timing and
> zero double-play.
>
> **Preview** is the single exception: it plays locally only and never sends a
> WS message.

## 🚀 Quick start

### Prerequisites

- **Node.js** ≥ 18
- **pnpm** ≥ 9 (`npm install -g pnpm`)

### Install & run

```bash
git clone https://github.com/AndreasMReumschuessel/bts-knet_soundboard.git
cd bts-knet_soundboard

pnpm install
pnpm build:shared        # one-time: build the shared package
pnpm dev                 # run web + server + desktop in parallel
```

Or run individually:

```bash
pnpm dev:server          # backend on http://localhost:8080
pnpm dev:web             # PWA on http://localhost:5173
pnpm dev:desktop         # Electron app (loads the Vite dev server)
```

Open `http://localhost:5173` in your browser, upload an MP3, and hit **Play**.
Open a second browser tab (or another device on your network) to see the
broadcast in action.

### Build for production

```bash
pnpm build               # build all workspaces
pnpm -F @bts-soundboard/desktop package  # Windows NSIS installer
```

## ⚙️ Configuration

All settings have sensible defaults. Copy `.env.example` to `.env` to override.

| Setting | Default | Env var | Used by |
|---|---|---|---|
| Backend port | `8080` | `BTS_SERVER_PORT` | Server |
| WebSocket URL | `ws://localhost:8080/ws` | `BTS_WS_URL` | Web, Desktop |
| Web dev port | `5173` | `BTS_WEB_PORT` | Web (Vite) |
| REST API base | `http://localhost:8080` | `VITE_BTS_API_BASE` | Web |
| Sounds directory | `./data/sounds` | `BTS_SOUNDS_DIR` | Server |
| Electron dev mode | — | `NODE_ENV=development` or `BTS_DEV=1` | Desktop |

## 📁 Project layout

```
bts-knet_soundboard/
├── apps/
│   ├── web/                 # React PWA (Vite + React + TypeScript)
│   ├── server/              # Node.js backend (REST + WebSocket)
│   └── desktop/             # Electron wrapper (global hotkeys)
├── packages/
│   └── shared/              # Shared types + Zod schemas
├── docs/
│   ├── adr/                 # Architecture Decision Records (0001–0007)
│   └── scaffold-plan.md     # Implementation handoff plan
├── .github/
│   ├── workflows/           # CI pipeline
│   └── ISSUE_TEMPLATE/       # Issue templates
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

## 📜 API reference

### REST endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check (`{ status, version, clients }`) |
| `GET` | `/sounds` | List all sounds (metadata) |
| `GET` | `/sounds/:id` | Get a single sound's metadata |
| `GET` | `/sounds/:id/file` | Stream the MP3 file (`audio/mpeg`) |
| `POST` | `/sounds` | Upload an MP3 (multipart `audio/mpeg`) |
| `DELETE` | `/sounds/:id` | Delete a sound |

### WebSocket events

| Direction | Event | Payload | Description |
|---|---|---|---|
| C→S | `play` | `{ soundId, triggeredBy?, clientTimestamp }` | Request broadcast |
| C→S | `request_sync` | — | Request full catalog |
| S→C | `play` | `{ soundId, triggeredBy?, serverTimestamp }` | Broadcast play |
| S→C | `sound_list` | `{ sounds: SoundMetadata[] }` | Full catalog snapshot |
| S→C | `sound_added` | `{ sound }` | New sound available |
| S→C | `sound_removed` | `{ soundId }` | Sound deleted |
| S→C | `error` | `{ code, message }` | Error report |

Connect to `ws://<host>:<port>/ws`.

## 📔 Architecture Decision Records

All non-trivial decisions are documented as ADRs in [`docs/adr/`](./docs/adr):

- [ADR-0001: Tech stack & monorepo layout](./docs/adr/0001-tech-stack-and-layout.md)
- [ADR-0002: WebSocket protocol & broadcast-play semantics](./docs/adr/0002-websocket-protocol-and-broadcast-play-semantics.md)
- [ADR-0003: REST API shape](./docs/adr/0003-rest-api-shape.md)
- [ADR-0004: Local sound caching strategy](./docs/adr/0004-local-sound-caching-strategy.md)
- [ADR-0005: Hotkey model](./docs/adr/0005-hotkey-model.md)
- [ADR-0006: Volume model](./docs/adr/0006-volume-model.md)
- [ADR-0007: CI, release & deployment strategy](./docs/adr/0007-ci-release-and-deployment-strategy.md)

## 🗺️ Roadmap

- [ ] Rooms & join codes (multi-room support)
- [ ] Per-sound volume
- [ ] Authentication
- [ ] Sound categories / tags
- [ ] Search & filter
- [ ] Upload rate limiting
- [ ] Automated test suite
- [ ] Code signing for Windows builds
- [ ] Server Docker image & LXC deployment

See the [open issues](https://github.com/AndreasMReumschuessel/bts-knet_soundboard/issues)
for the full list.

## 🤝 Contributing

Contributions are welcome! See [CONTRIBUTING.md](./CONTRIBUTING.md) for
guidelines on development setup, code style, and pull request workflow.

## 📄 License

MIT — see [LICENSE](./LICENSE).

## 🙏 Acknowledgements

Built with [React](https://react.dev), [Vite](https://vitejs.dev),
[Electron](https://www.electronjs.org), [pnpm](https://pnpm.io), and
[Zod](https://zod.dev).

# BTS Soundboard — Project Memory

Living memory for the Orchestrator/agents. Update when decisions change. Authoritative
details live in `docs/adr/` and `docs/scaffold-plan.md`; this file is a fast index.

## Vision
Cross-platform realtime soundboard. Friends hanging out in Discord each run the app
(PWA on phones, Electron on Windows). One player triggers a sound → a `play` *event*
goes to the backend → backend broadcasts to **all** clients → each plays locally via
Web Audio (uniform timing, no double-play). Upload MP3s (redistributed to all), list
sounds, play (broadcast) or preview (local-only), assign global hotkeys (desktop only),
set master volume.

## The one invariant (do not break)
**Clients never play locally on a broadcast `play` trigger.** Local playback happens
ONLY when the S→C `play` broadcast is received (handled in `apps/web/src/ws/useSocket.ts`
→ `engine.playSound`). The Play button (`App.tsx onPlay`) calls `sendPlay` only (WS send,
no engine). **Preview** is the single local-only exception (`onPreview` → `engine.playSound`,
no WS). Verified by the Reviewer across all three apps.

## Architecture
| Component | Location | Role |
|---|---|---|
| Shared | `packages/shared` | TS + Zod: WS events, REST DTOs, sound metadata, constants, `BtsDesktopBridge`. Single source of truth. |
| Backend | `apps/server` | Node `http` + `ws`. REST (health/sounds CRUD/file) + WS broadcast (echo `play` to ALL incl. originator, `sound_list` on connect/`request_sync`, `sound_added`/`sound_removed`). Path-traversal-safe storage. |
| Web (PWA) | `apps/web` | Vite+React. Owns the WS connection + Web Audio + Cache API + UI. Runs standalone and as the Electron renderer. |
| Desktop | `apps/desktop` | Electron, THIN: `globalShortcut` → IPC → renderer sends C→S `play`. No WS, no audio. Windows NSIS packaging. |

**Orchestrator decision:** the WS connection lives in the renderer (PWA) in both contexts.
Electron forwards hotkey presses to the renderer via the `window.btsDesktop` bridge; the
renderer sends C→S `play` over its WS. The no-local-play invariant holds either way.

## Key contracts (from `@bts-soundboard/shared`, import from package ROOT)
- WS: `ClientToServerMessage` (`play`, `request_sync`), `ServerToClientMessage`
  (`play`, `sound_added`, `sound_removed`, `sound_list`, `error`), `parseClientToServerMessage`,
  `parseServerToClientMessage`.
- REST DTOs: `SoundMetadata`, `SoundListResponse`, `UploadResponse`, `DeleteSoundResponse`, `HealthResponse`.
- Constants: `DEFAULT_SERVER_PORT`(8080), `DEFAULT_WEB_PORT`(5173), `WS_PATH`(`/ws`),
  `MAX_UPLOAD_BYTES`(25MiB), `SUPPORTED_MIME`(`audio/mpeg`), `DEFAULT_MASTER_VOLUME`(1.0).
- Bridge: `BtsDesktopBridge`, `HotkeyMap`, `HotkeySetResult` (+ ambient `window.btsDesktop`).
- **Note:** the `exports` map lacks a `./desktop-bridge` subpath — import from the root.

## Ports / env
| Thing | Default | Env |
|---|---|---|
| Web (Vite) | http://localhost:5173 | `BTS_WEB_PORT` / Vite `VITE_BTS_API_BASE`, `VITE_BTS_WS_URL` |
| Backend REST | http://localhost:8080 | `BTS_SERVER_PORT` |
| Backend WS | ws://localhost:8080/ws | `BTS_WS_URL` |
| Sounds dir | ./data/sounds | `BTS_SOUNDS_DIR` |
| Electron dev | http://localhost:5173 | `NODE_ENV=development` or `BTS_DEV=1` |

## Dev / build
```bash
pnpm install
pnpm build:shared        # after changing packages/shared
pnpm dev                 # web + server + desktop in parallel
pnpm dev:server | dev:web | dev:desktop
pnpm typecheck           # all workspaces
pnpm build               # all workspaces
# desktop packaging (Windows NSIS): build shared+web, then
pnpm -F @bts-soundboard/desktop package
```

## Decisions locked (ADRs in `docs/adr/`)
1. Tech: pnpm workspaces, TS strict (NodeNext, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`), React+Vite, Electron (CJS main, `verbatimModuleSyntax:false` scoped to apps/desktop), Node+`ws`, Zod.
2. WS broadcast-play: echo to originator, server-stamped `serverTimestamp`, no local play on trigger, `request_sync`→`sound_list`.
3. REST: metadata over WS, bytes over `GET /sounds/:id/file`; multipart `audio/mpeg` upload; traversal-safe ids `^[A-Za-z0-9_-]{1,64}$`.
4. Caching: Cache API keyed by file URL, lazy fetch on miss, evict on `sound_removed`, memo decoded `AudioBuffer`. SW also caches sounds for offline.
5. Hotkeys: desktop-only `globalShortcut`, per-device map in `userData/hotkeys.json`, PWA has none.
6. Volume: master per device in `localStorage` (`bts:masterVolume`), live on a shared `GainNode`.

## v1 scope (NOT built — documented follow-ups)
- Rooms + auth (single shared room in v1).
- Per-sound volume (master only).
- Cache LRU/size cap; eager prefetch on `sound_added`.
- REST upload rate-limiting/auth; CORS tighten when auth lands.
- Tests (Reviewers flagged no tests in any app — recommended follow-up).
- Desktop `sandbox:true` hardening; defer `registerAll()` to `did-finish-load`.

## Process notes (for the Orchestrator)
- Subagents have a step/time budget. Large single tasks (e.g. the full `apps/web`) returned
  EMPTY results with no files. Workaround that worked: delegate in SMALL chunks (scaffold →
  core logic → PWA shell → UI). Keep each task ≤ ~10 files.
- `frontend` and `general` subagent types both work for app work; use whichever.
- Backend and Desktop agents handle large briefs fine.
- Reviewer (read-only) returns structured Blockers/Issues/Nits + verdict; route should-fixes back.

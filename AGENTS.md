# BTS Soundboard — Agents

Shared instructions for every agent working on this project. Read this first.
Your individual agent file (`.opencode/agent/<name>.md`) adds your specific
scope and responsibilities.

## What this project is

A cross-platform soundboard with realtime broadcast: when one client triggers a
sound, **every connected client plays it**. Runs as a React PWA on Android
browsers and as an Electron app on Windows desktop with OS-level global
hotkeys.

## Architecture

| Component | Location | Role |
|---|---|---|
| React PWA | `apps/web` | Shared UI (Vite + React + TS). Runs in Android browsers and as the Electron renderer. Local sound caching, Web Audio playback, WS client. |
| Electron app | `apps/desktop` | Windows wrapper. `globalShortcut` hotkeys → WS emit. Desktop-only hotkeys. |
| Node/TS server | `apps/server` | REST for sound files + WebSocket server broadcasting `play` events to all clients. |
| Shared package | `packages/shared` | TypeScript types + Zod schemas for WS events, REST DTOs, sound metadata. **Single source of truth for all types.** |

## Hotkey → play flow

```
Desktop globalShortcut fires
  → Electron emits `play` WS event to backend
  → backend broadcasts `play` to ALL connected clients (including originator)
  → each client plays the sound via Web Audio
```

**Clients never play locally on trigger.** They play only on receiving the
broadcast, so timing is uniform and there's no double-play.

## Hard constraints

- **Android has no true global hotkeys** (OS security model). Hotkeys are
  desktop-only. Android users interact via the in-app PWA UI but still receive
  and play broadcast sounds.
- **Broadcast-play semantics:** the backend echoes a `play` event to all
  clients including the originator. The originator does not play locally on
  trigger. (See ADR when the Architect produces it.)
- **Shared types are owned by the Architect.** Every app imports from
  `packages/shared`. Never redefine a type inline. If you need a new type,
  request it via the Orchestrator.
- **Scope boundaries are strict.** Each agent owns specific directories (see
  your agent file). Do not edit outside your scope. The Reviewer flags
  cross-scope edits as blockers.
- **Ops ↔ Desktop packaging boundary (ADR-0007):** the Desktop agent owns the
  electron-builder *config* (`apps/desktop/electron-builder.yml`, NSIS target,
  signing); the Ops agent owns the *workflow that runs it* in CI and the
  *release that uploads the resulting installer*. Desktop never edits the
  workflow; Ops never edits the builder config.

## Agent team

| Agent | subagent_type | Mode | Owns |
|---|---|---|---|
| Orchestrator | — | primary (default) | Planning, delegation, assembly. No feature code. |
| Architect | `architect` | subagent | ADRs, monorepo layout, `packages/shared`, data contracts. |
| Frontend | `frontend` | subagent | `apps/web` — PWA, caching, WS client, Web Audio. |
| Backend | `backend` | subagent | `apps/server` — REST, WS broadcast, storage, connections. |
| Desktop | `desktop` | subagent | `apps/desktop` — Electron, `globalShortcut`, hotkey→WS emit, electron-builder config (NSIS). |
| Ops | `ops` | subagent | `.github/workflows/**`, release pipeline, versioning, server `Dockerfile` + LXC deploy, release-artifact packaging. |
| Reviewer | `reviewer` | subagent | Read-only review. Never edits. |

You talk to the **Orchestrator**. It delegates to the others via the `task`
tool. The **Architect** runs first on any greenfield or structural work and
produces ADRs the implementation agents follow.

## Tech stack

- **Language:** TypeScript everywhere.
- **Web:** React + Vite, Web Audio API, Cache API / IndexedDB, service worker.
- **Desktop:** Electron, `globalShortcut`, electron-builder (Windows NSIS).
- **Server:** Node.js, `ws` (or Socket.IO — decided by ADR), Zod validation.
- **Validation:** Zod schemas in `packages/shared`, shared across all apps.
- **Workspace:** pnpm workspaces (recommended).

## Coding conventions

- TypeScript strict mode. No `any` without a justifying comment.
- Validate all external data (WS events, REST bodies) with Zod schemas from
  `packages/shared`.
- Keep WS event names and REST DTOs **exactly** as defined in
  `packages/shared` — no drift.
- Errors: typed and surfaced, never swallowed silently.
- No secrets in code. Sound upload paths must guard against path traversal.
- No comments unless explaining a non-obvious decision.

## ADRs

Architecture Decision Records live in `docs/adr/` (the Architect creates this
directory). Every non-trivial decision gets an ADR with: context, options
considered, decision, consequences. Implementation agents follow ADRs; they do
not contradict them. If an ADR gap blocks your work, surface it to the
Orchestrator rather than improvising.

## First task

The monorepo is not yet scaffolded. The Orchestrator's first delegation is to
the **Architect** to produce:
1. ADRs covering stack, layout, WS event schema, REST API shape, local caching
   strategy, and broadcast-play semantics.
2. A scaffold plan + the initial `packages/shared` types.

Only then do the implementation agents (Frontend, Backend, Desktop) begin.

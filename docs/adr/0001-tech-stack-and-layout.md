# ADR-0001 — Tech stack & monorepo layout

- **Date:** 2026-07-09
- **Status:** Accepted
- **Owner:** Architect

## Context

BTS Soundboard is greenfield. We need a single codebase that produces three
deliverables — a React PWA (Android browsers + Electron renderer), an
Electron desktop wrapper with OS-level global hotkeys, and a Node/TS backend
that serves sound files over REST and broadcasts `play` events over
WebSocket — all sharing the same data contracts. The choice of language,
bundler, WS library, validation layer, and workspace tooling locks in the
developer experience and the inter-app contract surface for the life of the
project.

The shared types must be importable verbatim from all three apps with **no
drift**, and the protocol behavior is owned by the backend (it is the source
of truth for WS semantics — see ADR-0002).

## Options considered

### Language
- **TypeScript everywhere** (chosen) vs. mixed TS/JS.
  - TS gives us compile-time guarantees on the cross-app contract, which is
    the whole risk surface of a multi-client realtime app. Strict mode + Zod
    on every external boundary. Chosen.

### Workspace tooling
- **pnpm workspaces** (chosen) vs. npm workspaces vs. yarn workspaces vs. nx/turbo.
  - pnpm: strict node_modules layout (prevents phantom deps), fast, first-class
    workspace protocol, small footprint. npm workspaces would work but pnpm's
    strictness aligns with our "no drift / no implicit deps" rule. nx/turbo add
    a build-cache layer we don't need at v1. Chosen: pnpm workspaces.

### Bundler / web stack
- **Vite + React + TypeScript** (chosen) vs. Next.js vs. CRA.
  - Vite: fast HMR, ESM-native, trivial PWA/Electron integration, no SSR
    overhead (we are a client-rendered soundboard, not a content site).
    Next.js's SSR/routing is unnecessary complexity. CRA is unmaintained.
    Chosen.

### WebSocket library
- **`ws`** (chosen) vs. Socket.IO.
  - `ws`: minimal, ~no protocol overhead, native browser `WebSocket` client
    interop (no client SDK needed), tiny attack surface. Our protocol is a
    small discriminated-union message set; we don't need Socket.IO's rooms,
    ack callbacks, or fallback transports at v1 — and the v1 design keeps rooms
    addable later without rewriting the message schema (see ADR-0002).
  - Socket.IO brings its own binary protocol, a required client SDK, and
    auto-reconnect/replay semantics we'd rather implement explicitly and
    predictably for broadcast-play timing.
  - Chosen: `ws` on the server + native `WebSocket` in the browser/Electron
    renderer, all messages validated by Zod schemas from `packages/shared`.

### Validation
- **Zod** (chosen) vs. io-ts vs. ajv vs. hand-rolled guards.
  - Zod: TS-first, inferred types from schemas (so the schema *is* the type),
    ergonomic discriminated unions, runtime `safeParse`. Chosen.

### Audio playback
- **Web Audio API** (chosen) via an `AudioContext` + per-play `AudioBufferSourceNode`
  through a shared `GainNode` (master volume) vs. `<audio>` elements vs.
  Howler.js.
  - Web Audio gives sample-accurate scheduling, a single gain node for master
    volume (ADR-0006), and zero extra deps. `<audio>` elements can't be
    triggered tightly in parallel and have per-element volume drift. Howler is
    nice but redundant for our needs. Chosen: Web Audio.

### Module resolution
- **NodeNext** (chosen) vs. Bundler vs. Node10.
  - NodeNext is the strictest and works natively for the Node server (which
    runs real ESM via `"type": "module"`). Vite and Electron resolve the
    shared package through its `exports` map (built `dist`), and TS path
    mapping (`@bts-soundboard/shared` → `packages/shared/src`) gives the IDE
    and typecheck access to source. Bundler resolution would be looser and
    would not catch extension/import-style mistakes that NodeNext catches.
  - Consequence: **all relative imports inside `packages/shared` must use the
    `.js` extension** (ESM requirement) even though the source is `.ts`.
  - Chosen: `module: "NodeNext"`, `moduleResolution: "NodeNext"`,
    `target: "ES2022"`.

## Decision

- **Language:** TypeScript, `strict: true`, plus `noUncheckedIndexedAccess`,
  `noImplicitOverride`, `noFallthroughCasesInSwitch`, `noImplicitReturns`,
  `verbatimModuleSyntax`. No `any` without a justifying comment.
- **Workspace:** pnpm workspaces (`pnpm-workspace.yaml` globs `apps/*` and
  `packages/*`). Root `package.json` is `bts-soundboard`, private,
  `engines.node >= 18`, `packageManager: pnpm@9.12.0`.
- **Layout:**
  ```
  apps/web        React PWA (Vite)
  apps/desktop    Electron wrapper
  apps/server     Node/TS backend (REST + WS)
  packages/shared TS types + Zod schemas
  docs/adr/       ADRs
  docs/scaffold-plan.md
  ```
- **TS:** root `tsconfig.base.json` (NodeNext, strict, path mapping for
  `@bts-soundboard/shared`). `packages/shared/tsconfig.json` extends base and
  adds `composite: true` so it can be a project reference. Each app extends
  base and adds its own `references`.
- **Shared package:** `@bts-soundboard/shared`, `"type": "module"`, built to
  `dist` (ESM + `.d.ts`), consumed via `exports` map. Apps import types and
  schemas from the package root; they NEVER redefine a shared type inline.
- **WS:** `ws` on the server; native `WebSocket` in clients; all messages
  validated with Zod from `packages/shared`.
- **Audio:** Web Audio API, shared `AudioContext` + master `GainNode`.

## Consequences

- ✅ Single shared contract package; compile-time + runtime validation on every
  WS frame and REST body.
- ✅ Strict module resolution catches a class of bugs early; relative imports
  in `packages/shared` must use `.js` extensions.
- ✅ `packages/shared` must be built (`pnpm build:shared`) before the Node
  server or Electron main can run (they consume `dist`); Vite also consumes
  `dist` via the `exports` map. TS path mapping keeps typecheck/IDE working
  against source without a build.
- ✅ Adding rooms/auth later (v2) does not require changing the message schema
  — only server-side routing and (optionally) a `room` field. See ADR-0002.
- ⚠️ Native `WebSocket` has no auto-reconnect; clients implement reconnect +
  `request_sync` explicitly (ADR-0002). This is intentional for predictable
  broadcast-play behavior.

# ADR-0009 — Adopt React 19 + Vite 8 + plugin-react 6

- **Date:** 2026-07-10
- **Status:** Accepted
- **Owner:** Architect
- **Supersedes:** none
- **Related:** ADR-0001 (stack & layout — React/Vite chosen; `engines.node` floor),
  ADR-0008 (precedent: major-version adoption is recorded as an ADR)

## Context

Two Dependabot PRs touch `apps/web/package.json` and `pnpm-lock.yaml` and
therefore conflict on the lockfile, so they must land together as one combined
PR:

- **PR #6** — `react`/`react-dom` `18.3.1 → 19.2.7`; `@types/react`
  `18.3.31 → 19.2.17`; `@types/react-dom` `18.3.7 → 19.2.3`.
- **PR #7** — `vite` `5.4.21 → 8.1.4`; `@vitejs/plugin-react` `4.7.0 → 6.0.3`.

The combined bump was applied to a worktree off `main` and `pnpm install` run.
Verified results (trusted; not re-run by this ADR):

- `pnpm install` — OK.
- `pnpm -F @bts-soundboard/shared build` — PASS.
- `npx vite build` (apps/web) — PASS (116 modules transformed, 475 ms, dist
  produced). Vite 8 + plugin-react 6 work with the Oxc-based React Refresh.
- `pnpm -F @bts-soundboard/desktop typecheck` — PASS (desktop consumes React
  via the PWA but does not reference `JSX` types directly).
- `pnpm -F @bts-soundboard/web typecheck` — **FAILS** with exactly 9 errors,
  all `TS2503: Cannot find namespace 'JSX'`. React 19 types removed the global
  `JSX` namespace (it now lives at `React.JSX`); every occurrence is a
  `JSX.Element` return-type annotation.

React 19 API-surface audit of `apps/web/src`:

- `main.tsx` uses `StrictMode` from `react` and `createRoot` from
  `react-dom/client` — already the v18+ API. No `ReactDOM.render`/`hydrate`.
- All components are function components returning `JSX.Element`.
- Hooks in use: `useCallback`, `useEffect`, `useRef`, `useState`. Every
  `useRef` call passes an initial value.
- **None** of: `forwardRef`, `defaultProps`, `propTypes`,
  `useImperativeHandle`, class components, `React.FC`, `createRef`,
  `React.render`, `hydrate`.

So React 19's breaking surface for our code reduces to **the `JSX` namespace
move** — a mechanical, single-import-per-file fix.

Vite 8 removes Babel support (plugin-react 6 uses Oxc for React Refresh).
`apps/web/vite.config.ts` has no `babel:` key and no Babel options in the
plugin-react config, so the Babel removal is a non-issue. plugin-react 6
requires `vite: ^8.0.0`. Vite 8 requires Node `^20.19.0 || >=22.12.0`
(production runtime is Node 20; local dev is Node 26).

The tsconfig uses `jsx: "react-jsx"` (automatic runtime) and
`verbatimModuleSyntax: true` (per ADR-0001) — so no `import React` is required
for JSX itself, and any type-only import must use the `type` modifier.

## Options considered

### Adopt React 19 + Vite 8 + plugin-react 6 vs. pin React 18 / Vite 5
- **Adopt as one combined PR** (chosen). It is a verified drop-in modulo the
  `JSX` namespace fix: `vite build`, `shared` build, and `desktop` typecheck
  pass; `web` typecheck fails only on the 9 `JSX.Element` annotations. Our
  audited surface uses none of React 19's removed/changed APIs. A Dependabot
  major bump is the natural adoption moment, and the #6/#7 lockfile conflict
  forces a combined land anyway. Chosen.
- **Pin React 18 / Vite 5.** Avoids churn now but the same compatibility audit
  recurs on the next bump, and we cannot merge #6 without resolving #7 (or
  vice versa) because both rewrite the lockfile. Rejected.

### `JSX.Element` fix pattern (4 candidates)
- **(a)** `JSX.Element` → `React.JSX.Element` + `import type * as React from
  "react"`. Works, but edits 9 lines and adds a heavy namespace import per
  file. Rejected.
- **(b)** Bring the `JSX` namespace into scope as a type from `react` and leave
  the `JSX.Element` annotations unchanged (chosen). If the file already has a
  named `react` import, add `type JSX` to it (e.g.
  `import { useState, type JSX } from "react"`); otherwise add
  `import type { JSX } from "react";`. This is the React-19-documented
  migration for the global `JSX` namespace, is `verbatimModuleSyntax`-correct,
  and leaves the 9 return annotations byte-identical — one import edit per
  file. Chosen.
- **(c)** Remove the return-type annotations (let TS infer). Lowest churn, but
  drops the explicit return types this project's strict style keeps, and
  widens the inferred FC return to `ReactNode` (a subtle semantic change).
  Rejected.
- **(d)** `JSX.Element` → `React.ReactElement`. `ReactElement` is *narrower*
  than `JSX.Element`/`ReactNode` and breaks components that return `null` or
  strings; also requires a React import. Rejected.

## Decision

1. **Adopt** React 19.2.7 + `react-dom` 19.2.7 + `@types/react` 19.2.17 +
   `@types/react-dom` 19.2.3 + Vite 8.1.4 + `@vitejs/plugin-react` 6.0.3 in
   `apps/web`, landed as a **single combined PR** superseding Dependabot #6 and
   #7 individually (they cannot land separately due to the lockfile conflict).

2. **Canonical `JSX.Element` fix — owned by the Frontend agent.** In each of
   the 8 affected files, bring the `JSX` namespace into scope as a type from
   `react` and leave the `JSX.Element` return annotations unchanged:
   - If the file already has a named `react` import, add `type JSX` to it, e.g.
     `import { useState, type JSX } from "react"`.
   - Otherwise add `import type { JSX } from "react";` at the top.
   - Affected files (9 occurrences across 8 files): `apps/web/src/App.tsx`,
     `apps/web/src/components/ConnectionStatus.tsx`,
     `apps/web/src/components/HotkeySettings.tsx`,
     `apps/web/src/components/SoundItem.tsx`,
     `apps/web/src/components/SoundList.tsx`,
     `apps/web/src/components/Toast.tsx` (2 occurrences),
     `apps/web/src/components/UploadBar.tsx`,
     `apps/web/src/components/VolumeControl.tsx`.
   - Do **not** switch to `React.JSX.Element` or `React.ReactElement`, and do
     **not** delete the annotation. Pattern (b) is the only sanctioned fix.
   - No other `apps/web` source changes are required for the version bump.

3. **Node engine — flagged to Orchestrator/Ops, not edited by the Architect.**
   Vite 8 requires Node `^20.19.0 || >=22.12.0`. The root `package.json`
   `engines.node` is currently `>=18.0.0` (per ADR-0001). Bump the root
   `engines.node` to `^20.19.0 || >=22.12.0` and verify CI runners, the server
   `Dockerfile` base, and the Electron build environment are all ≥ 20.19.0.

## Consequences

- ✅ `apps/web` on React 19.2.7 + Vite 8.1.4 + plugin-react 6.0.3. `vite build`
  and `packages/shared` build verified green; `apps/desktop` typecheck green;
  `apps/web` typecheck green after the mechanical `JSX` import fix.
- ✅ The `JSX` fix is a one-import-edit-per-file change with return annotations
  unchanged — a small, reviewable diff for the Frontend agent, and the fix
  pattern is locked here so every occurrence is fixed identically.
- ✅ The audited compatibility scope is recorded: we use none of React 19's
  removed/changed APIs (`forwardRef`, `defaultProps`, `propTypes`,
  `useImperativeHandle`, class components, `React.FC`, `createRef`,
  `ReactDOM.render`/`hydrate`).
- ⚠️ **React 19 forward-compat notes for future components:** `forwardRef` is
  no longer needed — pass `ref` as a regular prop. `<Context>` is usable
  directly as a provider (`.Provider` still works). `use()` and document-
  metadata support are available. New components should accept `ref` as a prop
  rather than adopting `forwardRef`.
- ⚠️ **Vite 8 replaces Babel with Oxc** for React Refresh. Any future reliance
  on Babel plugins (decorators, styled-components, legacy-syntax transforms)
  will not work under plugin-react 6; revisit if such a need arises.
- ⚠️ **Node engine floor rises to ≥ 20.19.0** (from ≥ 18). Coordinated with
  Ops (CI matrix, server `Dockerfile` base, Electron builder env). Local dev on
  Node 26 is unaffected. This amends the `engines.node` statement in ADR-0001.
- ⚠️ **Merge sequencing:** the combined branch must rebase onto current
  `main` before merge and re-run CI after the `JSX` fix lands. PR #6 was
  "blocked" (needs rebase + CI); PR #7 was "clean" — combining resolves the
  lockfile conflict. ADR-0008 (Zod 4) is recorded on its own branch and should
  land to/with `main` so this ADR is not orphaned relative to the ADR log.

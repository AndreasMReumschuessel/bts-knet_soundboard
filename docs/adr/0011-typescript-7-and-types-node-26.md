# ADR-0011 — Adopt TypeScript 7 + pin @types/node to the Node 20 runtime

- **Date:** 2026-07-10
- **Status:** Accepted
- **Owner:** Architect
- **Supersedes:** none
- **Related:** ADR-0001 (stack & layout — TypeScript chosen; `engines.node` floor),
  ADR-0007 (CI/release — Node 20 runners; Ops↔Desktop boundary),
  ADR-0008 (Zod 4 — TS interop),
  ADR-0009 (React 19 + Vite 8 — raised root `engines.node` to
  `^20.19.0 || >=22.12.0`),
  ADR-0010 (Electron 43 — flagged CI→22 for Electron; `@types/node ^20`
  "cosmetic and not blocking")

## Context

Dependabot PR #5 bumps the TypeScript toolchain across the monorepo:

- `typescript` `5.9.3 → 7.0.2` in the root `package.json` and in
  `apps/{web,server,desktop}/package.json`.
- `@types/node` `20.14.0 → 26.1.1` in `apps/server` and `apps/desktop`
  (`apps/web` has no `@types/node` — it is a browser app using `@types/react`).

(The PR body's release-notes block references "TypeScript 6.0.3"; the actual
resolved npm package is `7.0.2`. The native-binary distribution model planned
for TS 6 shipped in 7.0.2. We adopt **7.0.2**, the installed package; the
PR-body reference is a Dependabot artifact and does not affect the decision.)

### TypeScript 7 structural change: native binary distribution

TS 7 replaces the single-platform JS-only `typescript` package with a **native
binary distribution**: `typescript@7.0.2` declares per-platform
`@typescript/typescript-<plat>-<arch>` packages as `optionalDependencies`
(e.g. `@typescript/typescript-darwin-arm64`, `...-win32-x64`,
`...-linux-x64`) and ships a native compiler binary. The package sets
`preferUnplugged: true` and `engines.node: ">=16.20.0"`.

### Verification (worktree `chore/ts7-typesnode`, Node 26 local dev)

The bump was applied to a worktree off `main` at `fd1203c` (which includes
merged PRs #9/#12/#13 — Zod 4, `z.iso.datetime`, React 19 + Vite 8 — and
#8/ADR-0010 Electron 43). `pnpm install` resolved the native binary package via
the pnpm store (`@typescript+typescript-darwin-arm64@7.0.2`). Verified:

- `npx tsc --version` → `Version 7.0.2`.
- `pnpm -F @bts-soundboard/shared build` — PASS (`tsc -b`, exit 0).
- `pnpm typecheck` (builds `shared`, then `tsc --noEmit` across
  shared/server/desktop/web) — PASS, all four "Done", exit 0.
- `pnpm build` (full monorepo: shared + server + desktop + web incl.
  `vite build`, 116 modules) — PASS, exit 0.
- `git diff` shows only the four `package.json` files + `pnpm-lock.yaml` —
  **zero source-code changes**.

### Codebase TS-surface audit (TS-7-sensitive patterns)

Audited `packages/**` and `apps/**` source (excluding `node_modules`/`dist`):

- **Zero** `any` / `as any` / `: any`.
- **Zero** `@ts-ignore` / `@ts-expect-error`.
- **No `enum` declarations.**
- **No constructor parameter properties** (`constructor(private x)`).
- `import type` / `export type` used throughout `packages/shared/src`,
  `apps/web/src`, and `apps/desktop/src` — `verbatimModuleSyntax: true`
  (ADR-0001) is satisfied; desktop overrides to `false` for CJS (scoped
  deviation, ADR-0001) — unaffected.
- Module resolution: `NodeNext` (shared/server/desktop) + `Bundler` (web);
  `workspace:*` imports — all resolve cleanly.
- Zod 4's own type definitions compile clean under TS 7 (`shared` + `server`
  build pass).

### Runtime reality for `@types/node`

- **Server** production runtime: `node:20` / `node:20-alpine` (Dockerfile,
  ADR-0007). Root `engines.node` is `^20.19.0 || >=22.12.0` (ADR-0009); CI runs
  Node 20.x.
- **Desktop** runtime: Electron 43, which embeds Node 24 (ADR-0010).
- **Web**: browser — no Node runtime; no `@types/node`.
- ADR-0010 already established `@types/node ^20.14.0` for desktop and called a
  bump "cosmetic and not blocking."

## Options considered

### Adopt TypeScript 7 vs. pin TypeScript 5.9
- **Adopt TS 7.0.2** (chosen). It is a verified drop-in: full typecheck + full
  build pass with zero source changes; the native binary resolves via pnpm; the
  audited codebase surface uses none of the patterns TS 6/7 tightens (`any`,
  enums, parameter properties, `@ts-ignore`). `engines.node >=16.20.0` means
  CI's Node 20.x is supported — no CI change is required for the TS bump
  itself. A Dependabot major bump is the natural adoption moment.
- **Pin TS 5.9.** Avoids the native-binary transition now, but the build is
  already green on 7.0.2 and staying on 5.9 ages the compiler with no
  compensating benefit. Rejected.

### `@types/node`: accept 26 vs. pin to the runtime floor
- **(a) Accept `@types/node 26` as-is** — rejected. `@types/node` is dev-only
  types, but its purpose is to describe the runtime API surface *available*.
  The server's production runtime is Node 20 (Dockerfile); `@types/node` 26
  declares Node 22/24/26 APIs that do **not** exist on `node:20`. With 26, the
  compiler would type-check a call to a newer API that then crashes at runtime
  on the server — the type system stops being a guardrail and becomes a
  permissive pass. This is the decisive reason not to accept 26 for the server.
- **(b) Pin `@types/node` to `^20` (the Node 20 runtime major)** in
  `apps/server` and `apps/desktop` (chosen). Types at or below the runtime
  floor are always safe (you cannot type-check an API the runtime lacks). For
  the server this matches the Node 20 runtime exactly, so the compiler rejects
  Node 22+ APIs that would crash in production. For desktop it is conservative
  (Electron 43's Node 24 is a superset of Node 20) and matches ADR-0010's
  accepted `^20.14.0`. This is the documented best practice (DefinitelyTyped /
  TS handbook: install `@types/node` matching your minimum Node). Near-zero
  cost — the codebase uses only stable Node APIs (fs/path/url/http/ws/stream),
  so typecheck stays green.
- **(c) Split — server `^20`, desktop `^24`** (Electron 43's Node 24). More
  precise for desktop's actual runtime, and pnpm already co-resolves multiple
  `@types/node` majors in the store. Rejected as the *default*: desktop uses a
  stable subset present in Node 20 (ADR-0010 audit), so `^24` buys nothing today
  and adds lockfile divergence. Noted as a future option if desktop ever needs
  a Node-24-only main-process API.

### `sync-versions.mjs` and TS 7's package structure
- `scripts/sync-versions.mjs` propagates only the root `package.json` `version`
  field into each workspace package's `version` field (ADR-0007). It does **not**
  touch `typescript` or `@types/node` versions, so TS 7's new native-binary
  `optionalDependencies` model has **no effect** on it. **No change required.**

### CI Node version for the TS 7 bump
- TS 7.0.2 declares `engines.node: ">=16.20.0"` — it does **not** require Node
  22. CI on Node 20.x already satisfies this; **no CI change is required for
  the TS 7 bump.** (Separately, ADR-0010 already flagged moving CI/release
  runners to Node 22.x for Electron 43's `>=22.12.0` floor — that is an
  independent, already-tracked Ops follow-up, not introduced by this ADR.)

## Decision

1. **Adopt `typescript@^7.0.2`** in the root `package.json` and in
   `apps/{web,server,desktop}/package.json`. Merge PR #5's TypeScript bump.
   **No source-code changes** — verified: full `pnpm typecheck` and `pnpm build`
   pass with zero code changes; the audited TS-7-sensitive surface (`any`,
   enums, parameter properties, `@ts-ignore`, `verbatimModuleSyntax`,
   `NodeNext`/`Bundler`, `workspace:*`, Zod 4 interop) is clean.

2. **Do NOT adopt `@types/node 26`. Pin `@types/node` to `^20`** in
   `apps/server` and `apps/desktop` (restore from the PR's `^26.1.1`; the
   pre-bump value was `^20.14.0` — pin to the `^20` major, optionally
   `^20.19.0` to match the `engines.node` floor exactly). Rationale: the
   server's production runtime is `node:20`; `@types/node` must not describe
   APIs absent at runtime. `apps/web` is unaffected (no `@types/node`). This is
   a **modification to PR #5** — the TS 7 bump is accepted, the `@types/node 26`
   bump is rejected and pinned to `^20`.

3. **`scripts/sync-versions.mjs` is unchanged.** It only syncs the package
   `version` field and is independent of the TypeScript package structure. No
   update for TS 7.

4. **No CI change is required for the TS 7 bump** (`engines.node >=16.20.0`).
   The ADR-0010 CI→22.x follow-up for Electron remains a separate Ops item.

5. **Root `engines.node` is unchanged** (`^20.19.0 || >=22.12.0`). TS 7 does
   not raise the floor.

## Consequences

- ✅ Monorepo on TypeScript 7.0.2. Verified drop-in: `shared` build, full
  `typecheck` (shared/server/desktop/web), and full `build` (incl. `vite build`)
  all pass with zero source changes. Native binary
  (`@typescript/typescript-<plat>-<arch>`) resolves via the pnpm store.
- ✅ `@types/node` pinned to `^20` (Node 20 major) in `server` + `desktop`.
  The type system remains a guardrail against Node 22+ APIs that would crash on
  the `node:20` server. Desktop on `^20` is conservative vs Electron 43's
  Node 24 and matches ADR-0010's accepted state.
- ✅ The audited TS-7 compatibility scope is recorded here so no agent re-runs
  the investigation: zero `any`/`as any`/`: any`/`@ts-ignore`/
  `@ts-expect-error`; no `enum`; no constructor parameter properties;
  `import type`/`export type` + `verbatimModuleSyntax` compliant;
  `NodeNext`/`Bundler` + `workspace:*` resolve cleanly; Zod 4 types compile
  under TS 7.
- ✅ `scripts/sync-versions.mjs` is unaffected — confirmed it touches only the
  `version` field.
- ⚠️ **PR #5 modification:** the Dependabot PR lands TS 7.0.2 but its
  `@types/node ^26.1.1` bump in `apps/server` and `apps/desktop` must be
  reverted to `^20` before merge. Route to whoever lands the PR (Orchestrator).
  The `apps/web` TS bump and root TS bump are accepted as-is.
- ⚠️ **Future: if the server moves to Node 22 LTS** (ADR-0007 Dockerfile bump),
  raise `@types/node` to `^22` to match; if desktop needs a Node-24-only
  main-process API, raise desktop-only `@types/node` to `^24` (Electron 43's
  Node 24). Until then, `^20` is the pin.
- ⚠️ **Native-binary adoption note:** TS 7's `preferUnplugged: true` +
  per-platform optional deps mean the install fetches one native binary per
  platform; offline/air-gapped CI must allow the `@typescript/typescript-*`
  package. Non-issue for standard GitHub Actions runners.
- ⚠️ **PR-body hygiene:** the Dependabot PR body references "TypeScript 6.0.3"
  release notes while the package is 7.0.2; the adopted version is 7.0.2 (the
  installed package). No action beyond this note.

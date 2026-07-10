# ADR-0012 — Target Node 24 LTS as the unified runtime floor

- **Date:** 2026-07-10
- **Status:** Accepted
- **Owner:** Architect
- **Supersedes:** ADR-0011 (the Node-20 floor / `@types/node ^20` pin part only;
  the TypeScript 7 adoption part of ADR-0011 is carried forward)
- **Related:** ADR-0001 (stack & layout — `engines.node` floor),
  ADR-0007 (CI/release — Node runners + `node:` Dockerfile; Ops↔Desktop boundary),
  ADR-0009 (React 19 + Vite 8 — raised `engines.node` to
  `^20.19.0 || >=22.12.0`),
  ADR-0010 (Electron 43 — embeds Node 24; `@types/node ^20` "cosmetic"),
  ADR-0011 (TypeScript 7 + `@types/node` — **rejected** on the Node-20/`^20`
  pin; TS 7 part stands)

## Context

ADR-0011 adopted TypeScript 7.0.2 (sound — verified drop-in, full typecheck +
build pass with zero source changes) but, in the same decision, **pinned
`@types/node` to `^20`** and **kept the Node 20 runtime floor** for the server,
arguing: `@types/node` must describe the runtime API surface *available*, and
the server's production runtime is `node:20`, so `@types/node 26` would let the
compiler type-check Node 22/24/26 APIs that crash at runtime on the server.

That reasoning is correct **as a principle** (types should match the runtime
floor), but the **conclusion** it pointed to — "stay on Node 20, pin types down
to `^20`" — is rejected by directive. The directive: **move the whole stack to
the latest Node LTS.**

### What "latest LTS" means here

Today is 2026-07-10. The Node release schedule:

- **Node 24** is **Active LTS** (since October 2025). It is the current *latest
  LTS*.
- Node 26 is "Current" (non-LTS); it does **not** become LTS until October 2026.
- Node 22 is in **maintenance** (LTS until April 2027, then EOL).

So "latest LTS" = **Node 24**, not 26.

### The split ADR-0011 created (and that Node 24 resolves)

ADR-0011 left the monorepo on a split:

- **Server** runtime: `node:20` / `node:20-alpine` (Dockerfile, ADR-0007).
  `@types/node ^20` (matches).
- **Desktop** runtime: **Electron 43, which embeds Node 24** (ADR-0010).
  `@types/node ^20` (conservative; ADR-0010 called a bump "cosmetic and not
  blocking").
- **CI** runners: Node 20.x (ADR-0007).
- Root `engines.node`: `^20.19.0 || >=22.12.0` (ADR-0009).

So desktop's *actual* runtime (Node 24, via Electron 43) already ran ahead of the
server's (Node 20), and `@types/node ^20` was a conservative under-approximation
for desktop. ADR-0011's own core argument — "*`@types/node` must not declare APIs
absent at runtime; the type system must stay a guardrail*" — was satisfied by
**pinning the types down** to the (low) runtime floor. The same guardrail
property can be satisfied the *other* way: **raise the runtime floor up** to
match a single, higher `@types/node` major. That is what this ADR does, and it
eliminates the split entirely.

### Unification on Node 24

- **Electron 43 embeds Node 24** (ADR-0010). Targeting Node 24 LTS for the
  server means the server runtime (Node 24) and the desktop runtime (Electron
  43's Node 24) are now the **same Node major**.
- `@types/node ^24` therefore describes APIs that exist on **both** runtimes
  (server Node 24 and desktop's Electron-43 Node 24). The type system stays a
  guardrail — ADR-0011's principle, now satisfied by raising the runtime instead
  of pinning the types down — and there is no longer a per-app `@types/node`
  divergence to track.
- CI runners on Node 24.x and the server Dockerfile on `node:24` /
  `node:24-alpine` match the floor, so the gate runs the same Node the runtimes
  target.

### TypeScript 7 (carried forward, not re-litigated)

TypeScript 7.0.2 stays (adopted in ADR-0011, verified drop-in, native binary
resolves via the pnpm store). **The TS 7 part of ADR-0011 is explicitly NOT
rejected** — only ADR-0011's Node-20 floor and `@types/node ^20` pin are
superseded. TS 7.0.2's `engines.node >=16.20.0` is trivially satisfied by
Node 24.

## Options considered

### Runtime floor: Node 24 LTS vs. Node 22 (maintenance) vs. Node 26 (Current)
- **Node 24 LTS (chosen).** Active LTS = the supported, "latest LTS" target. It
  matches Electron 43's embedded Node 24 exactly (unifies server + desktop).
  CI runners, `node:24` Docker images, and `@types/node ^24` all exist and are
  current. Resolves the ADR-0011 split with no compromise.
- **Node 22 (maintenance).** Still LTS until April 2027, so technically
  supportable, but it is *not* "latest LTS" and it does **not** match Electron
  43's Node 24 — it would preserve a server/desktop split (22 vs 24). Rejected:
  the directive is "latest LTS," and Node 22 keeps the very divergence this ADR
  exists to remove. Also drops off the active-LTS support line sooner.
- **Node 26 (Current).** Not LTS until Oct 2026; using a non-LTS "Current" line
  as a production floor is contrary to the "latest **LTS**" directive and to
  stability for a release pipeline. Rejected as the *target* (local dev on
  26.3.0 is fine since it satisfies `>=24`, but it is not the declared floor).

### `@types/node`: `^24` vs. `^20` (keep) vs. `^26`
- **`@types/node ^24` (chosen)** in `apps/server` and `apps/desktop`. Matches the
  Node 24 runtime floor on both server and desktop (Electron 43's Node 24). The
  type system remains a guardrail: it declares exactly the API surface present
  on the runtimes, so the compiler rejects APIs absent on Node 24. This is the
  documented best practice (install `@types/node` matching your minimum Node),
  now applied with the *raised* floor.
- **`@types/node ^20` (ADR-0011's choice).** Would remain a conservative
  under-approximation for desktop (Node 24 superset) and would *under-describe*
  the server's own Node 24 runtime — needlessly forbidding Node 24 APIs the
  server can in fact use, and leaving the desktop/server type pin out of sync
  with the (now 24) runtime. Rejected: it preserves the divergence and the
  under-description this ADR removes.
- **`@types/node ^26`.** `@types/node` tracks the Node *Current* line's typings;
  26 would again declare APIs (Node 26-only) absent on the Node 24 runtime,
  re-introducing the exact "type-checks an API that crashes at runtime" problem
  ADR-0011 flagged against 26. Rejected for the same reason ADR-0011 rejected 26:
  types must not exceed the runtime floor.

### `tsconfig.base.json` `target`/`lib`: ES2024 vs. ES2023 vs. keep ES2022
- **`target: ES2024`, `lib: ["ES2024"]` (chosen).** Node 24 fully implements
  ES2024 (`Promise.withResolvers`, `Object.groupBy`/`Map.groupBy`,
  `Atomics.waitAsync`, well-formed Unicode strings, `RegExp` `v` flag with set
  notation). Raising `target`/`lib` to match the Node 24 floor is the
  consistent move: emitted JS is ES2024 (Node 24 runs it natively — no
  downleveling needed), and the type checker exposes the ES2024 standard
  library that the runtime actually provides. For the web app, `target`/`lib`
  only govern `tsc --noEmit` (Vite/esbuild does the real build transpilation);
  modern Android browsers support ES2024, so it is safe there too. Zero source
  changes — bumping `lib` only *permits* ES2024 APIs; it forces none.
- **`ES2023`.** Also fully supported by Node 24 and a safe, conservative bump.
  Rejected only in that it stops one year short of the floor's actual
  capability; ES2024 is the matching choice for a Node 24 target.
- **Keep `ES2022`.** Works, but leaves `target`/`lib` a year behind the Node 24
  runtime for no benefit. Rejected as inconsistent with moving to latest LTS.

## Decision

1. **Target Node 24 LTS as the unified runtime floor.** Raise root
   `engines.node` from `^20.19.0 || >=22.12.0` to **`>=24.0.0`**. This drops
   Node 20 and Node 22 support; Node 24 (active LTS) is the floor. (Local dev on
   Node 26.3.0 satisfies `>=24.0.0`.)

2. **Raise `@types/node` to `^24`** in `apps/server` and `apps/desktop`
   (from `^20.14.0`). `apps/web` is unaffected — it has no `@types/node`
   (browser app). This matches the Node 24 floor on both the server runtime
   and desktop's Electron 43 (Node 24) runtime, so the type system stays a
   guardrail and the server/desktop type pin is unified.

3. **CI runners → Node 24.x; server Dockerfile → `node:24` (build) +
   `node:24-alpine` (runtime)**, amending ADR-0007. (Edit spec handed to Ops;
   this ADR does not edit those files — scope boundary.)

4. **Bump `tsconfig.base.json` `target`/`lib` from `ES2022` to `ES2024`** to
   match the Node 24 runtime floor. (Applied in this ADR — `tsconfig.base.json`
   is Architect scope.)

5. **Keep TypeScript 7.0.2** (root + all apps). The TS 7 adoption from
   ADR-0011 is carried forward unchanged. **Only** ADR-0011's Node-20 floor and
   `@types/node ^20` pin are rejected/superseded.

6. **`packages/shared` needs no change** — it has no `typescript` devDep and
   `zod` is already `^4.4.3`. (Confirmed; no edit.)

## Consequences

- ✅ **Unified runtime floor:** server (Node 24) + desktop (Electron 43 → Node
  24) + CI (Node 24.x) + Dockerfile (`node:24`/`node:24-alpine`) +
  `@types/node ^24` all match one Node major. The ADR-0011 split (server 20 /
  desktop 24 / types ^20) is gone.
- ✅ **Type system stays a guardrail** (ADR-0011's principle, now satisfied by
  raising the runtime): `@types/node ^24` declares exactly the API surface
  present on both runtimes; no over-permissive types that crash at runtime.
- ✅ **TypeScript 7.0.2 retained** — native binary resolves via pnpm (verified
  in ADR-0011). No re-litigation of the TS 7 adoption.
- ✅ **`tsconfig.base.json` at ES2024** matches the Node 24 floor; no
  downleveling, ES2024 standard library available to the type checker. Zero
  source changes (bumping `lib` only permits, never forces).
- ⚠️ **Drops Node 22 support.** Node 22 is in maintenance (LTS until April
  2027) but is *not* latest LTS and does not match Electron 43's Node 24.
  Consumers on Node 22 must move to Node 24 LTS. Acceptable per the "latest LTS"
  directive.
- ⚠️ **Per-file edit spec handed to other agents** (see ADR's handoff to the
  Orchestrator): Backend edits `apps/server/package.json` (`@types/node ^20.14.0`
  → `^24`); Desktop edits `apps/desktop/package.json` (same); Ops edits
  `.github/workflows/ci.yml` (1 spot) + `.github/workflows/release.yml` (2 spots)
  `node-version: 20.x` → `24.x`, and `apps/server/Dockerfile`
  `node:20` → `node:24` + `node:20-alpine` → `node:24-alpine` (and its comment).
  Frontend: no changes. **None of these agents run `pnpm install`/`pnpm build`**
  — the Orchestrator runs the integration build after all agents finish.
- ⚠️ **Reconciliation with prior ADRs (informational, no re-edit of those ADRs
  required — this ADR is authoritative for the Node floor going forward):**
  - **ADR-0007** ("CI runners Node 20.x; Dockerfile `node:20`/`node:20-alpine`")
    is amended to Node 24 by this ADR (Decision 3).
  - **ADR-0009** (`engines.node` `^20.19.0 || >=22.12.0`) is raised to
    `>=24.0.0` by this ADR (Decision 1).
  - **ADR-0010** ("desktop `@types/node ^20` cosmetic and not blocking") is
    resolved — desktop now uses `^24`, matching Electron 43's Node 24.
  - **ADR-0011** is marked **Rejected** (only its Node-20/`^20` pin); its TS 7
    adoption is carried forward here.

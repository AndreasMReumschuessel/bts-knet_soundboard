# ADR-0010 — Adopt Electron 43 + electron-builder 26

- **Date:** 2026-07-10
- **Status:** Accepted
- **Owner:** Architect
- **Supersedes:** none
- **Related:** ADR-0001 (stack & layout — Electron chosen; `engines.node` floor),
  ADR-0005 (hotkey model — `globalShortcut`), ADR-0007 (CI/release — Ops↔Desktop
  packaging boundary; CI uses Node 20.x), ADR-0009 (React 19 + Vite 8 — raised
  root `engines.node` to `^20.19.0 || >=22.12.0`)
- **Amended by:** ADR-0012 (desktop `@types/node` raised from `^20` to `^24`, matching Electron 43's embedded Node 24)

## Context

Dependabot PR #8 bumps the desktop toolchain in `apps/desktop/package.json`:

- `electron` `31.3.1 → 43.1.0` (12 major versions).
- `electron-builder` `24.13.3 → 26.15.3` (2 major versions).

The PR touches only `apps/desktop/package.json` + the regenerated `pnpm-lock.yaml`
— **zero source code changes**. The verified diff is exactly two version strings
(`electron: ^43.1.0`, `electron-builder: ^26.15.3`).

The combined bump was applied to a worktree off `main` at `8f66937` (which
includes merged PRs #9, #12, #13 — Zod 4, `z.iso.datetime`, React 19 + Vite 8).
A clean install (deleted `node_modules` + lockfile, fresh `pnpm install`)
produced **no peer-dependency warnings**. Verified results (trusted; not re-run
by this ADR):

- `pnpm install` (clean) — OK, no peer warnings.
- `pnpm -F @bts-soundboard/shared build` — PASS.
- `pnpm -F @bts-soundboard/desktop typecheck` — PASS (0 errors).
- `pnpm -F @bts-soundboard/desktop build` — PASS.
- `pnpm build` (full monorepo: shared + server + desktop + web) — PASS (all exit 0).
- `git diff` shows only `apps/desktop/package.json` (2 lines) + `pnpm-lock.yaml`.

### Electron API-surface audit (`apps/desktop/src/{main,preload,hotkeys,ipc}.ts`)

The entire Electron API surface the app uses is:

- `app`: `isPackaged`, `requestSingleInstanceLock()`, `quit()`, `whenReady()`,
  `on("second-instance"|"activate"|"window-all-closed"|"before-quit")`,
  `getPath("userData")`.
- `BrowserWindow`: constructor with `webPreferences` (`preload`,
  `contextIsolation: true`, `nodeIntegration: false`, `sandbox: false`),
  `loadURL()`, `loadFile()`, `webContents.openDevTools()`, `webContents.send()`,
  `on("closed")`, `isDestroyed()`, `isMinimized()`, `restore()`, `focus()`,
  `BrowserWindow.getAllWindows()`.
- `globalShortcut`: `register(accelerator, cb)`, `unregister(accelerator)`,
  `unregisterAll()`.
- `ipcMain`: `handle(channel, handler)`.
- `contextBridge`: `exposeInMainWorld(name, bridge)`.
- `ipcRenderer`: `invoke()`, `on()`, `off()`.
- `IpcRendererEvent` (imported as type).

### Electron 31→43 breaking changes evaluated

- **Node engine:** Electron 43's npm package declares `engines.node >= 22.12.0`
  (embedded runtime is Node 24). The project's root `engines.node` is
  `^20.19.0 || >=22.12.0` (set by PR #13 / ADR-0009). pnpm does not enforce
  engines strictly (no `.npmrc` with `engine-strict`), so `pnpm install` on
  Node 20.x warns but succeeds and the build passes. The CI/release runners use
  `node-version: 20.x` (ADR-0007). See the Node/CI decision below.
- **`sandbox: true` default** in newer Electron. Our code explicitly sets
  `sandbox: false` in `webPreferences` — non-issue.
- **Electron 43 is the last 32-bit version.** We build only `win.x64` — non-issue.
- **Download behavior change** (downloaded files open in the Downloads folder).
  Our app does not use Electron's download API — non-issue.
- **Linux frameless-window rounded corners.** We are Windows-only — non-issue.

So **none** of the Electron 31→43 breaking changes touch the audited API surface.

### electron-builder 24→26 changes evaluated

- electron-builder 26 replaced the Go-based `app-builder-bin` native helper with
  a TypeScript implementation. Our NSIS config
  (`apps/desktop/electron-builder.yml`) is a simple, standard config (`appId`,
  `productName`, `directories`, `files`, `extraResources`, `win.target: nsis
  x64`, `nsis` options) and is config-compatible with v26.
- The `electron-builder-squirrel-windows` peer at 26.x resolved correctly after
  the clean install (no peer warnings).

## Options considered

### Adopt Electron 43 + electron-builder 26 vs. pin 31/24
- **Adopt** (chosen). It is a verified drop-in for the audited API surface and
  the simple NSIS config: clean install, full monorepo build, and desktop
  typecheck all pass with zero code changes. A Dependabot major bump is the
  natural adoption moment, and staying on Electron 31 ages a core dependency
  (Electron 31 is EOL) with no compensating benefit.
- **Pin Electron 31 / electron-builder 24.** Avoids review now but forgoes
  security/feature updates and leaves a 12-major Electron jump unaddressed; the
  same compatibility audit recurs on the next bump. Electron 31 is already EOL.
  Rejected.

### CI/runner Node version: bump to 22.x vs. leave at 20.x
- **Bump CI + release runners to Node 22.x** (chosen; flagged to Ops — Ops owns
  workflows per ADR-0007). Electron 43's npm package officially requires Node
  `>= 22.12.0`. CI at 20.x "works" today (pnpm is not engine-strict), but it
  tests in a configuration Electron itself does not officially support. The
  release `package-desktop` job is the riskiest path — it runs electron-builder
  26 (now TS-based) + Electron 43 to produce the NSIS installer on
  `windows-latest`, and should run on the Node version Electron 43 officially
  supports. Node 22 is active LTS. Chosen.
- **Leave CI at 20.x.** Works today (verified), but ships installers built under
  an unsupported Node configuration and produces engine warnings on every run.
  Rejected as the release-pipeline posture.

### Root `engines.node`: bump vs. leave
- **Leave `engines.node` as `^20.19.0 || >=22.12.0`** (chosen). This range is the
  *project* minimum (it governs `shared`, `server`, and `web` which only need
  ≥ 20.19 per Vite 8 / ADR-0009). Electron 43's `>= 22.12.0` floor is enforced by
  the `electron` package's own `engines` field, not the root. The desktop build
  environment using Node 22.x is a runner choice (CI/release), not an `engines`
  statement. No root change needed.

## Decision

1. **Adopt** `electron@^43.1.0` and `electron-builder@^26.15.3` in
   `apps/desktop`. Merge PR #8. No source-code changes are required — the
   audited Electron API surface is untouched by every 31→43 breaking change, and
   the NSIS config is config-compatible with electron-builder 26.

2. **No Desktop code changes.** `apps/desktop/src/**` and
   `apps/desktop/electron-builder.yml` are unchanged. `sandbox: false` stays
   explicit. The Desktop agent owns these files (ADR-0007); this ADR records
   that no edit is needed for the bump.

3. **Root `engines.node` is unchanged** (`^20.19.0 || >=22.12.0`). Electron 43's
   Node floor is a per-package `engines` requirement, satisfied by running the
   desktop build on Node 22.x — not a root-engine change.

4. **CI + release runners → Node 22.x — flagged to Ops (workflow-owner).** Per
   ADR-0007 the Ops agent owns `.github/workflows/**`. The `node-version: 20.x`
   in `ci.yml` (line 33) and in `release.yml` (`build-web-server` line 44,
   `package-desktop` line 81) should move to `22.x`. The `package-desktop` job
   is the priority: it runs electron-builder 26 + Electron 43 natively on
   `windows-latest` and must run on the Node version Electron 43 officially
   supports. This is a coordination handoff, not an Architect edit.

## Consequences

- ✅ Desktop toolchain on Electron 43.1.0 + electron-builder 26.15.3. Verified:
  clean `pnpm install` (no peer warnings), full `pnpm build` green, desktop
  typecheck green — all with zero code changes.
- ✅ The audited compatibility scope is recorded here so no agent re-runs the
  investigation: the app uses none of Electron 43's breaking surfaces (the
  `sandbox` default, 32-bit drop, download behavior, Linux frameless corners),
  and the NSIS config is simple enough to be config-compatible with
  electron-builder 26's TS internals.
- ✅ electron-builder 26's TS-based implementation removes the Go `app-builder-bin`
  native binary — one fewer native-binary download in CI. The NSIS packaging
  path is unchanged from the config's perspective.
- ⚠️ **Ops follow-up (workflow-owner, ADR-0007):** bump `node-version` to `22.x`
  in `ci.yml` and all `release.yml` jobs. The `package-desktop` job on
  `windows-latest` is the critical path. Verify the electron-builder 26
  (TS-based) packaging still produces a working NSIS `.exe` on the runner — the
  local worktree verified `pnpm -F @bts-soundboard/desktop build`, but the
  actual `electron-builder --win nsis` packaging step was not run in the
  worktree (no code-signing cert / Windows host). The first release tag after
  this bump is the live validation of the installer.
- ⚠️ **Ops follow-up (optional):** the server `Dockerfile` base
  (`node:20`→`node:20-alpine`, ADR-0007) does not use Electron and needs no
  change. Ops *may* bump it to `node:22`/`node:22-alpine` for LTS alignment;
  not required by any dependency.
- ⚠️ **No code signing in v1** (per ADR-0007). Electron 43 + electron-builder 26
  do not change the signing story — still no signing, SmartScreen still warns.
  Adding signing remains a documented follow-up: cert in
  `WINDOWS_CERT`/`WINDOWS_CERT_PASSWORD`, signing block in
  `electron-builder.yml` (Desktop-owned), cert env passed through the release
  workflow (Ops-owned).
- ⚠️ **`@types/node` is `^20.14.0`** in `apps/desktop`. Electron 43 embeds
  Node 24, but `@types/node` 20.x is the type definitions for the *main-process
  Node API the code calls* (which is a stable subset). typecheck passes, so no
  change is required. A future bump to `@types/node` 22 is cosmetic and not
  blocking.

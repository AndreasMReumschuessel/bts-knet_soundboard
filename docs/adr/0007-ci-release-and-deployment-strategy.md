# ADR-0007 — CI, release & deployment strategy

- **Date:** 2026-07-10
- **Status:** Accepted
- **Owner:** Architect
- **Supersedes:** none
- **Related:** ADR-0001 (stack & layout), ADR-0003 (REST), ADR-0005 (hotkey/desktop)
- **Amended by:** ADR-0012 (CI runners + Dockerfile base moved from Node 20 to Node 24 LTS)

## Context

The monorepo is scaffolded (ADR-0001): `apps/web` (React PWA, Vite), `apps/desktop`
(Electron, NSIS), `apps/server` (Node/TS, REST + WS), and `packages/shared` (types +
Zod). All four workspace packages currently share `version: "0.1.0"`; root
`packageManager: pnpm@9.12.0`, `engines.node >= 18`. Root scripts already exist:
`build` (`pnpm -r build`), `build:shared`, `typecheck` (`pnpm -r typecheck`),
`lint` (`pnpm -r lint`), `dev`/`dev:web`/`dev:server`/`dev:desktop`. There is no
`.github/` directory yet.

We need to decide, before implementation agents fan out: (1) how CI gates PRs and
`main`, (2) the versioning scheme, (3) the release pipeline that produces a
Windows NSIS installer + PWA build + server image, (4) how the server is deployed
to a single LXC container on a Proxmox host (no cloud provider, no Terraform/
Pulumi), and (5) the CI-vs-runtime secrets boundary. This ADR is the basis for a
new **Ops** agent (subagent) that will own `.github/workflows/**`, root
release/versioning scripts, the server `Dockerfile` + LXC deploy script, and
release-artifact packaging.

A key boundary must be made explicit up front: the **Desktop agent owns the
electron-builder *config*** (`apps/desktop/electron-builder.yml`, NSIS target,
signing, `extraResources`); **Ops owns the workflow that invokes that config in
CI and the release that uploads the resulting installer.**

## Options considered

### CI runner strategy
- **Single CI job, single Node version, `ubuntu-latest`** (chosen) vs. a Node
  OS matrix vs. per-app pipelines.
  - The project targets one server runtime (Node), browsers for the PWA, and
    Electron for desktop. A matrix of Node versions adds runtime coverage we
    don't need at v1, and OS variation belongs only to the desktop-packaging
    step (a release-time concern, handled separately). A single fast job keeps
    PR feedback tight.
  - Pin Node 20 (active LTS, satisfies `>=18`) on `ubuntu-latest`. The desktop
    NSIS packaging runs on `windows-latest` in the release pipeline, not in PR
    CI (see below).
  - Chosen: one PR-gate job on `ubuntu-latest`, Node 20.x.

### CI steps & ordering
- **`pnpm install` (cached) → `pnpm lint` → `pnpm typecheck` → `pnpm build`**
  (chosen). pnpm's recursive `-r` runs respect workspace topological order, so
  `packages/shared` builds before `apps/web`, `apps/server`, and `apps/desktop`.
  No manual `build:shared` step is required in CI (though the script exists for
  local dev). Tests (when added) run after build. vs. a Turbo/Nx build cache —
  overkill at v1.
  - pnpm cache: `pnpm/action-setup@v4` + `actions/setup-node@v4` with
    `cache: pnpm` and `node-version: 20.x`.
  - Chosen: install → lint → typecheck → build → (tests). Fail fast on lint.

### Versioning scheme
- **Single shared version sourced from root `package.json`** (chosen) vs.
  Changesets (per-package, auto-changelog) vs. git-tags-only.
  - Nothing is published to npm (all packages are `private: true`), and the
    web/desktop/server ship together in one coordinated release. Changesets'
    independent per-package versioning + auto-changelog is designed for
    publishable libraries; here it adds ceremony with no benefit. Git-tags-only
    loses a single machine-readable version source. A single root version that
    propagates to all workspace packages is the simplest correct model.
  - Version source: root `package.json` `version` (canonical). A small
    `scripts/sync-versions.mjs` (Ops-owned) propagates the root version into
    every `apps/*/package.json` and `packages/*/package.json` so all four stay
    in lockstep. Release tag: `v<version>` (e.g. `v0.2.0`).
  - Bump command: `pnpm version <major|minor|patch>` at root, then
    `pnpm sync-versions` (a root script wrapping `scripts/sync-versions.mjs`),
    then commit + tag. No per-package bumping.
  - Chosen: single root version + sync script + `v*` tag.

### Changelog generation
- **Commit-derived changelog at release time** (chosen) vs. a maintained
  `CHANGELOG.md` vs. Changesets-generated.
  - The catalog is small and releases are infrequent; deriving the GitHub
    Release body from `git log v<prev>..v<curr> --oneline` (or conventional-
    commit grouping) is zero-maintenance. A hand-maintained `CHANGELOG.md` is
    optional and additive; it is not required. Chosen: release workflow
    generates the body from commits between tags.

### Release pipeline trigger
- **Tag-triggered (`v*`) + manual `workflow_dispatch`** (chosen) vs. push-to-main
  auto-release vs. release-branch.
  - A tag is an explicit, auditable release act; `workflow_dispatch` gives a
    manual escape hatch. Auto-releasing on every main push would ship unstable
    builds. Chosen: trigger on `push: tags: ['v*']` plus `workflow_dispatch`.

### Release jobs & artifacts
- **Three jobs: `build` (ubuntu) → `package-desktop` (windows) → `release`
  (ubuntu, depends on both).** (chosen)
  - `build`: install → `pnpm build`. Produces `apps/web/dist` (PWA) and
    `apps/server/dist`. Uploads them as workflow artifacts for the release job.
  - `package-desktop` (runs on `windows-latest`, Node 20): install → build
    shared + web + desktop, then `pnpm -F @bts-soundboard/desktop package`
    (invokes `apps/desktop/electron-builder.yml` → NSIS `.exe` in
    `apps/desktop/dist-electron/`). Uploads `*.exe` as an artifact.
    - electron-builder cross-building Windows NSIS on Linux needs Wine and is
      flaky; running it natively on `windows-latest` is reliable. The
      `extraResources` map in `electron-builder.yml` already pulls `../web/dist`
      into the asar, so the web build must precede packaging on the same runner.
  - `release` (needs `build` + `package-desktop`): creates a GitHub Release on
    the tag, writes the commit-derived changelog as the body, and attaches:
    the NSIS `.exe` (required), a PWA zip of `apps/web/dist` (optional), and a
    server image (built+pushed separately — see LXC deploy). Uses the
    automatic `GITHUB_TOKEN` for release creation; no PAT needed.
  - Chosen: three jobs as above. Desktop config is invoked, not duplicated.

### Server deployment target & mechanism
- **Docker image via GHCR + SSH deploy to a single LXC** (chosen) vs. SSH +
  bare `git pull` + `pnpm build` + systemd restart vs. cloud IaC.
  - Target is one LXC container on a Proxmox host (single-host, no cloud). No
    Terraform/Pulumi. A Docker image gives reproducible, hermetic deploys and a
    clean rollback (previous image tag); a bare `git pull` build is slower and
    drift-prone. Cloud IaC is explicitly out of scope (no cloud provider).
  - `apps/server/Dockerfile` (Ops-owned): multi-stage — `node:20` build stage
    (`pnpm install`, `pnpm build:shared`, `pnpm -F @bts-soundboard/server
    build`), then a `node:20-alpine` runtime stage copying `dist/` + production
    `node_modules`. Server deps are pure Node (`ws`, `busboy`, `mp3-duration`,
    `zod`) — no native modules, so the alpine runtime is safe.
  - A `docker-compose.yml` (Ops-owned) on the LXC runs the image with
    `restart: unless-stopped`, exposes `${BTS_SERVER_PORT:-8080}`, and
    bind-mounts a host `./data/sounds` → container `BTS_SOUNDS_DIR` so uploaded
    sounds persist across deploys/restarts.
  - Deploy: the release pipeline builds and pushes
    `ghcr.io/<owner>/bts-soundboard-server:<version>` (+ `:latest`) to GHCR
    using the automatic `GITHUB_TOKEN`. A `scripts/deploy-lxc.sh` (Ops-owned)
    SSHes into the LXC (key = GitHub secret `LXC_SSH_KEY`), `docker compose
    pull`, `docker compose up -d --remove-orphans`. Rolling back = re-running
    deploy with a previous tag.
  - **Provisioning the LXC itself on Proxmox** (creating the container,
    installing Docker, networking) is **out of scope** for this ADR and the Ops
    agent; it is a manual ops runbook item. The ADR assumes a Docker-capable
    LXC with SSH access already exists.
  - WS/REST exposure: the single port `BTS_SERVER_PORT` (default 8080) carries
    both REST and WS (`/ws`). The LXC exposes that port; clients reach it via
    the host's address. No separate WS port.
  - Chosen: GHCR image + SSH `docker compose` pull/restart on one LXC.

### Secrets boundary
- **CI secrets in GitHub Actions secrets; runtime secrets on the LXC env file.**
  (chosen)
  - CI secrets: `LXC_SSH_KEY` (deploy SSH private key),
    `WINDOWS_CERT`/`WINDOWS_CERT_PASSWORD` (code-signing, when/if added — not
    v1), and the automatic `GITHUB_TOKEN` (release creation + GHCR push, no
    manual secret). No other CI secrets.
  - Runtime/app secrets: a `.env` file on the LXC (never committed; `.gitignore`
    already excludes `.env`/`.env.*` except `.env.example`) sourced by
    `docker-compose.yml`. v1 holds only `BTS_SERVER_PORT` and `BTS_SOUNDS_DIR`
    (no auth — see ADR-0002). The boundary is established now so future auth
    secrets land here, not in CI or code.
  - No secrets in code or committed files. The `.env.example` documents the
    shape only.
  - Chosen: split CI vs runtime secrets as above.

## Decision

### CI (`.github/workflows/ci.yml`)
- **Trigger:** `pull_request` to `main`, and `push` to `main`.
- **Runner:** `ubuntu-latest`, single job `ci`.
- **Node/pnpm:** `actions/setup-node@v4` (`node-version: 20.x`,
  `cache: pnpm`) + `pnpm/action-setup@v4` (`version: 9.12.0`).
- **Steps:** `pnpm install --frozen-lockfile` → `pnpm lint` →
  `pnpm typecheck` → `pnpm build` → (tests, when present). Topological build
  order is guaranteed by `pnpm -r`; `packages/shared` builds first.
- **Artifacts:** none required on PRs (build is a gate). Optional: upload
  `apps/web/dist` and `apps/desktop/dist` as workflow artifacts for inspection.
- No matrix. Desktop NSIS packaging does not run in CI (release-only).

### Versioning
- **Single root version** in `package.json` (`version`) is canonical; all
  workspace packages are kept in lockstep by `scripts/sync-versions.mjs`
  (root script `sync-versions`). Bump via `pnpm version <bump> &&
  pnpm sync-versions`, then commit and tag `v<version>`.
- GitHub Release body is generated from `git log v<prev>..v<curr> --oneline`
  (conventional-commit grouping optional). No required `CHANGELOG.md`.

### Release (`.github/workflows/release.yml`)
- **Trigger:** `push: tags: ['v*']` + `workflow_dispatch`.
- **Job `build-web-server`** (`ubuntu-latest`, Node 20): install → `pnpm build`
  → upload `apps/web/dist` (PWA) as artifact.
- **Job `package-desktop`** (`windows-latest`, Node 20): install → build shared +
  web + desktop → `pnpm -F @bts-soundboard/desktop package` → upload
  `apps/desktop/dist-electron/*.exe` as artifact. This job **invokes** the
  Desktop-owned `electron-builder.yml`; it does **not** redefine packaging.
- **Job `build-server-image`** (`ubuntu-latest`): build
  `apps/server/Dockerfile`, push
  `ghcr.io/<owner>/bts-soundboard-server:<tag>` + `:latest` to GHCR (uses
  `GITHUB_TOKEN`).
- **Job `release`** (needs `build-web-server` + `package-desktop`): create
  GitHub Release on the tag, attach the NSIS `.exe` (required) and the PWA zip
  (optional). Body = commit-derived changelog.
- **Job `deploy-server`** (needs `build-server-image`): run
  `scripts/deploy-lxc.sh` via SSH (`LXC_SSH_KEY`) → `docker compose pull` +
  `up -d` on the LXC.

### LXC deploy
- `apps/server/Dockerfile` (multi-stage, `node:20`→`node:20-alpine`).
- `docker-compose.yml` (on the LXC, templated in repo): runs the GHCR image,
  exposes `BTS_SERVER_PORT` (default 8080), bind-mounts `./data/sounds` →
  `BTS_SOUNDS_DIR`.
- `scripts/deploy-lxc.sh`: SSH → `docker compose pull && docker compose up -d
  --remove-orphans`. Rollback = deploy a previous tag.
- LXC provisioning on Proxmox is **out of scope** (manual ops runbook). The ADR
  assumes a Docker-capable LXC with SSH exists.

### Secrets
- **CI:** `LXC_SSH_KEY`, optional `WINDOWS_CERT`/`WINDOWS_CERT_PASSWORD`,
  automatic `GITHUB_TOKEN`. Stored in GitHub Actions secrets.
- **Runtime:** `.env` on the LXC (sourced by compose), never committed. v1:
  `BTS_SERVER_PORT`, `BTS_SOUNDS_DIR`. Future auth secrets land here.

## Consequences

- ✅ PR CI is a single fast job that enforces lint + typecheck + build before
  merge; `pnpm -r` guarantees `packages/shared` builds before consumers, so the
  build-order hazard from ADR-0001 is covered automatically.
- ✅ Single root version + sync script keeps all four packages in lockstep with
  zero per-package ceremony; nothing is published to npm, so no registry
  concerns.
- ✅ Tag-triggered release produces a real NSIS installer (built natively on
  Windows) and a PWA build with an auditable, commit-derived changelog.
- ✅ **Ops ↔ Desktop packaging boundary:** the Desktop agent owns
  `apps/desktop/electron-builder.yml` (NSIS target, `extraResources`, signing
  config); the Ops agent owns `.github/workflows/release.yml` (the job that
  *runs* `pnpm -F @bts-soundboard/desktop package`) and the GitHub Release that
  *uploads* the resulting `.exe`. Desktop never edits the workflow; Ops never
  edits the builder config.
- ✅ Server deploys are reproducible Docker images from GHCR with a one-command
  SSH rollback; sound files survive deploys via a bind-mounted volume.
- ✅ CI and runtime secrets are cleanly separated: build/deploy credentials in
  GitHub, app env on the LXC. No secrets in code or committed files.
- ⚠️ Desktop packaging runs on `windows-latest`, which is slower and consumes
  more Actions minutes than Linux. Accepted for reliable native NSIS builds;
  Wine-on-Linux cross-build is a documented fallback if minutes become a
  concern.
- ⚠️ The server image is `:latest`-tagged in addition to `:v<version>`;
  `docker compose up` without an explicit tag pins to `latest`. The deploy
  script SHOULD pin the image to the released tag for reproducibility — this is
  a follow-up for the Ops agent (template the compose image tag from the
  release tag).
- ⚠️ LXC provisioning on Proxmox is out of scope; the deploy pipeline assumes a
  pre-existing Docker-capable LXC with SSH. An ops runbook must document
  container creation, Docker install, port/firewall, and the `.env` placement
  before the first deploy.
- ⚠️ No code signing in v1 (Windows SmartScreen will warn). Adding signing is a
  documented follow-up: the cert lives in `WINDOWS_CERT`/`WINDOWS_CERT_PASSWORD`
  and the signing block is added to `electron-builder.yml` by the Desktop
  agent; the release workflow must pass the cert env through to the packaging
  job (Ops).

# Contributing to BTS Soundboard

Thanks for your interest in contributing! This document covers the development
workflow, code style, and pull request process.

## Development setup

### Prerequisites

- **Node.js** ≥ 18
- **pnpm** ≥ 9 (`npm install -g pnpm`)

### Getting started

```bash
git clone https://github.com/AndreasMReumschuessel/bts-knet_soundboard.git
cd bts-knet_soundboard
pnpm install
pnpm build:shared        # build the shared package (one-time)
pnpm dev                 # run web + server + desktop in parallel
```

See the [README](./README.md) for full configuration options.

## Monorepo layout

| Package | Location | What it does |
|---|---|---|
| `@bts-soundboard/shared` | `packages/shared` | Types + Zod schemas (single source of truth) |
| `@bts-soundboard/server` | `apps/server` | Node.js backend (REST + WebSocket) |
| `@bts-soundboard/web` | `apps/web` | React PWA (Vite) |
| `@bts-soundboard/desktop` | `apps/desktop` | Electron wrapper (global hotkeys) |

**Always build `packages/shared` first** after changing it: `pnpm build:shared`.
The other packages consume its compiled `dist/` at runtime.

## Code style

- **TypeScript strict mode** — no `any` without a justifying comment.
- **`noUncheckedIndexedAccess`** is on — index access returns `T | undefined`,
  handle it.
- **`verbatimModuleSyntax`** is on — use `import type` for type-only imports.
- **Validate all external data** (WS frames, REST bodies) with Zod schemas
  from `@bts-soundboard/shared`. Never redefine a shared type inline.
- **Errors: typed and surfaced**, never swallowed silently.
- **No secrets in code.** Upload paths must guard against path traversal.
- **No comments** unless explaining a non-obvious decision.

## The broadcast-play invariant

> **Clients never play locally on a broadcast `play` trigger.** The Play
> button sends a C→S `play` event and plays nothing locally. Local playback
> happens only when the S→C `play` broadcast is received. **Preview** is the
> single local-only exception.

This is the project's defining behavior. Do not break it. If you're unsure
whether a change violates this invariant, ask in your PR description.

## Pull request process

1. **Create a branch** from `main`: `git checkout -b feat/my-feature`.
2. **Write code** following the style above. Run checks before pushing:
   ```bash
   pnpm typecheck        # must pass
   pnpm build            # must pass
   ```
3. **Open a pull request** against `main`. Use the PR template.
4. **CI must pass.** The CI pipeline runs `pnpm typecheck` and `pnpm build`
   on every PR.
5. **Address review feedback.** Be responsive and constructive.

### Commit messages

Use clear, descriptive commit messages. Conventional commits are appreciated
but not required:

```
feat: add per-sound volume slider
fix: prevent double-play on rapid hotkey press
docs: update REST API reference
```

## Architecture Decision Records (ADRs)

Non-trivial decisions are documented in [`docs/adr/`](./docs/adr). If your
change introduces or revises a decision, update or add an ADR. Implementation
must follow ADRs — do not contradict them.

## Issue templates

When filing an issue, use the [bug report](/.github/ISSUE_TEMPLATE/bug_report.yml)
or [feature request](/.github/ISSUE_TEMPLATE/feature_request.yml) template.

## Scope boundaries

If you're working on a specific package, stay within its directory. Cross-
package changes (especially to `packages/shared`) should be coordinated — the
shared package is the contract all apps depend on.

## Questions?

Open a [discussion](https://github.com/AndreasMReumschuessel/bts-knet_soundboard/discussions)
or an issue — happy to help.

## What does this change?

<!-- Brief description of what this PR does and why. Link any relevant issues
with "Closes #123" or "Related to #456". -->

## Type of change

- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing behavior to change)
- [ ] Documentation update
- [ ] Refactor / cleanup (no behavior change)

## Affected components

- [ ] `packages/shared`
- [ ] `apps/server`
- [ ] `apps/web`
- [ ] `apps/desktop`
- [ ] CI / build / release
- [ ] Documentation

## Checklist

- [ ] `pnpm typecheck` passes
- [ ] `pnpm build` passes
- [ ] No `any` without a justifying comment
- [ ] All external data validated with Zod schemas from `@bts-soundboard/shared`
- [ ] No shared types redefined inline
- [ ] **Broadcast-play invariant preserved** — clients do not play locally on a
      broadcast `play` trigger (Preview is the only local-only exception)
- [ ] No secrets committed (`.env` is gitignored)
- [ ] No scope violations (edits stay within the owning package's directory)

## Notes for reviewer

<!-- Anything the reviewer should pay attention to — tricky logic, trade-offs,
follow-ups, etc. -->

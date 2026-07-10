# ADR-0008 — Adopt Zod 4

- **Date:** 2026-07-10
- **Status:** Accepted
- **Owner:** Architect
- **Supersedes:** none
- **Related:** ADR-0001 (stack & layout — "Zod chosen"), ADR-0002 (WS protocol
  schemas), ADR-0003 (REST DTOs)

## Context

Zod is load-bearing: ADR-0001 selected it as the validation layer, and **every**
WS frame and REST body is validated by Zod schemas whose single source of truth
is `packages/shared/src/{sound,ws,rest}.ts`. The server consumes those schemas
directly (no inline Zod).

Dependabot PR #9 bumps `zod` `3.25.76 → 4.4.3` in `packages/shared` and
`apps/server` (lockfile resolved accordingly). Zod 4 is a **major** release with
real breaking changes (error shape, `z.coerce` removal, stricter `.transform`/
`.refine`, `z.record`/`z.preprocess`/`z.intersection`/`z.custom` changes). We
must decide whether to adopt it and, separately, whether to migrate the one
Zod-3 string-format call site to the Zod-4-idiomatic `z.iso.*` API.

Our entire Zod API surface (audited) is: `z.object`, `z.literal`, `z.string()`
with `.min/.max/.optional`, `z.number().int().nonnegative()`,
`z.discriminatedUnion("type", [...])`, `z.array`, `z.enum([...])`,
`z.string().datetime({ offset: true })`, `z.infer`, and `safeParse()` consumed
via `.success` / `.data` / `.error.message`. We use **none** of: `z.coerce`,
`.transform`, `.refine`, `z.record`, `z.preprocess`, `z.intersection`,
`z.custom`, `.email()` / `.url()` / `.ip()`.

Verified on the dependabot branch (Node 26, TS 5.9.3): `pnpm -F
@bts-soundboard/shared build` and `typecheck` pass; `apps/server` build passes;
`apps/web` and `apps/desktop` typecheck pass (exit 0). A 14-assertion runtime
smoke test against the built schemas is identical to Zod 3: `.datetime({ offset:
true })` accepts Zulu and `+02:00`, rejects garbage; the `ClientToServer` /
`ServerToClient` discriminated unions accept valid and reject missing fields,
unknown discriminators, and invalid enum codes; `parseClientToServerMessage` /
`parseServerToClientMessage` throw `WsProtocolError` with
`code === "invalid_message"`.

## Options considered

### Adopt Zod 4 vs. pin Zod 3
- **Adopt Zod 4** (chosen). It is a verified drop-in for our audited API
  surface — every app typechecks/builds and runtime behavior is identical. A
  dependabot major bump is the natural adoption moment, and staying on Zod 3
  ages the dependency with no compensating benefit (nothing blocks us on v3,
  but nothing requires it either).
- **Pin Zod 3.** Avoids any review burden now but forgoes v4 and leaves a major
  bump unaddressed; the same compatibility audit would recur on the next bump.
  Rejected.

### Forward-compat: `z.string().datetime()` vs. `z.iso.datetime()`
- **Migrate the single call site to `z.iso.datetime({ offset: true })`**
  (chosen). `z.iso.*` is the documented Zod-4 home for ISO string formats;
  `z.string().datetime()` is retained for compatibility and is the obvious
  candidate for removal in a future major. The inferred type is identical
  (`string`), so no consumer changes. Migrating the one line now (as part of
  the version bump) closes the loop rather than leaving a tracked TODO.
- **Leave `z.string().datetime({ offset: true })`.** Zero churn and verified to
  work in v4, but it relies on the compat path and would need migrating before
  Zod 5. Rejected — the migration is one line and verified.

## Decision

1. **Adopt Zod 4.** Merge PR #9 (zod `3.25.76 → 4.4.3`) in `packages/shared`
   and `apps/server`.
2. **Migrate the one string-format call site** in
   `packages/shared/src/sound.ts`: `uploadedAt: z.string().datetime({ offset:
   true })` → `uploadedAt: z.iso.datetime({ offset: true })`. No other schema
   code changes — the remainder of our API surface is unchanged in v4.
3. **No contract drift.** `packages/shared` remains the single source of truth;
   the WS event schemas (ADR-0002) and REST DTOs (ADR-0003) are byte-for-byte
   stable at the type level. `uploadedAt`'s inferred type is still `string`.
4. **Errors stay string-surfaced.** Schema parse helpers continue to expose
   `.error.message` (a string). We do **not** consume Zod's structured issue
   array, so the Zod-4 `ZodError` shape change does not affect us. Any future
   agent wanting field-level errors must adopt the v4 issue API explicitly.

## Consequences

- ✅ On Zod 4.4.3 across `packages/shared` and `apps/server`; the single ISO
  datetime field uses the forward-compatible `z.iso.datetime()` API. Verified:
  `packages/shared` build + `apps/server` build pass; runtime smoke (datetime
  accept/reject, `SoundMetadataSchema` end-to-end parse) identical to Zod 3.
- ✅ The audited compatibility scope is recorded here so no agent re-runs the
  investigation: we use none of the v4 breaking APIs (`z.coerce`, `.transform`,
  `.refine`, `z.record`, `z.preprocess`, `z.intersection`, `z.custom`).
- ✅ Inferred types unchanged; server consumption of shared's `dist` is
  unaffected.
- ⚠️ Future schema authors in `packages/shared` must avoid v3-only patterns or
  check v4 compatibility — this is the standing rule now that we are on v4.
- ⚠️ `z.string().datetime()` (and `.email()/.url()/.ip()`) remain available in
  v4 as compat aliases; we deliberately use `z.iso.*` so a future Zod 5 removal
  of the compat alias does not affect us.
- ⚠️ If a future change wants **structured** (field-level) validation errors,
  it must use the Zod-4 `ZodError` issue API — the current `.error.message`
  contract is preserved as-is.

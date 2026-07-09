# ADR-0004 — Local sound caching strategy

- **Date:** 2026-07-09
- **Status:** Accepted
- **Owner:** Architect
- **Related:** ADR-0002 (protocol), ADR-0003 (REST), ADR-0006 (volume)

## Context

When a `play` event is broadcast, every client must produce audio with minimal
latency. Fetching the file from the server on every play would add hundreds
of milliseconds (and saturate the uplink if many clients fetch at once). So
clients cache sound files locally. The distribution model is **notify +
lazy fetch**: the WS channel carries metadata (`sound_added`, `sound_list`,
`sound_removed`), and clients fetch bytes over REST only when needed.

Design goals: low play latency, offline playback of the cached catalog,
cache integrity, simple invalidation, and no double-fetch storms.

## Options considered

### Storage backend
- **Cache API** (chosen primary) vs. IndexedDB vs. both.
  - Cache API: purpose-built for `Response` blobs keyed by URL, integrates
    with service workers (offline PWA), simple `caches.match()` /
    `caches.put()`. Sufficient for "key = soundId → audio bytes".
  - IndexedDB: more flexible (indexes, queries) but heavier; we don't query
    sounds by anything but id, so its power is unused.
  - Both: IndexedDB for metadata + Cache API for bytes is a common pattern,
    but doubles the code surface. We keep it simple: **Cache API for audio
    bytes; localStorage for the master volume + (later) per-device hotkey map.**
  - Chosen: **Cache API** for audio bytes, keyed by a stable URL derived from
    `soundId`. IndexedDB reserved as a v2 option if we need indexed metadata
    or larger-than-Quota caches.

### Cache key
- **`soundId`-derived URL** (chosen): the cache key is the *full file URL*
  `GET /sounds/:id/file` (e.g. `${API_BASE}/sounds/${id}/file`). This makes
  `caches.match(fileUrl)` a direct hit test and works naturally with the
  service worker for offline. The `soundId` is the logical identity; the URL
  is the cache key.

### When to fetch
- **Lazy fetch on play-miss** (chosen): on a S→C `play`, if the sound is not
  in the cache, `fetch(fileUrl)`, cache it, then play. If it IS cached, play
  immediately from cache. This bounds bandwidth to "new sounds only."
- Optional warm-up: on `sound_added` / `sound_list`, the client MAY
  pre-fetch in the background. v1 default: **do not pre-fetch** (avoid
  surprise bandwidth on mobile); lazy fetch only. Configurable later.

### Invalidation
- **`sound_removed` → evict** the cache entry for that `soundId`.
- **`sound_added` → nothing** (lazy fetch will pick it up on first play).
- There is no content-addressed versioning in v1 (`soundId` is stable for the
  life of a sound; an updated sound is a delete + re-add with a new id). So no
  revalidation headers are required. The client MAY send
  `Cache-Control: no-cache` on a forced refresh, but v1 trusts the id.

### Eviction policy
- **No automatic eviction in v1** beyond `sound_removed`. A simple LRU/size
  cap is a documented follow-up. The catalog is expected to be small (tens to
  low-hundreds of short MP3s), well under typical Cache API quotas.

### Offline
- The PWA service worker caches the app shell (Vite build) and, in
  `fetch` handlers, serves cached sound files when offline. Offline, a `play`
  event for a non-cached sound fails gracefully (surface a typed error to the
  UI) — it does not crash.

## Decision

- **Storage:** Cache API for audio bytes (one cache, e.g. `bts-sounds`).
  Cache key = full file URL `${API_BASE}/sounds/${id}/file` (matches the REST
  endpoint in ADR-0003). Logical identity = `soundId`.
- **Fetch policy:** lazy fetch on play-miss. On S→C `play`:
  1. `caches.match(fileUrl)`; on hit → decode + play immediately.
  2. on miss → `fetch(fileUrl)` → `caches.put` → decode + play.
- **Sync on connect:** on `sound_list`, store/refresh metadata in memory (and
  optionally in IndexedDB later); do NOT bulk-download bytes.
- **Invalidation:** on `sound_removed`, `caches.delete(fileUrl)`.
- **Volume:** master volume is read from localStorage (ADR-0006) and applied
  to the shared `GainNode`; it is NOT stored per-sound in v1.
- **Errors:** a play-miss fetch failure or decode failure is surfaced as a
  typed error to the UI; it does not propagate to other clients.

## Consequences

- ✅ First play of a new sound costs one fetch; subsequent plays are instant
  and work offline.
- ✅ Cache key = soundId-derived URL aligns with the service worker and with
  `caches.match`, so the code is trivially correct.
- ✅ `sound_removed` cleanly evicts; no stale audio after a delete.
- ⚠️ First-play latency for a brand-new sound is one round-trip + decode. For
  a soundboard this is acceptable; if a user wants zero-latency they can
  "preview" once (which also warms the cache).
- ⚠️ No quota/size cap in v1; a runaway catalog could exceed Cache API quota.
  Documented follow-up: LRU + size cap.

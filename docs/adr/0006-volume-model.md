# ADR-0006 — Volume model

- **Date:** 2026-07-09
- **Status:** Accepted
- **Owner:** Architect
- **Related:** ADR-0001 (stack), ADR-0004 (caching)

## Context

Users need to control how loud sounds are on their own device. Volume is a
local concern: one friend's machine shouldn't dictate another's loudness. We
need to decide the granularity (master vs. per-sound), where it's stored, and
how it's applied in the Web Audio graph.

## Options considered

### Granularity
- **Master volume per device** (chosen) vs. per-sound volume vs. both.
  - Master volume is the 80% case and keeps the UI trivial. Per-sound volume
    is useful but adds a per-sound gain map + UI; it's a documented follow-up.
  - Chosen: **master volume per device only in v1.**

### Storage
- **`localStorage`** (chosen): a single number, e.g. `bts:masterVolume`
  (clamped 0..1). Simple, synchronous, survives reloads. vs. IndexedDB (overkill
  for one number). Chosen: localStorage. (The desktop app, sharing the
  renderer, uses the same localStorage; the master volume is therefore
  per-browser-profile / per-Electron-userData, which is what we want.)

### Application in the audio graph
- **One shared `AudioContext` + one master `GainNode`** that every
  `AudioBufferSourceNode` connects through (chosen). Master volume = setting
  `masterGain.gain.value` (with `setValueAtTime` for click-free changes).
  vs. per-source gain — rejected for v1 (per-sound is a follow-up).

## Decision

- **Model:** master volume per device, range `0..1` (linear gain), default
  `1.0` (`DEFAULT_MASTER_VOLUME`).
- **Storage:** `localStorage` key `bts:masterVolume` (JSON number, clamped on
  read). Persisted on change; restored on startup before first play.
- **Application:** all playback (both broadcast `play` and local `preview`)
  routes through a single shared `GainNode` whose `gain.value` is the master
  volume. Changes apply immediately to in-flight and future sources.
- **Per-sound volume** is a documented follow-up: it would add a per-source
  `GainNode` between each `AudioBufferSourceNode` and the master gain, fed by
  a per-`soundId` map (also in localStorage). Not built in v1.

## Consequences

- ✅ One volume control, one place in the graph, applies to every sound
  uniformly — broadcast and preview alike.
- ✅ Survives reloads; per-device as intended.
- ✅ Trivially extensible to per-sound volume later by inserting per-source
  gain nodes; the master gain stays the final stage.
- ⚠️ `localStorage` is synchronous and blocks; fine for a single small number.
  If we later store the per-sound volume map, consider IndexedDB. Follow-up.

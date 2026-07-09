# ADR-0005 — Hotkey model

- **Date:** 2026-07-09
- **Status:** Accepted
- **Owner:** Architect
- **Related:** ADR-0002 (protocol), ADR-0001 (stack)

## Context

Desktop users want to trigger sounds without focusing the app — e.g. while
Discord is focused. Electron's `globalShortcut` module registers OS-level
accelerators (Windows, macOS) that fire even when the app isn't focused. The
PWA running in an Android browser **cannot** register global hotkeys (Android
OS security model) and must not pretend to. So hotkeys are desktop-only, and
the PWA triggers sounds via on-screen buttons.

We need to decide how hotkeys are assigned to sounds, where the assignment is
stored, and how a hotkey press becomes a broadcast `play`.

## Options considered

### Where to register hotkeys
- **Electron main process `globalShortcut`** (chosen). The main process owns
  OS shortcuts; on fire it sends the `play` WS message (the renderer is the WS
  client). vs. renderer-side accelerators (only work when focused) — rejected,
  they defeat the "trigger while Discord is focused" goal.

### Assignment storage
- **Per-device, stored locally on the desktop** (chosen): a JSON map
  `{ soundId: accelerator }` persisted to `electron-store` / a JSON file in
  `app.getPath('userData')`. Hotkey maps are NOT synced across devices (your
  desktop's hotkeys are yours; another friend's desktop has its own). vs.
  server-side hotkey config — rejected (no auth in v1, and hotkeys are a local
  UX preference).

### Editing hotkeys
- **In-app settings UI in the Electron renderer** (the shared PWA UI) that
  reads/writes the local hotkey map and IPCs the main process to (re)register.
  The same UI in the PWA (Android) is hidden/disabled — it has no hotkeys.

### Accelerator format
- Electron accelerator strings, e.g. `"CommandOrControl+Shift+1"`,
  `"Alt+Q"`. The desktop agent validates against Electron's accelerator
  grammar before registering; invalid accelerators are rejected with a typed
  error.

## Decision

- **Hotkeys are desktop-only.** The PWA (Android browsers) has no hotkey
  feature; its UI hides the hotkey-assignment controls.
- **Storage:** per-device map `{ [soundId: string]: accelerator }` persisted
  in the desktop's `userData` (e.g. `electron-store` key `hotkeyMap`).
- **Registration:** the Electron main process iterates the map and registers
  each `accelerator` via `globalShortcut.register`. On a press, it emits the
  C→S `play` WS message `{ type: "play", soundId, triggeredBy, clientTimestamp }`
  (ADR-0002) — **it does NOT play locally**; it plays when the broadcast
  returns. The WS client lives in the renderer (or main; the desktop agent
  decides), but the *originator-never-plays-locally* rule still holds.
- **Editing:** the renderer settings UI writes the map and asks the main
  process (IPC) to unregister old + register new accelerators. Changes take
  effect immediately and persist.
- **Conflicts & invalid accelerators:** registering a duplicate/invalid
  accelerator fails; the desktop surfaces a typed error and keeps the rest of
  the map registered.
- **Cleanup:** on app quit, `globalShortcut.unregisterAll()`.

## Consequences

- ✅ True OS-level global hotkeys on desktop; triggers work while Discord (or
  any app) is focused.
- ✅ Per-device config matches reality (each friend has their own layout) and
  needs no auth/sync.
- ✅ Reuses the broadcast-play path: a hotkey press is just another `play`
  trigger, so timing is uniform with in-app triggers.
- ⚠️ The WS client must be reachable from the hotkey handler. The desktop
  agent decides whether the WS connection lives in the renderer or main
  process; either way the no-local-play rule holds.
- ⚠️ Global hotkeys can conflict with other apps' shortcuts; users may need to
  reassign. Documented in the settings UI.

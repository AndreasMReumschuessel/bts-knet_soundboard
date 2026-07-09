/**
 * Hotkey map persistence + globalShortcut registration (ADR-0005).
 *
 * The map `{ soundId: accelerator }` is persisted per-device in
 * `userData/hotkeys.json` (plain JSON via `fs` — no extra dep). The Electron
 * main process owns registration; on a press it calls the press callback set by
 * `setHotkeyPressHandler`, which main.ts wires to forward `bts:hotkey-pressed`
 * to the renderer.
 */
import { app, globalShortcut } from "electron";
import * as fs from "node:fs";
import * as path from "node:path";
import type { HotkeyMap, HotkeySetResult } from "@bts-soundboard/shared";

const HOTKEY_FILE = "hotkeys.json";

let hotkeyMap: HotkeyMap = {};
let onPress: (soundId: string) => void = () => {};

/** Set the callback invoked when a registered accelerator fires. */
export function setHotkeyPressHandler(cb: (soundId: string) => void): void {
  onPress = cb;
}

/** Read the persisted map from `userData/hotkeys.json`. Call after `app.whenReady()`. */
export function loadMap(): HotkeyMap {
  const filePath = hotkeyFilePath();
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    hotkeyMap = isHotkeyMap(parsed) ? { ...parsed } : {};
  } catch {
    hotkeyMap = {};
  }
  return { ...hotkeyMap };
}

/** Persist the current map to disk. */
function persist(): void {
  const filePath = hotkeyFilePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(hotkeyMap, null, 2), "utf8");
}

/** Register every accelerator in the current map. Idempotent-ish: caller should
 *  ensure prior registrations were cleared first (e.g. via unregisterAll). */
export function registerAll(): void {
  for (const [soundId, accelerator] of Object.entries(hotkeyMap)) {
    registerOne(soundId, accelerator);
  }
}

/** Unregister all OS-level accelerators. Safe to call on quit. */
export function unregisterAll(): void {
  globalShortcut.unregisterAll();
}

/** Snapshot of the in-memory map (defensive copy). */
export function getCurrentMap(): HotkeyMap {
  return { ...hotkeyMap };
}

/**
 * Set (or clear, when `accelerator` is null/empty) the accelerator for a sound.
 * Validates against conflicts and Electron's accelerator grammar via
 * `globalShortcut.register` (returns false on invalid/unavailable). On failure
 * the prior binding is left intact. Returns a typed `HotkeySetResult`.
 */
export function setHotkey(soundId: string, accelerator: string | null): HotkeySetResult {
  const clear = accelerator === null || accelerator === "";

  if (!clear) {
    // Reject if another sound already holds this accelerator (don't touch state yet).
    for (const [sid, acc] of Object.entries(hotkeyMap)) {
      if (sid !== soundId && acc === accelerator) {
        return { ok: false, error: `Accelerator "${accelerator}" is already bound to another sound.` };
      }
    }
  }

  const oldAccel = hotkeyMap[soundId];
  if (oldAccel !== undefined) {
    globalShortcut.unregister(oldAccel);
  }

  if (clear) {
    const next = { ...hotkeyMap };
    delete next[soundId];
    hotkeyMap = next;
    persist();
    return { ok: true };
  }

  const registered = registerOne(soundId, accelerator);
  if (!registered) {
    // Restore the prior binding so a bad input doesn't leave the sound unbound.
    if (oldAccel !== undefined) {
      registerOne(soundId, oldAccel);
    }
    return { ok: false, error: `Invalid or unavailable accelerator: "${accelerator}".` };
  }

  hotkeyMap = { ...hotkeyMap, [soundId]: accelerator };
  persist();
  return { ok: true };
}

/** Register a single accelerator -> soundId mapping. Returns false on failure. */
function registerOne(soundId: string, accelerator: string): boolean {
  try {
    return globalShortcut.register(accelerator, () => {
      onPress(soundId);
    });
  } catch {
    return false;
  }
}

function hotkeyFilePath(): string {
  return path.join(app.getPath("userData"), HOTKEY_FILE);
}

function isHotkeyMap(v: unknown): v is HotkeyMap {
  if (typeof v !== "object" || v === null) return false;
  for (const value of Object.values(v as Record<string, unknown>)) {
    if (typeof value !== "string") return false;
  }
  return true;
}

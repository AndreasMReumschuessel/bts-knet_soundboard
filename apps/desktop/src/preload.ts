/**
 * Preload: expose `window.btsDesktop` via contextBridge, matching the
 * `BtsDesktopBridge` contract from @bts-soundboard/shared (ADR-0005).
 *
 * contextIsolation is on and nodeIntegration is off; the renderer can only reach
 * the safe, explicitly-exposed surface below. The PWA uses `isPresent` to detect
 * the Electron context, edits the hotkey map via `setHotkey`, and receives
 * forwarded hotkey presses via `onHotkeyPressed` (it then emits C->S `play` over
 * its own WS connection — no local play on trigger).
 */
import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type { BtsDesktopBridge, HotkeyMap, HotkeySetResult } from "@bts-soundboard/shared";

const HOTKEY_PRESSED = "bts:hotkey-pressed";
const HOTKEY_MAP_CHANGED = "bts:hotkey-map-changed";

const bridge: BtsDesktopBridge = {
  isPresent: true,
  getHotkeyMap: (): Promise<HotkeyMap> =>
    ipcRenderer.invoke("bts:get-hotkey-map") as Promise<HotkeyMap>,
  setHotkey: (soundId: string, accelerator: string | null): Promise<HotkeySetResult> =>
    ipcRenderer.invoke("bts:set-hotkey", soundId, accelerator) as Promise<HotkeySetResult>,
  onHotkeyPressed: (cb: (soundId: string) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, soundId: string): void => cb(soundId);
    ipcRenderer.on(HOTKEY_PRESSED, listener);
    return (): void => {
      ipcRenderer.off(HOTKEY_PRESSED, listener);
    };
  },
  onHotkeyMapChanged: (cb: (map: HotkeyMap) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, map: HotkeyMap): void => cb(map);
    ipcRenderer.on(HOTKEY_MAP_CHANGED, listener);
    return (): void => {
      ipcRenderer.off(HOTKEY_MAP_CHANGED, listener);
    };
  },
};

contextBridge.exposeInMainWorld("btsDesktop", bridge);

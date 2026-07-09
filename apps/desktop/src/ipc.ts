/**
 * IPC channel names + handler wiring between the Electron main process and the
 * preload-exposed `window.btsDesktop` bridge (ADR-0005).
 *
 * Channels:
 *   - "bts:get-hotkey-map"   (invoke)  -> HotkeyMap
 *   - "bts:set-hotkey"       (invoke)  -> HotkeySetResult  (args: soundId, accelerator|null)
 *   - "bts:hotkey-pressed"   (main->renderer) -> soundId
 *   - "bts:hotkey-map-changed" (main->renderer) -> HotkeyMap
 */
import { ipcMain, type BrowserWindow } from "electron";
import type { HotkeySetResult } from "@bts-soundboard/shared";
import { getCurrentMap, setHotkey } from "./hotkeys.js";

export const IPC = {
  getHotkeyMap: "bts:get-hotkey-map",
  setHotkey: "bts:set-hotkey",
  hotkeyPressed: "bts:hotkey-pressed",
  hotkeyMapChanged: "bts:hotkey-map-changed",
} as const;

/** Wire main-process handlers. `getMainWindow` lets us target the live window. */
export function registerIpcHandlers(getMainWindow: () => BrowserWindow | null): void {
  ipcMain.handle(IPC.getHotkeyMap, () => {
    return getCurrentMap();
  });

  ipcMain.handle(
    IPC.setHotkey,
    (_event, soundId: string, accelerator: string | null): HotkeySetResult => {
      const result = setHotkey(soundId, accelerator);
      if (result.ok) {
        const win = getMainWindow();
        if (win && !win.isDestroyed()) {
          win.webContents.send(IPC.hotkeyMapChanged, getCurrentMap());
        }
      }
      return result;
    },
  );
}

/** Forward a hotkey press to the renderer as `bts:hotkey-pressed`. */
export function sendHotkeyPressed(win: BrowserWindow, soundId: string): void {
  if (!win.isDestroyed()) {
    win.webContents.send(IPC.hotkeyPressed, soundId);
  }
}

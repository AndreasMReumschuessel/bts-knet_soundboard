/**
 * Electron <-> PWA bridge contract (see ADR-0005). Exposed on `window.btsDesktop`
 * by the Electron preload script; absent in the standalone PWA. The PWA uses it
 * to detect the Electron context, edit the per-device hotkey map, and receive
 * hotkey presses forwarded from the main process (the renderer then emits a
 * C->S `play` over its own WS connection — no local play on trigger).
 */

/** Maps a sound id to an Electron accelerator string, e.g. "CommandOrControl+Shift+1". */
export type HotkeyMap = Record<string, string>;

export interface HotkeySetResult {
  ok: boolean;
  /** Present and set when `ok === false`. */
  error?: string;
}

export interface BtsDesktopBridge {
  /** Always `true` when the bridge is present. Used by the PWA to detect Electron. */
  readonly isPresent: true;
  /** Read the current per-device hotkey map (soundId -> accelerator). */
  getHotkeyMap(): Promise<HotkeyMap>;
  /**
   * Set (or clear, when accelerator is null) the accelerator for a sound.
   * Invalid accelerators are rejected with `{ ok: false, error }`.
   */
  setHotkey(soundId: string, accelerator: string | null): Promise<HotkeySetResult>;
  /** Subscribe to hotkey presses forwarded from the main process. Returns an unsubscribe function. */
  onHotkeyPressed(cb: (soundId: string) => void): () => void;
  /** Subscribe to hotkey-map changes (e.g. after a re-register). Returns an unsubscribe function. */
  onHotkeyMapChanged(cb: (map: HotkeyMap) => void): () => void;
}

declare global {
  interface Window {
    btsDesktop?: BtsDesktopBridge;
  }
}

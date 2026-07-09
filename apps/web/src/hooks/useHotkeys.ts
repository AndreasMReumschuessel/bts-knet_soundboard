import { useCallback, useEffect, useRef, useState } from "react";
import type { HotkeyMap } from "@bts-soundboard/shared";

export interface UseHotkeysResult {
  hotkeyMap: HotkeyMap;
  setHotkey: (soundId: string, accel: string | null) => Promise<void>;
  isDesktop: boolean;
}

export function useHotkeys(sendPlay: (soundId: string) => void): UseHotkeysResult {
  const bridge = typeof window !== "undefined" ? window.btsDesktop : undefined;
  const isDesktop = bridge?.isPresent === true;
  const [hotkeyMap, setHotkeyMap] = useState<HotkeyMap>({});

  const sendPlayRef = useRef(sendPlay);
  useEffect(() => {
    sendPlayRef.current = sendPlay;
  }, [sendPlay]);

  useEffect(() => {
    if (!isDesktop || !bridge) return;
    let cancelled = false;
    void bridge.getHotkeyMap().then((m) => {
      if (!cancelled) setHotkeyMap(m);
    });
    const unsubPress = bridge.onHotkeyPressed((id) => sendPlayRef.current(id));
    const unsubMap = bridge.onHotkeyMapChanged((m) => setHotkeyMap(m));
    return () => {
      cancelled = true;
      unsubPress();
      unsubMap();
    };
  }, [bridge, isDesktop]);

  const setHotkey = useCallback(
    async (soundId: string, accel: string | null): Promise<void> => {
      if (!isDesktop || !bridge) return;
      const result = await bridge.setHotkey(soundId, accel);
      if (!result.ok) {
        console.warn("[hotkeys] setHotkey failed:", result.error);
        return;
      }
      const updated = await bridge.getHotkeyMap();
      setHotkeyMap(updated);
    },
    [bridge, isDesktop],
  );

  return { hotkeyMap, setHotkey, isDesktop };
}

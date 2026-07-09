import { useCallback, useEffect, useState } from "react";
import { DEFAULT_MASTER_VOLUME } from "@bts-soundboard/shared";

import { MASTER_VOLUME_STORAGE_KEY } from "../config";
import { getEngine } from "../audio/engine";

function readStoredVolume(): number {
  try {
    const raw = localStorage.getItem(MASTER_VOLUME_STORAGE_KEY);
    if (raw == null) return DEFAULT_MASTER_VOLUME;
    const n = Number(raw);
    if (!Number.isFinite(n)) return DEFAULT_MASTER_VOLUME;
    return Math.max(0, Math.min(1, n));
  } catch {
    return DEFAULT_MASTER_VOLUME;
  }
}

export function useMasterVolume(): { volume: number; setVolume: (v: number) => void } {
  const [volume, setVolumeState] = useState<number>(() => readStoredVolume());

  useEffect(() => {
    getEngine().setMasterVolume(volume);
  }, [volume]);

  const setVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    setVolumeState(clamped);
    try {
      localStorage.setItem(MASTER_VOLUME_STORAGE_KEY, String(clamped));
    } catch {
      // Storage unavailable; keep in-memory state only.
    }
  }, []);

  return { volume, setVolume };
}

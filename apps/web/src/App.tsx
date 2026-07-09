import { useCallback, useEffect, useRef, useState } from "react";

import type { Toast } from "./types";
import { getEngine } from "./audio/engine";
import { useSocket } from "./ws/useSocket";
import { useMasterVolume } from "./hooks/useMasterVolume";
import { useHotkeys } from "./hooks/useHotkeys";
import { deleteSound } from "./api/sounds";
import { ConnectionStatus } from "./components/ConnectionStatus";
import { VolumeControl } from "./components/VolumeControl";
import { UploadBar } from "./components/UploadBar";
import { HotkeySettings } from "./components/HotkeySettings";
import { SoundList } from "./components/SoundList";
import { ToastStack } from "./components/Toast";
import "./styles.css";

export function App(): JSX.Element {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastIdRef = useRef(0);

  const pushToast = useCallback(
    (message: string, kind: "info" | "error" = "info"): void => {
      toastIdRef.current += 1;
      const id = toastIdRef.current;
      setToasts((prev) => [...prev, { id, message, kind }]);
    },
    [],
  );

  const dismissToast = useCallback((id: number): void => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const { connectionState, sounds, sendPlay } = useSocket(pushToast);
  const { volume, setVolume } = useMasterVolume();
  const { hotkeyMap, setHotkey, isDesktop } = useHotkeys(sendPlay);

  // Resume the AudioContext on the first user gesture so playback is allowed.
  useEffect(() => {
    let resumed = false;
    function unlock(): void {
      if (resumed) return;
      resumed = true;
      getEngine().resume();
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    }
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  // Play = broadcast only. Local playback happens only on the S->C `play`
  // broadcast, handled inside useSocket -> engine.playSound. No local play here.
  const onPlay = useCallback(
    (id: string): void => {
      getEngine().resume();
      sendPlay(id);
    },
    [sendPlay],
  );

  // Preview = local only; sends no WS message.
  const onPreview = useCallback((id: string): void => {
    getEngine().resume();
    void getEngine().playSound(id);
  }, []);

  const onDelete = useCallback(
    async (id: string): Promise<void> => {
      try {
        await deleteSound(id);
        pushToast("Sound deleted");
        // List update is driven by the `sound_removed` broadcast (useSocket).
      } catch (err) {
        const message = err instanceof Error ? err.message : "Delete failed";
        pushToast(message, "error");
      }
    },
    [pushToast],
  );

  return (
    <div className="app">
      <header className="app-header">
        <h1>BTS Soundboard</h1>
        <ConnectionStatus state={connectionState} />
      </header>
      <main className="app-main">
        <VolumeControl volume={volume} onChange={setVolume} />
        <UploadBar onToast={pushToast} />
        <HotkeySettings isDesktop={isDesktop} />
        <SoundList
          sounds={sounds}
          isDesktop={isDesktop}
          hotkeyMap={hotkeyMap}
          onPlay={onPlay}
          onPreview={onPreview}
          onDelete={onDelete}
          onSetHotkey={setHotkey}
        />
      </main>
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import type { SoundMetadata } from "@bts-soundboard/shared";

import type { ConnectionState } from "../types";
import { getEngine } from "../audio/engine";
import { deleteSound as evictSound } from "../audio/cache";
import { getSocket } from "./socket";

export type ToastSink = (message: string, kind: "info" | "error") => void;

export interface UseSocketResult {
  connectionState: ConnectionState;
  sounds: SoundMetadata[];
  sendPlay: (soundId: string, triggeredBy?: string) => void;
}

export function useSocket(onToast?: ToastSink): UseSocketResult {
  const socket = getSocket();
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [sounds, setSounds] = useState<SoundMetadata[]>([]);

  const onToastRef = useRef(onToast);
  useEffect(() => {
    onToastRef.current = onToast;
  }, [onToast]);

  useEffect(() => {
    const unsubMessages = socket.subscribe((msg) => {
      switch (msg.type) {
        case "sound_list":
          setSounds(msg.sounds);
          break;
        case "sound_added": {
          setSounds((prev) => {
            const idx = prev.findIndex((s) => s.id === msg.sound.id);
            if (idx === -1) return [...prev, msg.sound];
            const next = prev.slice();
            next[idx] = msg.sound;
            return next;
          });
          break;
        }
        case "sound_removed":
          setSounds((prev) => prev.filter((s) => s.id !== msg.soundId));
          void evictSound(msg.soundId);
          break;
        case "play":
          void getEngine().playSound(msg.soundId).catch((err: unknown) => {
            const message = err instanceof Error ? err.message : `Failed to play ${msg.soundId}`;
            onToastRef.current?.(message, "error");
          });
          break;
        case "error":
          onToastRef.current?.(msg.message, "error");
          break;
      }
    });

    const unsubState = socket.onStateChange((s) => setConnectionState(s));

    const unsubErrors = socket.onError((message) => {
      onToastRef.current?.(message, "error");
    });

    return () => {
      unsubMessages();
      unsubState();
      unsubErrors();
    };
  }, [socket]);

  const sendPlay = useCallback(
    (soundId: string, triggeredBy?: string) => {
      socket.send({ type: "play", soundId, triggeredBy, clientTimestamp: Date.now() });
    },
    [socket],
  );

  return { connectionState, sounds, sendPlay };
}

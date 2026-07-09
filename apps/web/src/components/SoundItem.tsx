import { useEffect, useState } from "react";
import type { SoundMetadata, HotkeyMap } from "@bts-soundboard/shared";

interface SoundItemProps {
  sound: SoundMetadata;
  isDesktop: boolean;
  hotkeyMap: HotkeyMap;
  onPlay: (id: string) => void;
  onPreview: (id: string) => void;
  onDelete: (id: string) => void;
  onSetHotkey: (id: string, accel: string | null) => void;
}

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function isModifierKey(key: string): boolean {
  return key === "Control" || key === "Shift" || key === "Alt" || key === "Meta";
}

function keyFromEvent(e: KeyboardEvent): string | null {
  const code = e.code;
  if (/^Digit([0-9])$/.test(code)) return code.slice(-1);
  if (/^Key([A-Z])$/.test(code)) return code.slice(-1);
  if (/^F([1-9]|1[0-2])$/.test(code)) return code;
  if (code === "Space") return "Space";
  if (code === "Enter") return "Return";
  if (code === "ArrowUp") return "Up";
  if (code === "ArrowDown") return "Down";
  if (code === "ArrowLeft") return "Left";
  if (code === "ArrowRight") return "Right";
  if (e.key.length === 1) return e.key.toUpperCase();
  return null;
}

function formatAccelerator(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("CommandOrControl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  const key = keyFromEvent(e);
  if (key) parts.push(key);
  return parts.join("+");
}

export function SoundItem({
  sound,
  isDesktop,
  hotkeyMap,
  onPlay,
  onPreview,
  onDelete,
  onSetHotkey,
}: SoundItemProps): JSX.Element {
  const [capturing, setCapturing] = useState(false);
  const hotkey = hotkeyMap[sound.id];

  useEffect(() => {
    if (!capturing) return;
    function handler(e: KeyboardEvent): void {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setCapturing(false);
        return;
      }
      if (isModifierKey(e.key)) return;
      const accel = formatAccelerator(e);
      onSetHotkey(sound.id, accel);
      setCapturing(false);
    }
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [capturing, sound.id, onSetHotkey]);

  function handleDelete(): void {
    if (window.confirm(`Delete "${sound.name}"?`)) onDelete(sound.id);
  }

  return (
    <li className="sound-item">
      <div className="sound-info">
        <div className="sound-name" title={sound.name}>{sound.name}</div>
        <div className="sound-meta">
          <span>{formatDuration(sound.durationMs)}</span>
          <span>{formatSize(sound.sizeBytes)}</span>
        </div>
      </div>
      <div className="sound-actions">
        <button type="button" className="btn btn-primary" onClick={() => onPlay(sound.id)}>
          Play
        </button>
        <button type="button" className="btn" onClick={() => onPreview(sound.id)}>
          Preview
        </button>
        <button type="button" className="btn btn-danger" onClick={handleDelete}>
          Delete
        </button>
      </div>
      {isDesktop && (
        <div className="sound-hotkey">
          <span className="hotkey-label">Hotkey:</span>
          <code className="hotkey-value">{hotkey ?? "None"}</code>
          {capturing ? (
            <span className="hotkey-capturing">Press a key combo… Esc to cancel.</span>
          ) : (
            <button type="button" className="btn btn-sm" onClick={() => setCapturing(true)}>
              Capture
            </button>
          )}
          {hotkey && !capturing && (
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => onSetHotkey(sound.id, null)}
            >
              Clear
            </button>
          )}
        </div>
      )}
    </li>
  );
}

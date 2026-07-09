import type { SoundMetadata, HotkeyMap } from "@bts-soundboard/shared";
import { SoundItem } from "./SoundItem";

interface SoundListProps {
  sounds: SoundMetadata[];
  isDesktop: boolean;
  hotkeyMap: HotkeyMap;
  onPlay: (id: string) => void;
  onPreview: (id: string) => void;
  onDelete: (id: string) => void;
  onSetHotkey: (id: string, accel: string | null) => void;
}

export function SoundList({
  sounds,
  isDesktop,
  hotkeyMap,
  onPlay,
  onPreview,
  onDelete,
  onSetHotkey,
}: SoundListProps): JSX.Element {
  if (sounds.length === 0) {
    return <div className="empty-state">No sounds yet — upload one!</div>;
  }
  return (
    <ul className="sound-grid">
      {sounds.map((s) => (
        <SoundItem
          key={s.id}
          sound={s}
          isDesktop={isDesktop}
          hotkeyMap={hotkeyMap}
          onPlay={onPlay}
          onPreview={onPreview}
          onDelete={onDelete}
          onSetHotkey={onSetHotkey}
        />
      ))}
    </ul>
  );
}

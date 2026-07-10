import type { JSX } from "react";

interface VolumeControlProps {
  volume: number;
  onChange: (v: number) => void;
}

export function VolumeControl({ volume, onChange }: VolumeControlProps): JSX.Element {
  const pct = Math.round(volume * 100);
  return (
    <div className="volume-control">
      <label htmlFor="master-volume" className="volume-label">
        Master Volume
      </label>
      <input
        id="master-volume"
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={volume}
        onChange={(e) => onChange(Number(e.target.value))}
        className="volume-slider"
        aria-label="Master volume"
      />
      <span className="volume-value">{pct}%</span>
    </div>
  );
}

import type { JSX } from "react";

interface HotkeySettingsProps {
  isDesktop: boolean;
}

export function HotkeySettings({ isDesktop }: HotkeySettingsProps): JSX.Element | null {
  if (!isDesktop) return null;
  return (
    <section className="hotkey-settings">
      <h2>Global Hotkeys (Desktop)</h2>
      <p>
        Hotkeys are OS-level shortcuts that work even while other apps are focused. Manage each
        sound's hotkey individually in the list using its Capture button. Mobile/PWA users interact
        via this UI and still receive and play broadcast sounds.
      </p>
    </section>
  );
}

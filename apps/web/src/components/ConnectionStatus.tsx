import type { JSX } from "react";
import type { ConnectionState } from "../types";

interface ConnectionStatusProps {
  state: ConnectionState;
}

const LABELS: Record<ConnectionState, string> = {
  connected: "Connected",
  connecting: "Connecting\u2026",
  reconnecting: "Reconnecting\u2026",
  disconnected: "Offline",
};

export function ConnectionStatus({ state }: ConnectionStatusProps): JSX.Element {
  return <span className={`badge badge-${state}`}>{LABELS[state] ?? state}</span>;
}

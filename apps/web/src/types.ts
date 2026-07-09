export type ConnectionState = "connecting" | "connected" | "reconnecting" | "disconnected";

export interface Toast {
  id: number;
  message: string;
  kind: "info" | "error";
}

/**
 * Project-wide constants. Single source of truth for ports, paths, limits,
 * and WS message-type discriminants. Implementation agents MUST import these
 * rather than hard-coding values.
 */

export const APP_NAME = "bts-soundboard";
export const APP_VERSION = "0.1.0";

/** Default TCP port for the Node/TS backend (REST + WS). */
export const DEFAULT_SERVER_PORT = 8080;

/** Default Vite dev-server port for the PWA / Electron renderer. */
export const DEFAULT_WEB_PORT = 5173;

/** WebSocket sub-path the server listens on (e.g. ws://host:8080/ws). */
export const WS_PATH = "/ws";

/** Max accepted upload size for a single sound file (25 MiB). */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** Only MIME type accepted for upload in v1. */
export const SUPPORTED_MIME = "audio/mpeg" as const;

/** All MIME types accepted for upload in v1. */
export const SUPPORTED_MIME_TYPES = [SUPPORTED_MIME] as const;

/** Default master playback volume (linear gain, 0..1). */
export const DEFAULT_MASTER_VOLUME = 1.0;

/**
 * WS message-type discriminants. The `type` field on every WS message is one of
 * these strings. Used as `z.literal(...)` in the Zod schemas in `ws.ts`.
 */
export const ClientMessageType = {
  /** Client requests the server broadcast a play event to all clients. */
  play: "play",
  /** Client (re)requests the full sound catalog. */
  request_sync: "request_sync",
} as const;

export const ServerMessageType = {
  /** Server-broadcast play event (echoed to all clients including originator). */
  play: "play",
  /** A new sound was added to the catalog (metadata only, no bytes). */
  sound_added: "sound_added",
  /** A sound was removed from the catalog. */
  sound_removed: "sound_removed",
  /** Full catalog snapshot (sent on connect or on request_sync). */
  sound_list: "sound_list",
  /** Server-side error reported to a single client. */
  error: "error",
} as const;

/** Stable error codes used in `error` server messages. */
export const WsErrorCode = {
  invalid_message: "invalid_message",
  unknown_sound: "unknown_sound",
  upload_too_large: "upload_too_large",
  unsupported_mime: "unsupported_mime",
  rate_limited: "rate_limited",
  internal: "internal",
} as const;

export type ClientMessageTypeValue = (typeof ClientMessageType)[keyof typeof ClientMessageType];
export type ServerMessageTypeValue = (typeof ServerMessageType)[keyof typeof ServerMessageType];
export type WsErrorCodeValue = (typeof WsErrorCode)[keyof typeof WsErrorCode];

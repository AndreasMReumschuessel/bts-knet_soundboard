import { z } from "zod";
import { ClientMessageType, ServerMessageType, WsErrorCode } from "./constants.js";
import { SoundMetadataSchema } from "./sound.js";

/**
 * WS protocol (see ADR-0002). Two discriminated unions keyed on `type`:
 *
 *   ClientToServerMessage  (C→S)
 *   ServerToClientMessage  (S→C)
 *
 * Broadcast-play semantics: when the server receives a C→S `play`, it rewrites
 * `clientTimestamp`→`serverTimestamp` and broadcasts a S→C `play` to ALL
 * clients INCLUDING the originator. The originator MUST NOT play locally on
 * trigger; it plays only when it receives the broadcast back. The single
 * documented exception is "preview", which is a client-local code path that
 * never touches the WS layer.
 */

// ---------------------------------------------------------------------------
// Client → Server
// ---------------------------------------------------------------------------

export const PlayClientMessageSchema = z.object({
  type: z.literal(ClientMessageType.play),
  soundId: z.string().min(1),
  triggeredBy: z.string().max(100).optional(),
  /** Epoch milliseconds, set by the client. Used for latency diagnostics only. */
  clientTimestamp: z.number().int().nonnegative(),
});

export const RequestSyncClientMessageSchema = z.object({
  type: z.literal(ClientMessageType.request_sync),
});

export const ClientToServerMessageSchema = z.discriminatedUnion("type", [
  PlayClientMessageSchema,
  RequestSyncClientMessageSchema,
]);
export type ClientToServerMessage = z.infer<typeof ClientToServerMessageSchema>;

// ---------------------------------------------------------------------------
// Server → Client
// ---------------------------------------------------------------------------

export const PlayServerMessageSchema = z.object({
  type: z.literal(ServerMessageType.play),
  soundId: z.string().min(1),
  triggeredBy: z.string().max(100).optional(),
  /** Epoch milliseconds, set by the server at broadcast time. Authoritative. */
  serverTimestamp: z.number().int().nonnegative(),
});

export const SoundAddedServerMessageSchema = z.object({
  type: z.literal(ServerMessageType.sound_added),
  sound: SoundMetadataSchema,
});

export const SoundRemovedServerMessageSchema = z.object({
  type: z.literal(ServerMessageType.sound_removed),
  soundId: z.string().min(1),
});

export const SoundListServerMessageSchema = z.object({
  type: z.literal(ServerMessageType.sound_list),
  sounds: z.array(SoundMetadataSchema),
});

export const ErrorServerMessageSchema = z.object({
  type: z.literal(ServerMessageType.error),
  code: z.enum([
    WsErrorCode.invalid_message,
    WsErrorCode.unknown_sound,
    WsErrorCode.upload_too_large,
    WsErrorCode.unsupported_mime,
    WsErrorCode.rate_limited,
    WsErrorCode.internal,
  ]),
  message: z.string().min(1),
});

export const ServerToClientMessageSchema = z.discriminatedUnion("type", [
  PlayServerMessageSchema,
  SoundAddedServerMessageSchema,
  SoundRemovedServerMessageSchema,
  SoundListServerMessageSchema,
  ErrorServerMessageSchema,
]);
export type ServerToClientMessage = z.infer<typeof ServerToClientMessageSchema>;

/** Convenience alias for "any WS message, either direction". */
export type WsMessage = ClientToServerMessage | ServerToClientMessage;

// ---------------------------------------------------------------------------
// Parse helpers — wrap Zod `.parse` so callers get a single ergonomic entry
// point and a typed `Error` surface. Implementation agents should validate
// every inbound frame/body with these (or the schemas directly).
// ---------------------------------------------------------------------------

export class WsProtocolError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "WsProtocolError";
  }
}

export function parseClientToServerMessage(data: unknown): ClientToServerMessage {
  const result = ClientToServerMessageSchema.safeParse(data);
  if (!result.success) {
    throw new WsProtocolError(
      WsErrorCode.invalid_message,
      `Invalid client→server message: ${result.error.message}`,
    );
  }
  return result.data;
}

export function parseServerToClientMessage(data: unknown): ServerToClientMessage {
  const result = ServerToClientMessageSchema.safeParse(data);
  if (!result.success) {
    throw new WsProtocolError(
      WsErrorCode.invalid_message,
      `Invalid server→client message: ${result.error.message}`,
    );
  }
  return result.data;
}

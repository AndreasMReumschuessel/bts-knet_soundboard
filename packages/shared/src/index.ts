/**
 * @bts-soundboard/shared — single source of truth for all types, Zod schemas,
 * and constants consumed by `apps/web`, `apps/server`, and `apps/desktop`.
 *
 * Import everything from the package root:
 *   import { ClientToServerMessageSchema, SoundMetadata, WS_PATH } from "@bts-soundboard/shared";
 *
 * Subpath imports are also supported (see package.json `exports`):
 *   import { ClientMessageType } from "@bts-soundboard/shared/constants";
 */

export * from "./constants.js";
export * from "./sound.js";
export * from "./ws.js";
export * from "./rest.js";
export * from "./desktop-bridge.js";

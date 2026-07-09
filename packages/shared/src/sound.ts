import { z } from "zod";
import { SUPPORTED_MIME_TYPES } from "./constants.js";

/**
 * `SoundMetadata` describes a sound in the catalog. It is metadata ONLY — the
 * audio bytes are never sent over WS. Clients fetch bytes on demand via
 * `GET /sounds/:id/file` (see ADR-0003 / ADR-0004).
 *
 * `id` is opaque to clients (server-generated, URL-safe, no file extension),
 * and is also the Cache API / IndexedDB key.
 */
export const SoundMetadataSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(200),
  durationMs: z.number().int().nonnegative(),
  sizeBytes: z.number().int().nonnegative(),
  mime: z.enum(SUPPORTED_MIME_TYPES),
  uploadedAt: z.string().datetime({ offset: true }),
  uploadedBy: z.string().max(100).optional(),
});
export type SoundMetadata = z.infer<typeof SoundMetadataSchema>;

/** Shape of the body returned by `GET /sounds/:id` (metadata only). */
export const SoundResponseSchema = SoundMetadataSchema;
export type SoundResponse = SoundMetadata;

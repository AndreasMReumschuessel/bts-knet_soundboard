import { z } from "zod";
import { SoundMetadataSchema } from "./sound.js";

/**
 * REST DTOs (see ADR-0003). All request/response bodies are JSON; sound file
 * upload is `multipart/form-data` with a single `audio/mpeg` part, and sound
 * file download is a binary stream with `Content-Type: audio/mpeg`.
 */

/** `GET /sounds` → list of all catalog metadata. */
export const SoundListResponseSchema = z.object({
  sounds: z.array(SoundMetadataSchema),
});
export type SoundListResponse = z.infer<typeof SoundListResponseSchema>;

/** `POST /sounds` (multipart upload) → the newly created sound's metadata. */
export const UploadResponseSchema = z.object({
  sound: SoundMetadataSchema,
});
export type UploadResponse = z.infer<typeof UploadResponseSchema>;

/** `DELETE /sounds/:id` → the removed sound's id. */
export const DeleteSoundResponseSchema = z.object({
  soundId: z.string().min(1),
});
export type DeleteSoundResponse = z.infer<typeof DeleteSoundResponseSchema>;

/** `GET /health` → service health. `clients` = currently connected WS clients. */
export const HealthResponseSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  version: z.string().optional(),
  clients: z.number().int().nonnegative().optional(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

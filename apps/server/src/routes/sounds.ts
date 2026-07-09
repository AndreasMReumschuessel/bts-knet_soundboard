import type { IncomingMessage, ServerResponse } from "node:http";
import { createReadStream } from "node:fs";
import { pipeline } from "node:stream";
import { SUPPORTED_MIME } from "@bts-soundboard/shared";
import type { Catalog } from "../storage/catalog.js";
import { fileStat, resolveSoundPath } from "../storage/files.js";
import { isValidId } from "../util/ids.js";
import { applyCorsHeaders } from "../util/cors.js";
import { sendError, sendJson } from "../util/http.js";

/** `GET /sounds` → `SoundListResponse { sounds: SoundMetadata[] }`. */
export function listSoundsRoute(
  catalog: Catalog,
  _req: IncomingMessage,
  res: ServerResponse,
): void {
  sendJson(res, 200, { sounds: catalog.list() });
}

/** `GET /sounds/:id` → `SoundMetadata` (400 bad id, 404 unknown). */
export function getSoundRoute(
  catalog: Catalog,
  id: string,
  _req: IncomingMessage,
  res: ServerResponse,
): void {
  if (!isValidId(id)) {
    sendError(res, 400, "Invalid sound id");
    return;
  }
  const meta = catalog.get(id);
  if (!meta) {
    sendError(res, 404, `No sound with id '${id}'`);
    return;
  }
  sendJson(res, 200, meta);
}

/**
 * `GET /sounds/:id/file` → binary stream, `Content-Type: audio/mpeg`.
 * Path-traversal-safe: bad id → 400, unknown id → 404, missing file → 404.
 */
export async function getSoundFileRoute(
  catalog: Catalog,
  soundsDir: string,
  id: string,
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!isValidId(id)) {
    sendError(res, 400, "Invalid sound id");
    return;
  }
  if (!catalog.has(id)) {
    sendError(res, 404, `No sound with id '${id}'`);
    return;
  }
  const resolved = resolveSoundPath(soundsDir, id);
  if (!resolved.ok) {
    sendError(res, 400, "Invalid sound id");
    return;
  }
  let size: number;
  try {
    size = (await fileStat(resolved.path)).size;
  } catch {
    // Catalog says it exists but the file is missing (integrity issue) → 404.
    sendError(res, 404, `No sound file with id '${id}'`);
    return;
  }
  applyCorsHeaders(res);
  res.setHeader("Content-Type", SUPPORTED_MIME);
  res.setHeader("Content-Length", size);
  // Range support is a follow-up; v1 serves whole-file only.
  res.writeHead(200);
  // `pipeline` forwards stream errors to the callback so a mid-stream disk
  // error or file deletion can't throw an unhandled 'error' and crash the
  // process. Headers are already written, so we just log and end cleanly.
  pipeline(
    createReadStream(resolved.path),
    res,
    (err) => {
      if (err) {
        console.error(`[sounds] stream error for ${id}:`, err);
        if (!res.writableEnded) res.end();
      }
    },
  );
}

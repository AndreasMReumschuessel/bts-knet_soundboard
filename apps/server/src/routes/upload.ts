import type { IncomingMessage, ServerResponse } from "node:http";
import Busboy from "busboy";
import {
  MAX_UPLOAD_BYTES,
  ServerMessageType,
  SUPPORTED_MIME,
  type SoundMetadata,
} from "@bts-soundboard/shared";
import type { Catalog } from "../storage/catalog.js";
import type { WsManager } from "../ws.js";
import { generateId } from "../util/ids.js";
import {
  computeDurationMs,
  looksLikeMp3,
  resolveSoundPath,
  writeSoundFile,
} from "../storage/files.js";
import { sendError, sendJson } from "../util/http.js";

export interface UploadDeps {
  soundsDir: string;
  catalog: Catalog;
  ws: WsManager;
}

/**
 * `POST /sounds` (multipart/form-data: field `name`, field `file` audio/mpeg).
 * Enforces `MAX_UPLOAD_BYTES`, rejects non-`audio/mpeg` (415) and non-MP3
 * bytes (415). On success: stores `<id>.mp3`, computes metadata, adds to
 * catalog, broadcasts S→C `sound_added` to all WS clients, returns
 * `UploadResponse { sound }`.
 */
export function uploadRoute(
  deps: UploadDeps,
  req: IncomingMessage,
  res: ServerResponse,
): void {
  let bb: Busboy.Busboy;
  try {
    bb = Busboy({
      headers: req.headers,
      limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 4 },
    });
  } catch {
    sendError(res, 400, "Expected multipart/form-data");
    return;
  }

  const fields = new Map<string, string>();
  let fileBuffer: Buffer | null = null;
  let fileMime: string | null = null;
  let fileTruncated = false;
  let tooManyFiles = false;
  let parseError: string | null = null;

  bb.on("field", (name, value) => {
    if (fields.size < 10) fields.set(name, value);
  });

  bb.on("file", (_fieldname, stream, info) => {
    fileMime = info.mimeType;
    const chunks: Buffer[] = [];
    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    stream.on("end", () => {
      fileBuffer = Buffer.concat(chunks);
    });
    stream.on("limit", () => {
      fileTruncated = true;
    });
  });

  bb.on("filesLimit", () => {
    tooManyFiles = true;
  });

  bb.on("error", (err: unknown) => {
    parseError = err instanceof Error ? err.message : String(err);
  });

  bb.on("close", () => {
    void onFinish();
  });

  req.pipe(bb);

  async function onFinish(): Promise<void> {
    if (res.writableEnded) return;

    if (parseError) {
      sendError(res, 400, `Upload parse error: ${parseError}`);
      return;
    }
    if (tooManyFiles) {
      sendError(res, 400, "Only one file may be uploaded at a time");
      return;
    }
    if (fileTruncated || (fileBuffer !== null && fileBuffer.length > MAX_UPLOAD_BYTES)) {
      sendError(res, 413, `Upload exceeds max size (${MAX_UPLOAD_BYTES} bytes)`);
      return;
    }
    if (fileBuffer === null || fileBuffer.length === 0) {
      sendError(res, 400, "Missing or empty 'file' field");
      return;
    }
    if (fileMime !== SUPPORTED_MIME) {
      sendError(res, 415, `Unsupported MIME type '${fileMime ?? "unknown"}'; expected ${SUPPORTED_MIME}`);
      return;
    }
    if (!looksLikeMp3(fileBuffer)) {
      sendError(res, 415, "File does not look like an MP3");
      return;
    }

    const rawName = (fields.get("name") ?? "").trim();
    if (rawName.length < 1 || rawName.length > 200) {
      sendError(res, 400, "Field 'name' must be 1..200 chars");
      return;
    }
    const rawUploadedBy = (fields.get("uploadedBy") ?? "").trim();
    const uploadedBy =
      rawUploadedBy.length >= 1 && rawUploadedBy.length <= 100
        ? rawUploadedBy
        : undefined;

    const id = generateId();
    const resolved = resolveSoundPath(deps.soundsDir, id);
    if (!resolved.ok) {
      sendError(res, 500, "Failed to resolve sound path for new id");
      return;
    }

    try {
      await writeSoundFile(resolved.path, fileBuffer);
      const durationMs = await computeDurationMs(fileBuffer);
      const meta: SoundMetadata = {
        id,
        name: rawName,
        durationMs,
        sizeBytes: fileBuffer.length,
        mime: SUPPORTED_MIME,
        uploadedAt: new Date().toISOString(),
        uploadedBy,
      };
      await deps.catalog.add(meta);
      deps.ws.broadcast({ type: ServerMessageType.sound_added, sound: meta });
      sendJson(res, 201, { sound: meta });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      sendError(res, 500, `Failed to store sound: ${message}`);
    }
  }
}

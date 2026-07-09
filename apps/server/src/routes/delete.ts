import type { IncomingMessage, ServerResponse } from "node:http";
import { ServerMessageType } from "@bts-soundboard/shared";
import type { Catalog } from "../storage/catalog.js";
import type { WsManager } from "../ws.js";
import { deleteSoundFile, resolveSoundPath } from "../storage/files.js";
import { isValidId } from "../util/ids.js";
import { sendError, sendJson } from "../util/http.js";

export interface DeleteDeps {
  soundsDir: string;
  catalog: Catalog;
  ws: WsManager;
}

/**
 * `DELETE /sounds/:id` → `DeleteSoundResponse { soundId }`.
 * Bad id → 400, unknown id → 404. On success: removes file + catalog entry
 * and broadcasts S→C `sound_removed` to all WS clients.
 */
export async function deleteSoundRoute(
  deps: DeleteDeps,
  id: string,
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!isValidId(id)) {
    sendError(res, 400, "Invalid sound id");
    return;
  }
  if (!deps.catalog.has(id)) {
    sendError(res, 404, `No sound with id '${id}'`);
    return;
  }
  const resolved = resolveSoundPath(deps.soundsDir, id);
  if (!resolved.ok) {
    sendError(res, 400, "Invalid sound id");
    return;
  }
  try {
    await deleteSoundFile(resolved.path);
  } catch (err) {
    // File may already be gone; log and continue removing the catalog entry.
    console.warn(`[delete] failed to remove file for ${id}:`, err);
  }
  await deps.catalog.remove(id);
  deps.ws.broadcast({ type: ServerMessageType.sound_removed, soundId: id });
  sendJson(res, 200, { soundId: id });
}

import type { IncomingMessage, ServerResponse } from "node:http";
import { APP_VERSION } from "@bts-soundboard/shared";
import type { WsManager } from "../ws.js";
import { sendJson } from "../util/http.js";

/** `GET /health` → `HealthResponse { status, version, clients }`. */
export function healthRoute(
  ws: WsManager,
  _req: IncomingMessage,
  res: ServerResponse,
): void {
  sendJson(res, 200, {
    status: "ok",
    version: APP_VERSION,
    clients: ws.clientCount,
  });
}

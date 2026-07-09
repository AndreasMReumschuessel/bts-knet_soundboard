import type { ServerResponse } from "node:http";
import { applyCorsHeaders } from "./cors.js";

/** Serialize `body` as JSON and end the response. CORS headers are applied. */
export function sendJson<T>(res: ServerResponse, status: number, body: T): void {
  if (res.writableEnded) return;
  applyCorsHeaders(res);
  const json = JSON.stringify(body);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Length", Buffer.byteLength(json));
  res.writeHead(status);
  res.end(json);
}

/** Send a JSON error envelope `{ error: string }` with CORS headers. */
export function sendError(res: ServerResponse, status: number, message: string): void {
  sendJson(res, status, { error: message });
}

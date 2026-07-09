import type { IncomingMessage, ServerResponse } from "node:http";

const ALLOWED_METHODS = "GET, POST, DELETE, OPTIONS";
const ALLOWED_HEADERS = "Content-Type, Content-Length, Authorization, X-Requested-With";

/**
 * v1 CORS policy: allow all origins. The PWA runs on http://localhost:5173
 * (Vite dev) and Electron loads from file:// (origin "null"); a wildcard is
 * the simplest correct policy for v1 (no credentials/cookies in v1). Tighten
 * to specific origins when auth lands (v2).
 */
export function applyCorsHeaders(res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", ALLOWED_METHODS);
  res.setHeader("Access-Control-Allow-Headers", ALLOWED_HEADERS);
  res.setHeader("Access-Control-Max-Age", "600");
  res.setHeader("Vary", "Origin");
}

/**
 * Apply CORS headers to every response and short-circuit OPTIONS preflight.
 * Returns `true` when the request was an OPTIONS preflight (already ended).
 */
export function handleCors(req: IncomingMessage, res: ServerResponse): boolean {
  applyCorsHeaders(res);
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return true;
  }
  return false;
}

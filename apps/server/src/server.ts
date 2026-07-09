import type { IncomingMessage, ServerResponse } from "node:http";
import type { Catalog } from "./storage/catalog.js";
import type { WsManager } from "./ws.js";
import { handleCors } from "./util/cors.js";
import { sendError } from "./util/http.js";
import { healthRoute } from "./routes/health.js";
import {
  getSoundFileRoute,
  getSoundRoute,
  listSoundsRoute,
} from "./routes/sounds.js";
import { uploadRoute } from "./routes/upload.js";
import { deleteSoundRoute } from "./routes/delete.js";

export interface RouteDeps {
  soundsDir: string;
  catalog: Catalog;
  ws: WsManager;
}

/**
 * Build the HTTP request listener. Lean hand-rolled router: only ~6 routes,
 * so a framework would be more dependency than value. CORS is applied to every
 * response and OPTIONS preflight is short-circuited here.
 */
export function createRequestListener(deps: RouteDeps) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (handleCors(req, res)) return;

    const url = new URL(req.url ?? "/", "http://localhost");
    const pathname = url.pathname;
    const method = req.method ?? "GET";

    try {
      if (method === "GET" && pathname === "/health") {
        healthRoute(deps.ws, req, res);
        return;
      }
      if (method === "GET" && pathname === "/sounds") {
        listSoundsRoute(deps.catalog, req, res);
        return;
      }
      if (method === "POST" && pathname === "/sounds") {
        uploadRoute({ soundsDir: deps.soundsDir, catalog: deps.catalog, ws: deps.ws }, req, res);
        return;
      }

      const match = matchSoundsPath(pathname);
      if (match) {
        const { id, tail } = match;
        if (method === "GET" && tail === undefined) {
          getSoundRoute(deps.catalog, id, req, res);
          return;
        }
        if (method === "GET" && tail === "file") {
          await getSoundFileRoute(deps.catalog, deps.soundsDir, id, req, res);
          return;
        }
        if (method === "DELETE" && tail === undefined) {
          await deleteSoundRoute(
            { soundsDir: deps.soundsDir, catalog: deps.catalog, ws: deps.ws },
            id,
            req,
            res,
          );
          return;
        }
      }

      sendError(res, 404, `No route for ${method} ${pathname}`);
    } catch (err) {
      if (!res.writableEnded) {
        sendError(res, 500, err instanceof Error ? err.message : String(err));
      } else {
        res.end();
      }
    }
  };
}

/**
 * Match `/sounds/:id` (tail undefined) or `/sounds/:id/file` (tail `"file"`).
 * Returns `null` for anything else. `:id` is validated downstream by routes.
 */
function matchSoundsPath(
  pathname: string,
): { id: string; tail?: "file" } | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  const [head, id, rest] = parts;
  if (head !== "sounds") return null;
  if (id === undefined) return null;
  if (parts.length === 2) return { id };
  if (parts.length === 3 && rest === "file") return { id, tail: "file" };
  return null;
}

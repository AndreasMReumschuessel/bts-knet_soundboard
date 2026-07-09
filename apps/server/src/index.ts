import http from "node:http";
import { promises as fs } from "node:fs";
import { APP_NAME, APP_VERSION } from "@bts-soundboard/shared";
import { loadConfig } from "./util/env.js";
import { Catalog } from "./storage/catalog.js";
import { createWsManager } from "./ws.js";
import { createRequestListener } from "./server.js";

async function main(): Promise<void> {
  const config = loadConfig();

  // Ensure data dirs exist.
  await fs.mkdir(config.soundsDir, { recursive: true });

  const catalog = new Catalog(config.catalogPath);
  await catalog.load();

  // Create the HTTP server first (no listener yet), attach the WS server to it,
  // then wire the request listener — this resolves the routes↔ws circular dep.
  const server = http.createServer();
  const ws = createWsManager(server, { catalog });
  server.on("request", createRequestListener({ soundsDir: config.soundsDir, catalog, ws }));

  server.listen(config.port, () => {
    console.log(
      `[${APP_NAME} v${APP_VERSION}] listening on http://localhost:${config.port}` +
        ` (WS path /ws) — sounds: ${config.soundsDir}`,
    );
  });

  const shutdown = (signal: string): void => {
    console.log(`\n[${signal}] shutting down...`);
    server.close(() => process.exit(0));
    // Force-exit after a grace period if connections hang.
    setTimeout(() => process.exit(1), 3000).unref();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});

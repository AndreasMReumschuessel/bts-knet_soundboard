import { DEFAULT_SERVER_PORT } from "@bts-soundboard/shared";
import path from "node:path";

export interface ServerConfig {
  port: number;
  /** Absolute path to the directory holding `<id>.mp3` files. */
  soundsDir: string;
  /** Absolute path to `catalog.json` (lives in the sounds dir's parent). */
  catalogPath: string;
}

function parsePort(raw: string | undefined): number {
  if (raw === undefined || raw === "") return DEFAULT_SERVER_PORT;
  const n = Number.parseInt(raw, 10);
  if (!Number.isInteger(n) || n <= 0 || n > 65535) {
    throw new Error(`Invalid BTS_SERVER_PORT: ${raw}`);
  }
  return n;
}

export function loadConfig(): ServerConfig {
  const port = parsePort(process.env.BTS_SERVER_PORT);
  const rawDir = process.env.BTS_SOUNDS_DIR ?? "./data/sounds";
  const soundsDir = path.resolve(process.cwd(), rawDir);
  // catalog.json lives in the parent of the sounds dir (e.g. ./data/catalog.json
  // when BTS_SOUNDS_DIR=./data/sounds) so the sounds dir holds only audio files.
  const catalogPath = path.join(path.dirname(soundsDir), "catalog.json");
  return { port, soundsDir, catalogPath };
}

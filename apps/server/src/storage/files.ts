import { promises as fs } from "node:fs";
import path from "node:path";
import mp3Duration from "mp3-duration";
import { ID_REGEX } from "../util/ids.js";

export type SoundPathResult =
  | { ok: true; path: string }
  | { ok: false; reason: "invalid_id" };

/**
 * Resolve a sound id to an absolute `<soundsDir>/<id>.mp3` path, with
 * defense-in-depth path-traversal protection:
 *   1. reject ids that fail `ID_REGEX` (no `/`, `\`, `..`, length ≤ 64);
 *   2. join against the resolved root;
 *   3. re-assert the resolved path is still inside the root.
 */
export function resolveSoundPath(soundsDir: string, id: string): SoundPathResult {
  if (!ID_REGEX.test(id)) return { ok: false, reason: "invalid_id" };
  const root = path.resolve(soundsDir);
  const target = path.resolve(path.join(root, `${id}.mp3`));
  const rel = path.relative(root, target);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return { ok: false, reason: "invalid_id" };
  }
  return { ok: true, path: target };
}

export async function writeSoundFile(filePath: string, data: Buffer): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, data);
}

export async function deleteSoundFile(filePath: string): Promise<void> {
  await fs.rm(filePath, { force: true });
}

export async function fileStat(filePath: string): Promise<{ size: number }> {
  const stat = await fs.stat(filePath);
  return { size: stat.size };
}

/**
 * Compute MP3 duration in milliseconds from the file buffer. `mp3-duration`
 * returns seconds as a float; we round to ms. On any parse failure we return
 * 0 (the sound is still stored; clients decode via Web Audio regardless).
 */
export async function computeDurationMs(buffer: Buffer): Promise<number> {
  try {
    const seconds = await mp3Duration(buffer);
    if (!Number.isFinite(seconds) || seconds < 0) return 0;
    return Math.round(seconds * 1000);
  } catch {
    return 0;
  }
}

/** Quick sanity sniff: ID3v2 tag header (`ID3`) or MPEG frame sync (0xFFE). */
export function looksLikeMp3(buf: Buffer): boolean {
  if (buf.length < 3) return false;
  // Length checked above; assert non-undefined for `noUncheckedIndexedAccess`.
  const b0 = buf[0]!;
  const b1 = buf[1]!;
  const b2 = buf[2]!;
  if (b0 === 0x49 && b1 === 0x44 && b2 === 0x33) return true; // "ID3"
  if (b0 === 0xff && (b1 & 0xe0) === 0xe0) return true; // MPEG sync
  return false;
}

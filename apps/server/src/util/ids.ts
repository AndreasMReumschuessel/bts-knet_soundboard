import { randomUUID } from "node:crypto";

/**
 * A sound id must be URL-safe and contain no path separators, `..`, or
 * extension. This regex is the first layer of path-traversal defense (the
 * second is a resolved-path containment check in `storage/files.ts`).
 */
export const ID_REGEX = /^[A-Za-z0-9_-]{1,64}$/;

export function isValidId(id: string): boolean {
  return ID_REGEX.test(id);
}

/**
 * Generate a fresh server-side id. `crypto.randomUUID()` is 36 chars with
 * hyphens; stripping the hyphens yields a 32-char hex string that matches
 * `ID_REGEX` and is opaque to clients (not derived from the filename).
 */
export function generateId(): string {
  return randomUUID().replace(/-/g, "");
}

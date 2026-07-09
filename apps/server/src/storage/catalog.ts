import { promises as fs } from "node:fs";
import path from "node:path";
import {
  SoundMetadataSchema,
  type SoundMetadata,
} from "@bts-soundboard/shared";

/**
 * In-memory sound catalog backed by a single `catalog.json` (an array of
 * `SoundMetadata`). Loaded on startup; write-through on every mutation via an
 * atomic temp-file + rename. The Zod schema is used to validate every entry
 * read from disk so a corrupt catalog never crashes the server.
 */
export class Catalog {
  private readonly byId = new Map<string, SoundMetadata>();
  private readonly catalogPath: string;

  constructor(catalogPath: string) {
    this.catalogPath = catalogPath;
  }

  async load(): Promise<void> {
    let raw: string;
    try {
      raw = await fs.readFile(this.catalogPath, "utf8");
    } catch {
      // Missing file on first run — start empty.
      this.byId.clear();
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.warn("[catalog] catalog.json is not valid JSON; starting empty.");
      this.byId.clear();
      return;
    }
    if (!Array.isArray(parsed)) {
      console.warn("[catalog] catalog.json is not an array; starting empty.");
      this.byId.clear();
      return;
    }
    this.byId.clear();
    let dropped = 0;
    for (const entry of parsed) {
      const result = SoundMetadataSchema.safeParse(entry);
      if (result.success) {
        this.byId.set(result.data.id, result.data);
      } else {
        dropped++;
      }
    }
    if (dropped > 0) {
      console.warn(`[catalog] dropped ${dropped} malformed entr(ies) from catalog.json.`);
    }
  }

  list(): SoundMetadata[] {
    return Array.from(this.byId.values());
  }

  get(id: string): SoundMetadata | undefined {
    return this.byId.get(id);
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  async add(meta: SoundMetadata): Promise<void> {
    this.byId.set(meta.id, meta);
    await this.persist();
  }

  /** Returns `true` if an entry was actually removed. */
  async remove(id: string): Promise<boolean> {
    const had = this.byId.delete(id);
    if (had) await this.persist();
    return had;
  }

  private async persist(): Promise<void> {
    const data = JSON.stringify(this.list(), null, 2);
    const dir = path.dirname(this.catalogPath);
    await fs.mkdir(dir, { recursive: true });
    const tmp = `${this.catalogPath}.tmp`;
    await fs.writeFile(tmp, data, "utf8");
    await fs.rename(tmp, this.catalogPath);
  }
}

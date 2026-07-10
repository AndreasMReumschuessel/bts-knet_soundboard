#!/usr/bin/env node
// Propagate the root package.json `version` into every workspace package's
// `version` field, keeping all four packages in lockstep (ADR-0007).
//
// Touches ONLY the `version` field. Run via `pnpm sync-versions` after
// `pnpm version <bump>` at the repo root, before committing + tagging `v<version>`.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = join(scriptDir, "..");
const rootPkgPath = join(rootDir, "package.json");

const rootPkg = JSON.parse(readFileSync(rootPkgPath, "utf8"));
const version = rootPkg.version;

if (!version) {
  console.error("sync-versions: root package.json has no `version` field.");
  process.exit(1);
}

const targets = [
  "apps/web/package.json",
  "apps/server/package.json",
  "apps/desktop/package.json",
  "packages/shared/package.json",
];

let updated = 0;
let skipped = 0;

for (const rel of targets) {
  const abs = join(rootDir, rel);
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(abs, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") {
      console.warn(`sync-versions: SKIP missing ${rel}`);
      skipped++;
      continue;
    }
    throw err;
  }
  if (pkg.version === version) {
    console.log(`sync-versions: OK    ${rel} already ${version}`);
    continue;
  }
  pkg.version = version;
  // 2-space indent + trailing newline; preserve JSON otherwise untouched.
  writeFileSync(abs, JSON.stringify(pkg, null, 2) + "\n", "utf8");
  console.log(`sync-versions: SET   ${rel} -> ${version}`);
  updated++;
}

console.log(
  `sync-versions: done (version=${version}, updated=${updated}, skipped=${skipped})`,
);

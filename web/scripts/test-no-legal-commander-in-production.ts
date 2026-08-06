/**
 * Static check: production commander paths must not reference legalCommander.
 * Run: npx tsx scripts/test-no-legal-commander-in-production.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertNoLegalCommanderInProductionPaths,
  PRODUCTION_COMMANDER_PATHS,
} from "../src/lib/deck-builder/commander-production-guards";

const root = resolve(process.cwd());
const violations = assertNoLegalCommanderInProductionPaths((rel) =>
  readFileSync(resolve(root, rel), "utf8"),
);

if (violations.length) {
  console.error("legalCommander references in production commander paths:");
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}

console.log(
  `no legalCommander in ${PRODUCTION_COMMANDER_PATHS.length} production commander paths`,
);

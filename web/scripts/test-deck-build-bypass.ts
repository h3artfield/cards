/**
 * Ensures production deck-build paths cannot start from free-form commanderName.
 * Run: npm run test:deck-build-bypass
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

function pass(label: string) {
  console.log(`✓ ${label}`);
}

const serviceSource = readFileSync(
  join(root, "lib/store-inventory/commander-deck-build-service.ts"),
  "utf8",
);
assert.ok(
  serviceSource.includes(
    "production paths cannot use free-form commanderName",
  ),
  "runDeckBuildStep rejects commanderName-only init",
);
pass("runDeckBuildStep rejects commanderName-only initialization");

assert.ok(
  !serviceSource.includes("export async function runFullDeckBuild"),
  "runFullDeckBuild removed from production service",
);
pass("runFullDeckBuild removed from production service");

const specialistSource = readFileSync(
  join(root, "lib/store-inventory/specialists/mtg-commander-specialist.ts"),
  "utf8",
);
assert.ok(
  !specialistSource.includes("commanderName: session ? undefined : input.commanderName"),
  "specialist no longer passes commanderName to bypass resolution",
);
pass("mtg-commander-specialist uses message-based deck build");

const routeSource = readFileSync(
  join(root, "app/api/store/[slug]/inventory/clerk/deck-build/route.ts"),
  "utf8",
);
assert.ok(routeSource.includes("runDeckBuildStep"), "deck-build route uses runDeckBuildStep");
assert.ok(!routeSource.includes("runFullDeckBuild"), "deck-build route does not use runFullDeckBuild");
pass("deck-build API route has no runFullDeckBuild import");

console.log("\nDeck build bypass tests PASSED");

/**
 * Playable exact resolution + display-name regression (requires Firestore catalog).
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadDeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import { canonicalizeDisplayName } from "./professor-canonical-card-identity-v4-15-1-v1";
import {
  PLAYABLE_EXACT_RESOLUTION_REGRESSION_NAMES_V111,
  resolvePlayableExactNameInCatalog,
} from "./professor-playable-oracle-resolution-v1-1-1";

function loadEnvLocal() {
  for (const rel of [".env.local", "web/.env.local"]) {
    const path = resolve(process.cwd(), rel);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

async function main() {
  loadEnvLocal();

  assert.equal(canonicalizeDisplayName("Overgrown Tomb // Overgrown Tomb"), "Overgrown Tomb");
  assert.equal(canonicalizeDisplayName("Bastion of Remembrance // Bastion of Remembrance"), "Bastion of Remembrance");
  assert.equal(canonicalizeDisplayName("Assault // Battery"), "Assault // Battery");
  assert.equal(canonicalizeDisplayName("Adventurous Eater // Have a Bite"), "Adventurous Eater // Have a Bite");

  const catalog = await loadDeckResolutionCatalog();
  const commanderColorIdentity = ["B", "G"];

  for (const name of PLAYABLE_EXACT_RESOLUTION_REGRESSION_NAMES_V111) {
    const resolved = resolvePlayableExactNameInCatalog({
      name,
      catalog,
      commanderColorIdentity,
    });
    assert.equal(resolved.resolved, true, `${name} should resolve`);
    assert.ok(resolved.oracleId, `${name} oracleId`);
    assert.equal(resolved.commanderLegal, true, `${name} commanderLegal`);
    assert.equal(resolved.colorLegal, true, `${name} colorLegal`);
    assert.equal(resolved.canonicalName, name, `${name} canonicalName`);
    assert.equal(
      canonicalizeDisplayName(resolved.canonicalName),
      name,
      `${name} display canonicalization`,
    );
  }

  console.log("PASS playable exact resolution regression — 8 archived names resolve to playable Commander-legal cards");
  console.log("ALL PASS — professor-playable-oracle-resolution-v1-1-1");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

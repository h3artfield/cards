/**
 * v4.14 — Metric regression: Assassin's Trophy + Heroic Intervention.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadDeckResolutionCatalog } from "./lib/load-deck-resolution-catalog";
import { assertMetricRegressionV414 } from "../src/lib/deck-synthesis/professor-verified-final-snapshot-v4-14-v1";
import { buildFunctionalCardProfileV47 } from "../src/lib/deck-synthesis/professor-functional-profile-v4-7-v1";

function loadEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
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
loadEnvLocal();

async function main() {
  const catalog = await loadDeckResolutionCatalog();

  const trophy = assertMetricRegressionV414({
    catalog,
    cardNames: ["Assassin's Trophy", "Forest", "Forest", "Forest"],
    expectInteraction: 1,
  });
  console.log("Assassin's Trophy test:", trophy.ok ? "PASS" : "FAIL", trophy.verified.interaction, trophy.errors);

  const heroic = assertMetricRegressionV414({
    catalog,
    cardNames: ["Heroic Intervention", "Forest", "Forest", "Forest"],
    expectProtection: 1,
  });
  console.log("Heroic Intervention test:", heroic.ok ? "PASS" : "FAIL", heroic.verified.protection, heroic.errors);

  const combined = assertMetricRegressionV414({
    catalog,
    cardNames: ["Assassin's Trophy", "Heroic Intervention", "Sol Ring", "Forest"],
    expectInteraction: 1,
    expectProtection: 1,
  });
  console.log("Combined test:", combined.ok ? "PASS" : "FAIL", combined.errors);

  for (const name of ["Assassin's Trophy", "Heroic Intervention"]) {
    for (const [, g] of catalog.byOracleId.entries()) {
      if (g.canonicalName === name) {
        const p = buildFunctionalCardProfileV47(g);
        console.log(`${name} roles:`, p.roles.join(", "));
        break;
      }
    }
  }

  if (!trophy.ok || !heroic.ok || !combined.ok) process.exit(1);
  console.log("\nAll metric regression tests PASSED");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * Audits a decklist's land base with the Oracle-derived mana quality model,
 * resolving cards through the same catalog the Professor uses at build time.
 *
 * Usage: tsx scripts/audit-decklist-land-quality-v1.ts <decklist.txt> <IDENTITY>
 * e.g.  tsx scripts/audit-decklist-land-quality-v1.ts fynn.txt G
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadProjectEnvLocal } from "./lib/script-env";
import { loadDeckResolutionCatalog } from "./lib/load-deck-resolution-catalog";
import { combinedGoldenOracleText } from "./lib/load-golden-catalog-index";
import { resolveCanonicalCardIdentity } from "@/lib/deck-synthesis/professor-canonical-card-identity-v4-15-1-v1";
import {
  classifyLandManaQualityV1,
  landManaQualityRankV1,
  summarizeLandBaseManaV1,
  type LandManaProfileV1,
} from "@/lib/deck-synthesis/professor-sol-directed-land-mana-quality-v1";

loadProjectEnvLocal();

async function main(): Promise<void> {
  const [file, identityArg] = process.argv.slice(2);
  if (!file || !identityArg) throw new Error("usage: <decklist.txt> <IDENTITY e.g. G>");
  const identity = identityArg.toUpperCase().split("");

  const catalog = await loadDeckResolutionCatalog();

  const rows: Array<{ name: string; copies: number }> = [];
  for (const line of readFileSync(resolve(file), "utf8").split(/\r?\n/)) {
    const match = line.trim().match(/^(\d+)\s+(.+?)(?:\s*\(commander\))?$/i);
    if (!match) continue;
    rows.push({ copies: Number(match[1]), name: match[2]!.trim() });
  }

  const lands: Array<{ profile: LandManaProfileV1; copies: number }> = [];
  const unresolved: string[] = [];
  for (const row of rows) {
    const resolved = resolveCanonicalCardIdentity({ name: row.name, catalog });
    if (!resolved.oracleId) {
      unresolved.push(row.name);
      continue;
    }
    const card = catalog.byOracleId.get(resolved.oracleId);
    if (!card) {
      unresolved.push(row.name);
      continue;
    }
    if (!/\bland\b/i.test(card.typeLine ?? "")) continue;
    lands.push({
      copies: row.copies,
      profile: classifyLandManaQualityV1({
        name: card.canonicalName,
        oracleText: combinedGoldenOracleText(card),
        commanderColorIdentity: identity,
      }),
    });
  }

  lands.sort(
    (a, b) =>
      landManaQualityRankV1(b.profile) - landManaQualityRankV1(a.profile) ||
      a.profile.name.localeCompare(b.profile.name),
  );

  console.log(`identity: ${identity.join("")}   deck rows: ${rows.length}\n`);
  console.log("rank  copies  land                             role");
  for (const { profile, copies } of lands) {
    const rank = String(landManaQualityRankV1(profile)).padStart(4);
    console.log(`${rank}  ${String(copies).padStart(6)}  ${profile.name.padEnd(32)} ${profile.role}`);
  }

  const summary = summarizeLandBaseManaV1(lands);
  console.log("\nsummary");
  console.log(`  total lands ................... ${summary.totalLands}`);
  console.log(`  count toward source target .... ${summary.identitySources}`);
  console.log(`  untapped, unconditional ....... ${summary.untappedUnconditionalSources}`);
  console.log(`  colorless only ................ ${summary.colorlessOnly}`);
  console.log(`  unusable in identity .......... ${summary.unusable.length ? summary.unusable.join(", ") : "none"}`);
  if (unresolved.length > 0) console.log(`  unresolved names .............. ${unresolved.join(", ")}`);
}

void main();

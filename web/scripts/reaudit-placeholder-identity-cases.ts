/**
 * Reaudit placeholder (_____) identity cases — enhanced catalog resolver.
 * Run: npx tsx scripts/reaudit-placeholder-identity-cases.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvLocal } from "./lib/script-env";
import { loadGoldenCatalogIndex, goldenFaceRecords } from "./lib/load-golden-catalog-index";
import {
  buildCatalogResolverIndexes,
  resolveCatalogSeed,
  classifyUnresolvedSeed,
  type SeedNameClassification,
} from "./lib/catalog-resolver";
import { buildDevelopmentCardNameLookup } from "./lib/dev-case-card-name-lookup";
import { buildFullEvalCardNameLookup } from "./lib/eval-case-card-name-lookup";
import type { CatalogEvalCase } from "./lib/eval-provenance-guard";

loadEnvLocal();

const PLACEHOLDER_ORACLE_ID = "4e536142-4ebe-4062-887b-5dd123c41d39";
const PLACEHOLDER_NAME = "_____";

function mergeLookups(): Map<string, string> {
  const lookup = buildFullEvalCardNameLookup();
  for (const [k, v] of buildDevelopmentCardNameLookup()) lookup.set(k, v);
  return lookup;
}

async function main() {
  const catalog = await loadGoldenCatalogIndex();
  const indexes = buildCatalogResolverIndexes(catalog);
  const lookup = mergeLookups();

  const v13Path = resolve(process.cwd(), "data/oracle-action-eval-development-v13.json");
  const v13 = JSON.parse(readFileSync(v13Path, "utf8")) as { cases: CatalogEvalCase[] };
  const placeholderCases = v13.cases.filter(
    (c) => c.cardName === PLACEHOLDER_NAME || c.oracleId === PLACEHOLDER_ORACLE_ID,
  );

  console.log(`\n=== Golden catalog verification ===`);
  for (const q of [
    "Brazen Borrower // Petty Theft",
    "Brazen Borrower",
    "Petty Theft",
    "Dusk // Dawn",
    "Dawn // Dusk",
    "Embereth Shieldbreaker // Battle Display",
    "Embereth Shieldbreaker",
    "Battle Display",
    "Heart of Ardente",
  ]) {
    const r = resolveCatalogSeed(catalog, indexes, { name: q });
    console.log(
      r
        ? `  FOUND ${q} => ${r.canonicalName} [${r.matchedBy}] faces: ${goldenFaceRecords(r.card).map((f) => f.faceName).join(" | ")}`
        : `  MISS  ${q} (class: ${classifyUnresolvedSeed(q, catalog, indexes)})`,
    );
  }

  console.log(`\n=== Reaudit ${placeholderCases.length} placeholder cases ===`);

  const results: Array<{
    caseId: string;
    intendedSeedName?: string;
    outcome: "resolved" | "excluded";
    matchedBy?: SeedNameClassification;
    correctedName?: string;
    canonicalName?: string;
    oracleId?: string;
    seedClassification?: SeedNameClassification;
    exclusionReason?: string;
  }> = [];

  const stats = {
    reviewed: placeholderCases.length,
    resolved: 0,
    excluded: 0,
    partialName: 0,
    reversedName: 0,
    wrongCompanionFace: 0,
    typo: 0,
    catalogOmission: 0,
    trulyNonexistent: 0,
  };

  for (const testCase of placeholderCases) {
    const intended = lookup.get(testCase.id);
    const resolution = intended
      ? resolveCatalogSeed(catalog, indexes, {
          name: intended,
          layout: testCase.layout,
          face: testCase.cardFace,
        })
      : null;

    if (resolution) {
      stats.resolved++;
      if (resolution.matchedBy === "partial_multiface_name" || resolution.matchedBy === "exact_face_name") stats.partialName++;
      if (resolution.matchedBy === "reversed_split_name") stats.reversedName++;
      if (resolution.matchedBy === "wrong_companion_face") stats.wrongCompanionFace++;
      results.push({
        caseId: testCase.id,
        intendedSeedName: intended,
        outcome: "resolved",
        matchedBy: resolution.matchedBy,
        correctedName: resolution.correctedName,
        canonicalName: resolution.canonicalName,
        oracleId: resolution.oracleId,
        seedClassification: resolution.matchedBy,
      });
    } else {
      stats.excluded++;
      const cls = intended ? classifyUnresolvedSeed(intended, catalog, indexes) : "truly_nonexistent";
      if (cls === "catalog_omission") stats.catalogOmission++;
      if (cls === "truly_nonexistent") stats.trulyNonexistent++;
      results.push({
        caseId: testCase.id,
        intendedSeedName: intended,
        outcome: "excluded",
        seedClassification: cls,
        exclusionReason: "unresolved_seed_identity",
      });
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    catalogCardCount: catalog.cardCount,
    placeholderCasesReviewed: stats.reviewed,
    resolvedToRealCatalogCard: stats.resolved,
    excludedAsIndeterminate: stats.excluded,
    partialNameResolutions: stats.partialName,
    reversedNameResolutions: stats.reversedName,
    incorrectFacePairSeeds: stats.wrongCompanionFace,
    trueCatalogOmissions: stats.catalogOmission,
    heartOfArdenteOrigin:
      "Incorrect Adventure pairing in MULTIFACE_CARD_NAMES (dev-case-card-name-lookup.ts) — canonical spell is Battle Display",
    resolverChanges: [
      "catalog-resolver.ts: face-name index, split reversal, partial multiface, curated aliases",
      "CURATED_ALIASES: Dawn//Dusk→Dusk//Dawn, Heart of Ardente→Battle Display",
    ],
    cases: results,
  };

  const outPath = resolve(process.cwd(), "reports/placeholder-identity-reaudit.json");
  mkdirSync(resolve(outPath, ".."), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");
  console.log("\n", JSON.stringify(stats, null, 2));
  console.log(`Report: ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

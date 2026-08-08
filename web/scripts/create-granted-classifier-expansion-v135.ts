/**
 * Build catalog-backed granted-classifier expansion cases from Firestore golden catalog.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvLocal } from "./lib/script-env";
import { loadGoldenCatalogIndex, lookupGoldenByName, goldenOracleTextHash } from "./lib/load-golden-catalog-index";
import { loadExcludedOracleIds, assertNoOracleIdOverlap } from "./lib/benchmark-oracle-id-exclusions";
import { GRANTED_CLASSIFIER_EXPANSION_V135_SEEDS } from "./development-granted-classifier-expansion-v135-seeds";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";

loadEnvLocal();

const OUT_PATH = "data/oracle-action-eval-granted-classifier-expansion-v135.json";
const DEV_PATHS = [
  "data/oracle-action-eval-development-v26-v14.json",
  "data/oracle-action-eval-rc3-positive-training-catalog-v133.json",
];

function loadDevOracleIds(): Set<string> {
  const ids = loadExcludedOracleIds();
  for (const rel of DEV_PATHS) {
    const path = resolve(rel);
    if (!existsSync(path)) continue;
    for (const c of (JSON.parse(readFileSync(path, "utf8")) as { cases: Array<{ oracleId: string }> }).cases) {
      ids.add(c.oracleId);
    }
  }
  return ids;
}

async function main() {
  const catalog = await loadGoldenCatalogIndex();
  const excluded = loadDevOracleIds();
  const cases: Array<OracleActionEvalCaseV2 & { expansionLabel: string; expectedGrantedRegionCount: number }> = [];

  for (const [index, seed] of GRANTED_CLASSIFIER_EXPANSION_V135_SEEDS.entries()) {
    const card = lookupGoldenByName(catalog, seed.cardName);
    if (!card) {
      console.warn(`SKIP missing catalog card: ${seed.cardName}`);
      continue;
    }
    if (excluded.has(card.oracleId)) {
      console.warn(`SKIP excluded oracleId: ${seed.cardName}`);
      continue;
    }
    cases.push({
      id: `granted-exp-v135-${String(index + 1).padStart(3, "0")}`,
      category: `granted-expansion-${seed.category}`,
      layout: card.layout ?? "normal",
      oracleId: card.oracleId,
      oracleText: card.oracleText ?? "",
      cardName: card.canonicalName ?? seed.cardName,
      expectedPrimitiveActions: [],
      expectedStructure: {},
      expectedRoles: [],
      coverageStratum: "granted_classifier_expansion_v135",
      expansionLabel: seed.label,
      expectedGrantedRegionCount: seed.expectedGrantedRegionCount,
      selectionRule: seed.selectionRule,
      goldenCatalogVersion: catalog.catalogVersion,
      goldenOracleTextHash: goldenOracleTextHash(card.oracleText),
      evaluationLabelVersion: "granted-classifier-expansion-v135",
      taxonomyVersion: "three-layer-v1.4",
      reviewer: "granted-classifier-expansion-v135",
      caseScope: "full_card",
      scopeReason: seed.selectionRule,
    });
  }

  assertNoOracleIdOverlap(cases, excluded, "granted-classifier-expansion-v135");

  const envelope = {
    generatedAt: new Date().toISOString(),
    setVersion: "granted-classifier-expansion-v135",
    caseCount: cases.length,
    contentHash: createHash("sha256").update(JSON.stringify(cases)).digest("hex"),
    cases,
  };

  writeFileSync(resolve(OUT_PATH), `${JSON.stringify(envelope, null, 2)}\n`);
  console.log(JSON.stringify({ outPath: OUT_PATH, caseCount: cases.length, positive: cases.filter((c) => c.expansionLabel === "positive_granted_region").length, negative: cases.filter((c) => c.expansionLabel === "negative_non_granted_region").length }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

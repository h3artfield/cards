/**
 * Build catalog-backed granted negative-control cases (v1.35).
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvLocal } from "./lib/script-env";
import { loadGoldenCatalogIndex, goldenOracleTextHash } from "./lib/load-golden-catalog-index";
import { resolveNamedCardFromCatalog, CatalogSeedResolutionError } from "./lib/eval-case-from-catalog";
import { selectionRuleTargetFragment, targetSubstringInOracle } from "./lib/benchmark-identity";
import { loadExcludedOracleIds, assertNoOracleIdOverlap } from "./lib/benchmark-oracle-id-exclusions";
import { GRANTED_NEGATIVE_CONTROLS_V135 } from "./development-granted-negative-controls-v135-seeds";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";

loadEnvLocal();

const OUT_PATH = "data/oracle-action-eval-granted-negative-controls-v135.json";
const DEV_PATHS = [
  "data/oracle-action-eval-development-v26-v14.json",
  "data/oracle-action-eval-rc3-positive-training-catalog-v133.json",
  "data/oracle-action-eval-granted-classifier-expansion-v135.json",
];

function loadExcluded(): Set<string> {
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
  const excluded = loadExcluded();
  const cases: Array<
    OracleActionEvalCaseV2 & {
      expansionLabel: "negative_non_granted_region";
      expectedGrantedRegionCount: 0;
      category: string;
      selectionRule: string;
    }
  > = [];

  for (const [index, seed] of GRANTED_NEGATIVE_CONTROLS_V135.entries()) {
    let identity;
    try {
      identity = resolveNamedCardFromCatalog(catalog, { name: seed.cardName }, "granted-negative-controls-v135");
    } catch (err) {
      if (err instanceof CatalogSeedResolutionError) {
        console.warn(`SKIP unresolved catalog card: ${seed.cardName}`);
        continue;
      }
      throw err;
    }
    if (excluded.has(identity.oracleId)) {
      console.warn(`SKIP excluded oracleId: ${seed.cardName}`);
      continue;
    }
    const target = selectionRuleTargetFragment(seed.selectionRule);
    if (target && !targetSubstringInOracle(identity.oracleText, target)) {
      console.warn(`SKIP selectionRule unresolved for ${seed.cardName}: "${target}" not in catalog oracle`);
      continue;
    }
    cases.push({
      id: `granted-neg-v135-${String(index + 1).padStart(3, "0")}`,
      category: `granted-negative-${seed.category}`,
      layout: identity.layout ?? "normal",
      oracleId: identity.oracleId,
      oracleText: identity.oracleText,
      cardName: identity.cardName,
      expectedPrimitiveActions: [],
      expectedStructure: {},
      expectedRoles: [],
      coverageStratum: "granted_negative_controls_v135",
      expansionLabel: "negative_non_granted_region",
      expectedGrantedRegionCount: 0,
      selectionRule: seed.selectionRule,
      goldenCatalogVersion: catalog.catalogVersion,
      goldenOracleTextHash: identity.goldenOracleTextHash,
      evaluationLabelVersion: "granted-negative-controls-v135",
      taxonomyVersion: "three-layer-v1.4",
      reviewer: "granted-negative-controls-v135",
      caseScope: "full_card",
      scopeReason: seed.selectionRule,
    });
  }

  assertNoOracleIdOverlap(cases, excluded, "granted-negative-controls-v135");

  const envelope = {
    generatedAt: new Date().toISOString(),
    setVersion: "granted-negative-controls-v135",
    caseCount: cases.length,
    contentHash: createHash("sha256").update(JSON.stringify(cases)).digest("hex"),
    cases,
  };

  writeFileSync(resolve(OUT_PATH), `${JSON.stringify(envelope, null, 2)}\n`);
  console.log(JSON.stringify({ outPath: OUT_PATH, caseCount: cases.length }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

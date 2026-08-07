/**
 * Create development_set_v8 = development_set_v7 + generalization expansion (immutable v7 preserved).
 * Run: npx tsx scripts/create-development-set-v8-expansion.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import {
  buildDevExpansionCases,
  DEV_EXPANSION_V8_SEEDS,
  familyCounts,
} from "./development-set-v8-expansion-seeds";
import { computeContentHash, REVIEWER_ID, TAXONOMY_VERSION } from "./oracle-action-eval-shared";

const V7_HASH = "6274107dfae50b3c8938099079004e36bdf3ce18e3bb3b8407e9af1cf409a147";

function main() {
  const v7Path = resolve(process.cwd(), "data", "oracle-action-eval-development-v7.json");
  const v8Path = resolve(process.cwd(), "data", "oracle-action-eval-development-v8.json");
  const diffPath = resolve(process.cwd(), "data", "oracle-action-eval-development-v8-diff.json");
  const manifestPath = resolve(process.cwd(), "data", "oracle-action-eval-sets-manifest.json");

  const v7 = JSON.parse(readFileSync(v7Path, "utf8")) as {
    cases: OracleActionEvalCaseV2[];
    contentHash: string;
    caseCount: number;
    multifaceGoldSupportByLayout?: Record<string, number>;
  };

  if (v7.contentHash !== V7_HASH) {
    throw new Error(`development_set_v7 hash mismatch: ${v7.contentHash.slice(0, 12)}…`);
  }

  const expansionCases = buildDevExpansionCases(1);
  const v8Cases = [...v7.cases, ...expansionCases];
  const v8Hash = computeContentHash(v8Cases);
  const reviewedAt = new Date().toISOString();

  const v8 = {
    setClassification: "development_set_v8",
    evaluationVersion: "development-v8-generalization-expansion",
    contentHash: v8Hash,
    taxonomyVersion: TAXONOMY_VERSION,
    caseCount: v8Cases.length,
    frozenAt: reviewedAt,
    usagePolicy:
      "Parser tuning — v8 adds manually reviewed generalization cases from validation failure families (not validation cards).",
    parentClassification: "development_set_v7",
    parentContentHash: V7_HASH,
    parentSetPath: "data/oracle-action-eval-development-v7.json",
    parentCaseCount: v7.caseCount,
    expansionCaseCount: expansionCases.length,
    expansionFamilies: familyCounts(),
    reviewer: REVIEWER_ID,
    reviewTimestamp: reviewedAt,
    multifaceGoldSupportByLayout: v7.multifaceGoldSupportByLayout,
    cases: v8Cases,
  };

  writeFileSync(v8Path, JSON.stringify(v8, null, 2), "utf8");
  writeFileSync(
    diffPath,
    JSON.stringify(
      {
        generatedAt: reviewedAt,
        reviewer: REVIEWER_ID,
        parentDataset: "development_set_v7",
        parentContentHash: V7_HASH,
        newDataset: "development_set_v8",
        newContentHash: v8Hash,
        addedCaseCount: expansionCases.length,
        reasonForChange:
          "Generalization expansion from validation failure families using different catalog cards.",
        addedCases: expansionCases.map((c, i) => ({
          caseId: c.id,
          cardName: DEV_EXPANSION_V8_SEEDS[i]?.name,
          family: DEV_EXPANSION_V8_SEEDS[i]?.family,
          category: c.category,
          primitiveCount: c.expectedPrimitiveActions.length,
        })),
        familyCounts: familyCounts(),
      },
      null,
      2,
    ),
    "utf8",
  );

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
  manifest.developmentSetV7 = {
    path: "data/oracle-action-eval-development-v7.json",
    classification: "development_set_v7",
    contentHash: V7_HASH,
    caseCount: v7.caseCount,
    purpose: "Frozen v1.12 checkpoint baseline",
  };
  manifest.developmentSet = {
    path: "data/oracle-action-eval-development-v8.json",
    classification: "development_set_v8",
    contentHash: v8Hash,
    caseCount: v8Cases.length,
    purpose: "Parser tuning — v8 generalization expansion",
    parentVersion: {
      classification: "development_set_v7",
      contentHash: V7_HASH,
      path: "data/oracle-action-eval-development-v7.json",
    },
    diffManifest: "data/oracle-action-eval-development-v8-diff.json",
    reviewer: REVIEWER_ID,
    reviewTimestamp: reviewedAt,
    expansionFamilies: familyCounts(),
  };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  console.log("Created development_set_v8");
  console.log(`  parent v7: ${V7_HASH.slice(0, 12)}…`);
  console.log(`  hash: ${v8Hash.slice(0, 12)}…`);
  console.log(`  added: ${expansionCases.length} cases`);
  console.log("  families:", familyCounts());
}

main();

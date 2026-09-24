/**
 * Create development_set_v10 = development_set_v7 + catalog-backed v9 expansion.
 * Run: npx tsx scripts/create-development-set-v10.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvLocal } from "./lib/script-env";
import { loadGoldenCatalogIndex } from "./lib/load-golden-catalog-index";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import {
  buildDevV9ExpansionCases,
  DEV_EXPANSION_V9_SEEDS,
  familyCounts,
} from "./development-set-v9-expansion-seeds";
import { computeContentHash, REVIEWER_ID, TAXONOMY_VERSION } from "./oracle-action-eval-shared";

loadEnvLocal();

const V7_HASH = "6274107dfae50b3c8938099079004e36bdf3ce18e3bb3b8407e9af1cf409a147";
const V9_HASH = "26cf5d1e8f251509ee68da3a3026621aaab6822f0b6678573e7bfbd3d3ed35e0";

async function main() {
  const catalog = await loadGoldenCatalogIndex();
  const v7Path = resolve(process.cwd(), "data", "oracle-action-eval-development-v7.json");
  const v9Path = resolve(process.cwd(), "data", "oracle-action-eval-development-v9.json");
  const v10Path = resolve(process.cwd(), "data", "oracle-action-eval-development-v10.json");
  const diffPath = resolve(process.cwd(), "data", "oracle-action-eval-development-v10-diff.json");
  const manifestPath = resolve(process.cwd(), "data", "oracle-action-eval-sets-manifest.json");

  const v7 = JSON.parse(readFileSync(v7Path, "utf8")) as {
    cases: OracleActionEvalCaseV2[];
    contentHash: string;
  };
  const v9 = JSON.parse(readFileSync(v9Path, "utf8")) as {
    contentHash: string;
  };

  if (v7.contentHash !== V7_HASH) {
    throw new Error(`development_set_v7 hash mismatch`);
  }
  if (v9.contentHash !== V9_HASH) {
    throw new Error(`development_set_v9 hash mismatch — v9 frozen baseline expected`);
  }

  const expansionCases = buildDevV9ExpansionCases(1, catalog);
  let v10Cases = [...v7.cases, ...expansionCases];

  const taxonomyV12GoldPatches: Array<{
    caseId: string;
    reason: string;
    apply: (c: OracleActionEvalCaseV2) => OracleActionEvalCaseV2;
  }> = [
    {
      caseId: "dev-opt-007",
      reason: "Hand→battlefield put is put_onto_battlefield under three-layer-v1.2.",
      apply: (c) => {
        const next = structuredClone(c);
        for (const exp of next.expectedPrimitiveActions) {
          if (exp.actionType === "search_library" && exp.evidenceContains.includes("put a land card from your hand")) {
            exp.actionType = "put_onto_battlefield";
            exp.sourceZone = "hand";
            exp.destinationZone = "battlefield";
            exp.affectedObject = "land_card";
          }
        }
        return next;
      },
    },
    {
      caseId: "eval-0049",
      reason: "Put-from-graveyard onto battlefield uses put_onto_battlefield under v1.2.",
      apply: (c) => {
        const next = structuredClone(c);
        for (const exp of next.expectedPrimitiveActions) {
          if (exp.actionType === "return_to_battlefield" && exp.evidenceContains.includes("graveyard onto the battlefield")) {
            exp.actionType = "put_onto_battlefield";
            exp.sourceZone = "graveyard";
            exp.destinationZone = "battlefield";
          }
        }
        return next;
      },
    },
  ];

  for (let i = 0; i < v10Cases.length; i++) {
    const patch = taxonomyV12GoldPatches.find((p) => p.caseId === v10Cases[i].id);
    if (patch) v10Cases[i] = patch.apply(v10Cases[i]);
  }

  const v10Hash = computeContentHash(v10Cases);
  const reviewedAt = new Date().toISOString();

  const v10 = {
    setClassification: "development_set_v10",
    evaluationVersion: "development-v10-catalog-identity",
    contentHash: v10Hash,
    taxonomyVersion: TAXONOMY_VERSION,
    caseCount: v10Cases.length,
    frozenAt: reviewedAt,
    usagePolicy: "Parser tuning — catalogOracleCards-backed identity for v9 expansion seeds.",
    parentClassification: "development_set_v9",
    parentContentHash: V9_HASH,
    parentSetPath: "data/oracle-action-eval-development-v9.json",
    baseSetPath: "data/oracle-action-eval-development-v7.json",
    baseContentHash: V7_HASH,
    goldenCatalogVersion: catalog.catalogVersion,
    reviewer: REVIEWER_ID,
    reviewTimestamp: reviewedAt,
    expansionFamilies: familyCounts(),
    manualReviewConfirmedCount: DEV_EXPANSION_V9_SEEDS.length,
    cases: v10Cases,
  };

  writeFileSync(v10Path, JSON.stringify(v10, null, 2), "utf8");
  writeFileSync(
    diffPath,
    JSON.stringify(
      {
        generatedAt: reviewedAt,
        parentDataset: "development_set_v9",
        parentContentHash: V9_HASH,
        newDataset: "development_set_v10",
        newContentHash: v10Hash,
        goldenCatalogVersion: catalog.catalogVersion,
        identityFixNote:
          "v9 expansion cases now use catalog oracleId and oracleText; v7 base cases unchanged pending full dev regen.",
        ashiokFix: {
          caseId: "dev-v9-018",
          note: "Ashiok, Dream Render now uses catalog oracle text (not Grafdigger's Cage text).",
        },
        addedExpansionCount: expansionCases.length,
      },
      null,
      2,
    ),
    "utf8",
  );

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
  manifest.developmentSetV9 = {
    path: "data/oracle-action-eval-development-v9.json",
    classification: "development_set_v9",
    contentHash: V9_HASH,
    purpose: "Frozen pre-catalog-identity development baseline",
  };
  manifest.developmentSet = {
    path: "data/oracle-action-eval-development-v10.json",
    classification: "development_set_v10",
    contentHash: v10Hash,
    caseCount: v10Cases.length,
    taxonomyVersion: TAXONOMY_VERSION,
    purpose: "Catalog-backed identity for v9 expansion — parser tuning baseline post identity audit",
    parentVersion: {
      classification: "development_set_v9",
      contentHash: V9_HASH,
      path: "data/oracle-action-eval-development-v9.json",
    },
    diffManifest: "data/oracle-action-eval-development-v10-diff.json",
    reviewer: REVIEWER_ID,
    reviewTimestamp: reviewedAt,
  };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  console.log("Created development_set_v10");
  console.log(`  hash: ${v10Hash}`);
  console.log(`  cases: ${v10Cases.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

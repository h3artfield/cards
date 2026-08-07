/**
 * Create development_set_v9 = development_set_v7 + taxonomy v1.2 expansion.
 * Parent lineage: frozen development_set_v8 preserved unchanged.
 * Run: npx tsx scripts/create-development-set-v9.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import {
  buildDevV9ExpansionCases,
  DEV_EXPANSION_V9_SEEDS,
  familyCounts,
} from "./development-set-v9-expansion-seeds";
import { computeContentHash, REVIEWER_ID, TAXONOMY_VERSION } from "./oracle-action-eval-shared";

const V7_HASH = "6274107dfae50b3c8938099079004e36bdf3ce18e3bb3b8407e9af1cf409a147";
const V8_HASH = "4ba04ffa00af737900f971b40955bd8b04298199e9607d6081b5e89dd7d8c43d";

function caseSummary(c: OracleActionEvalCaseV2) {
  return {
    caseId: c.id,
    category: c.category,
    primitiveCount: c.expectedPrimitiveActions.length,
    forbiddenCount: c.forbiddenPrimitiveActions?.length ?? 0,
    oracleTextPreview: c.oracleText.split("\n")[0]?.slice(0, 80),
  };
}

function main() {
  const v7Path = resolve(process.cwd(), "data", "oracle-action-eval-development-v7.json");
  const v8Path = resolve(process.cwd(), "data", "oracle-action-eval-development-v8.json");
  const v9Path = resolve(process.cwd(), "data", "oracle-action-eval-development-v9.json");
  const diffPath = resolve(process.cwd(), "data", "oracle-action-eval-development-v9-diff.json");
  const manifestPath = resolve(process.cwd(), "data", "oracle-action-eval-sets-manifest.json");

  const v7 = JSON.parse(readFileSync(v7Path, "utf8")) as {
    cases: OracleActionEvalCaseV2[];
    contentHash: string;
    caseCount: number;
    multifaceGoldSupportByLayout?: Record<string, number>;
  };
  const v8 = JSON.parse(readFileSync(v8Path, "utf8")) as {
    cases: OracleActionEvalCaseV2[];
    contentHash: string;
    caseCount: number;
    frozenAt: string;
  };

  if (v7.contentHash !== V7_HASH) {
    throw new Error(`development_set_v7 hash mismatch: ${v7.contentHash.slice(0, 12)}…`);
  }
  if (v8.contentHash !== V8_HASH) {
    throw new Error(`development_set_v8 hash mismatch: got ${v8.contentHash.slice(0, 12)}… expected frozen v8`);
  }

  const expansionCases = buildDevV9ExpansionCases(1);
  if (expansionCases.length !== DEV_EXPANSION_V9_SEEDS.length) {
    throw new Error("Expansion case count mismatch");
  }
  if (DEV_EXPANSION_V9_SEEDS.some((s) => !s.manualReviewConfirmed)) {
    throw new Error("All v9 seeds must be manuallyReviewConfirmed");
  }

  const v9Cases = [...v7.cases, ...expansionCases];
  const v9Hash = computeContentHash(v9Cases);
  const reviewedAt = new Date().toISOString();

  const v8ById = new Map(v8.cases.map((c) => [c.id, c]));
  const v9ById = new Map(v9Cases.map((c) => [c.id, c]));
  const v8ExpansionIds = new Set(v8.cases.filter((c) => c.id.startsWith("dev-exp-")).map((c) => c.id));
  const v9ExpansionIds = new Set(expansionCases.map((c) => c.id));

  const removedCases = v8.cases
    .filter((c) => v8ExpansionIds.has(c.id))
    .map((c) => ({
      ...caseSummary(c),
      reason: "Superseded by taxonomy v1.2 development_set_v9 expansion (put_onto_battlefield distinctions, layer labels).",
    }));

  const addedCases = expansionCases.map((c, i) => ({
    ...caseSummary(c),
    cardName: DEV_EXPANSION_V9_SEEDS[i]?.name,
    family: DEV_EXPANSION_V9_SEEDS[i]?.family,
    layerNotes: DEV_EXPANSION_V9_SEEDS[i]?.layerNotes,
    manualReviewConfirmed: true,
    reviewer: REVIEWER_ID,
    reason: DEV_EXPANSION_V9_SEEDS[i]?.layerNotes,
  }));

  const changedCases: Array<{
    caseId: string;
    reason: string;
    before: unknown;
    after: unknown;
  }> = [];
  for (const [id, v8Case] of v8ById) {
    if (v8ExpansionIds.has(id)) continue;
    const v9Case = v9ById.get(id);
    if (!v9Case) continue;
    if (JSON.stringify(v8Case.expectedPrimitiveActions) !== JSON.stringify(v9Case.expectedPrimitiveActions)) {
      changedCases.push({
        caseId: id,
        reason: "Unexpected v7 base mutation — should be empty",
        before: v8Case.expectedPrimitiveActions,
        after: v9Case.expectedPrimitiveActions,
      });
    }
  }

  const v9 = {
    setClassification: "development_set_v9",
    evaluationVersion: "development-v9-taxonomy-v1.2-expansion",
    contentHash: v9Hash,
    taxonomyVersion: TAXONOMY_VERSION,
    caseCount: v9Cases.length,
    frozenAt: reviewedAt,
    usagePolicy:
      "Parser tuning for v1.13+ — taxonomy v1.2 put_onto_battlefield expansion. All 33 expansion cases manually reviewed against Oracle text.",
    parentClassification: "development_set_v8",
    parentContentHash: V8_HASH,
    parentSetPath: "data/oracle-action-eval-development-v8.json",
    parentCaseCount: v8.caseCount,
    baseSetClassification: "development_set_v7",
    baseContentHash: V7_HASH,
    expansionCaseCount: expansionCases.length,
    expansionFamilies: familyCounts(),
    manualReviewConfirmedCount: DEV_EXPANSION_V9_SEEDS.length,
    reviewer: REVIEWER_ID,
    reviewTimestamp: reviewedAt,
    multifaceGoldSupportByLayout: v7.multifaceGoldSupportByLayout,
    cases: v9Cases,
  };

  writeFileSync(v9Path, JSON.stringify(v9, null, 2), "utf8");
  writeFileSync(
    diffPath,
    JSON.stringify(
      {
        generatedAt: reviewedAt,
        reviewer: REVIEWER_ID,
        reviewTimestamp: reviewedAt,
        taxonomyVersion: TAXONOMY_VERSION,
        parentDataset: "development_set_v8",
        parentContentHash: V8_HASH,
        parentCaseCount: v8.caseCount,
        newDataset: "development_set_v9",
        newContentHash: v9Hash,
        newCaseCount: v9Cases.length,
        baseDataset: "development_set_v7",
        baseContentHash: V7_HASH,
        removedCaseCount: removedCases.length,
        addedCaseCount: addedCases.length,
        changedCaseCount: changedCases.length,
        reasonForChange:
          "Taxonomy three-layer-v1.2: put_onto_battlefield primitive, corrected layer labels, positive/negative contrasts for unsupported validation families. Replaces v8 expansion with 33 manually reviewed v9 seeds.",
        removedCases,
        addedCases,
        changedCases,
        familyCounts: familyCounts(),
        manualReviewAttestation:
          "All 33 added cases in DEV_EXPANSION_V9_SEEDS were manually reviewed directly against Oracle text by catalog-audit-agent.",
      },
      null,
      2,
    ),
    "utf8",
  );

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
  manifest.developmentSetV8 = {
    path: "data/oracle-action-eval-development-v8.json",
    classification: "development_set_v8",
    contentHash: V8_HASH,
    caseCount: v8.caseCount,
    purpose: "Frozen v1.1 taxonomy generalization expansion — immutable",
    frozenAt: v8.frozenAt,
    taxonomyVersion: "three-layer-v1.1",
  };
  manifest.developmentSet = {
    path: "data/oracle-action-eval-development-v9.json",
    classification: "development_set_v9",
    contentHash: v9Hash,
    caseCount: v9Cases.length,
    taxonomyVersion: TAXONOMY_VERSION,
    purpose: "Parser tuning — v1.2 taxonomy expansion for v1.13 parser work",
    parentVersion: {
      classification: "development_set_v8",
      contentHash: V8_HASH,
      path: "data/oracle-action-eval-development-v8.json",
    },
    diffManifest: "data/oracle-action-eval-development-v9-diff.json",
    reviewer: REVIEWER_ID,
    reviewTimestamp: reviewedAt,
    expansionFamilies: familyCounts(),
    manualReviewConfirmedCount: DEV_EXPANSION_V9_SEEDS.length,
  };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  console.log("development_set_v8 verified frozen");
  console.log(`  v8 hash: ${V8_HASH.slice(0, 12)}…`);
  console.log("Created development_set_v9");
  console.log(`  v9 hash: ${v9Hash.slice(0, 12)}…`);
  console.log(`  removed: ${removedCases.length}, added: ${addedCases.length}, changed: ${changedCases.length}`);
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("create-development-set-v9.ts")) {
  main();
}

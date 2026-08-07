/**
 * Restore immutable development_set_v5 (319ef3f9…) and create development_set_v6
 * with parent/diff manifest for gold-label corrections.
 * Run: npx tsx scripts/create-development-set-v6.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import {
  applyV6GoldPatches,
  V6_GOLD_PATCH_RECORDS,
  type GoldPatchRecord,
} from "./development-set-v6-gold-patches";
import { computeContentHash, REVIEWER_ID, TAXONOMY_VERSION } from "./oracle-action-eval-shared";

const V5_HASH = "319ef3f9fce2f2637da8582055d99ebbdf6e46f7e51763059493888e1742abbe";

function caseDiff(
  prior: OracleActionEvalCaseV2,
  next: OracleActionEvalCaseV2,
): Record<string, { before: unknown; after: unknown }> | null {
  const fields = [
    "oracleText",
    "expectedPrimitiveActions",
    "expectedConditions",
    "expectedStructure",
    "expectedRoles",
    "expectedFaces",
    "forbiddenPrimitiveActions",
    "category",
    "layout",
    "cardFace",
  ] as const;
  const delta: Record<string, { before: unknown; after: unknown }> = {};
  for (const field of fields) {
    if (JSON.stringify(prior[field]) !== JSON.stringify(next[field])) {
      delta[field] = { before: prior[field], after: next[field] };
    }
  }
  return Object.keys(delta).length ? delta : null;
}

function main() {
  const v5Path = resolve(process.cwd(), "data", "oracle-action-eval-development-v5.json");
  const v6Path = resolve(process.cwd(), "data", "oracle-action-eval-development-v6.json");
  const v6DiffPath = resolve(process.cwd(), "data", "oracle-action-eval-development-v6-diff.json");
  const manifestPath = resolve(process.cwd(), "data", "oracle-action-eval-sets-manifest.json");

  const v5 = JSON.parse(readFileSync(v5Path, "utf8")) as {
    cases: OracleActionEvalCaseV2[];
    contentHash: string;
    caseCount: number;
    setClassification: string;
    frozenAt: string;
    multifaceGoldSupportByLayout?: Record<string, number>;
  };

  if (v5.contentHash !== V5_HASH) {
    throw new Error(
      `development_set_v5 hash mismatch: expected ${V5_HASH.slice(0, 12)}…, got ${v5.contentHash.slice(0, 12)}…. Restore v5 from commit 3612cc2 first.`,
    );
  }

  V6_GOLD_PATCH_RECORDS.length = 0;
  const v6Cases = v5.cases.map((c) => JSON.parse(JSON.stringify(c)) as OracleActionEvalCaseV2);
  const patchCount = applyV6GoldPatches(v6Cases);
  const v6Hash = computeContentHash(v6Cases);
  const reviewedAt = new Date().toISOString();

  const labelChanges: Array<{
    caseId: string;
    reason: string;
    changedFields: string[];
    fieldDiff: Record<string, { before: unknown; after: unknown }>;
  }> = [];

  for (const record of V6_GOLD_PATCH_RECORDS) {
    const prior = v5.cases.find((c) => c.id === record.caseId);
    const next = v6Cases.find((c) => c.id === record.caseId);
    if (!prior || !next) continue;
    const delta = caseDiff(prior, next);
    if (delta) {
      labelChanges.push({
        caseId: record.caseId,
        reason: record.reason,
        changedFields: record.changedFields,
        fieldDiff: delta,
      });
    }
  }

  const v6 = {
    setClassification: "development_set_v6",
    evaluationVersion: "development-v6-gold-corrections",
    contentHash: v6Hash,
    taxonomyVersion: TAXONOMY_VERSION,
    caseCount: v6Cases.length,
    frozenAt: reviewedAt,
    usagePolicy:
      "Parser tuning set — gold corrections on v5 multiface corpus (replacement labels, cast/play split, incomplete gold).",
    parentClassification: "development_set_v5",
    parentContentHash: V5_HASH,
    parentSetPath: "data/oracle-action-eval-development-v5.json",
    parentCaseCount: v5.caseCount,
    multifaceGoldSupportByLayout: v5.multifaceGoldSupportByLayout,
    reviewer: REVIEWER_ID,
    reviewTimestamp: reviewedAt,
    cases: v6Cases,
  };

  writeFileSync(v6Path, JSON.stringify(v6, null, 2), "utf8");
  writeFileSync(
    v6DiffPath,
    JSON.stringify(
      {
        generatedAt: reviewedAt,
        reviewer: REVIEWER_ID,
        reviewTimestamp: reviewedAt,
        parentDataset: "development_set_v5",
        parentContentHash: V5_HASH,
        parentCaseCount: v5.caseCount,
        newDataset: "development_set_v6",
        newContentHash: v6Hash,
        newCaseCount: v6Cases.length,
        patchCount,
        changedCaseCount: labelChanges.length,
        reasonForChange:
          "Gold-label corrections after v1.9 development slice: replacement/multiface labels, incomplete gold, cast/play taxonomy audit.",
        labelChanges,
      },
      null,
      2,
    ),
    "utf8",
  );

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
  manifest.developmentSetV5 = {
    path: "data/oracle-action-eval-development-v5.json",
    classification: "development_set_v5",
    contentHash: V5_HASH,
    caseCount: v5.caseCount,
    purpose: "Frozen multiface gold expansion — immutable after 3612cc2",
    frozenAt: v5.frozenAt,
  };
  manifest.developmentSet = {
    path: "data/oracle-action-eval-development-v6.json",
    classification: "development_set_v6",
    contentHash: v6Hash,
    caseCount: v6Cases.length,
    taxonomyVersion: TAXONOMY_VERSION,
    purpose: "Parser tuning — v6 gold corrections (replacement, cast/play, incomplete labels)",
    parentVersion: {
      classification: "development_set_v5",
      contentHash: V5_HASH,
      caseCount: v5.caseCount,
      path: "data/oracle-action-eval-development-v5.json",
    },
    diffManifest: "data/oracle-action-eval-development-v6-diff.json",
    reviewer: REVIEWER_ID,
    reviewTimestamp: reviewedAt,
    multifaceGoldSupportByLayout: v5.multifaceGoldSupportByLayout,
    priorVersions: [
      ...((
        manifest.developmentSet as { priorVersions?: unknown[] } | undefined
      )?.priorVersions ?? []),
      {
        path: "data/oracle-action-eval-development-v5.json",
        classification: "development_set_v5",
        contentHash: V5_HASH,
        caseCount: v5.caseCount,
        supersededAt: reviewedAt,
        reason: "Gold-label corrections moved to v6; v5 frozen immutable",
      },
    ],
  };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  console.log("development_set_v5 verified immutable");
  console.log(`  hash: ${V5_HASH.slice(0, 12)}…`);
  console.log("Created development_set_v6");
  console.log(`  cases: ${v6Cases.length}, hash ${v6Hash.slice(0, 12)}…`);
  console.log(`  gold patches: ${patchCount}, changed cases: ${labelChanges.length}`);
}

main();

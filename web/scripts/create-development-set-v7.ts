/**
 * Restore immutable development_set_v6 (24d24887732e…) and create development_set_v7
 * with FN adjudication gold patches and parent/diff manifest.
 * Run: npx tsx scripts/create-development-set-v7.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import { applyV7GoldPatches, V7_GOLD_PATCH_RECORDS } from "./development-set-v7-gold-patches";
import { writeFnAdjudicationReport } from "./development-set-v7-fn-adjudication";
import { computeContentHash, REVIEWER_ID, TAXONOMY_VERSION } from "./oracle-action-eval-shared";

const V6_HASH = "24d24887732e5ae6412ee3597b1654753ccccf8cd4d044c095b07822e530bb9d";
const V6_COMMIT = "f7bf9b9";

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
  const repoRoot = resolve(process.cwd(), "..");
  const v6Path = resolve(process.cwd(), "data", "oracle-action-eval-development-v6.json");
  const v7Path = resolve(process.cwd(), "data", "oracle-action-eval-development-v7.json");
  const v7DiffPath = resolve(process.cwd(), "data", "oracle-action-eval-development-v7-diff.json");
  const manifestPath = resolve(process.cwd(), "data", "oracle-action-eval-sets-manifest.json");

  const v6Raw = execSync(`git show ${V6_COMMIT}:web/data/oracle-action-eval-development-v6.json`, {
    cwd: repoRoot,
    encoding: "utf8",
  });
  const v6 = JSON.parse(v6Raw) as {
    cases: OracleActionEvalCaseV2[];
    contentHash: string;
    caseCount: number;
    frozenAt: string;
    multifaceGoldSupportByLayout?: Record<string, number>;
  };

  if (v6.contentHash !== V6_HASH) {
    throw new Error(`development_set_v6 hash mismatch: expected ${V6_HASH.slice(0, 12)}…`);
  }

  writeFileSync(v6Path, JSON.stringify(v6, null, 2), "utf8");

  V7_GOLD_PATCH_RECORDS.length = 0;
  const v7Cases = v6.cases.map((c) => JSON.parse(JSON.stringify(c)) as OracleActionEvalCaseV2);
  const patchCount = applyV7GoldPatches(v7Cases);
  const v7Hash = computeContentHash(v7Cases);
  const reviewedAt = new Date().toISOString();

  const labelChanges: Array<{
    caseId: string;
    reason: string;
    changedFields: string[];
    fieldDiff: Record<string, { before: unknown; after: unknown }>;
  }> = [];

  for (const record of V7_GOLD_PATCH_RECORDS) {
    const prior = v6.cases.find((c) => c.id === record.caseId);
    const next = v7Cases.find((c) => c.id === record.caseId);
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

  const v7 = {
    setClassification: "development_set_v7",
    evaluationVersion: "development-v7-fn-adjudication",
    contentHash: v7Hash,
    taxonomyVersion: TAXONOMY_VERSION,
    caseCount: v7Cases.length,
    frozenAt: reviewedAt,
    usagePolicy:
      "Parser tuning set — v7 FN gold adjudication (structural-only, taxonomy corrections, duplicate label removal).",
    parentClassification: "development_set_v6",
    parentContentHash: V6_HASH,
    parentSetPath: "data/oracle-action-eval-development-v6.json",
    parentCaseCount: v6.caseCount,
    multifaceGoldSupportByLayout: v6.multifaceGoldSupportByLayout,
    reviewer: REVIEWER_ID,
    reviewTimestamp: reviewedAt,
    cases: v7Cases,
  };

  writeFileSync(v7Path, JSON.stringify(v7, null, 2), "utf8");
  writeFileSync(
    v7DiffPath,
    JSON.stringify(
      {
        generatedAt: reviewedAt,
        reviewer: REVIEWER_ID,
        reviewTimestamp: reviewedAt,
        parentDataset: "development_set_v6",
        parentContentHash: V6_HASH,
        parentCaseCount: v6.caseCount,
        newDataset: "development_set_v7",
        newContentHash: v7Hash,
        newCaseCount: v7Cases.length,
        patchCount,
        changedCaseCount: labelChanges.length,
        reasonForChange:
          "Manual FN adjudication: remove gold defects, structural-only labels, duplicate return primitives, flashback grant scope.",
        labelChanges,
      },
      null,
      2,
    ),
    "utf8",
  );

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
  manifest.developmentSetV6 = {
    path: "data/oracle-action-eval-development-v6.json",
    classification: "development_set_v6",
    contentHash: V6_HASH,
    caseCount: v6.caseCount,
    purpose: "Frozen at parser v1.10 — immutable after f7bf9b9",
    frozenAt: v6.frozenAt,
  };
  manifest.developmentSet = {
    path: "data/oracle-action-eval-development-v7.json",
    classification: "development_set_v7",
    contentHash: v7Hash,
    caseCount: v7Cases.length,
    taxonomyVersion: TAXONOMY_VERSION,
    purpose: "Parser tuning — v7 FN gold adjudication + unified matcher integrity",
    parentVersion: {
      classification: "development_set_v6",
      contentHash: V6_HASH,
      caseCount: v6.caseCount,
      path: "data/oracle-action-eval-development-v6.json",
    },
    diffManifest: "data/oracle-action-eval-development-v7-diff.json",
    reviewer: REVIEWER_ID,
    reviewTimestamp: reviewedAt,
    multifaceGoldSupportByLayout: v6.multifaceGoldSupportByLayout,
    priorVersions: [
      ...((manifest.developmentSet as { priorVersions?: unknown[] } | undefined)?.priorVersions ?? []),
      {
        path: "data/oracle-action-eval-development-v6.json",
        classification: "development_set_v6",
        contentHash: V6_HASH,
        caseCount: v6.caseCount,
        supersededAt: reviewedAt,
        reason: "FN adjudication moved to v7; v6 frozen immutable",
      },
    ],
  };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  writeFnAdjudicationReport(
    v7Cases,
    resolve(process.cwd(), "data", "oracle-action-eval-development-v7-fn-adjudication.json"),
  );

  console.log("development_set_v6 verified immutable");
  console.log(`  hash: ${V6_HASH.slice(0, 12)}…`);
  console.log("Created development_set_v7");
  console.log(`  hash: ${v7Hash.slice(0, 12)}…`);
  console.log(`  gold patches: ${patchCount}, changed cases: ${labelChanges.length}`);
}

main();

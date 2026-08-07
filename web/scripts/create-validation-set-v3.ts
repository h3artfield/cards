/**
 * Create validation_set_v3 from immutable validation_set_v2 + v12 missing-gold adjudication.
 * Run: npx tsx scripts/create-validation-set-v3.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import {
  VALIDATION_MISSING_GOLD_ADJUDICATIONS,
  type MissingGoldAdjudication,
} from "./adjudicate-validation-missing-gold-v12";
import { computeContentHash, REVIEWER_ID, TAXONOMY_VERSION } from "./oracle-action-eval-shared";

const V2_HASH = "496a5dd7fcc5c6259f600e25aeecaeead6a036a6574b53cc58e9001321943734";

function caseDiff(
  prior: OracleActionEvalCaseV2,
  next: OracleActionEvalCaseV2,
): Record<string, { before: unknown; after: unknown }> | null {
  if (JSON.stringify(prior.expectedPrimitiveActions) === JSON.stringify(next.expectedPrimitiveActions)) {
    return null;
  }
  return {
    expectedPrimitiveActions: {
      before: prior.expectedPrimitiveActions,
      after: next.expectedPrimitiveActions,
    },
  };
}

function applyAdjudications(cases: OracleActionEvalCaseV2[]): {
  cases: OracleActionEvalCaseV2[];
  labelChanges: Array<{
    caseId: string;
    reason: string;
    adjudication: MissingGoldAdjudication;
    fieldDiff: Record<string, { before: unknown; after: unknown }>;
  }>;
} {
  const byId = new Map(
    cases.map((c) => [c.id, { ...c, expectedPrimitiveActions: [...c.expectedPrimitiveActions] }]),
  );
  const labelChanges: Array<{
    caseId: string;
    reason: string;
    adjudication: MissingGoldAdjudication;
    fieldDiff: Record<string, { before: unknown; after: unknown }>;
  }> = [];

  for (const adj of VALIDATION_MISSING_GOLD_ADJUDICATIONS) {
    if (adj.decision !== "accept_into_gold") continue;
    const prior = cases.find((c) => c.id === adj.caseId);
    const testCase = byId.get(adj.caseId);
    if (!prior || !testCase) continue;

    const exists = testCase.expectedPrimitiveActions.some(
      (e) =>
        e.actionType === adj.proposedPrimitive &&
        e.evidenceContains.toLowerCase().includes(adj.evidenceSpan.toLowerCase().slice(0, 12)),
    );
    if (!exists) {
      testCase.expectedPrimitiveActions.push({
        actionType: adj.proposedPrimitive as OracleActionEvalCaseV2["expectedPrimitiveActions"][number]["actionType"],
        evidenceContains: adj.evidenceSpan,
      });
    }

    const delta = caseDiff(prior, testCase);
    if (delta) {
      labelChanges.push({
        caseId: adj.caseId,
        reason: adj.reason,
        adjudication: adj,
        fieldDiff: delta,
      });
    }
  }

  return { cases: [...byId.values()], labelChanges };
}

function main() {
  const v2Path = resolve(process.cwd(), "data", "oracle-action-eval-validation-v2.json");
  const v3Path = resolve(process.cwd(), "data", "oracle-action-eval-validation-v3.json");
  const diffPath = resolve(process.cwd(), "data", "oracle-action-eval-validation-v3-diff.json");
  const manifestPath = resolve(process.cwd(), "data", "oracle-action-eval-sets-manifest.json");

  const v2 = JSON.parse(readFileSync(v2Path, "utf8")) as {
    cases: OracleActionEvalCaseV2[];
    contentHash: string;
    caseCount: number;
    frozenAt: string;
  };

  if (v2.contentHash !== V2_HASH) {
    throw new Error(`validation_set_v2 hash mismatch: got ${v2.contentHash.slice(0, 12)}…`);
  }

  const { cases: v3Cases, labelChanges } = applyAdjudications(v2.cases);
  const v3Hash = computeContentHash(v3Cases);
  const reviewedAt = new Date().toISOString();

  const v3 = {
    setClassification: "validation_set_v3",
    evaluationVersion: "validation-v3-missing-gold-v12",
    contentHash: v3Hash,
    taxonomyVersion: TAXONOMY_VERSION,
    caseCount: v3Cases.length,
    frozenAt: reviewedAt,
    usagePolicy:
      "Occasional generalization measurement — gold corrections from v12 missing-label adjudication only.",
    parentClassification: "validation_set_v2",
    parentContentHash: V2_HASH,
    parentSetPath: "data/oracle-action-eval-validation-v2.json",
    parentCaseCount: v2.caseCount,
    reviewer: REVIEWER_ID,
    reviewTimestamp: reviewedAt,
    adjudicationSource: "adjudicate-validation-missing-gold-v12.ts",
    acceptedIntoGoldCount: labelChanges.length,
    rejectedProposalCount: VALIDATION_MISSING_GOLD_ADJUDICATIONS.filter(
      (a) => a.decision !== "accept_into_gold",
    ).length,
    cases: v3Cases,
  };

  writeFileSync(v3Path, JSON.stringify(v3, null, 2), "utf8");
  writeFileSync(
    diffPath,
    JSON.stringify(
      {
        generatedAt: reviewedAt,
        reviewer: REVIEWER_ID,
        reviewTimestamp: reviewedAt,
        parentDataset: "validation_set_v2",
        parentContentHash: V2_HASH,
        newDataset: "validation_set_v3",
        newContentHash: v3Hash,
        changedCaseCount: labelChanges.length,
        reasonForChange: "v12 missing-gold-label adjudication — accept supported untap primitives only.",
        labelChanges,
        fullAdjudicationLog: VALIDATION_MISSING_GOLD_ADJUDICATIONS,
      },
      null,
      2,
    ),
    "utf8",
  );

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
  manifest.validationSetV2 = {
    path: "data/oracle-action-eval-validation-v2.json",
    classification: "validation_set_v2",
    contentHash: V2_HASH,
    caseCount: v2.caseCount,
    purpose: "Frozen pre-v12-adjudication baseline",
    frozenAt: v2.frozenAt,
  };
  manifest.validationSet = {
    path: "data/oracle-action-eval-validation-v3.json",
    classification: "validation_set_v3",
    contentHash: v3Hash,
    caseCount: v3Cases.length,
    purpose: "Corrected validation baseline after v12 missing-gold adjudication",
    parentVersion: {
      classification: "validation_set_v2",
      contentHash: V2_HASH,
      path: "data/oracle-action-eval-validation-v2.json",
    },
    diffManifest: "data/oracle-action-eval-validation-v3-diff.json",
    reviewer: REVIEWER_ID,
    reviewTimestamp: reviewedAt,
    priorVersions: [
      ...((manifest.validationSet as { priorVersions?: unknown[] } | undefined)?.priorVersions ?? []),
      {
        path: "data/oracle-action-eval-validation-v2.json",
        classification: "validation_set_v2",
        contentHash: V2_HASH,
        caseCount: v2.caseCount,
        supersededAt: reviewedAt,
        reason: "v12 missing-gold adjudication moved to v3; v2 frozen immutable",
      },
    ],
  };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  console.log("validation_set_v2 verified immutable");
  console.log(`  hash: ${V2_HASH.slice(0, 12)}…`);
  console.log("Created validation_set_v3");
  console.log(`  hash: ${v3Hash.slice(0, 12)}…`);
  console.log(`  gold accepts: ${labelChanges.length}, rejected: ${v3.rejectedProposalCount}`);
}

main();

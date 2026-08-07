/**
 * Create validation_set_v4 from immutable validation_set_v3 + taxonomy v1.2 gold corrections.
 * Run: npx tsx scripts/create-validation-set-v4.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import { computeContentHash, REVIEWER_ID, TAXONOMY_VERSION } from "./oracle-action-eval-shared";

const V3_HASH = "4cbb7dfeb4646b1c965687b528f6e3d33784951e8adb72069b0325fa35875cda";

export interface TaxonomyV12GoldPatch {
  caseId: string;
  cardName: string;
  reason: string;
  apply: (testCase: OracleActionEvalCaseV2) => OracleActionEvalCaseV2;
}

export const TAXONOMY_V12_VALIDATION_PATCHES: TaxonomyV12GoldPatch[] = [
  {
    caseId: "held-0025",
    cardName: "Growth Spiral",
    reason:
      "Hand→battlefield land put is put_onto_battlefield, distinct from play, cast, and search_library.",
    apply: (c) => {
      const next = structuredClone(c);
      next.expectedPrimitiveActions.push({
        actionType: "put_onto_battlefield",
        evidenceContains: "put a land card from your hand onto the battlefield",
        sourceZone: "hand",
        destinationZone: "battlefield",
        affectedObject: "land_card",
        optionalEffect: true,
      });
      return next;
    },
  },
  {
    caseId: "held-0058",
    cardName: "Aether Vial",
    reason:
      "Creature put from hand onto battlefield is put_onto_battlefield, not return_to_battlefield or search_library.",
    apply: (c) => {
      const next = structuredClone(c);
      next.expectedPrimitiveActions = next.expectedPrimitiveActions.filter(
        (e) => e.actionType !== "return_to_battlefield",
      );
      next.expectedPrimitiveActions.push({
        actionType: "put_onto_battlefield",
        evidenceContains: "from your hand onto the battlefield",
        sourceZone: "hand",
        destinationZone: "battlefield",
        affectedObject: "creature_card",
        optionalEffect: true,
        condition: "manaValueCondition: charge counter count",
      });
      next.expectedRoles = [{ role: "recursion", fromPrimitiveActions: ["put_onto_battlefield"] }];
      return next;
    },
  },
];

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
    expectedRoles: {
      before: prior.expectedRoles,
      after: next.expectedRoles,
    },
  };
}

function main() {
  const v3Path = resolve(process.cwd(), "data", "oracle-action-eval-validation-v3.json");
  const v4Path = resolve(process.cwd(), "data", "oracle-action-eval-validation-v4.json");
  const diffPath = resolve(process.cwd(), "data", "oracle-action-eval-validation-v4-diff.json");
  const manifestPath = resolve(process.cwd(), "data", "oracle-action-eval-sets-manifest.json");

  const v3 = JSON.parse(readFileSync(v3Path, "utf8")) as {
    cases: OracleActionEvalCaseV2[];
    contentHash: string;
    caseCount: number;
    frozenAt: string;
  };

  if (v3.contentHash !== V3_HASH) {
    throw new Error(`validation_set_v3 hash mismatch: got ${v3.contentHash.slice(0, 12)}…`);
  }

  const byId = new Map(v3.cases.map((c) => [c.id, structuredClone(c)]));
  const labelChanges: Array<{
    caseId: string;
    cardName: string;
    reason: string;
    fieldDiff: Record<string, { before: unknown; after: unknown }>;
  }> = [];

  for (const patch of TAXONOMY_V12_VALIDATION_PATCHES) {
    const prior = v3.cases.find((c) => c.id === patch.caseId);
    const testCase = byId.get(patch.caseId);
    if (!prior || !testCase) continue;
    const updated = patch.apply(testCase);
    byId.set(patch.caseId, updated);
    const delta = caseDiff(prior, updated);
    if (delta) {
      labelChanges.push({
        caseId: patch.caseId,
        cardName: patch.cardName,
        reason: patch.reason,
        fieldDiff: delta,
      });
    }
  }

  const v4Cases = v3.cases.map((c) => byId.get(c.id)!);
  const v4Hash = computeContentHash(v4Cases);
  const reviewedAt = new Date().toISOString();

  const v4 = {
    setClassification: "validation_set_v4",
    evaluationVersion: "validation-v4-taxonomy-v1.2",
    contentHash: v4Hash,
    taxonomyVersion: TAXONOMY_VERSION,
    caseCount: v4Cases.length,
    frozenAt: reviewedAt,
    usagePolicy:
      "Occasional generalization measurement — gold corrections from three-layer-v1.2 put_onto_battlefield taxonomy.",
    parentClassification: "validation_set_v3",
    parentContentHash: V3_HASH,
    parentSetPath: "data/oracle-action-eval-validation-v3.json",
    parentCaseCount: v3.caseCount,
    reviewer: REVIEWER_ID,
    reviewTimestamp: reviewedAt,
    taxonomyMigration: "data/oracle-action-taxonomy-v1.2-migration.json",
    goldPatchCount: labelChanges.length,
    windfallNote:
      "held-0010 Windfall draw gold unchanged; evaluator third-person draw heuristic fixed in oracle-action-eval-shared.ts",
    cases: v4Cases,
  };

  writeFileSync(v4Path, JSON.stringify(v4, null, 2), "utf8");
  writeFileSync(
    diffPath,
    JSON.stringify(
      {
        generatedAt: reviewedAt,
        reviewer: REVIEWER_ID,
        reviewTimestamp: reviewedAt,
        parentDataset: "validation_set_v3",
        parentContentHash: V3_HASH,
        newDataset: "validation_set_v4",
        newContentHash: v4Hash,
        taxonomyVersion: TAXONOMY_VERSION,
        changedCaseCount: labelChanges.length,
        reasonForChange: "three-layer-v1.2 put_onto_battlefield primitive + Growth Spiral / Aether Vial gold corrections.",
        labelChanges,
        evaluatorOnlyChanges: [
          {
            caseId: "held-0010",
            cardName: "Windfall",
            change: "Third-person draw heuristic in inferSupportedPrimitiveFromEvidence — gold unchanged.",
          },
        ],
      },
      null,
      2,
    ),
    "utf8",
  );

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
  manifest.validationSetV3 = {
    path: "data/oracle-action-eval-validation-v3.json",
    classification: "validation_set_v3",
    contentHash: V3_HASH,
    caseCount: v3.caseCount,
    purpose: "Frozen pre-v1.2-taxonomy baseline",
    frozenAt: v3.frozenAt,
  };
  manifest.validationSet = {
    path: "data/oracle-action-eval-validation-v4.json",
    classification: "validation_set_v4",
    contentHash: v4Hash,
    caseCount: v4Cases.length,
    taxonomyVersion: TAXONOMY_VERSION,
    purpose: "Corrected validation baseline after three-layer-v1.2 taxonomy",
    parentVersion: {
      classification: "validation_set_v3",
      contentHash: V3_HASH,
      path: "data/oracle-action-eval-validation-v3.json",
    },
    diffManifest: "data/oracle-action-eval-validation-v4-diff.json",
    taxonomyMigration: "data/oracle-action-taxonomy-v1.2-migration.json",
    reviewer: REVIEWER_ID,
    reviewTimestamp: reviewedAt,
    priorVersions: [
      ...((manifest.validationSet as { priorVersions?: unknown[] } | undefined)?.priorVersions ?? []),
      {
        path: "data/oracle-action-eval-validation-v3.json",
        classification: "validation_set_v3",
        contentHash: V3_HASH,
        caseCount: v3.caseCount,
        supersededAt: reviewedAt,
        reason: "three-layer-v1.2 put_onto_battlefield taxonomy moved to v4; v3 frozen immutable",
      },
    ],
  };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  console.log("validation_set_v3 verified immutable");
  console.log(`  hash: ${V3_HASH.slice(0, 12)}…`);
  console.log("Created validation_set_v4");
  console.log(`  hash: ${v4Hash.slice(0, 12)}…`);
  console.log(`  gold patches: ${labelChanges.length}`);
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("create-validation-set-v4.ts")) {
  main();
}

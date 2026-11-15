/**
 * Create validation_set_v5 — catalog-backed card identity from held-out generator + v1.2 gold patches.
 * Run: npx tsx scripts/create-validation-set-v5.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import { TAXONOMY_V12_VALIDATION_PATCHES } from "./create-validation-set-v4";
import { computeContentHash, REVIEWER_ID, TAXONOMY_VERSION } from "./oracle-action-eval-shared";

const V4_HASH = "c422988bc2816a86725cd7042c35d844c2b1cbd80ca5430c08a7f32bb403a076";

function main() {
  const heldOutPath = resolve(process.cwd(), "data", "oracle-action-eval-held-out.json");
  const v4Path = resolve(process.cwd(), "data", "oracle-action-eval-validation-v4.json");
  const v5Path = resolve(process.cwd(), "data", "oracle-action-eval-validation-v5.json");
  const diffPath = resolve(process.cwd(), "data", "oracle-action-eval-validation-v5-diff.json");
  const manifestPath = resolve(process.cwd(), "data", "oracle-action-eval-sets-manifest.json");

  const heldOut = JSON.parse(readFileSync(heldOutPath, "utf8")) as {
    cases: OracleActionEvalCaseV2[];
    contentHash: string;
  };
  const v4 = JSON.parse(readFileSync(v4Path, "utf8")) as {
    cases: OracleActionEvalCaseV2[];
    contentHash: string;
  };

  if (v4.contentHash !== V4_HASH) {
    throw new Error(`validation_set_v4 hash mismatch: ${v4.contentHash.slice(0, 12)}…`);
  }

  const v4GoldById = new Map(v4.cases.map((c) => [c.id, c]));
  const identityChanges: Array<{ caseId: string; cardName?: string; beforeOracleId: string; afterOracleId: string; reason: string }> = [];

  const v5Cases = heldOut.cases.map((catalogCase) => {
    const prior = v4GoldById.get(catalogCase.id);
    const merged: OracleActionEvalCaseV2 = prior
      ? {
          ...catalogCase,
          expectedPrimitiveActions: prior.expectedPrimitiveActions,
          expectedStructure: prior.expectedStructure,
          expectedConditions: prior.expectedConditions,
          expectedRoles: prior.expectedRoles,
          forbiddenPrimitiveActions: prior.forbiddenPrimitiveActions,
          expectedFaces: prior.expectedFaces,
        }
      : catalogCase;

    if (prior && prior.oracleId !== catalogCase.oracleId) {
      identityChanges.push({
        caseId: catalogCase.id,
        beforeOracleId: prior.oracleId,
        afterOracleId: catalogCase.oracleId,
        reason: "Catalog-backed oracleId replaces synthetic held-oracle-* id.",
      });
    }
    return merged;
  });

  for (const patch of TAXONOMY_V12_VALIDATION_PATCHES) {
    const idx = v5Cases.findIndex((c) => c.id === patch.caseId);
    if (idx >= 0) v5Cases[idx] = patch.apply(v5Cases[idx]);
  }

  const v5Hash = computeContentHash(v5Cases);
  const reviewedAt = new Date().toISOString();

  const v5 = {
    setClassification: "validation_set_v5",
    evaluationVersion: "validation-v5-catalog-identity",
    contentHash: v5Hash,
    taxonomyVersion: TAXONOMY_VERSION,
    caseCount: v5Cases.length,
    frozenAt: reviewedAt,
    usagePolicy:
      "Validation baseline with catalogOracleCards-backed card identity. Gold labels preserved from v4 where case IDs match.",
    parentClassification: "validation_set_v4",
    parentContentHash: V4_HASH,
    parentSetPath: "data/oracle-action-eval-validation-v4.json",
    heldOutCatalogHash: heldOut.contentHash,
    reviewer: REVIEWER_ID,
    reviewTimestamp: reviewedAt,
    identityCorrectionCount: identityChanges.length,
    goldPatchCount: TAXONOMY_V12_VALIDATION_PATCHES.length,
    cases: v5Cases,
  };

  writeFileSync(v5Path, JSON.stringify(v5, null, 2), "utf8");
  writeFileSync(
    diffPath,
    JSON.stringify(
      {
        generatedAt: reviewedAt,
        reviewer: REVIEWER_ID,
        parentDataset: "validation_set_v4",
        parentContentHash: V4_HASH,
        newDataset: "validation_set_v5",
        newContentHash: v5Hash,
        heldOutCatalogSource: "data/oracle-action-eval-held-out.json",
        heldOutCatalogHash: heldOut.contentHash,
        identityChanges,
        goldPatches: TAXONOMY_V12_VALIDATION_PATCHES.map((p) => ({
          caseId: p.caseId,
          cardName: p.cardName,
          reason: p.reason,
        })),
        stormTheFestivalFix: {
          caseId: "held-0030",
          note: "Oracle text now loaded from catalog for Storm the Festival (sorcery, not saga graveyard-return).",
        },
      },
      null,
      2,
    ),
    "utf8",
  );

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
  manifest.validationSetV4 = {
    path: "data/oracle-action-eval-validation-v4.json",
    classification: "validation_set_v4",
    contentHash: V4_HASH,
    caseCount: v4.caseCount,
    purpose: "Frozen pre-catalog-identity validation baseline",
    frozenAt: v4.frozenAt,
  };
  manifest.validationSet = {
    path: "data/oracle-action-eval-validation-v5.json",
    classification: "validation_set_v5",
    contentHash: v5Hash,
    caseCount: v5Cases.length,
    taxonomyVersion: TAXONOMY_VERSION,
    purpose: "Catalog-backed card identity validation baseline",
    parentVersion: {
      classification: "validation_set_v4",
      contentHash: V4_HASH,
      path: "data/oracle-action-eval-validation-v4.json",
    },
    diffManifest: "data/oracle-action-eval-validation-v5-diff.json",
    reviewer: REVIEWER_ID,
    reviewTimestamp: reviewedAt,
    priorVersions: [
      ...((manifest.validationSet as { priorVersions?: unknown[] } | undefined)?.priorVersions ?? []),
      {
        path: "data/oracle-action-eval-validation-v4.json",
        classification: "validation_set_v4",
        contentHash: V4_HASH,
        caseCount: v4.caseCount,
        supersededAt: reviewedAt,
        reason: "catalogOracleCards identity audit moved to v5; v4 frozen immutable",
      },
    ],
  };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  console.log("Created validation_set_v5");
  console.log(`  hash: ${v5Hash}`);
  console.log(`  identity corrections: ${identityChanges.length}`);
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("create-validation-set-v5.ts")) {
  main();
}

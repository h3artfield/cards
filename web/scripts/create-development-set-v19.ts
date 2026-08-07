/**
 * Create development_set_v19 from immutable development_set_v18.
 * Applies cast-permission policy gold corrections only (eval-0150, eval-0157, eval-0163).
 * Run: npx tsx scripts/create-development-set-v19.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  computeDatasetContentHash,
  type CatalogEvalCase,
  type EvalDatasetEnvelope,
} from "./lib/eval-provenance-guard";
import { evidenceMatchesOracle } from "./oracle-action-eval-shared";
import { TAXONOMY_VERSION } from "./oracle-action-eval-shared";
import { inferDerivedRoles } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";

const V18_HASH = "dacabb51eec6033179baac2269713bd750983aa21590915ee4d4873f3d3fd4dd";
const REVIEWER = "cast-permission-policy-v1";
const REVIEWED_AT = "2026-08-07T08:00:00.000Z";

type CaseChange = {
  caseId: string;
  changedFields: string[];
  reason: string;
};

const CAST_POLICY_CHANGES: CaseChange[] = [
  {
    caseId: "eval-0150",
    changedFields: ["expectedPrimitiveActions", "forbiddenPrimitiveActions", "expectedRoles"],
    reason: "One-shot resolution cast permission → Layer 2 cast (reverses v18 reject_parser_output)",
  },
  {
    caseId: "eval-0157",
    changedFields: ["forbiddenPrimitiveActions"],
    reason: "Removed contradictory forbidden draw where draw is in gold",
  },
  {
    caseId: "eval-0163",
    changedFields: ["forbiddenPrimitiveActions"],
    reason: "Removed contradictory forbidden draw where draw is in gold",
  },
];

function applyCastPolicy(c: CatalogEvalCase): CatalogEvalCase {
  if (c.id === "eval-0150") {
    const evidence = "You may cast it without paying its mana cost";
    if (!evidenceMatchesOracle(c.oracleText, evidence)) throw new Error("eval-0150 oracle mismatch");
    const expectedPrimitiveActions = [
      { actionType: "cast" as const, evidenceContains: evidence, optionalEffect: true },
    ];
    const primitives = expectedPrimitiveActions.map((p) => p.actionType);
    const forbiddenPrimitiveActions = (c.forbiddenPrimitiveActions ?? []).filter((p) => p !== "cast");
    return {
      ...c,
      expectedPrimitiveActions,
      forbiddenPrimitiveActions: forbiddenPrimitiveActions.length ? forbiddenPrimitiveActions : undefined,
      expectedRoles: inferDerivedRoles(primitives).map((role) => ({ role, fromPrimitiveActions: [...primitives] })),
      goldReviewedAt: REVIEWED_AT,
      goldReviewer: REVIEWER,
      castPermissionPolicyNote: "One-shot resolution cast permission → Layer 2 cast",
    };
  }
  if (c.id === "eval-0157" || c.id === "eval-0163") {
    const hasDrawGold = c.expectedPrimitiveActions.some((p) => p.actionType === "draw");
    const forbiddenPrimitiveActions = (c.forbiddenPrimitiveActions ?? []).filter(
      (p) => !(p === "draw" && hasDrawGold),
    );
    return {
      ...c,
      forbiddenPrimitiveActions: forbiddenPrimitiveActions.length ? forbiddenPrimitiveActions : undefined,
      goldReviewedAt: REVIEWED_AT,
      goldReviewer: REVIEWER,
      forbiddenDrawCleanupNote: "Removed contradictory forbidden draw where draw is in gold",
    };
  }
  return c;
}

async function main() {
  const v18Path = resolve(process.cwd(), "data/oracle-action-eval-development-v18.json");
  const v18 = JSON.parse(readFileSync(v18Path, "utf8")) as EvalDatasetEnvelope & {
    cases: CatalogEvalCase[];
    contentHash: string;
  };

  if (v18.contentHash !== V18_HASH) {
    throw new Error(`v18 hash mismatch: expected ${V18_HASH}, got ${v18.contentHash}`);
  }
  if (v18.setClassification !== "development_set_v18") {
    throw new Error(`Expected development_set_v18, got ${v18.setClassification}`);
  }

  const changedCaseIds: string[] = [];
  const v19Cases = v18.cases.map((c) => {
    const updated = applyCastPolicy(c);
    if (updated !== c) changedCaseIds.push(c.id);
    return updated;
  });

  const v19Hash = computeDatasetContentHash(v19Cases);
  const v19 = {
    ...v18,
    setClassification: "development_set_v19",
    evaluationSetVersion: "development-v19-cast-permission-policy",
    contentHash: v19Hash,
    parentClassification: "development_set_v18",
    parentContentHash: V18_HASH,
    parentSetPath: "data/oracle-action-eval-development-v18.json",
    frozenAt: REVIEWED_AT,
    reviewer: REVIEWER,
    reviewTimestamp: REVIEWED_AT,
    castPermissionPolicy: {
      appliedAt: REVIEWED_AT,
      reviewer: REVIEWER,
      rule: "Resolution-time cast instruction → Layer 2; persistent zone permission → Layer 1 static_permission",
      changedCaseIds: ["eval-0150", "eval-0157", "eval-0163"],
    },
    cases: v19Cases,
  };

  writeFileSync(resolve(process.cwd(), "data/oracle-action-eval-development-v19.json"), JSON.stringify(v19, null, 2), "utf8");
  writeFileSync(
    resolve(process.cwd(), "data/oracle-action-eval-development-v19-diff.json"),
    JSON.stringify(
      {
        generatedAt: REVIEWED_AT,
        parentDataset: "development_set_v18",
        parentContentHash: V18_HASH,
        newDataset: "development_set_v19",
        newContentHash: v19Hash,
        changedCaseIds,
        changes: CAST_POLICY_CHANGES,
        policy: "Cast-permission policy gold migration — no parser changes",
      },
      null,
      2,
    ),
    "utf8",
  );

  const manifest = JSON.parse(
    readFileSync(resolve(process.cwd(), "data/oracle-action-eval-sets-manifest.json"), "utf8"),
  ) as Record<string, unknown>;
  manifest.developmentSet = {
    path: "data/oracle-action-eval-development-v19.json",
    classification: "development_set_v19",
    contentHash: v19Hash,
    caseCount: v19Cases.length,
    taxonomyVersion: TAXONOMY_VERSION,
    purpose: "Canonical development set — v19 cast-permission policy gold corrections",
    parentClassification: "development_set_v18",
    parentContentHash: V18_HASH,
    benchmarkStatus: "catalog_clean",
    usableForParserEvaluation: true,
  };
  manifest.developmentSetV18 = {
    path: "data/oracle-action-eval-development-v18.json",
    classification: "development_set_v18",
    contentHash: V18_HASH,
    caseCount: v18.cases.length,
    purpose: "Immutable parent — v18 gold_omission audit (frozen)",
    benchmarkStatus: "catalog_clean",
    usableForParserEvaluation: true,
  };
  writeFileSync(
    resolve(process.cwd(), "data/oracle-action-eval-sets-manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf8",
  );

  console.log(JSON.stringify({ v19Hash, parentHash: V18_HASH, changedCaseIds }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

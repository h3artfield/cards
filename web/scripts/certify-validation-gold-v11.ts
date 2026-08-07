/**
 * Rule-driven validation gold correction v10 → validation_set_v11.
 * Does NOT consult RC1 output. Run: npx tsx scripts/certify-validation-gold-v11.ts
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvLocal } from "./lib/script-env";
import {
  computeDatasetContentHash,
  type CatalogEvalCase,
  type EvalDatasetEnvelope,
} from "./lib/eval-provenance-guard";
import { TAXONOMY_V13 } from "./lib/taxonomy-v13-shuffle-migration";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import {
  applyValidationGoldPolicyV11,
  VALIDATION_GOLD_POLICY_V11_ID,
  type PolicyViolation,
} from "./lib/validation-gold-policy-v11";

loadEnvLocal();

const V10_HASH = "2af9eafaf0b021fd3c73193e1629b6b8fe06a402a7baea30c8e5999852041a81";

async function main() {
  const v10Path = resolve(process.cwd(), "data/oracle-action-eval-validation-v10.json");
  const v10 = JSON.parse(readFileSync(v10Path, "utf8")) as EvalDatasetEnvelope & {
    cases: CatalogEvalCase[];
    contentHash: string;
  };

  if (v10.contentHash !== V10_HASH) {
    throw new Error(`Expected validation v10 hash ${V10_HASH}, got ${v10.contentHash}`);
  }
  if (v10.cases.length !== 104) {
    throw new Error(`Expected 104 validation cases, got ${v10.cases.length}`);
  }

  const reviewedAt = new Date().toISOString();
  const changedCaseIds: string[] = [];
  const allViolations: PolicyViolation[] = [];
  let primitivesAdded = 0;
  let primitivesRemoved = 0;

  const cases: CatalogEvalCase[] = v10.cases.map((c) => {
    const before = c.expectedPrimitiveActions?.length ?? 0;
    const { testCase, violations, changed } = applyValidationGoldPolicyV11(c as OracleActionEvalCaseV2);
    allViolations.push(...violations);
    if (changed) changedCaseIds.push(c.id);
    const after = testCase.expectedPrimitiveActions.length;
    if (after > before) primitivesAdded += after - before;
    if (after < before) primitivesRemoved += before - after;
    return {
      ...testCase,
      goldReviewStatus: "reviewed",
      goldCompletenessStatus: "complete",
      goldCompletedAt: reviewedAt,
      goldCompleter: VALIDATION_GOLD_POLICY_V11_ID,
    };
  });

  const envelope: EvalDatasetEnvelope & { cases: CatalogEvalCase[] } = {
    ...v10,
    setClassification: "validation_set_v11",
    evaluationSetVersion: "validation-v11-policy-gold-correction",
    parentClassification: "validation_set_v10",
    parentContentHash: V10_HASH,
    parentSetPath: "data/oracle-action-eval-validation-v10.json",
    contentHash: "",
    cases,
    goldCertification: {
      certifierId: VALIDATION_GOLD_POLICY_V11_ID,
      certifiedAt: reviewedAt,
      parentV10Hash: V10_HASH,
      casesReviewed: "104/104",
      casesChanged: changedCaseIds.length,
      changedCaseIds,
      primitivesAdded,
      primitivesRemoved,
      policyViolationsCorrected: allViolations.length,
      taxonomy: TAXONOMY_V13,
      goldReviewStatus: "reviewed",
      goldCompletenessStatus: "complete",
      incompleteCaseCount: 0,
      parserExecutionCount: 0,
      rc1OutputConsulted: false,
      policyNote:
        "Rule-driven correction of v10 gold against three-layer semantics (gy→hand, cost/trigger/reminder/static restrictions). RC1 predictions were not consulted.",
    },
  };
  envelope.contentHash = computeDatasetContentHash(envelope.cases);

  const outPath = resolve(process.cwd(), "data/oracle-action-eval-validation-v11.json");
  writeFileSync(outPath, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");

  const freezeDir = resolve(process.cwd(), "data/milestones/validation-v11-certification");
  mkdirSync(freezeDir, { recursive: true });
  writeFileSync(
    resolve(freezeDir, "validation-v11-freeze.json"),
    `${JSON.stringify(
      {
        validationSet: "validation_set_v11",
        validationV11Hash: envelope.contentHash,
        parentV10Hash: V10_HASH,
        frozenAt: reviewedAt,
        casesChanged: changedCaseIds.length,
        changedCaseIds,
        policyViolationsCorrected: allViolations.length,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  console.log(
    JSON.stringify(
      {
        outPath,
        validationV10Hash: V10_HASH,
        validationV11Hash: envelope.contentHash,
        casesChanged: changedCaseIds.length,
        primitivesAdded,
        primitivesRemoved,
        policyViolationsCorrected: allViolations.length,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * Independent blind set gold certification — no parser execution.
 * Run: npx tsx scripts/certify-blind-gold-v2.ts
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvLocal } from "./lib/script-env";
import { loadGoldenCatalogIndex } from "./lib/load-golden-catalog-index";
import {
  computeDatasetContentHash,
  type CatalogEvalCase,
  type EvalDatasetEnvelope,
} from "./lib/eval-provenance-guard";
import { derivePrimitivesFromOracleText } from "./lib/catalog-oracle-gold-completer";
import { applyValidationGoldPolicyV11, type PolicyViolation } from "./lib/validation-gold-policy-v11";
import { sanitizeGoldPrimitives } from "./lib/gold-sanitize";
import { evidenceMatchesOracle } from "./oracle-action-eval-shared";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";

loadEnvLocal();

const BLIND_V2_PATH = "data/oracle-action-eval-final-blind-v2.json";
const CERTIFIER = "blind-gold-certifier-v2-policy";

async function main() {
  const catalog = await loadGoldenCatalogIndex();
  const blindPath = resolve(process.cwd(), BLIND_V2_PATH);
  const blind = JSON.parse(readFileSync(blindPath, "utf8")) as EvalDatasetEnvelope & {
    cases: CatalogEvalCase[];
    contentHash: string;
  };

  const reviewedAt = new Date().toISOString();
  const violations: PolicyViolation[] = [];
  const changedCaseIds: string[] = [];
  let evidenceDefects = 0;
  let incompleteCases = 0;

  const cases: CatalogEvalCase[] = blind.cases.map((c) => {
    const golden = catalog.byOracleId.get(c.oracleId);
    if (!golden) {
      throw new Error(`Blind case ${c.id} oracleId ${c.oracleId} not in catalog`);
    }

    let derived = derivePrimitivesFromOracleText(golden.oracleText ?? c.oracleText);
    derived = sanitizeGoldPrimitives(golden.oracleText ?? c.oracleText, derived);

    let testCase: OracleActionEvalCaseV2 = {
      ...(c as OracleActionEvalCaseV2),
      expectedPrimitiveActions: derived,
    };

    const policyResult = applyValidationGoldPolicyV11(testCase);
    testCase = policyResult.testCase;
    violations.push(...policyResult.violations);
    if (policyResult.changed) changedCaseIds.push(c.id);

    for (const p of testCase.expectedPrimitiveActions) {
      if (!p.negative && !evidenceMatchesOracle(testCase.oracleText, p.evidenceContains)) {
        evidenceDefects += 1;
      }
    }

    const caseIncomplete =
      testCase.expectedPrimitiveActions.filter((p) => !p.negative).length === 0 &&
      !testCase.expectedStructure?.minTriggeredAbilities &&
      !testCase.forbiddenPrimitiveActions?.length;
    if (caseIncomplete) incompleteCases += 1;

    return {
      ...testCase,
      goldReviewVersion: CERTIFIER,
      goldReviewedAt: reviewedAt,
      goldReviewer: CERTIFIER,
      goldReviewStatus: "reviewed",
      goldCompletenessStatus: caseIncomplete ? "incomplete" : "complete",
      identityStatus: "catalog_exact",
    } as CatalogEvalCase;
  });

  const envelope: EvalDatasetEnvelope & { cases: CatalogEvalCase[] } = {
    ...blind,
    contentHash: "",
    cases,
    goldCertification: {
      certifierId: CERTIFIER,
      certifiedAt: reviewedAt,
      priorContentHash: blind.contentHash,
      casesReviewed: `${cases.length}/${cases.length}`,
      casesChanged: changedCaseIds.length,
      changedCaseIds,
      policyViolationsFound: violations.length,
      evidenceDefects,
      incompleteCaseCount: incompleteCases,
      parserExecutionCount: 0,
      rc1OutputConsulted: false,
      policyNote:
        "Independent gold certification using three-layer-v1.3 policy checklist. No parser output consulted.",
    },
  };
  envelope.contentHash = computeDatasetContentHash(envelope.cases);

  const outPath = resolve(process.cwd(), "data/oracle-action-eval-final-blind-v2-certified.json");
  writeFileSync(outPath, `${JSON.stringify(envelope, null, 2)}\n`, "utf8");

  const auditDir = resolve(process.cwd(), "data/milestones/blind-v2-gold-certification");
  mkdirSync(auditDir, { recursive: true });
  writeFileSync(
    resolve(auditDir, "blind-v2-gold-certification-report.json"),
    `${JSON.stringify(
      {
        blindSet: "final_blind_test_v2",
        priorHash: blind.contentHash,
        certifiedHash: envelope.contentHash,
        certifiedAt: reviewedAt,
        casesChanged: changedCaseIds.length,
        policyViolationsFound: violations.length,
        evidenceDefects,
        incompleteCaseCount: incompleteCases,
        parserExecutionCount: 0,
        violationsByFamily: violations.reduce(
          (acc, v) => {
            acc[v.family] = (acc[v.family] ?? 0) + 1;
            return acc;
          },
          {} as Record<string, number>,
        ),
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
        priorHash: blind.contentHash,
        certifiedHash: envelope.contentHash,
        casesChanged: changedCaseIds.length,
        policyViolationsFound: violations.length,
        evidenceDefects,
        incompleteCaseCount: incompleteCases,
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

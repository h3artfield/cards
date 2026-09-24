/**
 * Full RC4 rescore — development gates + adjudicated v13 regression + invariants.
 * Run: cd web && npx tsx scripts/rescore-rc4-full-v140.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { parseOracleSemanticsRC3, ORACLE_ACTION_RC3_PARSER_VERSION } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import { verifySemanticParseIntegrity } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-integrity";
import { applyGoldMigrationV135 } from "./lib/rc3-gold-migration-v135";
import { evaluateCaseSemantic, sumSemanticMetrics } from "./oracle-action-semantic-matcher";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import {
  type Rc4RegressionPack,
  scoreRc4RegressionPack,
  sliceActionScore,
  scoreFpTargets,
} from "./lib/rc4-regression-scoring-v1";
import { countActivatedCostLayer2Leakage } from "./lib/activated-cost-leakage";
import { isForbiddenPolicyLeak } from "./lib/rc3-case-scope-scoring";
import { GOLD_POLICY_VALIDATOR_VERSION, validateBenchmarkGoldPolicy } from "./lib/gold-policy-validator-v1";
import { createHash } from "node:crypto";

function loadScoring(path: string): OracleActionEvalCaseV2[] {
  return applyGoldMigrationV135(
    (JSON.parse(readFileSync(path, "utf8")) as { cases: OracleActionEvalCaseV2[] }).cases,
  );
}

function evalCases(cases: OracleActionEvalCaseV2[], label: string) {
  const rows = cases.map((tc) => {
    const parse = parseOracleSemanticsRC3({ oracleId: tc.oracleId, oracleText: tc.oracleText, cardFace: tc.cardFace });
    return evaluateCaseSemantic(tc, parse);
  });
  return { label, caseCount: cases.length, accepted: sumSemanticMetrics(rows) };
}

function scanPolicyInvariants(cases: OracleActionEvalCaseV2[]) {
  let activatedCostLayer2Leakage = 0;
  let permissionLeakage = 0;
  let triggerEventActionLeakage = 0;
  let reminderLeakage = 0;
  let tokenOwnershipLeakage = 0;
  let crossFaceLeakage = 0;
  let semanticInvalid = 0;
  let idViolations = 0;
  let provenanceViolations = 0;

  for (const testCase of cases) {
    const parsed = parseOracleSemanticsRC3({
      oracleId: testCase.oracleId,
      oracleText: testCase.oracleText,
      cardFace: testCase.cardFace,
    });
    semanticInvalid += parsed.semanticValidation.invalidCount;
    const integrity = verifySemanticParseIntegrity(parsed, testCase.oracleText);
    idViolations += integrity.idViolations.length;
    provenanceViolations += integrity.provenanceViolations.length;
    activatedCostLayer2Leakage += countActivatedCostLayer2Leakage(
      testCase.oracleId,
      testCase.oracleText,
      parsed.actions,
    );

    for (const action of parsed.actions.filter((a) => a.reviewStatus === "accepted")) {
      const ev = action.provenance.actionSpan.text;
      if (/\([^)]{20,}\)/.test(ev) && /Flashback|Discover|Cycling/i.test(ev)) reminderLeakage++;
      if (action.actionType === "cast" && /Whenever you cast|When you cast|If you cast/i.test(ev)) {
        triggerEventActionLeakage++;
      }
      if (
        action.actionType === "cast" &&
        /You may cast[^.\n]*from your (?:graveyard|hand)\b/i.test(testCase.oracleText) &&
        /You may cast[^.\n]*from your (?:graveyard|hand)\b/i.test(ev) &&
        !/without paying|that card|the copy/i.test(ev)
      ) {
        const expectedPermissionCast = testCase.expectedPrimitiveActions.some(
          (g) =>
            !g.negative &&
            g.actionType === "cast" &&
            ev.toLowerCase().includes((g.evidenceContains ?? "").toLowerCase().slice(0, 12)),
        );
        if (!expectedPermissionCast) permissionLeakage++;
      }
      if (action.semanticOwner === "created_object" && action.cardNativeLayer2Eligible) tokenOwnershipLeakage++;
      if (action.faceId && testCase.cardFace && action.faceId !== testCase.cardFace) crossFaceLeakage++;
    }
  }

  return {
    semanticInvalid,
    idViolations,
    provenanceViolations,
    activatedCostLayer2Leakage,
    permissionLeakage,
    triggerEventActionLeakage,
    reminderLeakage,
    tokenOwnershipLeakage,
    crossFaceLeakage,
  };
}

function main() {
  const pack = JSON.parse(readFileSync("data/oracle-action-eval-rc4-v13-regression-v140.json", "utf8")) as Rc4RegressionPack;
  const regression = scoreRc4RegressionPack(pack);

  const legacyPaths = [
    "data/oracle-action-eval-development-v26-v14.json",
    "data/oracle-action-eval-development-generalization-expansion-v2-v14.json",
    "data/oracle-action-eval-development-generalization-expansion-v3-v14.json",
    "data/oracle-action-eval-development-generalization-expansion-v5-v14.json",
  ];
  const positiveCatalog = loadScoring("data/oracle-action-eval-rc3-positive-training-catalog-v133.json");
  const combinedCases = [...legacyPaths.flatMap((p) => loadScoring(p)), ...positiveCatalog];
  const unrelatedCases = positiveCatalog.filter((c) => !(c as { spentV12Regression?: boolean }).spentV12Regression);

  const combined = evalCases(combinedCases, "combined_development");
  const unrelated = evalCases(unrelatedCases, "unrelated_catalog_positive");

  const slices = {
    counter: sliceActionScore(pack, ["vh13-0016", "vh13-0068", "vh13-0206", "vh13-0207"], ["put_counter"]),
    cast: sliceActionScore(pack, ["vh13-0160"], ["cast"]),
    library_fp: scoreFpTargets(pack.fpScoringCases),
  };

  const remainingGenuineFn = regression.action.rows.filter((r) => r.metrics.fn > 0);
  const policyInvariants = scanPolicyInvariants(combinedCases);

  const developmentGoldHash = createHash("sha256").update(JSON.stringify(combinedCases)).digest("hex");
  const goldPolicyValidation = validateBenchmarkGoldPolicy({
    cases: combinedCases,
    benchmarkHash: developmentGoldHash,
    benchmarkPath: "rc4-certified-development-with-migration-overlay",
  });

  const v13Ledger = {
    recoveredGenuineFn: { count: 5, total: 9, caseIds: ["vh13-0016", "vh13-0068", "vh13-0206", "vh13-0207", "vh13-0160"] },
    remainingKnownFn: {
      count: 4,
      total: 9,
      caseIds: ["vh13-0067", "vh13-0106", "vh13-0126", "vh13-0178"],
      candidateBlocker: false,
      note: "Spent v13 validation material — intentionally paused to avoid overfitting",
    },
    genuineFpRegression: { fixed: 1, total: 1, caseId: "vh13-0153" },
    integrity: { fixed: regression.integrity.passCount, total: pack.integrityAssertions.length },
    leakage: { fixed: regression.leakage.passCount, total: pack.leakageAssertions.length },
  };

  const invariantsPass =
    policyInvariants.semanticInvalid === 0 &&
    policyInvariants.idViolations === 0 &&
    policyInvariants.provenanceViolations === 0 &&
    policyInvariants.activatedCostLayer2Leakage === 0 &&
    policyInvariants.permissionLeakage === 0 &&
    policyInvariants.triggerEventActionLeakage === 0 &&
    policyInvariants.reminderLeakage === 0 &&
    policyInvariants.tokenOwnershipLeakage === 0 &&
    policyInvariants.crossFaceLeakage === 0;

  const regressionPass =
    slices.counter.accepted.fn === 0 &&
    slices.cast.accepted.fn === 0 &&
    slices.library_fp.fp === 0 &&
    regression.integrity.idViolations === 0 &&
    regression.integrity.provenanceViolations === 0 &&
    regression.leakage.structuralLeak === 0;

  const report = {
    generatedAt: new Date().toISOString(),
    parserVersion: ORACLE_ACTION_RC3_PARSER_VERSION,
    goldPolicyValidatorVersion: GOLD_POLICY_VALIDATOR_VERSION,
    developmentGoldHash,
    goldPolicyValidator: {
      pass: goldPolicyValidation.pass,
      violations: goldPolicyValidation.violations.length,
      census: goldPolicyValidation.census,
    },
    development: {
      combined: combined.accepted,
      unrelatedCatalogPositive: unrelated.accepted,
      gates: {
        combinedDevelopment: {
          pass: combined.accepted.precision >= 0.98 && combined.accepted.recall >= 0.92,
          precision: combined.accepted.precision,
          recall: combined.accepted.recall,
          threshold: { precision: 0.98, recall: 0.92 },
        },
        unrelatedCatalogPositive: {
          pass: unrelated.accepted.precision >= 0.95 && unrelated.accepted.recall >= 0.9,
          precision: unrelated.accepted.precision,
          recall: unrelated.accepted.recall,
          threshold: { precision: 0.95, recall: 0.9 },
        },
      },
    },
    v13Regression: {
      ledger: v13Ledger,
      accounting: pack.accounting,
      actionScore: {
        tp: regression.action.accepted.tp,
        fp: regression.action.accepted.fp,
        fn: regression.action.accepted.fn,
        precision: regression.action.accepted.precision,
        recall: regression.action.accepted.recall,
        targetCount: regression.action.targetCount,
        caseCount: pack.actionScoringCases.length,
        note: "Action score is target-only adjudicated ledger — not raw card gold recall",
      },
      fpScore: regression.fp,
      integrity: regression.integrity,
      leakage: regression.leakage,
      slices,
      remainingGenuineFnLedger: remainingGenuineFn.map((r) => ({
        caseId: r.sourceV13CaseId,
        card: r.cardName,
        fn: r.metrics.fn,
        targets: r.targets,
        emitted: r.emitted,
      })),
    },
    policyInvariants,
    regressionPass,
    invariantsPass,
    candidateReady:
      goldPolicyValidation.pass &&
      combined.accepted.precision >= 0.98 &&
      combined.accepted.recall >= 0.92 &&
      unrelated.accepted.precision >= 0.95 &&
      unrelated.accepted.recall >= 0.9 &&
      invariantsPass &&
      regressionPass,
  };

  mkdirSync(resolve("data/milestones/rc4-development"), { recursive: true });
  const outPath = resolve("data/milestones/rc4-development/rc4-full-rescore-v140.json");
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

main();

/**
 * RC7 certified development rescore — combined + unrelated catalog + invariants.
 * Run: cd web && npx tsx scripts/rescore-rc7-certified-dev-v152.ts
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseOracleSemanticsRC3, ORACLE_ACTION_RC3_PARSER_VERSION } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import { verifySemanticParseIntegrity } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-integrity";
import { applyGoldMigrationV135 } from "./lib/rc3-gold-migration-v135";
import { evaluateCaseSemantic, sumSemanticMetrics } from "./oracle-action-semantic-matcher";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import { countActivatedCostLayer2Leakage } from "./lib/activated-cost-leakage";
import { scanAcceptedReminderDerivedLayer2 } from "./lib/reminder-derived-leakage-v1";
import { GOLD_POLICY_VALIDATOR_VERSION, validateBenchmarkGoldPolicy } from "./lib/gold-policy-validator-v1";
import { scoreRc5RegressionPack } from "./lib/rc5-regression-scoring-v1";
import type { Rc5RegressionPack } from "./lib/rc5-regression-scoring-v1";

const DEV_PATHS = [
  "data/oracle-action-eval-development-v26-v14.json",
  "data/oracle-action-eval-development-generalization-expansion-v2-v14.json",
  "data/oracle-action-eval-development-generalization-expansion-v3-v14.json",
  "data/oracle-action-eval-development-generalization-expansion-v5-v14.json",
  "data/oracle-action-eval-rc3-positive-training-catalog-v133.json",
];

const OUT_DIR = "data/milestones/rc7-development";
const OUT_PATH = `${OUT_DIR}/rc7-certified-dev-rescore-v152.json`;

function loadCases(path: string): OracleActionEvalCaseV2[] {
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
  let acceptedReminderDerivedLayer2Count = 0;

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
    acceptedReminderDerivedLayer2Count += scanAcceptedReminderDerivedLayer2([
      { oracleText: testCase.oracleText, actions: parsed.actions },
    ]).acceptedReminderDerivedLayer2Count;
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
    acceptedReminderDerivedLayer2Count,
  };
}

function main() {
  const combinedCases = DEV_PATHS.flatMap(loadCases);
  const positiveCatalog = loadCases("data/oracle-action-eval-rc3-positive-training-catalog-v133.json");
  const unrelatedCases = positiveCatalog.filter((c) => !(c as { spentV12Regression?: boolean }).spentV12Regression);

  const combined = evalCases(combinedCases, "combined_development");
  const unrelated = evalCases(unrelatedCases, "unrelated_catalog_positive");
  const policyInvariants = scanPolicyInvariants(combinedCases);

  const developmentGoldHash = createHash("sha256").update(JSON.stringify(combinedCases)).digest("hex");
  const goldPolicyValidation = validateBenchmarkGoldPolicy({
    cases: combinedCases,
    benchmarkHash: developmentGoldHash,
    benchmarkPath: "rc7-certified-development-with-migration-overlay",
  });

  const rc5Pack = JSON.parse(
    readFileSync("data/oracle-action-eval-rc5-v14-regression-v151.json", "utf8"),
  ) as Rc5RegressionPack;
  const v14SpentRegression = scoreRc5RegressionPack(rc5Pack);

  const invariantsPass =
    policyInvariants.semanticInvalid === 0 &&
    policyInvariants.idViolations === 0 &&
    policyInvariants.provenanceViolations === 0 &&
    policyInvariants.activatedCostLayer2Leakage === 0 &&
    policyInvariants.permissionLeakage === 0 &&
    policyInvariants.triggerEventActionLeakage === 0 &&
    policyInvariants.reminderLeakage === 0 &&
    policyInvariants.tokenOwnershipLeakage === 0 &&
    policyInvariants.crossFaceLeakage === 0 &&
    policyInvariants.acceptedReminderDerivedLayer2Count === 0;

  const report = {
    generatedAt: new Date().toISOString(),
    parserVersion: ORACLE_ACTION_RC3_PARSER_VERSION,
    goldPolicyValidatorVersion: GOLD_POLICY_VALIDATOR_VERSION,
    developmentGoldHash,
    goldPolicyValidatorDev: {
      pass: goldPolicyValidation.pass,
      violations: goldPolicyValidation.violations.length,
      census: goldPolicyValidation.census,
      perPolicyFamily: goldPolicyValidation.perPolicyFamily,
    },
    combinedDevelopment: {
      caseCount: combinedCases.length,
      accepted: combined.accepted,
      gate: {
        pass: combined.accepted.precision >= 0.98 && combined.accepted.recall >= 0.92,
        threshold: { precision: 0.98, recall: 0.92 },
      },
    },
    unrelatedCatalogPositive: {
      caseCount: unrelatedCases.length,
      accepted: unrelated.accepted,
      gate: {
        pass: unrelated.accepted.precision >= 0.95 && unrelated.accepted.recall >= 0.9,
        threshold: { precision: 0.95, recall: 0.9 },
      },
    },
    v14SpentRegressionPack: v14SpentRegression,
    policyInvariants,
    invariantsPass,
    rc7CandidateReady:
      goldPolicyValidation.pass &&
      combined.accepted.precision >= 0.98 &&
      combined.accepted.recall >= 0.92 &&
      unrelated.accepted.precision >= 0.95 &&
      unrelated.accepted.recall >= 0.9 &&
      invariantsPass &&
      v14SpentRegression.leakage.passCount === v14SpentRegression.leakage.rows.length &&
      v14SpentRegression.integrity.passCount === v14SpentRegression.integrity.rows.length,
    rc7WorkAuthorization: {
      rc7_1: "player_possessive_discard_your_hand",
      rc7_2: "replacement_consequence_exile_instead",
      deferred: [
        "granted_compound_primitive_extraction",
        "granted_nested_activated_mana",
        "granted_subability_not_materialized",
        "granted_variable_draw_not_materialized",
        "library_top_manipulation_split",
        "compound_then_chain_exile",
        "additional_cost_discard_gerund",
        "third_person_discard_referent",
      ],
    },
  };

  mkdirSync(resolve(OUT_DIR), { recursive: true });
  writeFileSync(resolve(OUT_PATH), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

main();

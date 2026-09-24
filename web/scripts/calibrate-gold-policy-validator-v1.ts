/**
 * Gold Policy Validator historical calibration — raw v13, corrected v13-v2, development gold.
 * Run: cd web && npx tsx scripts/calibrate-gold-policy-validator-v1.ts
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { validateBenchmarkGoldPolicy, GOLD_POLICY_VALIDATOR_VERSION, GOLD_POLICY_VERSION } from "./lib/gold-policy-validator-v1";
import { applyGoldMigrationV135 } from "./lib/rc3-gold-migration-v135";
import type { OracleActionEvalCaseV2, ExpectedPrimitiveAction } from "./audit-oracle-action-eval-cases";
import { createHash } from "node:crypto";

const ADJUDICATION_PATH =
  "data/milestones/validation-v13-rc3-certification/validation-v13-policy-adjudication-v2.json";

type FnRow = {
  caseId: string;
  expectedAction: string;
  goldEvidence: string;
  finalVerdict: string;
};

type FpRow = {
  caseId: string;
  observedAction: string;
  observedEvidence: string;
  finalVerdict: string;
  recommendedGoldAddition?: ExpectedPrimitiveAction;
};

function hashFile(path: string): string {
  return createHash("sha256").update(readFileSync(resolve(path))).digest("hex");
}

function buildPolicyCorrectedV13(rawCases: OracleActionEvalCaseV2[]): OracleActionEvalCaseV2[] {
  const adjudication = JSON.parse(readFileSync(ADJUDICATION_PATH, "utf8")) as {
    canonicalFnLedger: { rows: FnRow[] };
    canonicalGateFpLedger: { rows: FpRow[] };
  };

  const invalidFnKeys = new Set(
    adjudication.canonicalFnLedger.rows
      .filter((r) => r.finalVerdict.startsWith("invalid_"))
      .map((r) => `${r.caseId}|${r.expectedAction}|${r.goldEvidence}`),
  );

  const missingGoldAdds = adjudication.canonicalGateFpLedger.rows.filter(
    (r) => r.finalVerdict === "missing_gold" && r.recommendedGoldAddition,
  );

  return rawCases.map((c) => {
    const filtered = c.expectedPrimitiveActions.filter((g) => {
      if (g.negative) return true;
      const key = `${c.id}|${g.actionType}|${g.evidenceContains ?? ""}`;
      return !invalidFnKeys.has(key);
    });

    const additions = missingGoldAdds
      .filter((r) => r.caseId === c.id && r.recommendedGoldAddition)
      .map((r) => r.recommendedGoldAddition!);

    return { ...c, expectedPrimitiveActions: [...filtered, ...additions] };
  });
}

function summarize(result: ReturnType<typeof validateBenchmarkGoldPolicy>, label: string) {
  const families: Record<string, number> = { ...result.perPolicyFamily };
  for (const v of result.violations) {
    families[v.policyFamily] = (families[v.policyFamily] ?? 0) + 1;
  }
  return {
    label,
    pass: result.pass,
    violationCount: result.violations.length,
    census: result.census,
    perPolicyFamily: families,
    sampleViolations: result.violations.slice(0, 8).map((v) => ({
      caseId: v.caseId,
      actionType: v.actionType,
      code: v.code,
      policyFamily: v.policyFamily,
      evidenceContains: v.evidenceContains.slice(0, 60),
    })),
  };
}

function familyPass(result: ReturnType<typeof validateBenchmarkGoldPolicy>, families: string[]) {
  const hit = result.violations.filter((v) => families.includes(v.policyFamily));
  return { pass: hit.length === 0, count: hit.length, families: Object.fromEntries(families.map((f) => [f, hit.filter((v) => v.policyFamily === f).length])) };
}

const CORRUPTION_FAMILIES = [
  "activated_additional_cost_layer1",
  "cast_play_permission_layer1",
  "trigger_event_reference",
  "reminder_mechanic_definition",
  "condition_reference",
];

function main() {
  const rawV13 = (JSON.parse(readFileSync("data/oracle-action-eval-validation-v13.json", "utf8")) as {
    cases: OracleActionEvalCaseV2[];
    contentHash: string;
  }).cases;

  const correctedV13 = buildPolicyCorrectedV13(rawV13);

  const devPaths = [
    "data/oracle-action-eval-development-v26-v14.json",
    "data/oracle-action-eval-development-generalization-expansion-v2-v14.json",
    "data/oracle-action-eval-development-generalization-expansion-v3-v14.json",
    "data/oracle-action-eval-development-generalization-expansion-v5-v14.json",
    "data/oracle-action-eval-rc3-positive-training-catalog-v133.json",
  ];
  const devCases = devPaths.flatMap((p) =>
    applyGoldMigrationV135(
      (JSON.parse(readFileSync(p, "utf8")) as { cases: OracleActionEvalCaseV2[] }).cases,
    ),
  );

  const rawResult = validateBenchmarkGoldPolicy({
    cases: rawV13,
    benchmarkHash: hashFile("data/oracle-action-eval-validation-v13.json"),
    benchmarkPath: "data/oracle-action-eval-validation-v13.json",
  });

  const correctedResult = validateBenchmarkGoldPolicy({
    cases: correctedV13,
    benchmarkHash: createHash("sha256").update(JSON.stringify(correctedV13)).digest("hex"),
    benchmarkPath: "validation-v13-policy-corrected-v2-synthetic",
  });

  const devResult = validateBenchmarkGoldPolicy({
    cases: devCases,
    benchmarkHash: createHash("sha256").update(JSON.stringify(devCases)).digest("hex"),
    benchmarkPath: "rc3-development-gold-with-migration-overlay",
  });

  const artifact = {
    generatedAt: new Date().toISOString(),
    validatorVersion: GOLD_POLICY_VALIDATOR_VERSION,
    policyVersion: GOLD_POLICY_VERSION,
    expectedBehavior: {
      rawV13: "flags known cost/cast/trigger/reminder violations",
      correctedV13V2:
        "mismatch-adjudicated forensic view — NOT fully Gold-Policy-certified v13 corpus; may retain residual violations",
      developmentGold: "Gold-Policy-certified current-policy development corpus (violations=0)",
    },
    corruptionFamilies: CORRUPTION_FAMILIES,
    results: {
      rawV13: {
        ...summarize(rawResult, "raw_validation_v13"),
        corruptionFamilyCheck: familyPass(rawResult, CORRUPTION_FAMILIES),
      },
      correctedV13V2: {
        ...summarize(correctedResult, "validation_v13_mismatch_adjudicated_forensic_v2"),
        corpusLabel: "mismatch-adjudicated forensic view — not Gold-Policy-certified",
        corruptionFamilyCheck: familyPass(correctedResult, CORRUPTION_FAMILIES),
      },
      developmentGold: {
        ...summarize(devResult, "rc4_certified_development_with_migration_overlay"),
        corpusLabel: "Gold-Policy-certified development",
        corruptionFamilyCheck: familyPass(devResult, CORRUPTION_FAMILIES),
      },
    },
    calibrationPass:
      rawResult.violations.length > 0 &&
      rawResult.census.invalidLayer2CostGold > 0 &&
      devResult.violations.length === 0 &&
      devResult.pass,
  };

  mkdirSync(resolve("data/milestones/rc4-development"), { recursive: true });
  writeFileSync(
    resolve("data/milestones/rc4-development/gold-policy-validator-calibration-v1.json"),
    `${JSON.stringify(artifact, null, 2)}\n`,
  );
  console.log(JSON.stringify(artifact, null, 2));
}

main();

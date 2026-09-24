/**
 * Gold Policy Validator v1.5 historical calibration — dev, v14, v15 forensic, v16.
 * Run: cd web && npx tsx scripts/calibrate-gold-policy-validator-v2.ts
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  validateBenchmarkGoldPolicy,
  GOLD_POLICY_VALIDATOR_VERSION,
  GOLD_POLICY_VERSION,
} from "./lib/gold-policy-validator-v1";
import { applyGoldMigrationV135 } from "./lib/rc3-gold-migration-v135";
import type { OracleActionEvalCaseV2, ExpectedPrimitiveAction } from "./audit-oracle-action-eval-cases";
import { computeGoldPolicyStackHashes } from "./lib/gold-policy-stack-v1";

const CORRUPTION_FAMILIES = [
  "activated_additional_cost_layer1",
  "cast_play_permission_layer1",
  "trigger_event_reference",
  "reminder_mechanic_definition",
  "condition_reference",
];

const TOKEN_DEF_FAMILY = "token_definition_not_card_native_l2";

function hashFile(path: string): string {
  return createHash("sha256").update(readFileSync(resolve(path))).digest("hex");
}

function summarize(result: ReturnType<typeof validateBenchmarkGoldPolicy>, label: string) {
  return {
    label,
    pass: result.pass,
    violationCount: result.violations.length,
    census: result.census,
    perPolicyFamily: result.perPolicyFamily,
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
  return {
    pass: hit.length === 0,
    count: hit.length,
    families: Object.fromEntries(families.map((f) => [f, hit.filter((v) => v.policyFamily === f).length])),
  };
}

function buildPolicyCorrectedFromForensic(
  rawCases: OracleActionEvalCaseV2[],
  adjudicationPath: string,
): OracleActionEvalCaseV2[] {
  const adjudication = JSON.parse(readFileSync(adjudicationPath, "utf8")) as {
    fnLedger: { rows: Array<{ caseId: string; expectedAction: string; goldEvidence: string; finalVerdict: string }> };
    fpLedger: {
      rows: Array<{
        caseId: string;
        finalVerdict: string;
        recommendedGoldAddition?: ExpectedPrimitiveAction;
      }>;
    };
  };

  const invalidFnKeys = new Set(
    adjudication.fnLedger.rows
      .filter((r) => r.finalVerdict === "invalid_gold" || r.finalVerdict === "wrong_primitive_gold")
      .map((r) => `${r.caseId}|${r.expectedAction}|${r.goldEvidence}`),
  );

  const missingGoldAdds = adjudication.fpLedger.rows.filter(
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
    return { ...c, expectedPrimitiveActions: [...filtered.filter((g) => !g.negative), ...additions] };
  });
}

function main() {
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

  const v14Cases = (JSON.parse(readFileSync("data/oracle-action-eval-validation-v14.json", "utf8")) as {
    cases: OracleActionEvalCaseV2[];
    contentHash: string;
  }).cases;

  const v14Forensic = buildPolicyCorrectedFromForensic(
    v14Cases,
    "data/milestones/validation-v14-certification/validation-v14-forensic-adjudication-v2.json",
  );

  const v15Raw = (JSON.parse(readFileSync("data/oracle-action-eval-validation-v15.json", "utf8")) as {
    cases: OracleActionEvalCaseV2[];
    contentHash: string;
  }).cases;

  const v15Forensic = buildPolicyCorrectedFromForensic(
    v15Raw,
    "data/milestones/validation-v15-certification/validation-v15-forensic-adjudication-v1.2.json",
  );

  const v16Cases = (JSON.parse(readFileSync("data/oracle-action-eval-validation-v16.json", "utf8")) as {
    cases: OracleActionEvalCaseV2[];
    contentHash: string;
  }).cases;

  const devResult = validateBenchmarkGoldPolicy({
    cases: devCases,
    benchmarkHash: createHash("sha256").update(JSON.stringify(devCases)).digest("hex"),
    benchmarkPath: "rc5-certified-development",
  });

  const v14ForensicResult = validateBenchmarkGoldPolicy({
    cases: v14Forensic,
    benchmarkHash: createHash("sha256").update(JSON.stringify(v14Forensic)).digest("hex"),
    benchmarkPath: "validation-v14-forensic-v2-corrected",
  });

  const v15ForensicResult = validateBenchmarkGoldPolicy({
    cases: v15Forensic,
    benchmarkHash: createHash("sha256").update(JSON.stringify(v15Forensic)).digest("hex"),
    benchmarkPath: "validation-v15-forensic-v1.2-corrected",
  });

  const v16Result = validateBenchmarkGoldPolicy({
    cases: v16Cases,
    benchmarkHash: hashFile("data/oracle-action-eval-validation-v16.json"),
    benchmarkPath: "data/oracle-action-eval-validation-v16.json",
  });

  const scionProbe = validateBenchmarkGoldPolicy({
    cases: [
      {
        id: "cal-scion",
        category: "calibration",
        oracleId: "00000000-0000-0000-0000-000000000001",
        oracleText:
          'Create two 1/1 colorless Eldrazi Scion creature tokens. They have "Sacrifice this token: Add {C}."',
        expectedPrimitiveActions: [{ actionType: "add_mana", evidenceContains: "Add {C}" }],
      } as OracleActionEvalCaseV2,
    ],
    benchmarkHash: "cal-scion",
    benchmarkPath: "calibration-scion",
  });

  const grantedProbe = validateBenchmarkGoldPolicy({
    cases: [
      {
        id: "cal-candlekeep",
        category: "calibration",
        oracleId: "00000000-0000-0000-0000-000000000002",
        oracleText:
          'Commander creatures you own have "When this creature enters or leaves the battlefield, draw a card."',
        expectedPrimitiveActions: [{ actionType: "draw", evidenceContains: "draw a card" }],
      } as OracleActionEvalCaseV2,
    ],
    benchmarkHash: "cal-granted",
    benchmarkPath: "calibration-granted",
  });

  const artifact = {
    generatedAt: new Date().toISOString(),
    validatorVersion: GOLD_POLICY_VALIDATOR_VERSION,
    policyVersion: GOLD_POLICY_VERSION,
    policyStack: computeGoldPolicyStackHashes(),
    expectedBehavior: {
      developmentGold: "violations=0 on certified development corpus",
      v14: "policy-corrected v14 should pass",
      v15Forensic: "forensic v1.2 corrected view should pass",
      v16: "post-v1.5 corrected v16 should pass",
      tokenDefinitionProbe: "must reject source-card L2 in They have token definition",
      grantedAbilityProbe: "must accept granted quoted triggered draw",
    },
    results: {
      developmentGold: {
        ...summarize(devResult, "rc5_certified_development"),
        corruptionFamilyCheck: familyPass(devResult, CORRUPTION_FAMILIES),
      },
      validationV14ForensicV2: {
        ...summarize(v14ForensicResult, "validation_v14_forensic_v2_corrected"),
        corruptionFamilyCheck: familyPass(v14ForensicResult, CORRUPTION_FAMILIES),
      },
      validationV15ForensicV12: {
        ...summarize(v15ForensicResult, "validation_v15_forensic_v1.2_corrected"),
        corruptionFamilyCheck: familyPass(v15ForensicResult, CORRUPTION_FAMILIES),
      },
      validationV16: {
        ...summarize(v16Result, "validation_v16"),
        corruptionFamilyCheck: familyPass(v16Result, CORRUPTION_FAMILIES),
      },
      tokenDefinitionProbe: {
        pass: !scionProbe.pass,
        violationCount: scionProbe.violations.length,
        policyFamily: scionProbe.violations[0]?.policyFamily ?? null,
      },
      grantedAbilityProbe: {
        pass: grantedProbe.pass,
        violationCount: grantedProbe.violations.length,
      },
    },
    calibrationPass:
      devResult.pass &&
      v16Result.pass &&
      !scionProbe.pass &&
      scionProbe.violations.some((v) => v.policyFamily === TOKEN_DEF_FAMILY) &&
      grantedProbe.pass &&
      familyPass(v15ForensicResult, CORRUPTION_FAMILIES).pass,
  };

  mkdirSync(resolve("data/milestones/rc4-development"), { recursive: true });
  writeFileSync(
    resolve("data/milestones/rc4-development/gold-policy-validator-calibration-v2.json"),
    `${JSON.stringify(artifact, null, 2)}\n`,
  );
  console.log(JSON.stringify(artifact, null, 2));
  if (!artifact.calibrationPass) process.exit(1);
}

main();

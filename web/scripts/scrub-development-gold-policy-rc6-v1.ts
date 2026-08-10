/**
 * RC6 parser-blind development gold scrub — removes v1.6 reminder_card_native_gold violations only.
 * Preserves prior certified dev gold artifacts; emits overlay + correction report.
 * Run: cd web && npx tsx scripts/scrub-development-gold-policy-rc6-v1.ts
 */
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ExpectedPrimitiveAction, OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import {
  GOLD_POLICY_VALIDATOR_VERSION,
  GOLD_POLICY_VERSION,
  validateBenchmarkGoldPolicy,
  type GoldPolicyViolation,
} from "./lib/gold-policy-validator-v1";
import { applyGoldMigrationV135, loadAllGoldMigrationsV135, type GoldMigrationRecord } from "./lib/rc3-gold-migration-v135";
import { enrichGoldAction } from "./lib/gold-semantic-enrichment-v1";

const DEV_PATHS = [
  "data/oracle-action-eval-development-v26-v14.json",
  "data/oracle-action-eval-development-generalization-expansion-v2-v14.json",
  "data/oracle-action-eval-development-generalization-expansion-v3-v14.json",
  "data/oracle-action-eval-development-generalization-expansion-v5-v14.json",
  "data/oracle-action-eval-rc3-positive-training-catalog-v133.json",
];

const OUT_DIR = "data/milestones/rc6-development";
const SCRUB_PATH = `${OUT_DIR}/rc6-development-gold-policy-scrub-v1.json`;
const CORRECTIONS_PATH = `${OUT_DIR}/rc6-development-gold-policy-scrub-corrections-v1.json`;
const PRESERVED_RESCORE_PATH = "data/milestones/rc5-development/rc5-certified-dev-rescore-v150.json";

function loadDevelopmentCases(): OracleActionEvalCaseV2[] {
  return DEV_PATHS.flatMap((p) =>
    applyGoldMigrationV135(
      (JSON.parse(readFileSync(resolve(p), "utf8")) as { cases: OracleActionEvalCaseV2[] }).cases,
    ),
  );
}

function developmentHash(cases: OracleActionEvalCaseV2[]): string {
  return createHash("sha256").update(JSON.stringify(cases)).digest("hex");
}

function goldMatches(g: ExpectedPrimitiveAction, actionType: string, evidenceContains: string): boolean {
  if (g.actionType !== actionType) return false;
  const a = (g.evidenceContains ?? "").toLowerCase();
  const b = evidenceContains.toLowerCase();
  return a.includes(b.slice(0, Math.min(20, b.length))) || b.includes(a.slice(0, Math.min(20, a.length)));
}

function main() {
  mkdirSync(resolve(OUT_DIR), { recursive: true });

  const priorRescore = JSON.parse(readFileSync(resolve(PRESERVED_RESCORE_PATH), "utf8"));
  const priorDevGoldHash = priorRescore.developmentGoldHash as string;

  copyFileSync(
    resolve(PRESERVED_RESCORE_PATH),
    resolve(`${OUT_DIR}/rc5-certified-dev-rescore-v150-preserved-pre-rc6-gold-scrub.json`),
  );

  const cases = loadDevelopmentCases();
  const preHash = developmentHash(cases);
  const preValidation = validateBenchmarkGoldPolicy({
    cases,
    benchmarkHash: preHash,
    benchmarkPath: "development-pre-rc6-reminder-scrub",
  });

  const reminderViolations = preValidation.violations.filter((v) => v.code === "reminder_card_native_gold");
  if (reminderViolations.length === 0) {
    console.log(JSON.stringify({ pass: true, note: "No reminder_card_native_gold violations to scrub" }, null, 2));
    return;
  }

  const byCase = new Map<string, GoldMigrationRecord>();
  const corrections: Array<Record<string, unknown>> = [];

  for (const v of reminderViolations) {
    const testCase = cases.find((c) => c.id === v.caseId);
    if (!testCase) continue;
    const oldGold = testCase.expectedPrimitiveActions.find((g) => goldMatches(g, v.actionType, v.evidenceContains));
    const semantic = oldGold ? enrichGoldAction(testCase, oldGold) : v.semanticJustification;

    if (!byCase.has(v.caseId)) {
      byCase.set(v.caseId, {
        caseId: v.caseId,
        removeLayer2Actions: [],
        policyClass: v.policyFamily,
        policyReason: v.policyReason,
      });
    }
    byCase.get(v.caseId)!.removeLayer2Actions!.push({
      actionType: v.actionType,
      evidenceContains: v.evidenceContains,
    });

    corrections.push({
      caseId: v.caseId,
      cardName: v.cardName,
      censusFamily: "invalid_reminder_gold",
      policyRule: v.policyFamily,
      policyReason: v.policyReason,
      oldGold: oldGold ?? { actionType: v.actionType, evidenceContains: v.evidenceContains },
      correctedGold: null,
      reminderSpan: semantic.evidenceSpan ? { start: semantic.evidenceSpan.start, end: semantic.evidenceSpan.end } : undefined,
      semanticOwner: semantic.semanticOwner,
      executionContext: semantic.executionContext,
      clauseRole: semantic.clauseRole,
      migrationReason: "RC6 v1.6 reminder_card_native_gold — invalid card-native L2 in mechanic/reminder span",
    });
  }

  const records = [...byCase.values()];
  const scrubEnvelope = {
    migrationVersion: "rc6-development-gold-policy-scrub-v1",
    generatedAt: new Date().toISOString(),
    parserBlind: true,
    parserConsulted: false,
    policyVersion: GOLD_POLICY_VERSION,
    validatorVersion: GOLD_POLICY_VALIDATOR_VERSION,
    priorMigrationCount: loadAllGoldMigrationsV135().length,
    priorDevelopmentGoldHash: priorDevGoldHash,
    preScrubDevelopmentGoldHash: preHash,
    preScrubViolationCount: reminderViolations.length,
    preScrubCensus: { invalid_reminder_gold: reminderViolations.length },
    rule: "Parser-blind RC6 scrub — removes reminder_card_native_gold only under Gold Policy Validator v1.6.",
    recordCount: records.length,
    correctionCount: corrections.length,
    records,
  };

  writeFileSync(resolve(SCRUB_PATH), `${JSON.stringify(scrubEnvelope, null, 2)}\n`);
  writeFileSync(
    resolve(CORRECTIONS_PATH),
    `${JSON.stringify(
      {
        generatedAt: scrubEnvelope.generatedAt,
        priorDevelopmentGoldHash: priorDevGoldHash,
        preScrubDevelopmentGoldHash: preHash,
        scrubRecords: records.length,
        corrections,
        violations: reminderViolations,
      },
      null,
      2,
    )}\n`,
  );

  const postCases = applyGoldMigrationV135(cases, { migrationVersion: scrubEnvelope.migrationVersion, records });
  const postHash = developmentHash(postCases);
  const postValidation = validateBenchmarkGoldPolicy({
    cases: postCases,
    benchmarkHash: postHash,
    benchmarkPath: "development-post-rc6-reminder-scrub",
  });

  writeFileSync(
    resolve(`${OUT_DIR}/rc6-development-gold-policy-correction-report-v1.json`),
    `${JSON.stringify(
      {
        preservedRescorePath: `${OUT_DIR}/rc5-certified-dev-rescore-v150-preserved-pre-rc6-gold-scrub.json`,
        priorDevelopmentGoldHash: priorDevGoldHash,
        preScrubDevelopmentGoldHash: preHash,
        correctedDevelopmentGoldHash: postHash,
        preScrubReminderViolations: reminderViolations.length,
        postScrubViolations: postValidation.violations.length,
        postScrubPass: postValidation.pass,
        removedGoldCount: corrections.length,
        scrubPath: SCRUB_PATH,
        correctionsPath: CORRECTIONS_PATH,
      },
      null,
      2,
    )}\n`,
  );

  console.log(
    JSON.stringify(
      {
        priorDevelopmentGoldHash: priorDevGoldHash,
        preScrubHash: preHash,
        correctedDevelopmentGoldHash: postHash,
        removed: reminderViolations.length,
        postPass: postValidation.pass,
        postViolations: postValidation.violations.length,
        scrubPath: SCRUB_PATH,
      },
      null,
      2,
    ),
  );
}

main();

/**
 * RC7 parser-blind development gold scrub — removes v1.7 trigger_event_reference violations only.
 * Run: cd web && npx tsx scripts/scrub-development-gold-policy-rc7-v1.ts
 */
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ExpectedPrimitiveAction, OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import {
  GOLD_POLICY_VALIDATOR_VERSION,
  GOLD_POLICY_VERSION,
  validateBenchmarkGoldPolicy,
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

const OUT_DIR = "data/milestones/rc7-development";
const SCRUB_PATH = `${OUT_DIR}/rc7-development-gold-policy-scrub-v1.json`;
const CORRECTIONS_PATH = `${OUT_DIR}/rc7-development-gold-policy-scrub-corrections-v1.json`;
const PRESERVED_RESCORE_PATH = "data/milestones/rc6-development/rc6-certified-dev-rescore-v151.json";

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

  let priorDevGoldHash: string | undefined;
  try {
    const priorRescore = JSON.parse(readFileSync(resolve(PRESERVED_RESCORE_PATH), "utf8"));
    priorDevGoldHash = priorRescore.developmentGoldHash as string;
    copyFileSync(
      resolve(PRESERVED_RESCORE_PATH),
      resolve(`${OUT_DIR}/rc6-certified-dev-rescore-v151-preserved-pre-rc7-gold-scrub.json`),
    );
  } catch {
    // RC6 rescore artifact may not exist yet; proceed without preserve copy.
  }

  const cases = loadDevelopmentCases();
  const preHash = developmentHash(cases);
  const preValidation = validateBenchmarkGoldPolicy({
    cases,
    benchmarkHash: preHash,
    benchmarkPath: "development-pre-rc7-trigger-reference-scrub",
  });

  const triggerViolations = preValidation.violations.filter((v) => v.code === "trigger_reference_action_gold");
  if (triggerViolations.length === 0) {
    console.log(JSON.stringify({ pass: true, note: "No trigger_reference_action_gold violations to scrub" }, null, 2));
    return;
  }

  const byCase = new Map<string, GoldMigrationRecord>();
  const corrections: Array<Record<string, unknown>> = [];

  for (const v of triggerViolations) {
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
      censusFamily: "invalid_trigger_reference_gold",
      policyRule: v.policyFamily,
      policyReason: v.policyReason,
      oldGold: oldGold ?? { actionType: v.actionType, evidenceContains: v.evidenceContains },
      correctedGold: null,
      reminderSpan: semantic.evidenceSpan ? { start: semantic.evidenceSpan.start, end: semantic.evidenceSpan.end } : undefined,
      semanticOwner: semantic.semanticOwner,
      executionContext: semantic.executionContext,
      clauseRole: semantic.clauseRole,
      migrationReason: "RC7 v1.7 trigger_event_reference — invalid trigger-reference L2 in dev gold",
    });
  }

  const records = [...byCase.values()];
  const scrubEnvelope = {
    migrationVersion: "rc7-development-gold-policy-scrub-v1",
    generatedAt: new Date().toISOString(),
    parserBlind: true,
    parserConsulted: false,
    policyVersion: GOLD_POLICY_VERSION,
    validatorVersion: GOLD_POLICY_VALIDATOR_VERSION,
    priorMigrationCount: loadAllGoldMigrationsV135().length,
    priorDevelopmentGoldHash: priorDevGoldHash,
    preScrubDevelopmentGoldHash: preHash,
    preScrubViolationCount: triggerViolations.length,
    preScrubCensus: { invalid_trigger_reference_gold: triggerViolations.length },
    rule: "Parser-blind RC7 scrub — removes trigger_reference_action_gold only under Gold Policy Validator v1.7.",
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
        violations: triggerViolations,
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
    benchmarkPath: "development-post-rc7-trigger-reference-scrub",
  });

  writeFileSync(
    resolve(`${OUT_DIR}/rc7-development-gold-policy-correction-report-v1.json`),
    `${JSON.stringify(
      {
        preservedRescorePath: `${OUT_DIR}/rc6-certified-dev-rescore-v151-preserved-pre-rc7-gold-scrub.json`,
        priorDevelopmentGoldHash: priorDevGoldHash,
        preScrubDevelopmentGoldHash: preHash,
        correctedDevelopmentGoldHash: postHash,
        preScrubTriggerViolations: triggerViolations.length,
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
        removed: triggerViolations.length,
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

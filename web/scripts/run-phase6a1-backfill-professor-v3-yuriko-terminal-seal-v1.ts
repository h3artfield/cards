#!/usr/bin/env npx tsx
/** Backfill canonical terminal seal for spent Yuriko REPAIR_EXHAUSTED smoke — 0 OpenAI calls. */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { normalizeProfessorPlanningResponseV3 } from "./lib/phase6a1-professor-plan-normalizer-v3";
import { buildProfessorPlanningContextV3 } from "./lib/phase6a1-professor-plan-context-builder-v3";
import {
  buildValidatorContextV3FromPlanning,
  validateProfessorPlanOutputV3,
} from "../src/lib/deck-synthesis/strategy-package-validator-v3";
import type { StrategyHypothesisV3 } from "../src/lib/deck-synthesis/professor-planning-contracts-v3";
import { PROFESSOR_V3_YURIKO_PROSPECTIVE_SMOKE_CANDIDATE_EXECUTION_AUTHORIZATION_V10 } from "./lib/phase6a1-professor-v3-smoke-execution-authorization-v10";
import type { ProfessorV3ReviewedExecutionIdentityV9 } from "./lib/phase6a1-professor-v3-smoke-material-pins-v9";
import { PROFESSOR_V3_SMOKE_EXECUTION_IDENTITY_V9_PATH } from "./lib/phase6a1-professor-v3-smoke-material-pins-v9";
import { sealProfessorV3YurikoProspectiveSmokeTerminalOutcomeV10 } from "./lib/phase6a1-professor-v3-smoke-terminal-seal-v10";
import { resolveProfessorV3SmokeYurikoProspectiveOutputTargetsV1 } from "./lib/phase6a1-professor-v3-smoke-output-targets-v6";
import { loadProfessorModelPinV2 } from "./lib/phase6a1-professor-plan-model-pin-v2";
import { getPilotMechanismCatalogEntry } from "./lib/phase6a1-spent-pilot-truth-loader-v1";
import type { ProfessorV3ModelAttemptArtifactRecordV3 } from "./lib/phase6a1-professor-v3-model-attempt-artifacts-v3";

async function main() {
  const targets = resolveProfessorV3SmokeYurikoProspectiveOutputTargetsV1();
  const reviewedExecutionIdentity = JSON.parse(
    readFileSync(PROFESSOR_V3_SMOKE_EXECUTION_IDENTITY_V9_PATH, "utf8"),
  ) as ProfessorV3ReviewedExecutionIdentityV9;

  const parsedEnvelope = JSON.parse(
    readFileSync(join(targets.modelAttemptsDir, "attempt-003-parsed-response.json"), "utf8"),
  ) as { parsed?: unknown };
  const repairPrompt = readFileSync(join(targets.modelAttemptsDir, "attempt-003-repair-instructions.txt"), "utf8");

  const entry = getPilotMechanismCatalogEntry("multi-yuriko");
  if (!entry) throw new Error("Missing multi-yuriko mechanism truth");
  const ctx = await buildProfessorPlanningContextV3({
    entry,
    oppCase: null,
    options: { includeMechanicalAffordances: true },
  });
  ctx.caseId = "professor-v3-smoke-yuriko-prospective-v1";

  const normalization = normalizeProfessorPlanningResponseV3({
    parsedModelResponse: parsedEnvelope.parsed ?? parsedEnvelope,
    ctx,
  });
  if (normalization.status !== "SUCCESS") {
    throw new Error(`Backfill normalization failed: ${normalization.status}`);
  }

  const validatorCtx = buildValidatorContextV3FromPlanning(ctx);
  const validationOutcomes = validateProfessorPlanOutputV3(validatorCtx, {
    strategyHypotheses: normalization.normalized as StrategyHypothesisV3[],
  });

  const modelAttemptArtifacts: ProfessorV3ModelAttemptArtifactRecordV3[] = readdirSync(targets.modelAttemptsDir)
    .filter((name) => name.startsWith("attempt-") && name.endsWith("-http-metadata.json"))
    .sort()
    .map((name, index) => ({
      attemptIndex: index,
      relPrefix: "phase6a1-professor-v3-smoke-yuriko-prospective-model-attempts-v1",
      requestPhasePath: name.replace("-http-metadata.json", "-api-request-body.json"),
      responsePhasePath: name.replace("-http-metadata.json", "-api-response-raw.json"),
      finalizedPath: name.replace("-http-metadata.json", "-parsed-response.json"),
    }));

  const orchestration = {
    executionMode: "REAL_SMOKE" as const,
    realOutcome: "REPAIR_EXHAUSTED" as const,
    modelAuthorization: "AUTHORIZED" as const,
    caseId: ctx.caseId,
    caseStatus: "REPAIR_EXHAUSTED" as const,
    executionStatus: "REPAIR_EXHAUSTED" as const,
    phasesExecuted: ["PREFLIGHT", "LEDGER", "PAYLOAD", "MODEL_REQUEST", "VALIDATE", "REPAIR"],
    runLedger: null,
    executionTrace: null,
    toolCalls: [],
    repairRounds: [{ round: 3, validationOutcomes, repairPrompt }],
    maxRepairRounds: loadProfessorModelPinV2().experimentBounds.maxValidationRepairRounds,
    normalization,
    validationOutcomes,
    lensCoverageIssues: [],
    promptPayload: null,
    note: "Backfilled from spent attempt-003 artifacts",
  };

  const seal = sealProfessorV3YurikoProspectiveSmokeTerminalOutcomeV10({
    targets,
    caseId: ctx.caseId,
    mechanismTruthCaseId: "multi-yuriko",
    executionStage: "VALIDATE",
    materialPins: { fileCount: 0, files: [] },
    stackIdentity: "professor-v3-yuriko-smoke-execution-tree-v1-prospective",
    independentlyReviewedExecutionAuthorization: PROFESSOR_V3_YURIKO_PROSPECTIVE_SMOKE_CANDIDATE_EXECUTION_AUTHORIZATION_V10,
    reviewedExecutionIdentity,
    modelAttemptArtifacts,
    executionTrace: null,
    runLedger: null,
    stdout: "",
    stderr: "",
    decision: PROFESSOR_V3_YURIKO_PROSPECTIVE_SMOKE_CANDIDATE_EXECUTION_AUTHORIZATION_V10.decision,
    orchestration,
    modelPinSha256: loadProfessorModelPinV2().sha256,
    requireLensCoverage: true,
    backfilledFromSpentArtifacts: true,
  });

  console.log(
    JSON.stringify(
      {
        terminalOutcome: seal.terminalOutcome,
        caseStatus: seal.caseStatus,
        manifest: targets.manifest,
        failure: targets.failure,
        result: targets.result,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

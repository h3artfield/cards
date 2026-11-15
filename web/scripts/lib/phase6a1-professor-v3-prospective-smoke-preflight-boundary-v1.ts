/**
 * Shared pre-model preflight boundary for Professor v3 prospective smoke runners.
 */
import { buildProfessorPlanningContextV3 } from "./phase6a1-professor-plan-context-builder-v3";
import { getPilotMechanismCatalogEntry } from "./phase6a1-spent-pilot-truth-loader-v1";
import type { ProfessorV3IndependentlyReviewedExecutionAuthorizationV8 } from "./phase6a1-professor-v3-smoke-execution-authorization-v8";
import {
  assertProfessorV3SmokeExecutionGatePreflightEligibleV1,
  evaluateProfessorV3SmokeExecutionGateV1,
  type ProfessorV3SmokeExecutionGateEvaluationV1,
  type ProfessorV3SmokeRunnerCaseBindingV1,
} from "./phase6a1-professor-v3-smoke-execution-authorization-binding-v1";
import {
  assertProfessorV3SuccessorProspectiveSmokeExecutionPreflightV8,
  buildProfessorV3ProspectiveSmokeMaterialPinReportV1,
} from "./phase6a1-professor-v3-smoke-material-pins-v7";
import type { ProfessorV3SmokeOutputTargetsV6 } from "./phase6a1-professor-v3-smoke-output-targets-v6";
import { assertProfessorV3SmokeOutputsAbsentV6 } from "./phase6a1-professor-v3-smoke-output-targets-v6";
import { assertProfessorV3SuccessorRagPreflightBeforeModelV1 } from "./phase6a1-professor-v3-successor-rag-preflight-v1";
import type { ProfessorPlanningContextV3 } from "../../src/lib/deck-synthesis/professor-planning-contracts-v3";

export const PROFESSOR_V3_PROSPECTIVE_SMOKE_PREFLIGHT_BOUNDARY_V1_VERSION =
  "phase6a1-professor-v3-prospective-smoke-preflight-boundary-v1";

export type ProfessorV3ProspectiveSmokePreflightBoundaryResultV1 = {
  version: typeof PROFESSOR_V3_PROSPECTIVE_SMOKE_PREFLIGHT_BOUNDARY_V1_VERSION;
  gate: ProfessorV3SmokeExecutionGateEvaluationV1;
  identityVerification: ReturnType<typeof assertProfessorV3SuccessorProspectiveSmokeExecutionPreflightV8>;
  materialPinReport: ReturnType<typeof buildProfessorV3ProspectiveSmokeMaterialPinReportV1>;
  ragPreflight: ReturnType<typeof assertProfessorV3SuccessorRagPreflightBeforeModelV1>;
  ctx: ProfessorPlanningContextV3;
  reachedStage: "PREFLIGHT_BOUNDARY_BEFORE_MODEL_ORCHESTRATION";
};

export async function runProfessorV3ProspectiveSmokePreflightBoundaryV1(args: {
  authorization: ProfessorV3IndependentlyReviewedExecutionAuthorizationV8;
  runner: ProfessorV3SmokeRunnerCaseBindingV1;
  executeSwitchPresent: boolean;
  targets: ProfessorV3SmokeOutputTargetsV6;
}): Promise<ProfessorV3ProspectiveSmokePreflightBoundaryResultV1> {
  const gate = evaluateProfessorV3SmokeExecutionGateV1({
    authorization: args.authorization,
    runner: args.runner,
    executeSwitchPresent: args.executeSwitchPresent,
  });
  assertProfessorV3SmokeExecutionGatePreflightEligibleV1(gate);

  assertProfessorV3SmokeOutputsAbsentV6(args.targets);
  const identityVerification = assertProfessorV3SuccessorProspectiveSmokeExecutionPreflightV8({
    authorization: args.authorization,
  });
  const materialPinReport = buildProfessorV3ProspectiveSmokeMaterialPinReportV1(identityVerification);

  const entry = getPilotMechanismCatalogEntry(args.runner.mechanismTruthCaseId);
  if (!entry) throw new Error(`Missing mechanism truth for ${args.runner.mechanismTruthCaseId}`);

  const ctx = await buildProfessorPlanningContextV3({
    entry,
    oppCase: null,
    options: { includeMechanicalAffordances: true },
  });
  ctx.caseId = args.runner.caseId;

  const ragPreflight = assertProfessorV3SuccessorRagPreflightBeforeModelV1(ctx);

  return {
    version: PROFESSOR_V3_PROSPECTIVE_SMOKE_PREFLIGHT_BOUNDARY_V1_VERSION,
    gate,
    identityVerification,
    materialPinReport,
    ragPreflight,
    ctx,
    reachedStage: "PREFLIGHT_BOUNDARY_BEFORE_MODEL_ORCHESTRATION",
  };
}

export function emitProfessorV3SmokeExecutionGateBlockedArtifactV1(args: {
  version: string;
  decision: string;
  gate: ProfessorV3SmokeExecutionGateEvaluationV1;
  runner: ProfessorV3SmokeRunnerCaseBindingV1;
  authorization: ProfessorV3IndependentlyReviewedExecutionAuthorizationV8;
  outputTargets?: ProfessorV3SmokeOutputTargetsV6;
}) {
  return {
    version: args.version,
    generatedAt: new Date().toISOString(),
    decision: args.decision,
    executeSwitchRequired: "--execute",
    caseId: args.runner.caseId,
    mechanismTruthCaseId: args.runner.mechanismTruthCaseId,
    stackIdentity: args.runner.stackIdentity,
    independentlyReviewedExecutionAuthorization: args.authorization,
    executionGate: args.gate,
    modelAuthorization: args.gate.modelAuthorization,
    executionStatus: args.gate.executionStatus,
    outputTargets: args.outputTargets ?? null,
    note: "Fail closed before hash preflight or model request.",
  };
}

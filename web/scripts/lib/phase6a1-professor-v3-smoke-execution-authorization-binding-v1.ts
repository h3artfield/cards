/**
 * Semantic execution gate — --execute is necessary but not sufficient for REAL_SMOKE.
 */
import type { ProfessorV3IndependentlyReviewedExecutionAuthorizationV8 } from "./phase6a1-professor-v3-smoke-execution-authorization-v8";
import { assertProfessorV3MaxModelApiCallsPresentWhenAuthorizedV1 } from "./phase6a1-professor-v3-model-call-budget-v1";

export const PROFESSOR_V3_SMOKE_EXECUTION_AUTHORIZATION_BINDING_V1_VERSION =
  "phase6a1-professor-v3-smoke-execution-authorization-binding-v1";

export const PROFESSOR_V3_SMOKE_EXECUTION_GATE_BLOCKED_NO_EXECUTE_SWITCH =
  "BLOCKED_NO_EXECUTE_SWITCH" as const;
export const PROFESSOR_V3_SMOKE_EXECUTION_GATE_BLOCKED_MODEL_EXECUTION_NOT_AUTHORIZED =
  "BLOCKED_MODEL_EXECUTION_NOT_AUTHORIZED" as const;
export const PROFESSOR_V3_SMOKE_EXECUTION_GATE_BLOCKED_AUTHORIZATION_DECISION_MISMATCH =
  "BLOCKED_AUTHORIZATION_DECISION_MISMATCH" as const;
export const PROFESSOR_V3_SMOKE_EXECUTION_GATE_BLOCKED_CASE_IDENTITY_MISMATCH =
  "BLOCKED_CASE_IDENTITY_MISMATCH" as const;
export const PROFESSOR_V3_SMOKE_EXECUTION_GATE_BLOCKED_SPENT_SUBJECT_PROHIBITED =
  "BLOCKED_SPENT_SUBJECT_PROHIBITED" as const;
export const PROFESSOR_V3_SMOKE_EXECUTION_GATE_PREFLIGHT_ELIGIBLE = "PREFLIGHT_ELIGIBLE" as const;

export type ProfessorV3SmokeExecutionGateStatusV1 =
  | typeof PROFESSOR_V3_SMOKE_EXECUTION_GATE_BLOCKED_NO_EXECUTE_SWITCH
  | typeof PROFESSOR_V3_SMOKE_EXECUTION_GATE_BLOCKED_MODEL_EXECUTION_NOT_AUTHORIZED
  | typeof PROFESSOR_V3_SMOKE_EXECUTION_GATE_BLOCKED_AUTHORIZATION_DECISION_MISMATCH
  | typeof PROFESSOR_V3_SMOKE_EXECUTION_GATE_BLOCKED_CASE_IDENTITY_MISMATCH
  | typeof PROFESSOR_V3_SMOKE_EXECUTION_GATE_BLOCKED_SPENT_SUBJECT_PROHIBITED
  | typeof PROFESSOR_V3_SMOKE_EXECUTION_GATE_PREFLIGHT_ELIGIBLE;

export type ProfessorV3SmokeRunnerCaseBindingV1 = {
  decision: string;
  caseId: string;
  mechanismTruthCaseId: string;
  stackIdentity: string;
};

export type ProfessorV3SmokeExecutionGateEvaluationV1 = {
  version: typeof PROFESSOR_V3_SMOKE_EXECUTION_AUTHORIZATION_BINDING_V1_VERSION;
  status: ProfessorV3SmokeExecutionGateStatusV1;
  modelAuthorization: "BLOCKED" | "AUTHORIZED";
  executionStatus: "MODEL_EXECUTION_NOT_AUTHORIZED" | "PREFLIGHT_ELIGIBLE";
  independentlyReviewedDecision: string;
  modelExecutionAuthorized: boolean;
  executeSwitchPresent: boolean;
};

const SPENT_MULDROTHA_SUCCESSOR_CASE_ID_PREFIXES = [
  "professor-v3-smoke-muldrotha-successor-",
] as const;

const SPENT_MULDROTHA_MECHANISM_TRUTH_CASE_IDS = ["multi-muldrotha"] as const;

const SPENT_YURIKO_PROSPECTIVE_CASE_IDS = ["professor-v3-smoke-yuriko-prospective-v1"] as const;
const SPENT_YURIKO_MECHANISM_TRUTH_CASE_IDS = ["multi-yuriko"] as const;

export function inferProfessorV3ModelExecutionAuthorizedFromDecision(decision: string): boolean {
  if (decision.includes("_NO_MODEL")) return false;
  if (decision.includes("_AUTHORIZED_WITH_EXTERNAL_ANCHORS")) return true;
  if (decision.includes("_SMOKE_AUTHORIZED")) return true;
  return false;
}

export function resolveProfessorV3ModelExecutionAuthorizedV1(
  authorization: Pick<ProfessorV3IndependentlyReviewedExecutionAuthorizationV8, "decision" | "modelExecutionAuthorized">,
): boolean {
  if (typeof authorization.modelExecutionAuthorized === "boolean") {
    return authorization.modelExecutionAuthorized;
  }
  return inferProfessorV3ModelExecutionAuthorizedFromDecision(authorization.decision);
}

export function assertProfessorV3AuthorizationDecisionSemanticallyConsistentV1(
  authorization: Pick<ProfessorV3IndependentlyReviewedExecutionAuthorizationV8, "decision" | "modelExecutionAuthorized">,
): void {
  const inferred = inferProfessorV3ModelExecutionAuthorizedFromDecision(authorization.decision);
  if (authorization.decision.includes("_NO_MODEL") && authorization.modelExecutionAuthorized !== false) {
    throw new Error(
      `FAIL_CLOSED: authorization decision ${authorization.decision} requires modelExecutionAuthorized=false`,
    );
  }
  if (typeof authorization.modelExecutionAuthorized === "boolean" && authorization.modelExecutionAuthorized !== inferred) {
    throw new Error(
      `FAIL_CLOSED: authorization modelExecutionAuthorized=${authorization.modelExecutionAuthorized} disagrees with decision semantics for ${authorization.decision}`,
    );
  }
}

export function isProfessorV3SpentYurikoProspectiveRunnerBindingV1(runner: ProfessorV3SmokeRunnerCaseBindingV1): boolean {
  if (SPENT_YURIKO_MECHANISM_TRUTH_CASE_IDS.includes(runner.mechanismTruthCaseId as (typeof SPENT_YURIKO_MECHANISM_TRUTH_CASE_IDS)[number])) {
    return true;
  }
  return SPENT_YURIKO_PROSPECTIVE_CASE_IDS.includes(runner.caseId as (typeof SPENT_YURIKO_PROSPECTIVE_CASE_IDS)[number]);
}

export function isProfessorV3SpentMuldrothaSuccessorRunnerBindingV1(runner: ProfessorV3SmokeRunnerCaseBindingV1): boolean {
  if (SPENT_MULDROTHA_MECHANISM_TRUTH_CASE_IDS.includes(runner.mechanismTruthCaseId as (typeof SPENT_MULDROTHA_MECHANISM_TRUTH_CASE_IDS)[number])) {
    return true;
  }
  return SPENT_MULDROTHA_SUCCESSOR_CASE_ID_PREFIXES.some((prefix) => runner.caseId.startsWith(prefix));
}

export function evaluateProfessorV3SmokeExecutionGateV1(args: {
  authorization: ProfessorV3IndependentlyReviewedExecutionAuthorizationV8;
  runner: ProfessorV3SmokeRunnerCaseBindingV1;
  executeSwitchPresent: boolean;
}): ProfessorV3SmokeExecutionGateEvaluationV1 {
  assertProfessorV3AuthorizationDecisionSemanticallyConsistentV1(args.authorization);
  const modelExecutionAuthorized = resolveProfessorV3ModelExecutionAuthorizedV1(args.authorization);
  if (modelExecutionAuthorized) {
    assertProfessorV3MaxModelApiCallsPresentWhenAuthorizedV1({
      modelExecutionAuthorized,
      maxModelApiCalls: args.authorization.maxModelApiCalls,
      decision: args.authorization.decision,
    });
  }

  const base = {
    version: PROFESSOR_V3_SMOKE_EXECUTION_AUTHORIZATION_BINDING_V1_VERSION,
    independentlyReviewedDecision: args.authorization.decision,
    modelExecutionAuthorized,
    executeSwitchPresent: args.executeSwitchPresent,
  } as const;

  if (!args.executeSwitchPresent) {
    return {
      ...base,
      status: PROFESSOR_V3_SMOKE_EXECUTION_GATE_BLOCKED_NO_EXECUTE_SWITCH,
      modelAuthorization: "BLOCKED",
      executionStatus: "MODEL_EXECUTION_NOT_AUTHORIZED",
    };
  }

  if (isProfessorV3SpentMuldrothaSuccessorRunnerBindingV1(args.runner)) {
    return {
      ...base,
      status: PROFESSOR_V3_SMOKE_EXECUTION_GATE_BLOCKED_SPENT_SUBJECT_PROHIBITED,
      modelAuthorization: "BLOCKED",
      executionStatus: "MODEL_EXECUTION_NOT_AUTHORIZED",
    };
  }

  if (isProfessorV3SpentYurikoProspectiveRunnerBindingV1(args.runner)) {
    return {
      ...base,
      status: PROFESSOR_V3_SMOKE_EXECUTION_GATE_BLOCKED_SPENT_SUBJECT_PROHIBITED,
      modelAuthorization: "BLOCKED",
      executionStatus: "MODEL_EXECUTION_NOT_AUTHORIZED",
    };
  }

  if (!modelExecutionAuthorized) {
    return {
      ...base,
      status: PROFESSOR_V3_SMOKE_EXECUTION_GATE_BLOCKED_MODEL_EXECUTION_NOT_AUTHORIZED,
      modelAuthorization: "BLOCKED",
      executionStatus: "MODEL_EXECUTION_NOT_AUTHORIZED",
    };
  }

  if (args.runner.decision !== args.authorization.decision) {
    return {
      ...base,
      status: PROFESSOR_V3_SMOKE_EXECUTION_GATE_BLOCKED_AUTHORIZATION_DECISION_MISMATCH,
      modelAuthorization: "BLOCKED",
      executionStatus: "MODEL_EXECUTION_NOT_AUTHORIZED",
    };
  }

  if (
    args.runner.caseId !== args.authorization.prospectiveCaseId ||
    args.runner.mechanismTruthCaseId !== args.authorization.mechanismTruthCaseId ||
    args.runner.stackIdentity !== args.authorization.stackIdentity
  ) {
    return {
      ...base,
      status: PROFESSOR_V3_SMOKE_EXECUTION_GATE_BLOCKED_CASE_IDENTITY_MISMATCH,
      modelAuthorization: "BLOCKED",
      executionStatus: "MODEL_EXECUTION_NOT_AUTHORIZED",
    };
  }

  return {
    ...base,
    status: PROFESSOR_V3_SMOKE_EXECUTION_GATE_PREFLIGHT_ELIGIBLE,
    modelAuthorization: "AUTHORIZED",
    executionStatus: "PREFLIGHT_ELIGIBLE",
  };
}

export function assertProfessorV3SmokeExecutionGatePreflightEligibleV1(
  evaluation: ProfessorV3SmokeExecutionGateEvaluationV1,
): void {
  if (evaluation.status !== PROFESSOR_V3_SMOKE_EXECUTION_GATE_PREFLIGHT_ELIGIBLE) {
    throw new Error(`FAIL_CLOSED: execution gate status=${evaluation.status}; expected PREFLIGHT_ELIGIBLE`);
  }
}

export function assertProfessorV3SmokeExecutionGateBlockedV1(args: {
  evaluation: ProfessorV3SmokeExecutionGateEvaluationV1;
  expectedStatus: Exclude<ProfessorV3SmokeExecutionGateStatusV1, typeof PROFESSOR_V3_SMOKE_EXECUTION_GATE_PREFLIGHT_ELIGIBLE>;
}): void {
  if (args.evaluation.status !== args.expectedStatus) {
    throw new Error(`Expected gate status=${args.expectedStatus}; got ${args.evaluation.status}`);
  }
  if (args.evaluation.modelAuthorization !== "BLOCKED") {
    throw new Error(`Expected modelAuthorization=BLOCKED; got ${args.evaluation.modelAuthorization}`);
  }
}

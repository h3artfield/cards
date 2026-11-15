/**
 * Professor v3 OpenAI Responses API call budget — enforced before every model request.
 */
import type { ProfessorV3ModelCallerInput, ProfessorV3ModelResponse } from "./phase6a1-professor-plan-agent-v3";

export const PROFESSOR_V3_MODEL_CALL_BUDGET_V1_VERSION = "phase6a1-professor-v3-model-call-budget-v1";

export const PROFESSOR_V3_MODEL_CALL_BUDGET_EXHAUSTED_V1 = "FAIL_CLOSED_MODEL_CALL_BUDGET_EXHAUSTED" as const;

export class ProfessorV3ModelCallBudgetExhaustedErrorV1 extends Error {
  readonly code = PROFESSOR_V3_MODEL_CALL_BUDGET_EXHAUSTED_V1;
  readonly maxModelApiCalls: number;
  readonly attemptedCallIndex: number;

  constructor(args: { maxModelApiCalls: number; attemptedCallIndex: number }) {
    super(
      `${PROFESSOR_V3_MODEL_CALL_BUDGET_EXHAUSTED_V1}: attempted model API call index ${args.attemptedCallIndex} exceeds authorized maxModelApiCalls=${args.maxModelApiCalls}`,
    );
    this.name = "ProfessorV3ModelCallBudgetExhaustedErrorV1";
    this.maxModelApiCalls = args.maxModelApiCalls;
    this.attemptedCallIndex = args.attemptedCallIndex;
  }
}

export function isProfessorV3ModelCallBudgetExhaustedErrorV1(error: unknown): error is ProfessorV3ModelCallBudgetExhaustedErrorV1 {
  return error instanceof ProfessorV3ModelCallBudgetExhaustedErrorV1;
}

export function assertProfessorV3MaxModelApiCallsPresentWhenAuthorizedV1(args: {
  modelExecutionAuthorized: boolean;
  maxModelApiCalls: number | undefined;
  decision: string;
}): void {
  if (!args.modelExecutionAuthorized) return;
  if (typeof args.maxModelApiCalls !== "number" || !Number.isInteger(args.maxModelApiCalls) || args.maxModelApiCalls < 1) {
    throw new Error(
      `FAIL_CLOSED: authorization decision ${args.decision} requires explicit maxModelApiCalls >= 1 when modelExecutionAuthorized=true`,
    );
  }
}

export function resolveProfessorV3MaxModelApiCallsV1(args: {
  modelExecutionAuthorized: boolean;
  maxModelApiCalls: number | undefined;
  decision?: string;
}): number | null {
  assertProfessorV3MaxModelApiCallsPresentWhenAuthorizedV1({
    modelExecutionAuthorized: args.modelExecutionAuthorized,
    maxModelApiCalls: args.maxModelApiCalls,
    decision: args.decision ?? "authorization",
  });
  if (!args.modelExecutionAuthorized) return null;
  return args.maxModelApiCalls ?? null;
}

export type ProfessorV3ModelCallBudgetGuardV1 = {
  readonly maxModelApiCalls: number;
  apiCallsMade: number;
  assertCallAllowed: (attemptIndex: number) => void;
  recordCallCompleted: () => void;
};

export function createProfessorV3ModelCallBudgetGuardV1(maxModelApiCalls: number): ProfessorV3ModelCallBudgetGuardV1 {
  if (!Number.isInteger(maxModelApiCalls) || maxModelApiCalls < 1) {
    throw new Error(`FAIL_CLOSED: maxModelApiCalls must be a positive integer; got ${maxModelApiCalls}`);
  }
  const guard: ProfessorV3ModelCallBudgetGuardV1 = {
    maxModelApiCalls,
    apiCallsMade: 0,
    assertCallAllowed(attemptIndex: number) {
      if (attemptIndex >= guard.maxModelApiCalls) {
        throw new ProfessorV3ModelCallBudgetExhaustedErrorV1({ maxModelApiCalls: guard.maxModelApiCalls, attemptedCallIndex: attemptIndex });
      }
    },
    recordCallCompleted() {
      guard.apiCallsMade += 1;
    },
  };
  return guard;
}

export function wrapProfessorV3ModelCallerWithBudgetV1(args: {
  modelCaller: (input: ProfessorV3ModelCallerInput) => Promise<ProfessorV3ModelResponse>;
  budgetGuard: ProfessorV3ModelCallBudgetGuardV1;
}): (input: ProfessorV3ModelCallerInput) => Promise<ProfessorV3ModelResponse> {
  return async (input) => {
    args.budgetGuard.assertCallAllowed(input.attemptIndex);
    const response = await args.modelCaller(input);
    args.budgetGuard.recordCallCompleted();
    return response;
  };
}

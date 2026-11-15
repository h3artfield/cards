/**
 * Deterministic Professor planning context preflight — no model calls.
 */
import type { ProfessorPlanningContext } from "../../src/lib/deck-synthesis/professor-planning-contracts-v2";

export const PROFESSOR_PLAN_CONTEXT_PREFLIGHT_V1_VERSION = "phase6a1-professor-plan-context-preflight-v1";

export type ProfessorContextPreflightIssue = {
  code:
    | "EMPTY_MECHANISM_FACT_UNIVERSE"
    | "EMPTY_SEMANTIC_OPPORTUNITY_UNIVERSE"
    | "EMPTY_COMMAND_ZONE"
    | "MISSING_CASE_ID";
  path: string;
  message: string;
};

export type ProfessorContextPreflightResult =
  | { pass: true; issues: [] }
  | { pass: false; classification: "PROFESSOR_CONTEXT_UNSATISFIABLE"; issues: ProfessorContextPreflightIssue[] };

export function auditProfessorPlanningContextPreflight(ctx: ProfessorPlanningContext): ProfessorContextPreflightResult {
  const issues: ProfessorContextPreflightIssue[] = [];

  if (!ctx.caseId?.trim()) {
    issues.push({
      code: "MISSING_CASE_ID",
      path: "caseId",
      message: "Planning context requires nonblank caseId",
    });
  }

  if (!ctx.commandZone.commanders.length) {
    issues.push({
      code: "EMPTY_COMMAND_ZONE",
      path: "commandZone.commanders",
      message: "Planning context requires at least one commander",
    });
  }

  if (!ctx.commanderMechanismFacts.length) {
    issues.push({
      code: "EMPTY_MECHANISM_FACT_UNIVERSE",
      path: "commanderMechanismFacts",
      message: "Positive hypotheses require commanderMechanismFactIds from a non-empty frozen fact universe",
    });
  }

  if (!ctx.semanticOpportunities.length) {
    issues.push({
      code: "EMPTY_SEMANTIC_OPPORTUNITY_UNIVERSE",
      path: "semanticOpportunities",
      message:
        "Positive hypotheses require semanticOpportunityIds from a non-empty frozen opportunity universe; empty universe is an input/context defect",
    });
  }

  if (issues.length > 0) {
    return {
      pass: false,
      classification: "PROFESSOR_CONTEXT_UNSATISFIABLE",
      issues,
    };
  }

  return { pass: true, issues: [] };
}

export function assertProfessorPlanningContextPreflight(ctx: ProfessorPlanningContext): void {
  const result = auditProfessorPlanningContextPreflight(ctx);
  if (!result.pass) {
    const detail = result.issues.map((i) => `${i.code} @ ${i.path}: ${i.message}`).join("; ");
    throw new Error(`PROFESSOR_CONTEXT_UNSATISFIABLE: ${detail}`);
  }
}

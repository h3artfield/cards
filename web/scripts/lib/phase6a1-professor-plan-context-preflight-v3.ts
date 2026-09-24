/**
 * Deterministic Professor v3 planning context preflight — no model calls.
 * Empty precomputed affordances do NOT make context unsatisfiable.
 * Canonical Oracle + mechanism facts baseline is required; RAG alone is insufficient.
 */
import type { ProfessorPlanningContextV3 } from "../../src/lib/deck-synthesis/professor-planning-contracts-v3";

export const PROFESSOR_PLAN_CONTEXT_PREFLIGHT_V3_VERSION = "phase6a1-professor-plan-context-preflight-v3";

export type ProfessorContextPreflightIssueV3 = {
  code:
    | "MISSING_CASE_ID"
    | "EMPTY_COMMAND_ZONE"
    | "MISSING_CANONICAL_ORACLE"
    | "EMPTY_MECHANISM_FACT_UNIVERSE"
    | "RAG_ONLY_INSUFFICIENT_BASELINE"
    | "INSUFFICIENT_GROUNDING_MATERIAL";
  path: string;
  message: string;
};

export type ProfessorContextPreflightResultV3 =
  | { pass: true; issues: [] }
  | { pass: false; classification: "PROFESSOR_CONTEXT_UNSATISFIABLE"; issues: ProfessorContextPreflightIssueV3[] };

export function auditProfessorPlanningContextPreflightV3(ctx: ProfessorPlanningContextV3): ProfessorContextPreflightResultV3 {
  const issues: ProfessorContextPreflightIssueV3[] = [];

  if (!ctx.caseId?.trim()) {
    issues.push({ code: "MISSING_CASE_ID", path: "caseId", message: "Planning context requires nonblank caseId" });
  }
  if (!ctx.commandZone.commanders.length) {
    issues.push({
      code: "EMPTY_COMMAND_ZONE",
      path: "commandZone.commanders",
      message: "Planning context requires at least one commander",
    });
  }

  const hasMechanismFacts = ctx.commanderMechanismFacts.length > 0;
  const hasOracle = ctx.canonicalOracle.some((o) => o.oracleText.trim().length > 0);
  const hasRelationships = ctx.semanticRelationships.length > 0;
  const hasRag = ctx.initialRagEvidence.length > 0;
  const hasRules = (ctx.rulesConstraints?.length ?? 0) > 0;
  const hasAffordances = ctx.knownMechanicalAffordances.length > 0;
  const hasResearch = ctx.initialResearchEvidence.length > 0;

  if (!hasOracle) {
    issues.push({
      code: "MISSING_CANONICAL_ORACLE",
      path: "canonicalOracle",
      message: "Professor v3 requires resolved canonical Oracle text for command-zone identity",
    });
  }

  if (!hasMechanismFacts) {
    issues.push({
      code: "EMPTY_MECHANISM_FACT_UNIVERSE",
      path: "commanderMechanismFacts",
      message: "Professor v3 requires commander mechanism facts when semantic parsing is expected",
    });
  }

  const ragOnlyBaseline =
    hasRag &&
    !hasMechanismFacts &&
    !hasOracle &&
    !hasRelationships &&
    !hasAffordances &&
    !hasRules &&
    !hasResearch;

  if (ragOnlyBaseline || (hasRag && !hasMechanismFacts && !hasOracle)) {
    issues.push({
      code: "RAG_ONLY_INSUFFICIENT_BASELINE",
      path: "groundingMaterial",
      message: "RAG/research enrich canonical truth but cannot replace commander Oracle + mechanism facts baseline",
    });
  }

  if (
    !hasMechanismFacts &&
    !hasOracle &&
    !hasRelationships &&
    !hasRag &&
    !hasRules &&
    !hasAffordances &&
    !hasResearch
  ) {
    issues.push({
      code: "INSUFFICIENT_GROUNDING_MATERIAL",
      path: "groundingMaterial",
      message:
        "Professor v3 requires trustworthy grounding material (mechanism facts, oracle, relationships, rules, RAG, or optional affordances)",
    });
  }

  if (issues.length > 0) {
    return { pass: false, classification: "PROFESSOR_CONTEXT_UNSATISFIABLE", issues };
  }
  return { pass: true, issues: [] };
}

export function assertProfessorPlanningContextPreflightV3(ctx: ProfessorPlanningContextV3): void {
  const result = auditProfessorPlanningContextPreflightV3(ctx);
  if (!result.pass) {
    throw new Error(
      `PROFESSOR_CONTEXT_UNSATISFIABLE: ${result.issues.map((i) => `${i.code} @ ${i.path}`).join("; ")}`,
    );
  }
}

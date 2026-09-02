/**
 * Typed planning evidence — single canonical union for Professor packages/hypotheses.
 */
export const PROFESSOR_PLANNING_EVIDENCE_V1_VERSION = "professor-planning-evidence-v1";

export type PlanningEvidence =
  | {
      kind: "CANONICAL_FACT";
      factIds: string[];
      statement?: string;
    }
  | {
      kind: "SEMANTIC_OPPORTUNITY";
      opportunityIds: string[];
      statement?: string;
    }
  | {
      kind: "RAG_EVIDENCE";
      evidenceIds: string[];
      statement?: string;
    }
  | {
      kind: "RULES_EVIDENCE";
      ruleId: string;
      statement?: string;
    }
  | {
      kind: "MODEL_INFERENCE";
      rationale: string;
      supportingFactIds?: string[];
      supportingOpportunityIds?: string[];
    };

export function isPlanningEvidence(value: unknown): value is PlanningEvidence {
  if (!value || typeof value !== "object") return false;
  const kind = (value as { kind?: string }).kind;
  if (kind === "CANONICAL_FACT") {
    return Array.isArray((value as { factIds?: unknown }).factIds);
  }
  if (kind === "SEMANTIC_OPPORTUNITY") {
    return Array.isArray((value as { opportunityIds?: unknown }).opportunityIds);
  }
  if (kind === "RAG_EVIDENCE") {
    return Array.isArray((value as { evidenceIds?: unknown }).evidenceIds);
  }
  if (kind === "RULES_EVIDENCE") {
    return typeof (value as { ruleId?: unknown }).ruleId === "string";
  }
  if (kind === "MODEL_INFERENCE") {
    return typeof (value as { rationale?: unknown }).rationale === "string";
  }
  return false;
}

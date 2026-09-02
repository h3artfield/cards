/**
 * Professor v3 evidence reference contract — grounding sources for strategic claims.
 * Precomputed semantic opportunities are optional hints (PRECOMPUTED_AFFORDANCE), not a whitelist.
 */
export const PROFESSOR_PLANNING_EVIDENCE_V3_VERSION = "professor-planning-evidence-v3";

export type EvidenceRef =
  | {
      kind: "MECHANISM_FACT";
      factIds: string[];
      statement?: string;
    }
  | {
      kind: "ORACLE_CLAUSE";
      sourceOracleId: string;
      oracleSpan?: string;
      statement?: string;
    }
  | {
      kind: "SEMANTIC_RELATIONSHIP";
      relationshipId: string;
      statement?: string;
    }
  | {
      kind: "PRECOMPUTED_AFFORDANCE";
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
      kind: "RESEARCH_EVIDENCE";
      evidenceIds: string[];
      statement?: string;
    };

export function evidenceRefText(fields: Array<string | undefined>): string {
  return fields.filter((x): x is string => Boolean(x)).join(" ").toLowerCase();
}

export function collectEvidenceRefBlob(refs: EvidenceRef[]): string {
  return refs
    .map((ref) => {
      if (ref.kind === "MECHANISM_FACT") return [ref.statement, ...ref.factIds].join(" ");
      if (ref.kind === "ORACLE_CLAUSE") return [ref.statement, ref.oracleSpan, ref.sourceOracleId].join(" ");
      if (ref.kind === "SEMANTIC_RELATIONSHIP") return [ref.statement, ref.relationshipId].join(" ");
      if (ref.kind === "PRECOMPUTED_AFFORDANCE") return [ref.statement, ...ref.opportunityIds].join(" ");
      if (ref.kind === "RAG_EVIDENCE") return [ref.statement, ...ref.evidenceIds].join(" ");
      if (ref.kind === "RULES_EVIDENCE") return [ref.statement, ref.ruleId].join(" ");
      return [ref.statement, ...ref.evidenceIds].join(" ");
    })
    .join(" ")
    .toLowerCase();
}

/**
 * Fail-closed Professor v3 evidence reference resolver — existence + ledger integrity.
 * Structural entailment for assertions lives in typed-assertion-grounding-v3.
 */
import type { EvidenceRef } from "./professor-planning-evidence-v3";
import type { IndependentMechanismFact } from "./independent-truth-types-v1";
import type { SemanticOpportunity } from "./semantic-opportunity-types-v1";
import type { ProfessorPlanningContextV3, SemanticRelationshipV3 } from "./professor-planning-contracts-v3";
import {
  buildProfessorEvidenceLedgerV3,
  ledgerEntryById,
  ledgerRulesEntryByRuleId,
  type ProfessorEvidenceLedgerV3,
} from "./professor-v3-evidence-ledger-v1";

function normalizeForSpanMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/\{[^}]+\}/g, (m) => m.replace(/\s+/g, ""))
    .replace(/[—–]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function spanExistsInOracle(span: string, oracleText: string): boolean {
  if (!span?.trim() || !oracleText?.trim()) return false;
  const normSpan = normalizeForSpanMatch(span);
  const normOracle = normalizeForSpanMatch(oracleText);
  if (normOracle.includes(normSpan)) return true;
  const words = normSpan.split(/\s+/).filter((w) => w.length > 3);
  if (words.length === 0) return normSpan.length <= 4 && normOracle.includes(normSpan);
  return words.filter((w) => normOracle.includes(w)).length / words.length >= 0.75;
}

export const PROFESSOR_PLANNING_EVIDENCE_RESOLVER_V3_VERSION = "professor-planning-evidence-resolver-v3";

export type EvidenceResolutionIssueV3 = {
  code: string;
  message: string;
  severity: "ERROR" | "WARNING";
};

export type PreservedResearchEvidenceV3 = {
  evidenceId: string;
  sourceTitle: string;
  summary: string;
  sourceUrl?: string;
  retrievedAt: string;
};

export type EvidenceResolverContextV3 = {
  mechanismFacts: IndependentMechanismFact[];
  knownMechanicalAffordances: SemanticOpportunity[];
  semanticRelationships: SemanticRelationshipV3[];
  oracleEntries: ProfessorPlanningContextV3["canonicalOracle"];
  ledger: ProfessorEvidenceLedgerV3;
  researchEvidenceById: Map<string, PreservedResearchEvidenceV3>;
};

export function buildEvidenceResolverContextV3(ctx: ProfessorPlanningContextV3): EvidenceResolverContextV3 {
  return {
    mechanismFacts: ctx.commanderMechanismFacts,
    knownMechanicalAffordances: ctx.knownMechanicalAffordances,
    semanticRelationships: ctx.semanticRelationships,
    oracleEntries: ctx.canonicalOracle,
    ledger: buildProfessorEvidenceLedgerV3(ctx),
    researchEvidenceById: new Map(ctx.initialResearchEvidence.map((r) => [r.evidenceId, r])),
  };
}

function nonEmptyIds(ids: string[] | undefined): string[] | null {
  const filtered = (ids ?? []).map((x) => x.trim()).filter(Boolean);
  return filtered.length > 0 ? filtered : null;
}

function oracleById(ctx: EvidenceResolverContextV3, sourceOracleId: string) {
  return ctx.oracleEntries.find((o) => o.sourceOracleId === sourceOracleId);
}

export function resolveEvidenceRefExistenceV3(args: {
  ctx: EvidenceResolverContextV3;
  ref: EvidenceRef;
}): EvidenceResolutionIssueV3[] {
  const { ref, ctx } = args;
  const issues: EvidenceResolutionIssueV3[] = [];
  const facts = new Map(ctx.mechanismFacts.map((f) => [f.mechanismId, f]));
  const affordances = new Set(ctx.knownMechanicalAffordances.map((o) => o.opportunityId));

  if (ref.kind === "MECHANISM_FACT") {
    const factIds = nonEmptyIds(ref.factIds);
    if (!factIds) {
      issues.push({ code: "EMPTY_MECHANISM_FACT_IDS", message: "MECHANISM_FACT requires non-empty factIds", severity: "ERROR" });
      return issues;
    }
    for (const fid of factIds) {
      if (!facts.has(fid)) {
        issues.push({ code: "UNKNOWN_MECHANISM_FACT", message: `Unknown mechanism fact '${fid}'`, severity: "ERROR" });
      }
    }
    return issues;
  }

  if (ref.kind === "ORACLE_CLAUSE") {
    if (!ref.sourceOracleId?.trim()) {
      issues.push({ code: "EMPTY_ORACLE_ID", message: "ORACLE_CLAUSE requires nonblank sourceOracleId", severity: "ERROR" });
      return issues;
    }
    const entry = oracleById(ctx, ref.sourceOracleId);
    if (!entry) {
      issues.push({ code: "UNKNOWN_ORACLE_CLAUSE", message: `Unknown oracle entry '${ref.sourceOracleId}'`, severity: "ERROR" });
      return issues;
    }
    if (ref.oracleSpan?.trim() && !spanExistsInOracle(ref.oracleSpan, entry.oracleText)) {
      issues.push({
        code: "FABRICATED_ORACLE_SPAN",
        message: `oracleSpan not found in canonical Oracle text for '${ref.sourceOracleId}'`,
        severity: "ERROR",
      });
    }
    return issues;
  }

  if (ref.kind === "PRECOMPUTED_AFFORDANCE") {
    const opportunityIds = nonEmptyIds(ref.opportunityIds);
    if (!opportunityIds) {
      issues.push({ code: "EMPTY_PRECOMPUTED_AFFORDANCE_IDS", message: "PRECOMPUTED_AFFORDANCE requires non-empty opportunityIds", severity: "ERROR" });
      return issues;
    }
    for (const oid of opportunityIds) {
      if (!affordances.has(oid)) {
        issues.push({ code: "UNKNOWN_PRECOMPUTED_AFFORDANCE", message: `Unknown precomputed affordance '${oid}'`, severity: "ERROR" });
      }
    }
    return issues;
  }

  if (ref.kind === "SEMANTIC_RELATIONSHIP") {
    if (!ref.relationshipId?.trim()) {
      issues.push({ code: "EMPTY_SEMANTIC_RELATIONSHIP_ID", message: "SEMANTIC_RELATIONSHIP requires nonblank relationshipId", severity: "ERROR" });
      return issues;
    }
    if (!ctx.semanticRelationships.some((r) => r.relationshipId === ref.relationshipId)) {
      issues.push({ code: "UNKNOWN_SEMANTIC_RELATIONSHIP", message: `Unknown semantic relationship '${ref.relationshipId}'`, severity: "ERROR" });
    }
    return issues;
  }

  if (ref.kind === "RAG_EVIDENCE") {
    const evidenceIds = nonEmptyIds(ref.evidenceIds);
    if (!evidenceIds) {
      issues.push({ code: "EMPTY_RAG_EVIDENCE_IDS", message: "RAG_EVIDENCE requires non-empty evidenceIds", severity: "ERROR" });
      return issues;
    }
    for (const eid of evidenceIds) {
      if (!ledgerEntryById(ctx.ledger, eid)) {
        issues.push({ code: "UNKNOWN_RAG_EVIDENCE", message: `Unknown RAG evidence '${eid}' — not in run ledger`, severity: "ERROR" });
      }
    }
    return issues;
  }

  if (ref.kind === "RULES_EVIDENCE") {
    if (!ref.ruleId?.trim()) {
      issues.push({ code: "EMPTY_RULE_ID", message: "RULES_EVIDENCE requires nonblank ruleId", severity: "ERROR" });
      return issues;
    }
    if (!ledgerRulesEntryByRuleId(ctx.ledger, ref.ruleId)) {
      issues.push({
        code: "UNKNOWN_RULES_EVIDENCE",
        message: `Unknown rules evidence '${ref.ruleId}' — not in pinned comprehensive rules ledger`,
        severity: "ERROR",
      });
    }
    return issues;
  }

  if (ref.kind === "RESEARCH_EVIDENCE") {
    const evidenceIds = nonEmptyIds(ref.evidenceIds);
    if (!evidenceIds) {
      issues.push({ code: "EMPTY_RESEARCH_EVIDENCE_IDS", message: "RESEARCH_EVIDENCE requires non-empty evidenceIds", severity: "ERROR" });
      return issues;
    }
    for (const eid of evidenceIds) {
      if (!ctx.researchEvidenceById.has(eid) && !ledgerEntryById(ctx.ledger, eid)) {
        issues.push({ code: "UNKNOWN_RESEARCH_EVIDENCE", message: `Unknown research evidence '${eid}'`, severity: "ERROR" });
      }
    }
    return issues;
  }

  issues.push({ code: "UNKNOWN_EVIDENCE_KIND", message: "Unsupported evidenceRef kind", severity: "ERROR" });
  return issues;
}

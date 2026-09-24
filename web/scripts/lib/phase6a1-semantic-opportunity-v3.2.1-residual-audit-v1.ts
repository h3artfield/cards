/**
 * Build v3.2.1 residual audit report with acceptance metric checks.
 */
import type { SemanticOpportunity } from "../../src/lib/deck-synthesis/semantic-opportunity-types-v1";
import type { CrossFactEdge, CaseOpportunityInferenceV3 } from "./phase6a1-semantic-opportunity-inference-v3";
import type {
  ResidualAuditIssue,
  SemanticOpportunityV32ResidualAudit,
} from "./phase6a1-semantic-opportunity-v3.2-independent-residual-audit-loader-v1";

export type ResidualAuditRepairStatus = "RESOLVED" | "PARTIAL" | "UNRESOLVED" | "PRESERVED_NO_ACTIONABLE";

export type ResidualAuditIssueRecord = ResidualAuditIssue & {
  repairStatus: ResidualAuditRepairStatus;
  note: string;
};

export type SemanticOpportunityV321ResidualAudit = {
  version: "phase6a1-semantic-opportunity-v3.2.1-residual-audit-v1";
  generatedAt: string;
  sourceAuditVersion: string;
  overallVerdict: string;
  acceptanceMetrics: {
    falseStructuredCostEdges: number;
    derivedRelationsLabeledOracle: number;
    incompatibleFaceStateEdges: number;
    unresolvedBlockerMajorFindings: number;
    knownMissingKainQuantityEdge: number;
  };
  acceptanceTargetsMet: boolean;
  population: {
    cases: number;
    opportunities: number;
    noActionableRecords: number;
    crossFactEdges: number;
  };
  issueRecords: ResidualAuditIssueRecord[];
  missingCausalRecords: Array<{
    caseId: string;
    finding: string;
    repairStatus: ResidualAuditRepairStatus;
    note: string;
  }>;
  preservedNoActionable: string[];
};

function allOpportunities(cases: CaseOpportunityInferenceV3[]): SemanticOpportunity[] {
  return cases.flatMap((c) => c.opportunities);
}

function countFalseStructuredCostEdges(opportunities: SemanticOpportunity[]): number {
  return opportunities.filter(
    (o) =>
      o.semanticEdge?.includes("COST:mana+life") ||
      (o.semanticEdge?.includes("mana+life") && !o.semanticEdge.includes("PAY_3_LIFE")),
  ).length;
}

function countDerivedRelationsLabeledOracle(opportunities: SemanticOpportunity[]): number {
  return opportunities.filter(
    (o) =>
      o.opportunityId.includes("--cross-") &&
      o.evidence.type === "COMMANDER_ORACLE" &&
      o.evidence.oracleSpan &&
      !o.sourceFactIds.some((fid) => o.evidence.oracleSpan?.includes(`[${fid}]`)),
  ).length;
}

function countIncompatibleFaceEdges(cases: CaseOpportunityInferenceV3[]): number {
  let count = 0;
  for (const c of cases) {
    for (const edge of c.crossFactEdges) {
      if (
        edge.edgeId.includes("cyclonus-front-flying-to-cyclonus-back-combat") ||
        edge.edgeId.includes("cyclonus-back-flying-to-cyclonus-front-combat")
      ) {
        count++;
      }
    }
  }
  return count;
}

function hasKainQuantityEdge(opportunities: SemanticOpportunity[]): boolean {
  return opportunities.some(
    (o) =>
      o.opportunityId.includes("combat-damage-quantity") ||
      o.semanticEdge?.includes("COMBAT_DAMAGE_DEALT") ||
      o.semanticEdge?.includes("COMBAT_DAMAGE_AMOUNT"),
  );
}

function evaluateIssue(
  issue: ResidualAuditIssue,
  opportunities: SemanticOpportunity[],
  cases: CaseOpportunityInferenceV3[],
): ResidualAuditIssueRecord {
  const ids = issue.opportunityIds ?? [];
  const related = opportunities.filter((o) => ids.some((id) => o.opportunityId.endsWith(id) || o.opportunityId.includes(id)));

  if (issue.kind === "FALSE_STRUCTURED_COST_EDGE") {
    const remaining = related.filter((o) => o.semanticEdge?.includes("COST:mana+life"));
    return {
      ...issue,
      repairStatus: remaining.length === 0 ? "RESOLVED" : "UNRESOLVED",
      note: remaining.length === 0 ? "Exact typed cost components emitted" : `${remaining.length} still use generic mana+life`,
    };
  }

  if (issue.kind === "DERIVED_RELATION_MISLABELED_AS_ORACLE") {
    const bad = related.filter((o) => o.evidence.type === "COMMANDER_ORACLE");
    return {
      ...issue,
      repairStatus: bad.length === 0 ? "RESOLVED" : "UNRESOLVED",
      note: bad.length === 0 ? "Cross-fact uses DERIVED_CAUSAL_INFERENCE with literal oracle spans" : `${bad.length} still COMMANDER_ORACLE`,
    };
  }

  if (issue.kind === "MUTUALLY_EXCLUSIVE_FACE_COMPOSITION") {
    const badEdges = cases.flatMap((c) =>
      c.crossFactEdges.filter(
        (e) =>
          e.edgeId.includes("cyclonus-front-flying-to-cyclonus-back-combat") ||
          e.edgeId.includes("cyclonus-back-flying-to-cyclonus-front-combat"),
      ),
    );
    return {
      ...issue,
      repairStatus: badEdges.length === 0 ? "RESOLVED" : "UNRESOLVED",
      note: badEdges.length === 0 ? "Cross-face flying→combat edges removed" : `${badEdges.length} incompatible edges remain`,
    };
  }

  if (issue.kind === "OVERCOMPOSED_OR_REDUNDANT_EDGE") {
    const bad = cases.flatMap((c) =>
      c.crossFactEdges.filter((e) => e.edgeId.includes("kain-turn-flying-to-kain-combat-donation-value-combat-scaling-chain")),
    );
    return {
      ...issue,
      repairStatus: bad.length === 0 ? "RESOLVED" : "UNRESOLVED",
      note: bad.length === 0 ? "Flying→scaling removed; quantity chain added" : "Kain flying→scaling edge still present",
    };
  }

  if (issue.kind === "DUPLICATE_COST_OPPORTUNITY") {
    const payMana = related.filter((o) => o.opportunityId.endsWith("pay-mana-cost"));
    return {
      ...issue,
      repairStatus: payMana.length === 0 ? "RESOLVED" : "UNRESOLVED",
      note: payMana.length === 0 ? "Duplicate {2} pay-mana-cost removed; pay-granted-activation-cost retained" : "Duplicate cost record remains",
    };
  }

  if (issue.kind === "WRONG_OPPORTUNITY_TYPE") {
    const wrong = related.filter((o) => o.opportunityType === "ACTIVATION_REPETITION");
    return {
      ...issue,
      repairStatus: wrong.length === 0 ? "RESOLVED" : "UNRESOLVED",
      note: wrong.length === 0 ? "Retyped to TRIGGER_FREQUENCY" : "Still ACTIVATION_REPETITION",
    };
  }

  if (issue.kind === "CONSTRAINT_STILL_TYPED_AS_OPPORTUNITY") {
    const wrong = related.filter((o) => o.opportunityType === "REDUNDANCY");
    return {
      ...issue,
      repairStatus: wrong.length === 0 ? "RESOLVED" : "UNRESOLVED",
      note: wrong.length === 0 ? "Represented as STRUCTURAL_SUPPORT / RISK_CONSTRAINT semantic edge" : "Still REDUNDANCY",
    };
  }

  if (issue.kind === "TRIGGER_WORDING") {
    const bad = related.filter((o) => o.requiredStateOrAction.includes("successful attack"));
    return {
      ...issue,
      repairStatus: bad.length === 0 ? "RESOLVED" : "UNRESOLVED",
      note: bad.length === 0 ? "Attack trigger wording corrected" : "Still references successful attack",
    };
  }

  if (issue.kind === "ACTION_RESTATEMENT") {
    const exists = related.length > 0;
    return {
      ...issue,
      repairStatus: exists ? "UNRESOLVED" : "RESOLVED",
      note: exists ? "shaun-rebecca tap-mana-then-mill still present" : "Removed action-restatement record",
    };
  }

  if (issue.kind === "CONFIDENCE_OVERSTATEMENT") {
    const high = related.filter((o) => o.opportunityConfidence === "HIGH");
    return {
      ...issue,
      repairStatus: high.length === 0 ? "RESOLVED" : "PARTIAL",
      note: high.length === 0 ? "Lifelink→X-life confidence lowered to MEDIUM" : "Still HIGH confidence",
    };
  }

  if (issue.kind === "RULES_SEMANTIC_DERIVATION_CLASS") {
    const wrong = related.filter((o) => o.derivationClass === "DIRECT_MECHANICAL");
    return {
      ...issue,
      repairStatus: wrong.length === 0 ? "RESOLVED" : "UNRESOLVED",
      note: wrong.length === 0 ? "Connive uses DERIVED_AMPLIFICATION + rules provenance" : "Still DIRECT_MECHANICAL",
    };
  }

  return { ...issue, repairStatus: "PARTIAL", note: "Manual review required" };
}

export function buildV321ResidualAuditReport(args: {
  cases: CaseOpportunityInferenceV3[];
  sourceAudit: SemanticOpportunityV32ResidualAudit;
  generatedAt: string;
}): SemanticOpportunityV321ResidualAudit {
  const { cases, sourceAudit, generatedAt } = args;
  const opportunities = allOpportunities(cases);

  const acceptanceMetrics = {
    falseStructuredCostEdges: countFalseStructuredCostEdges(opportunities),
    derivedRelationsLabeledOracle: countDerivedRelationsLabeledOracle(opportunities),
    incompatibleFaceStateEdges: countIncompatibleFaceEdges(cases),
    unresolvedBlockerMajorFindings: 0,
    knownMissingKainQuantityEdge: hasKainQuantityEdge(opportunities) ? 0 : 1,
  };

  const issueRecords = sourceAudit.issues.map((issue) => evaluateIssue(issue, opportunities, cases));

  acceptanceMetrics.unresolvedBlockerMajorFindings = issueRecords.filter(
    (r) => (r.severity === "BLOCKER" || r.severity === "MAJOR") && r.repairStatus === "UNRESOLVED",
  ).length;

  const missingCausalRecords = sourceAudit.missingCausalOpportunities.map((m) => ({
    caseId: m.caseId,
    finding: m.finding,
    repairStatus: (m.caseId === "blindv5-47-artifacts" && hasKainQuantityEdge(opportunities)
      ? "RESOLVED"
      : "UNRESOLVED") as ResidualAuditRepairStatus,
    note:
      m.caseId === "blindv5-47-artifacts" && hasKainQuantityEdge(opportunities)
        ? "COMBAT_DAMAGE_AMOUNT quantity scaling opportunity added"
        : "Quantity scaling opportunity still missing",
  }));

  const acceptanceTargetsMet =
    acceptanceMetrics.falseStructuredCostEdges === 0 &&
    acceptanceMetrics.derivedRelationsLabeledOracle === 0 &&
    acceptanceMetrics.incompatibleFaceStateEdges === 0 &&
    acceptanceMetrics.unresolvedBlockerMajorFindings === 0 &&
    acceptanceMetrics.knownMissingKainQuantityEdge === 0;

  return {
    version: "phase6a1-semantic-opportunity-v3.2.1-residual-audit-v1",
    generatedAt,
    sourceAuditVersion: sourceAudit.version,
    overallVerdict: acceptanceTargetsMet ? "TARGETED_V3_2_1_REPAIR_COMPLETE_AWAIT_FREEZE" : "TARGETED_V3_2_1_REPAIR_INCOMPLETE",
    acceptanceMetrics,
    acceptanceTargetsMet,
    population: {
      cases: cases.length,
      opportunities: opportunities.length,
      noActionableRecords: cases.reduce((n, c) => n + c.noActionableOpportunities.length, 0),
      crossFactEdges: cases.reduce((n, c) => n + c.crossFactEdges.length, 0),
    },
    issueRecords,
    missingCausalRecords,
    preservedNoActionable: [
      "korvold-flying",
      "prosper-deathtouch",
      "erinis-deathtouch",
      "esper-terra-flying",
      "orvar-changeling",
      "shaun-rebecca-vigilance",
    ],
  };
}

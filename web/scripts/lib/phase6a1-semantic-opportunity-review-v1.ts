/**
 * Independent review of SemanticOpportunityModel — flags generic inference risks.
 */
import type {
  CommandZoneOpportunityModel,
  SemanticOpportunity,
  SemanticOpportunityModelCatalog,
} from "../../src/lib/deck-synthesis/semantic-opportunity-types-v1";

export const SEMANTIC_OPPORTUNITY_REVIEW_V1_VERSION = "phase6a1-semantic-opportunity-review-v1";

export type OpportunityReviewFlag =
  | "GENERIC_STRUCTURAL_FALLBACK"
  | "OPTIONAL_EXPLOIT_LOW_CONFIDENCE"
  | "PROTECTION_WITHOUT_ORACLE_KEYWORD"
  | "DUPLICATE_CAUSAL_STATEMENT_IN_CASE"
  | "HIGH_CONFIDENCE_UNVERIFIED"
  | "STRATEGY_CREEP_SUSPECT";

export type OpportunityReviewEntry = {
  caseId: string;
  opportunityId: string;
  flags: OpportunityReviewFlag[];
  derivationClass: string;
  opportunityConfidence: string;
  opportunityType: string;
  causalStatement: string;
  reviewNote: string;
};

export type SemanticOpportunityReviewReport = {
  version: string;
  generatedAt: string;
  population: { cases: number; totalOpportunities: number; flaggedOpportunities: number };
  summaryByFlag: Record<OpportunityReviewFlag, number>;
  summaryByDerivation: Record<string, number>;
  trustAssessment: {
    directMechanicalHigh: number;
    optionalExploitLow: number;
    structuralFallbacks: number;
    recommendation: string;
  };
  flaggedEntries: OpportunityReviewEntry[];
  caseSummaries: Array<{
    caseId: string;
    commanders: string[];
    opportunityCount: number;
    flagCount: number;
    directMechanicalCount: number;
    optionalExploitCount: number;
  }>;
};

function reviewOpportunity(
  caseEntry: CommandZoneOpportunityModel,
  opp: SemanticOpportunity,
): OpportunityReviewEntry | null {
  const flags: OpportunityReviewFlag[] = [];
  const span = opp.evidence.oracleSpan.toLowerCase();

  if (opp.opportunityId.endsWith("--structural-support")) {
    flags.push("GENERIC_STRUCTURAL_FALLBACK");
  }

  if (opp.derivationClass === "OPTIONAL_EXPLOIT" && opp.opportunityConfidence === "LOW") {
    flags.push("OPTIONAL_EXPLOIT_LOW_CONFIDENCE");
  }

  if (opp.opportunityType === "PROTECTION") {
    const hasProtectionKeyword = /hexproof|indestructible|ward|protection from|can't be the target/i.test(span);
    if (!hasProtectionKeyword) {
      flags.push("PROTECTION_WITHOUT_ORACLE_KEYWORD");
    }
  }

  if (
    opp.derivationClass === "OPTIONAL_EXPLOIT" &&
    (opp.opportunityType === "STRUCTURAL_SUPPORT" || opp.opportunityType === "REDUNDANCY")
  ) {
    flags.push("STRATEGY_CREEP_SUSPECT");
  }

  if (opp.opportunityConfidence === "HIGH" && opp.derivationClass === "OPTIONAL_EXPLOIT") {
    flags.push("HIGH_CONFIDENCE_UNVERIFIED");
  }

  if (flags.length === 0) return null;

  return {
    caseId: caseEntry.caseId,
    opportunityId: opp.opportunityId,
    flags,
    derivationClass: opp.derivationClass,
    opportunityConfidence: opp.opportunityConfidence,
    opportunityType: opp.opportunityType,
    causalStatement: opp.causalStatement,
    reviewNote: describeFlags(flags, opp),
  };
}

function describeFlags(flags: OpportunityReviewFlag[], opp: SemanticOpportunity): string {
  if (flags.includes("GENERIC_STRUCTURAL_FALLBACK")) {
    return "Catch-all fallback when no mechanism rule matched — deck-quality not Oracle-derived";
  }
  if (flags.includes("PROTECTION_WITHOUT_ORACLE_KEYWORD")) {
    return "PROTECTION opportunity without protection keyword in oracle span — universal strategy creep";
  }
  if (flags.includes("STRATEGY_CREEP_SUSPECT")) {
    return `${opp.opportunityType} marked OPTIONAL_EXPLOIT — strategic not mechanical`;
  }
  return flags.join(", ");
}

export function reviewSemanticOpportunityCatalog(
  catalog: SemanticOpportunityModelCatalog,
): SemanticOpportunityReviewReport {
  const flaggedEntries: OpportunityReviewEntry[] = [];
  const summaryByFlag = {} as Record<OpportunityReviewFlag, number>;
  const summaryByDerivation: Record<string, number> = {};
  const caseSummaries: SemanticOpportunityReviewReport["caseSummaries"] = [];

  let directMechanicalHigh = 0;
  let optionalExploitLow = 0;
  let structuralFallbacks = 0;

  for (const caseEntry of catalog.cases) {
    const seenCausal = new Set<string>();
    let caseFlagCount = 0;
    let directMechanicalCount = 0;
    let optionalExploitCount = 0;

    for (const opp of caseEntry.opportunities) {
      summaryByDerivation[opp.derivationClass] = (summaryByDerivation[opp.derivationClass] ?? 0) + 1;

      if (opp.derivationClass === "DIRECT_MECHANICAL" && opp.opportunityConfidence === "HIGH") {
        directMechanicalHigh++;
        directMechanicalCount++;
      }
      if (opp.derivationClass === "OPTIONAL_EXPLOIT" && opp.opportunityConfidence === "LOW") {
        optionalExploitLow++;
        optionalExploitCount++;
      }
      if (opp.opportunityId.endsWith("--structural-support")) {
        structuralFallbacks++;
      }

      const causalKey = `${opp.opportunityType}:${opp.causalStatement}`;
      if (seenCausal.has(causalKey)) {
        const dup: OpportunityReviewEntry = {
          caseId: caseEntry.caseId,
          opportunityId: opp.opportunityId,
          flags: ["DUPLICATE_CAUSAL_STATEMENT_IN_CASE"],
          derivationClass: opp.derivationClass,
          opportunityConfidence: opp.opportunityConfidence,
          opportunityType: opp.opportunityType,
          causalStatement: opp.causalStatement,
          reviewNote: "Duplicate causal statement within same case",
        };
        flaggedEntries.push(dup);
        for (const f of dup.flags) summaryByFlag[f] = (summaryByFlag[f] ?? 0) + 1;
        caseFlagCount++;
      }
      seenCausal.add(causalKey);

      const entry = reviewOpportunity(caseEntry, opp);
      if (entry) {
        flaggedEntries.push(entry);
        caseFlagCount++;
        for (const f of entry.flags) summaryByFlag[f] = (summaryByFlag[f] ?? 0) + 1;
      }
    }

    caseSummaries.push({
      caseId: caseEntry.caseId,
      commanders: caseEntry.commanders,
      opportunityCount: caseEntry.opportunities.length,
      flagCount: caseFlagCount,
      directMechanicalCount,
      optionalExploitCount,
    });
  }

  const total = catalog.population.totalOpportunities;
  const flagged = flaggedEntries.length;

  return {
    version: SEMANTIC_OPPORTUNITY_REVIEW_V1_VERSION,
    generatedAt: new Date().toISOString(),
    population: {
      cases: catalog.population.cases,
      totalOpportunities: total,
      flaggedOpportunities: flagged,
    },
    summaryByFlag,
    summaryByDerivation,
    trustAssessment: {
      directMechanicalHigh,
      optionalExploitLow,
      structuralFallbacks,
      recommendation:
        structuralFallbacks > 0
          ? "Review structural-support fallbacks — consider removing or reclassifying as OPTIONAL_EXPLOIT deck-quality"
          : "Core DIRECT_MECHANICAL opportunities appear Oracle-grounded; treat OPTIONAL_EXPLOIT/LOW as non-authoritative for planning",
    },
    flaggedEntries,
    caseSummaries,
  };
}

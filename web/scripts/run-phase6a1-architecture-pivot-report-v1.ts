#!/usr/bin/env npx tsx
/**
 * Phase 6A.1 — Architecture pivot report: Professor/RAG audit + SemanticOpportunityModel + planning contracts.
 * Does NOT implement Professor PLAN call, Gate B, or new retrieval tokens.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  BUILD_PATH_V3_DISPOSITION,
  PROFESSOR_PLANNING_CONTRACTS_V1_VERSION,
  PROFESSOR_PLANNING_PIPELINE_V1,
  PROFESSOR_TASK_CONTRACTS_V1,
} from "../src/lib/deck-synthesis/professor-planning-contracts-v1";
import { SEMANTIC_OPPORTUNITY_TYPES_V1_VERSION } from "../src/lib/deck-synthesis/semantic-opportunity-types-v1";
import { getImplementedMechanismCatalog } from "./lib/phase6a1-implemented-mechanism-catalog-v1";
import {
  PROFESSOR_ARCHITECTURE_AUDIT,
  PROFESSOR_RAG_ARCHITECTURE_AUDIT_V1_VERSION,
} from "./lib/phase6a1-professor-rag-architecture-audit-v1";
import {
  countByType,
  inferOpportunitiesForCase,
  SEMANTIC_OPPORTUNITY_INFERENCE_V1_VERSION,
} from "./lib/phase6a1-semantic-opportunity-inference-v1";

const OUT_DIR = resolve("data/milestones/deck-synthesis");
const ARCHITECTURE_AUDIT_PATH = resolve(OUT_DIR, "phase6a1-professor-rag-architecture-audit-v1.json");
const OPPORTUNITY_MODEL_PATH = resolve(OUT_DIR, "phase6a1-semantic-opportunity-model-v1.json");
const CONTRACTS_PATH = resolve(OUT_DIR, "phase6a1-professor-planning-contracts-v1.json");
const PIVOT_REPORT_PATH = resolve(OUT_DIR, "phase6a1-architecture-pivot-report-v1.json");

function main() {
  const generatedAt = new Date().toISOString();
  const mechanismEntries = getImplementedMechanismCatalog();

  const opportunityCases = mechanismEntries.map((entry) => {
    const opportunities = inferOpportunitiesForCase(entry);
    return {
      caseId: entry.caseId,
      commanders: entry.commanders,
      commandZoneConfiguration: entry.commandZoneConfiguration,
      mechanismFactCount: entry.independentMechanismFacts.length,
      opportunities,
      opportunityCountByType: countByType(opportunities),
      derivationSource: "phase6a1-commander-mechanism-facts-v4-implemented" as const,
      adjudicationStatus: "DERIVED_FROM_FROZEN_FACTS" as const,
    };
  });

  const totalOpportunities = opportunityCases.reduce((n, c) => n + c.opportunities.length, 0);

  const opportunityModel = {
    version: SEMANTIC_OPPORTUNITY_TYPES_V1_VERSION,
    inferenceVersion: SEMANTIC_OPPORTUNITY_INFERENCE_V1_VERSION,
    generatedAt,
    population: { cases: opportunityCases.length, totalOpportunities },
    note: "Mechanical opportunities inferred from frozen facts only. No named archetypes. No deck strategies.",
    exampleKrenko: opportunityCases.find((c) => c.caseId === "single-tokens-krenko"),
    cases: opportunityCases,
  };

  const architectureAudit = {
    version: PROFESSOR_RAG_ARCHITECTURE_AUDIT_V1_VERSION,
    generatedAt,
    traceMethod: "Static code trace — no runtime Professor agent",
    ...PROFESSOR_ARCHITECTURE_AUDIT,
  };

  const planningContracts = {
    version: PROFESSOR_PLANNING_CONTRACTS_V1_VERSION,
    generatedAt,
    status: "DESIGN_ONLY — Professor PLAN implementation WAIT",
    pipeline: PROFESSOR_PLANNING_PIPELINE_V1,
    taskContracts: PROFESSOR_TASK_CONTRACTS_V1,
    provenanceHierarchy: [
      "CANONICAL_FACT",
      "CURATED_KNOWLEDGE",
      "CURRENT_EXTERNAL_RESEARCH",
      "MODEL_INFERENCE",
    ],
    professorPlanningContext: {
      description: "Structured grounding for Professor PLAN — separates canonical facts from RAG/research",
      fields: [
        "commandZone",
        "canonicalOracle",
        "commanderMechanismFacts",
        "semanticOpportunities",
        "colorIdentity",
        "bracket",
        "userConstraints",
        "ragEvidence[]",
        "researchEvidence[]",
        "inventoryContext?",
      ],
    },
    strategyProposal: {
      description: "6–12 coherent strategy hypotheses with SemanticPackages — not a decklist",
      fields: [
        "proposalId",
        "title",
        "thesis",
        "commanderMechanismsUsed[]",
        "semanticOpportunitiesUsed[]",
        "dependencyProfile",
        "packages[]",
        "strengths[]",
        "vulnerabilities[]",
        "evidence[]",
      ],
    },
    semanticPackage: {
      description: "Package/function-level building block — not individual cards",
      fields: [
        "packageId",
        "purpose",
        "causalChain[]",
        "requiredFunctions[]",
        "requiredResources[]",
        "producedResources[]",
        "payoffs[]",
        "commanderContribution",
        "commanderIndependentFunction",
        "overlapsWithPackageIds[]",
        "evidence[]",
      ],
    },
    deterministicValidator: {
      outcomes: [
        "VALIDATED",
        "VALID_WITH_CONSTRAINT",
        "PARTIALLY_SUPPORTED",
        "REJECTED_MECHANICALLY",
        "REJECTED_LEGALITY",
        "NEEDS_MORE_EVIDENCE",
      ],
      checks: [
        "referenced mechanics exist",
        "interaction follows mechanically",
        "color identity respected",
        "Commander legality respected",
        "bracket constraints respected",
        "package enabler feeds payoff",
        "commander-dependent claim uses commander",
        "commander-independent claim works without commander",
        "Harmony bridge serves two causal systems",
      ],
    },
    threeLensObjectives: {
      DEPENDENT_SYNERGY: "Optimize commander amplification, trigger frequency, output exploitation",
      INDEPENDENT_SYNERGY: "Optimize commander-absent functionality and self-contained packages",
      HARMONY: "Optimize cross-support and multi-role packages — not union or midpoint",
    },
    runtimeAuthority: "validated Professor strategy/package → three-lens selection → PathCandidateIntent → retrieval",
    buildPathV3Disposition: BUILD_PATH_V3_DISPOSITION,
  };

  const pivotReport = {
    version: "phase6a1-architecture-pivot-report-v1",
    generatedAt,
    authorization: {
      semanticOpportunityModel: "AUTHORIZED / GENERATED",
      professorRagArchitectureAudit: "AUTHORIZED / COMPLETE",
      professorPlanningContext: "AUTHORIZED FOR DESIGN",
      strategyProposalSemanticPackageContracts: "AUTHORIZED FOR DESIGN",
      deterministicProposalValidator: "AUTHORIZED FOR DESIGN",
      threeLensObjectiveSelector: "AUTHORIZED FOR DESIGN",
      professorPlanImplementation: "WAIT",
      webResearchIntegration: "DESIGN ONLY / WAIT",
      gateB: "WAIT",
      newRetrievalTokens: "WAIT",
      liveRetrieval: "WAIT",
      blindCorpus: "WAIT",
      optimizer: "WAIT",
      professorCritic: "WAIT",
    },
    keyFindings: {
      professorImplemented: false,
      professorCallsRag: false,
      mtgRagImplemented: true,
      mtgRagUsedBy: "Store clerk deck-build pipeline (not Professor, not deck-synthesis Gate B)",
      deckSynthesisRetrieval: "Deterministic semantic-map retrieval — separate from mtg-rag",
      buildPathV3Role: "GOLD_DEV_STRATEGY_REFERENCE for future Professor comparison",
      pathIntents167: "DIAGNOSTIC / REFERENCE — do not Gate-B or mint 55 tokens yet",
    },
    opportunityModelSummary: {
      cases: opportunityCases.length,
      totalOpportunities,
      avgOpportunitiesPerCase: Math.round((totalOpportunities / opportunityCases.length) * 10) / 10,
    },
    nextSteps: [
      "Review SemanticOpportunityModel on 28 frozen cases",
      "Review planning contracts design",
      "Implement Professor PLAN against ProfessorPlanningContext (after authorization)",
      "Compare Professor output to BuildPath v3 gold reference on 28 cases",
      "Implement deterministic validator before path selection",
      "Gate B remains WAIT until runtime planning path proven",
    ],
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(ARCHITECTURE_AUDIT_PATH, JSON.stringify(architectureAudit, null, 2));
  writeFileSync(OPPORTUNITY_MODEL_PATH, JSON.stringify(opportunityModel, null, 2));
  writeFileSync(CONTRACTS_PATH, JSON.stringify(planningContracts, null, 2));
  writeFileSync(PIVOT_REPORT_PATH, JSON.stringify(pivotReport, null, 2));

  console.log(JSON.stringify(pivotReport.keyFindings, null, 2));
  console.log(JSON.stringify(pivotReport.opportunityModelSummary, null, 2));
  console.log(`\nWrote ${ARCHITECTURE_AUDIT_PATH}`);
  console.log(`Wrote ${OPPORTUNITY_MODEL_PATH}`);
  console.log(`Wrote ${CONTRACTS_PATH}`);
  console.log(`Wrote ${PIVOT_REPORT_PATH}`);
}

main();

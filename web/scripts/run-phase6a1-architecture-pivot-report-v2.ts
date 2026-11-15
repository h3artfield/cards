#!/usr/bin/env npx tsx
/**
 * Phase 6A.1 — Architecture pivot report v2:
 * Shared Deck Intelligence + opportunity review + validator contracts.
 * Does NOT invoke Professor PLAN model call.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DECK_INTELLIGENCE_LAYER_VERSION,
  DECK_INTELLIGENCE_PIPELINE,
  DECK_INTELLIGENCE_SERVICES,
} from "../src/lib/deck-intelligence";
import { MTG_KNOWLEDGE_SERVICE_VERSION } from "../src/lib/deck-intelligence/mtg-knowledge-service";
import {
  BUILD_PATH_V3_DISPOSITION,
  DEFAULT_PROFESSOR_PLAN_TOOL_BUDGET,
  PROFESSOR_PLANNING_CONTRACTS_V2_VERSION,
  PROFESSOR_REPAIR_LOOP_V1,
  PROFESSOR_TASK_CONTRACTS_V2,
} from "../src/lib/deck-synthesis/professor-planning-contracts-v2";
import { SEMANTIC_OPPORTUNITY_TYPES_V1_VERSION } from "../src/lib/deck-synthesis/semantic-opportunity-types-v1";
import { STRATEGY_PACKAGE_VALIDATOR_V1_VERSION } from "../src/lib/deck-synthesis/strategy-package-validator-v1";
import {
  buildValidatorContextFromPlanning,
  validateStrategyHypothesis,
} from "../src/lib/deck-synthesis/strategy-package-validator-v1";
import type { StrategyHypothesis } from "../src/lib/deck-synthesis/professor-planning-contracts-v2";
import { getImplementedMechanismCatalog } from "./lib/phase6a1-implemented-mechanism-catalog-v1";
import { PROFESSOR_ARCHITECTURE_AUDIT } from "./lib/phase6a1-professor-rag-architecture-audit-v1";
import {
  countByDerivation,
  countByType,
  inferOpportunitiesForCase,
  SEMANTIC_OPPORTUNITY_INFERENCE_V1_VERSION,
} from "./lib/phase6a1-semantic-opportunity-inference-v1";
import {
  reviewSemanticOpportunityCatalog,
  SEMANTIC_OPPORTUNITY_REVIEW_V1_VERSION,
} from "./lib/phase6a1-semantic-opportunity-review-v1";

const OUT_DIR = resolve("data/milestones/deck-synthesis");
const OPPORTUNITY_MODEL_PATH = resolve(OUT_DIR, "phase6a1-semantic-opportunity-model-v1.json");
const OPPORTUNITY_REVIEW_PATH = resolve(OUT_DIR, "phase6a1-semantic-opportunity-review-v1.json");
const CONTRACTS_V2_PATH = resolve(OUT_DIR, "phase6a1-professor-planning-contracts-v2.json");
const DECK_INTELLIGENCE_PATH = resolve(OUT_DIR, "phase6a1-deck-intelligence-architecture-v1.json");
const VALIDATOR_DEMO_PATH = resolve(OUT_DIR, "phase6a1-strategy-package-validator-demo-v1.json");
const PIVOT_REPORT_PATH = resolve(OUT_DIR, "phase6a1-architecture-pivot-report-v2.json");

function buildValidatorDemo() {
  const entry = getImplementedMechanismCatalog()[0];
  const ctx = buildValidatorContextFromPlanning({
    caseId: entry.caseId,
    colorIdentity: entry.combinedColorIdentity,
    bracket: entry.bracket,
    commandZoneConfiguration: entry.commandZoneConfiguration,
    commanders: entry.commanders,
    mechanismFacts: entry.independentMechanismFacts,
    semanticOpportunities: inferOpportunitiesForCase(entry),
  });

  const badHypothesis: StrategyHypothesis = {
    hypothesisId: "demo-artifact-sacrifice-mismatch",
    title: "Artifact sacrifice engine",
    thesis: "Sacrifice artifacts for value",
    commanderMechanismFactIds: [],
    semanticOpportunityIds: [],
    packages: [
      {
        packageId: "pkg-artifact-sac",
        title: "Artifact Sacrifice",
        purpose: "Sacrifice artifacts for triggers",
        causalChain: ["Sacrifice artifacts", "Creature dies trigger fires"],
        semanticRequirements: [
          { slotId: "fodder", requirement: "ARTIFACT_FODDER", alternatives: ["NONCREATURE_ARTIFACT"] },
          { slotId: "outlet", requirement: "SACRIFICE_OUTLET" },
        ],
        requiredResources: ["noncreature artifacts"],
        producedResources: [],
        payoffs: ["When a creature you control dies, draw a card"],
        commanderContribution: "Not used for this package",
        commanderIndependentFunction: "Standalone artifact sacrifice value",
        commanderDependency: "LOW",
        worksWithoutCommander: "HIGH",
        dependsOnPackageIds: [],
        overlapsWithPackageIds: [],
        vulnerabilities: [],
        evidence: [{ tier: "MODEL_INFERENCE", statement: "Demo package for validator" }],
      },
    ],
    strengths: [],
    vulnerabilities: [],
    evidence: [{ tier: "MODEL_INFERENCE", statement: "Demo hypothesis" }],
  };

  return validateStrategyHypothesis(ctx, badHypothesis);
}

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
      opportunityCountByDerivation: countByDerivation(opportunities),
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
    note: "Mechanical opportunities with provenance. OPTIONAL_EXPLOIT/LOW are not planning authority.",
    exampleKrenko: opportunityCases.find((c) => c.caseId === "single-tokens-krenko"),
    cases: opportunityCases,
  };

  const opportunityReview = reviewSemanticOpportunityCatalog(opportunityModel);

  const deckIntelligence = {
    version: DECK_INTELLIGENCE_LAYER_VERSION,
    generatedAt,
    architecture: "Single shared stack — NOT three independent deck-building brains",
    services: DECK_INTELLIGENCE_SERVICES,
    pipeline: DECK_INTELLIGENCE_PIPELINE,
    consumers: {
      store_clerk: "May consume MtgKnowledgeService + SemanticFactService (migration in progress)",
      professor_planner: "Will consume all services via bounded tool loop — PLAN WAIT",
      semantic_retrieval: "SemanticRetrievalService — Gate B WAIT",
      deck_optimizer: "WAIT",
      deck_build_ui: "Fixture shell — packages as graph nodes later",
    },
    mtgKnowledgeService: {
      version: MTG_KNOWLEDGE_SERVICE_VERSION,
      modes: ["RULES", "TERMINOLOGY", "STRATEGY", "COMMANDER_PRIMER", "PACKAGE", "INTERACTION"],
      wraps: "web/src/lib/mtg-rag/hybrid-retrieval.ts",
      note: "Clerk and Professor share corpus; different query strategies and limits",
    },
    professorToolLoop: {
      baselineContext: [
        "Oracle facts",
        "semantic opportunities",
        "command zone",
        "color identity",
        "bracket",
        "user constraints",
        "initial RAG evidence (not exclusive)",
      ],
      boundedTools: DEFAULT_PROFESSOR_PLAN_TOOL_BUDGET,
      futureTool: "searchCurrentStrategy — WAIT",
    },
    repairLoop: PROFESSOR_REPAIR_LOOP_V1,
    buildPathV3Disposition: BUILD_PATH_V3_DISPOSITION,
  };

  const contractsV2 = {
    version: PROFESSOR_PLANNING_CONTRACTS_V2_VERSION,
    generatedAt,
    status: "DESIGN + VALIDATOR IMPLEMENTED — Professor PLAN model call WAIT",
    taskContracts: PROFESSOR_TASK_CONTRACTS_V2,
    packagePortfolioThreeLens: {
      description: "Three paths are compositions of validated packages, not disjoint full plans",
      example: {
        available: ["A", "B", "C", "D", "E", "F", "G"],
        DEPENDENT_SYNERGY: ["A", "B", "C", "G"],
        INDEPENDENT_SYNERGY: ["A", "D", "E", "F"],
        HARMONY: ["A", "C", "D", "F"],
      },
    },
    validator: {
      version: STRATEGY_PACKAGE_VALIDATOR_V1_VERSION,
      categories: [
        "MECHANICAL_VALIDITY",
        "CAUSAL_COHERENCE",
        "COLOR_IDENTITY",
        "COMMANDER_LEGALITY",
        "BRACKET_COMPATIBILITY",
        "COMMANDER_DEPENDENCY_CLAIM",
        "COMMANDER_INDEPENDENCE_CLAIM",
        "PACKAGE_COMPLETENESS",
        "BRIDGE_VALIDITY",
        "EVIDENCE_SUFFICIENCY",
      ],
    },
  };

  const validatorDemo = buildValidatorDemo();

  const pivotReport = {
    version: "phase6a1-architecture-pivot-report-v2",
    generatedAt,
    authorization: {
      sharedDeckIntelligence: "AUTHORIZED / IMPLEMENTED",
      mtgKnowledgeSharedService: "AUTHORIZED / IMPLEMENTED",
      semanticOpportunityProvenance: "AUTHORIZED / EXTENDED",
      packagePortfolioThreeLens: "AUTHORIZED / DESIGNED",
      deterministicValidator: "AUTHORIZED / IMPLEMENTED",
      professorRepairLoop: "AUTHORIZED / DESIGNED",
      professorPlanModelCall: "WAIT",
      webResearchRuntime: "WAIT",
      gateB: "WAIT",
      liveRetrieval: "WAIT",
      optimizer: "WAIT",
    },
    keyChangesFromV1: [
      "Converged to single Shared Deck Intelligence Layer — not a third stack",
      "MtgKnowledgeService wraps existing RAG with Professor-oriented modes",
      "SemanticOpportunity extended with derivationClass, confidence, causalProof",
      "Packages are primary planning units; three lenses select package portfolios",
      "Professor uses bounded tool loop, not static RAG-only prompt",
      "Validator + repair-loop contract implemented (no model call yet)",
    ],
    opportunityReviewSummary: {
      totalOpportunities,
      flaggedOpportunities: opportunityReview.population.flaggedOpportunities,
      trustAssessment: opportunityReview.trustAssessment,
      topFlags: opportunityReview.summaryByFlag,
    },
    validatorDemo: {
      hypothesisId: validatorDemo.hypothesisId,
      outcome: validatorDemo.outcome,
      issueCount: validatorDemo.issues.length,
      sampleIssue: validatorDemo.issues[0],
    },
    professorStatus: PROFESSOR_ARCHITECTURE_AUDIT.professor,
    nextSteps: [
      "Review independent opportunity flags on 28 cases",
      "Review validator demo artifact-sacrifice rejection",
      "Authorize Professor PLAN model call against shared services",
      "Migrate Store Clerk deck-build to MtgKnowledgeService (incremental)",
      "Compare Professor output to BuildPath v3 gold reference",
    ],
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OPPORTUNITY_MODEL_PATH, JSON.stringify(opportunityModel, null, 2));
  writeFileSync(OPPORTUNITY_REVIEW_PATH, JSON.stringify(opportunityReview, null, 2));
  writeFileSync(CONTRACTS_V2_PATH, JSON.stringify(contractsV2, null, 2));
  writeFileSync(DECK_INTELLIGENCE_PATH, JSON.stringify(deckIntelligence, null, 2));
  writeFileSync(VALIDATOR_DEMO_PATH, JSON.stringify(validatorDemo, null, 2));
  writeFileSync(PIVOT_REPORT_PATH, JSON.stringify(pivotReport, null, 2));

  console.log(JSON.stringify(pivotReport.authorization, null, 2));
  console.log(JSON.stringify(pivotReport.opportunityReviewSummary, null, 2));
  console.log(JSON.stringify(pivotReport.validatorDemo, null, 2));
  console.log(`\nWrote ${PIVOT_REPORT_PATH}`);
}

main();

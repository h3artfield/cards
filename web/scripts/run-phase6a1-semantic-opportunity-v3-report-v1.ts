#!/usr/bin/env npx tsx
/**
 * Generate SemanticOpportunityModel v3 artifacts + comparison + validator gold tests.
 * Does NOT invoke Professor PLAN.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { SEMANTIC_OPPORTUNITY_TYPES_V1_VERSION } from "../src/lib/deck-synthesis/semantic-opportunity-types-v1";
import {
  buildValidatorContextFromPlanning,
  validateStrategyHypothesis,
} from "../src/lib/deck-synthesis/strategy-package-validator-v1";
import type { StrategyHypothesis } from "../src/lib/deck-synthesis/professor-planning-contracts-v2";
import { getImplementedMechanismCatalog } from "./lib/phase6a1-implemented-mechanism-catalog-v1";
import {
  INDEPENDENT_OPPORTUNITY_AUDIT_V1_PATH,
  tryLoadIndependentOpportunityAudit,
} from "./lib/phase6a1-independent-opportunity-audit-loader-v1";
import {
  inferOpportunitiesForCase,
  SEMANTIC_OPPORTUNITY_INFERENCE_V1_VERSION as V1_INFERENCE,
} from "./lib/phase6a1-semantic-opportunity-inference-v1";
import {
  countByDerivation,
  countByType,
  inferOpportunitiesForCaseV3,
  SEMANTIC_OPPORTUNITY_INFERENCE_V3_VERSION,
} from "./lib/phase6a1-semantic-opportunity-inference-v3";
import { buildV3ComparisonReport } from "./lib/phase6a1-semantic-opportunity-v3-comparison-v1";

const OUT_DIR = resolve("data/milestones/deck-synthesis");
const MODEL_V3_PATH = resolve(OUT_DIR, "phase6a1-semantic-opportunity-model-v3.json");
const COMPARISON_PATH = resolve(OUT_DIR, "phase6a1-semantic-opportunity-v3-vs-independent-audit.json");
const COVERAGE_PATH = resolve(OUT_DIR, "phase6a1-semantic-opportunity-v3-fact-coverage.json");
const CROSS_FACT_PATH = resolve(OUT_DIR, "phase6a1-semantic-opportunity-v3-cross-fact-report.json");
const VALIDATOR_GOLD_PATH = resolve(OUT_DIR, "phase6a1-strategy-package-validator-gold-v1.json");
const REPORT_PATH = resolve(OUT_DIR, "phase6a1-semantic-opportunity-v3-report-v1.json");

function buildGoldValidatorTests() {
  const entries = getImplementedMechanismCatalog();
  const krenko = entries.find((e) => e.caseId === "single-tokens-krenko")!;
  const korvold = entries.find((e) => e.caseId === "multi-korvold")!;
  const prosper = entries.find((e) => e.caseId === "hybrid-prosper")!;

  const cases = [
    {
      caseId: krenko.caseId,
      ctx: buildValidatorContextFromPlanning({
        caseId: krenko.caseId,
        colorIdentity: krenko.combinedColorIdentity,
        bracket: krenko.bracket,
        commandZoneConfiguration: krenko.commandZoneConfiguration,
        commanders: krenko.commanders,
        mechanismFacts: krenko.independentMechanismFacts,
        semanticOpportunities: inferOpportunitiesForCaseV3(krenko).opportunities,
      }),
      hypothesis: {
        hypothesisId: "gold-krenko-dependent-packages",
        title: "Krenko repeated-activation Goblin engine",
        thesis: "Scale Goblins and repeat Krenko activations",
        commanderMechanismFactIds: ["krenko-token-activation"],
        semanticOpportunityIds: [
          "krenko-token-activation--untap-repeat-activation",
          "krenko-token-activation--amplify-scaling-input",
        ],
        packages: [
          {
            packageId: "pkg-goblin-density",
            title: "Goblin Density",
            purpose: "Increase COUNT(GOBLINS_YOU_CONTROL) for scaling",
            causalChain: ["More Goblins controlled", "Higher X on Krenko activation"],
            semanticRequirements: [
              {
                slotId: "density",
                requirement: "GOBLIN_CREATURE_OR_TOKEN_PRODUCTION",
                satisfiesOpportunityIds: ["krenko-token-activation--amplify-scaling-input"],
              },
            ],
            requiredResources: ["Goblin creatures/tokens"],
            producedResources: ["Goblins on battlefield"],
            payoffs: ["Larger token swarm per tap"],
            commanderContribution: "Krenko tap creates X Goblins where X = Goblins controlled",
            commanderIndependentFunction: "Independent Goblin producers also increase count",
            commanderDependency: "HIGH",
            worksWithoutCommander: "LOW",
            dependsOnPackageIds: [],
            overlapsWithPackageIds: ["pkg-repeat-activation"],
            vulnerabilities: ["Board wipes"],
            evidence: [{ tier: "CANONICAL_FACT", statement: "Krenko scales with Goblins controlled" }],
          },
          {
            packageId: "pkg-repeat-activation",
            title: "Repeated Activation",
            purpose: "Untap Krenko for additional activations",
            causalChain: ["Untap Krenko", "Tap again for more tokens"],
            semanticRequirements: [
              {
                slotId: "untap",
                requirement: "UNTAP_TARGET_CREATURE",
                alternatives: ["EXTRA_ACTIVATION"],
                satisfiesOpportunityIds: ["krenko-token-activation--untap-repeat-activation"],
              },
            ],
            requiredResources: ["Untap effects"],
            producedResources: ["Additional activations"],
            payoffs: ["Multiple Krenko taps per turn"],
            commanderContribution: "Directly repeats TAP_SELF activation",
            commanderIndependentFunction: "Untap can target other creatures too",
            commanderDependency: "HIGH",
            worksWithoutCommander: "LOW",
            dependsOnPackageIds: ["pkg-goblin-density"],
            overlapsWithPackageIds: [],
            vulnerabilities: [],
            evidence: [{ tier: "CANONICAL_FACT", statement: "Krenko ability costs tap" }],
          },
        ],
        strengths: [],
        vulnerabilities: [],
        evidence: [{ tier: "CANONICAL_FACT", statement: "Gold reference from BuildPath adjudication shape" }],
      } satisfies StrategyHypothesis,
    },
    {
      caseId: korvold.caseId,
      ctx: buildValidatorContextFromPlanning({
        caseId: korvold.caseId,
        colorIdentity: korvold.combinedColorIdentity,
        bracket: korvold.bracket,
        commandZoneConfiguration: korvold.commandZoneConfiguration,
        commanders: korvold.commanders,
        mechanismFacts: korvold.independentMechanismFacts,
        semanticOpportunities: inferOpportunitiesForCaseV3(korvold).opportunities,
      }),
      hypothesis: {
        hypothesisId: "gold-korvold-sacrifice-payoff",
        title: "Korvold sacrifice value engine",
        thesis: "Sacrifice permanents you control for counters and draw",
        commanderMechanismFactIds: ["korvold-sacrifice-payoff"],
        semanticOpportunityIds: ["korvold-sacrifice-payoff--controller-sacrifice-payoff"],
        packages: [
          {
            packageId: "pkg-sac-outlet",
            title: "Sacrifice Outlets",
            purpose: "Cause sacrifices you control for payoff trigger",
            causalChain: ["Sacrifice permanent", "Korvold gets +1/+1 and you draw"],
            semanticRequirements: [
              { slotId: "outlet", requirement: "SACRIFICE_OUTLET" },
              { slotId: "fodder", requirement: "PERMANENT_FODDER" },
            ],
            requiredResources: ["Sac outlets", "Fodder permanents"],
            producedResources: ["Sacrifice events you control"],
            payoffs: ["+1/+1 counter on Korvold", "Draw a card"],
            commanderContribution: "Payoff trigger on YOU_SACRIFICE_A_PERMANENT",
            commanderIndependentFunction: "Outlets work without Korvold but payoff needs him",
            commanderDependency: "HIGH",
            worksWithoutCommander: "LOW",
            dependsOnPackageIds: [],
            overlapsWithPackageIds: [],
            vulnerabilities: [],
            evidence: [{ tier: "CANONICAL_FACT", statement: "Sacrifice payoff trigger" }],
          },
        ],
        strengths: [],
        vulnerabilities: [],
        evidence: [{ tier: "CANONICAL_FACT", statement: "Gold Korvold reference" }],
      } satisfies StrategyHypothesis,
    },
    {
      caseId: prosper.caseId,
      ctx: buildValidatorContextFromPlanning({
        caseId: prosper.caseId,
        colorIdentity: prosper.combinedColorIdentity,
        bracket: prosper.bracket,
        commandZoneConfiguration: prosper.commandZoneConfiguration,
        commanders: prosper.commanders,
        mechanismFacts: prosper.independentMechanismFacts,
        semanticOpportunities: inferOpportunitiesForCaseV3(prosper).opportunities,
      }),
      hypothesis: {
        hypothesisId: "gold-prosper-exile-play",
        title: "Prosper exile-play Treasure chain",
        thesis: "Play cards from exile to generate Treasures",
        commanderMechanismFactIds: ["prosper-endstep-impulse", "prosper-exile-play-treasure"],
        semanticOpportunityIds: ["hybrid-prosper--cross-prosper-endstep-impulse-to-prosper-exile-play-treasure-exile-play-chain"],
        packages: [
          {
            packageId: "pkg-exile-cast",
            title: "Exile Cast Window",
            purpose: "Cast impulse exiled cards under permission",
            causalChain: ["Exile top on end step", "Cast from exile", "Create Treasure"],
            semanticRequirements: [{ slotId: "cast", requirement: "PLAY_CARD_FROM_EXILE" }],
            requiredResources: ["Mana", "Castable exiled cards"],
            producedResources: ["Treasure tokens"],
            payoffs: ["Treasure mana", "Card advantage from exile"],
            commanderContribution: "Impulse exile + play-from-exile trigger",
            commanderIndependentFunction: "Other exile-play effects also trigger Treasure",
            commanderDependency: "HIGH",
            worksWithoutCommander: "MEDIUM",
            dependsOnPackageIds: [],
            overlapsWithPackageIds: [],
            vulnerabilities: [],
            evidence: [{ tier: "CANONICAL_FACT", statement: "Prosper cross-fact chain" }],
          },
        ],
        strengths: [],
        vulnerabilities: [],
        evidence: [{ tier: "CANONICAL_FACT", statement: "Gold Prosper reference" }],
      } satisfies StrategyHypothesis,
    },
  ];

  return cases.map((c) => ({
    caseId: c.caseId,
    hypothesisId: c.hypothesis.hypothesisId,
    result: validateStrategyHypothesis(c.ctx, c.hypothesis),
  }));
}

function main() {
  const generatedAt = new Date().toISOString();
  const mechanismEntries = getImplementedMechanismCatalog();
  const audit = tryLoadIndependentOpportunityAudit();

  const v1Cases = mechanismEntries.map((entry) => ({
    caseId: entry.caseId,
    opportunities: inferOpportunitiesForCase(entry),
  }));

  const v3Cases = mechanismEntries.map((entry) => inferOpportunitiesForCaseV3(entry));
  const totalV3Opportunities = v3Cases.reduce((n, c) => n + c.opportunities.length, 0);
  const totalNoActionable = v3Cases.reduce((n, c) => n + c.noActionableOpportunities.length, 0);

  const modelV3 = {
    version: "semantic-opportunity-model-v3",
    inferenceVersion: SEMANTIC_OPPORTUNITY_INFERENCE_V3_VERSION,
    typesVersion: SEMANTIC_OPPORTUNITY_TYPES_V1_VERSION,
    generatedAt,
    population: {
      cases: v3Cases.length,
      totalOpportunities: totalV3Opportunities,
      noActionableRecords: totalNoActionable,
      crossFactEdges: v3Cases.reduce((n, c) => n + c.crossFactEdges.length, 0),
    },
    note: "Typed semantic-edge inference. No generic fallbacks. Not Professor grounding until audit ACCEPT set validated.",
    cases: v3Cases.map((c) => ({
      ...c,
      opportunityCountByType: countByType(c.opportunities),
      opportunityCountByDerivation: countByDerivation(c.opportunities),
    })),
  };

  const comparison = buildV3ComparisonReport({ v1Cases, v3Cases, audit });

  const factCoverage = {
    version: "phase6a1-semantic-opportunity-v3-fact-coverage-v1",
    generatedAt,
    totalFacts: mechanismEntries.reduce((n, e) => n + e.independentMechanismFacts.length, 0),
    factsWithOpportunity: v3Cases.reduce(
      (n, c) => n + c.mechanismFactCount - c.noActionableOpportunities.length,
      0,
    ),
    factsNoActionable: totalNoActionable,
    cases: v3Cases.map((c) => ({
      caseId: c.caseId,
      commanders: c.commanders,
      mechanismFactCount: c.mechanismFactCount,
      opportunityCount: c.opportunities.length,
      noActionable: c.noActionableOpportunities,
      memberCoverage: c.memberCoverage,
      uncoveredFacts: c.noActionableOpportunities.map((n) => n.factId),
    })),
  };

  const crossFactReport = {
    version: "phase6a1-semantic-opportunity-v3-cross-fact-report-v1",
    generatedAt,
    totalEdges: v3Cases.reduce((n, c) => n + c.crossFactEdges.length, 0),
    cases: v3Cases
      .filter((c) => c.crossFactEdges.length > 0)
      .map((c) => ({
        caseId: c.caseId,
        commanders: c.commanders,
        edges: c.crossFactEdges,
        crossOpportunities: c.opportunities.filter((o) => o.opportunityId.includes("--cross-")),
      })),
  };

  const validatorGold = buildGoldValidatorTests();

  const report = {
    version: "phase6a1-semantic-opportunity-v3-report-v1",
    generatedAt,
    authorization: {
      semanticOpportunityInferenceV3: "AUTHORIZED / GENERATED",
      independentAuditIncorporated: audit ? "YES" : `NO — place audit at ${INDEPENDENT_OPPORTUNITY_AUDIT_V1_PATH}`,
      professorPlanRuntime: "WAIT",
      gateB: "WAIT",
    },
    population: modelV3.population,
    comparisonSummary: comparison.migrationSummary,
    auditLoaded: comparison.auditLoaded,
    validatorGoldSummary: validatorGold.map((g) => ({
      caseId: g.caseId,
      hypothesisId: g.hypothesisId,
      outcome: g.result.outcome,
      issueCount: g.result.issues.length,
    })),
    v1InferenceRetained: V1_INFERENCE,
    note: "v1 model FAIL as Professor grounding. v3 pending independent audit ACCEPT set.",
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(MODEL_V3_PATH, JSON.stringify(modelV3, null, 2));
  writeFileSync(COMPARISON_PATH, JSON.stringify(comparison, null, 2));
  writeFileSync(COVERAGE_PATH, JSON.stringify(factCoverage, null, 2));
  writeFileSync(CROSS_FACT_PATH, JSON.stringify(crossFactReport, null, 2));
  writeFileSync(VALIDATOR_GOLD_PATH, JSON.stringify(validatorGold, null, 2));
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

  console.log(JSON.stringify(report.authorization, null, 2));
  console.log(JSON.stringify(report.population, null, 2));
  console.log(JSON.stringify(report.comparisonSummary, null, 2));
  console.log(JSON.stringify(report.validatorGoldSummary, null, 2));
  console.log(`\nWrote ${REPORT_PATH}`);
}

main();

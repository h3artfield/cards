/**
 * PROFESSOR v4.17 Slice 5.3 — adaptive full-corpus retrieval cheap acceptance.
 */
import assert from "node:assert/strict";
import { buildUltimeciaCommanderV417 } from "./professor-brew-blueprint-fixture-v4-17-v1";
import { buildBlueprintFromSolProposalV417 } from "./professor-sol-blueprint-live-v4-17-v1";
import { validateSolBlueprintProposalV417 } from "./professor-sol-blueprint-proposal-v4-17-v1";
import { bracketQualityContractV417, type BrewRequirementV417 } from "./professor-brew-blueprint-v4-17-v1";
import { requirementBracketContractV417 } from "./professor-requirement-bracket-v4-17-v1";
import { functionalTokenForFamily } from "./professor-requirement-materializer-v4-17-v1";
import {
  adaptiveRetrieveCandidateInputsV417,
  buildLegalCommanderCorpusV417,
  createAdaptiveRetrievalBuildContextV417,
  evaluateRetrievedCandidateFunnelV417,
  diagnoseTailObjectiveExhaustionV417,
} from "./professor-requirement-adaptive-retrieval-v4-17-v1";
import { retrieveCandidatesForRequirementV417 } from "./professor-requirement-retrieval-v4-17-v1";
import { compileRequirementSemanticQueryV417 } from "./professor-requirement-semantic-query-v4-17-v1";
import { evaluateCandidateAgainstRequirementV417 } from "./professor-requirement-candidate-v4-17-v1";
import { mapTailExhaustionToFailureV417 } from "./professor-blueprint-assembly-types-v4-17-v1";

type MockCatalog = {
  byOracleId: Map<string, {
    oracleId: string;
    canonicalName: string;
    oracleText: string;
    typeLine: string;
    manaValue: number;
    colors: string[];
    colorIdentity: string[];
    legalities?: { commander?: string };
    commanderEligibility?: { canBeSoleCommander?: boolean };
  }>;
};

function buildMockCatalog(size: number, colorIdentity: string[]): MockCatalog {
  const byOracleId = new Map<string, MockCatalog["byOracleId"] extends Map<string, infer V> ? V : never>();
  for (let i = 0; i < size; i++) {
    const oracleId = `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
    byOracleId.set(oracleId, {
      oracleId,
      canonicalName: i === size - 1 ? "Hidden Ramp Gem" : `Mock Card ${i}`,
      oracleText: i === size - 1 ? "Add {U}{U}." : "Draw a card.",
      typeLine: i === size - 1 ? "Artifact" : "Instant",
      manaValue: i === size - 1 ? 2 : 1,
      colors: [],
      colorIdentity,
      legalities: { commander: "legal" },
    });
  }
  return { byOracleId };
}

function accelerationReq(): BrewRequirementV417 {
  return {
    requirementId: "req-accel-test",
    blueprintRevisionId: 0,
    family: "ACCELERATION",
    purpose: "Ramp",
    priority: 90,
    coverageMode: "FUNCTIONAL_COVERAGE",
    sharePolicy: "GLOBAL_SHAREABLE",
    physicalSlotsNeeded: { min: 1, preferred: 1, max: 1 },
    requiredFunctions: ["ACCELERATION"],
    requiredMechanics: [],
    hardRequirements: [{ constraintId: "legal", description: "legal", semanticToken: functionalTokenForFamily("ACCELERATION") }],
    preferredRequirements: [],
    acceptableFunctionalAlternatives: [],
    hardConstraints: ["legal_in_color_identity"],
    softPreferences: [],
    packageIds: [],
    bracketQualityContract: bracketQualityContractV417(4),
    requirementBracketContract: requirementBracketContractV417("ACCELERATION", 4),
    currentCoverage: 0,
    targetCoverage: 1,
    selectedCardIds: [],
    status: "OPEN",
  };
}

function testCatalogOrderIndependence() {
  const catalogSize = 15000;
  const catalog = buildMockCatalog(catalogSize, ["U", "B", "R"]) as unknown as import("../../../scripts/lib/load-deck-resolution-catalog").DeckResolutionCatalog;
  const req = accelerationReq();
  const compiled = compileRequirementSemanticQueryV417(req);
  const ctx = createAdaptiveRetrievalBuildContextV417();
  const hiddenId = `00000000-0000-4000-8000-${String(catalogSize - 1).padStart(12, "0")}`;
  const { inputs, trace } = adaptiveRetrieveCandidateInputsV417({
    catalog,
    commanderColorIdentity: ["U", "B", "R"],
    objectiveId: req.requirementId,
    objectiveType: "FUNCTIONAL_REQUIREMENT",
    functionalMatchToken: compiled.functionalMatchToken,
    probeFunctions: ["ACCELERATION"],
    excludeOracleIds: new Set(),
    boundedScan: 500,
    boundedEvaluate: 50,
    buildContext: ctx,
    requireFullCorpus: true,
  });
  assert.ok(trace.searchSpaceExhausted, "full corpus fallback must run");
  assert.ok(
    inputs.some((c) => c.oracleId === hiddenId),
    "card beyond bounded scan window must be discoverable after adaptive expansion",
  );
  console.log("PASS catalog-order independence — hidden candidate surfaced via full corpus");
}

function testTierMateriallyNewIds() {
  const catalog = buildMockCatalog(200, ["G", "W"]) as unknown as import("../../../scripts/lib/load-deck-resolution-catalog").DeckResolutionCatalog;
  const req = accelerationReq();
  const compiled = compileRequirementSemanticQueryV417(req);
  const { inputs, trace } = adaptiveRetrieveCandidateInputsV417({
    catalog,
    commanderColorIdentity: ["G", "W"],
    objectiveId: req.requirementId,
    objectiveType: "FUNCTIONAL_REQUIREMENT",
    functionalMatchToken: compiled.functionalMatchToken,
    probeFunctions: ["ACCELERATION"],
    excludeOracleIds: new Set(),
    boundedScan: 20,
    boundedEvaluate: 5,
    requireFullCorpus: true,
  });
  assert.ok(trace.retrievalSourcesAttempted.includes("TIER_4_FUNCTION_UNION_CORPUS"), "tier 4 attempted");
  assert.ok(trace.searchSpaceExhausted, "full corpus covered");
  console.log("PASS adaptive tiers record materially new IDs or exhausted proof");
}

function testFullCorpusReconciliation() {
  const catalog = buildMockCatalog(120, ["B", "R"]) as unknown as import("../../../scripts/lib/load-deck-resolution-catalog").DeckResolutionCatalog;
  const legal = buildLegalCommanderCorpusV417({ catalog, commanderColorIdentity: ["B", "R"] });
  const req = accelerationReq();
  const result = retrieveCandidatesForRequirementV417({
    catalog,
    requirement: req,
    commanderColorIdentity: ["B", "R"],
    maxScan: 10,
    maxEvaluate: 5,
    minQualityScore: 1,
  });
  assert.equal(result.supplyTrace.legalCorpusSize, legal.length);
  assert.ok(result.supplyTrace.searchSpaceExhausted);
  console.log("PASS full-corpus reconciliation — legalCorpusSize matches permitted corpus");
}

function testTailExhaustionDiagnosis() {
  const trace = {
    objectiveId: "fd-test",
    objectiveType: "FUNCTIONAL_DENSITY" as const,
    legalCorpusSize: 100,
    retrievalSourcesAttempted: ["TIER_5_FULL_LEGAL_CORPUS" as const],
    retrievedUnique: 5,
    alreadySelected: 0,
    canonicalLegal: 5,
    semanticEligible: 0,
    hardConstraintPassed: 0,
    bracketQualityPassed: 0,
    positiveBlueprintDelta: 0,
    selectedCount: 0,
    rejectionBreakdown: { SEMANTIC_PREFILTER_REJECT: 5 },
    searchSpaceExhausted: true,
    tiers: [],
  };
  const exhaustion = diagnoseTailObjectiveExhaustionV417({ trace, minQualityScore: 40 });
  assert.equal(exhaustion.terminalReason, "NO_SEMANTIC_MATCH");
  assert.equal(mapTailExhaustionToFailureV417(exhaustion), "TAIL_NO_SEMANTIC_MATCH");
  console.log("PASS tail exhaustion maps to specific failure — not generic only");
}

function testPoolCacheReuse() {
  const catalog = buildMockCatalog(80, ["U", "R"]) as unknown as import("../../../scripts/lib/load-deck-resolution-catalog").DeckResolutionCatalog;
  const req = accelerationReq();
  const compiled = compileRequirementSemanticQueryV417(req);
  const ctx = createAdaptiveRetrievalBuildContextV417();
  adaptiveRetrieveCandidateInputsV417({
    catalog,
    commanderColorIdentity: ["U", "R"],
    objectiveId: "obj-1",
    objectiveType: "FUNCTIONAL_REQUIREMENT",
    functionalMatchToken: compiled.functionalMatchToken,
    probeFunctions: ["ACCELERATION"],
    excludeOracleIds: new Set(),
    buildContext: ctx,
  });
  assert.ok(ctx.pools.size >= 1, "pool cached after first retrieval");
  adaptiveRetrieveCandidateInputsV417({
    catalog,
    commanderColorIdentity: ["U", "R"],
    objectiveId: "obj-2",
    objectiveType: "FUNCTIONAL_DENSITY",
    functionalMatchToken: compiled.functionalMatchToken,
    probeFunctions: ["ACCELERATION"],
    excludeOracleIds: new Set(),
    buildContext: ctx,
  });
  assert.ok(ctx.pools.size >= 1);
  console.log("PASS functional candidate pool cached across objectives");
}

function main() {
  testCatalogOrderIndependence();
  testTierMateriallyNewIds();
  testFullCorpusReconciliation();
  testTailExhaustionDiagnosis();
  testPoolCacheReuse();
  console.log("professor-v4-17-brew-blueprint-slice5-3.selftest — ALL PASS");
}

main();

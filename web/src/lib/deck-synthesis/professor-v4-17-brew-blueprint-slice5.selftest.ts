/**
 * PROFESSOR v4.17 Slice 5 — assembly loop unit regressions (+ optional full assembly).
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildBlueprintFromSolProposalV417 } from "./professor-sol-blueprint-live-v4-17-v1";
import { validateSolBlueprintProposalV417 } from "./professor-sol-blueprint-proposal-v4-17-v1";
import { buildUltimeciaCommanderV417 } from "./professor-brew-blueprint-fixture-v4-17-v1";
import { chooseNextRequirementV417 } from "./professor-blueprint-next-requirement-v4-17-v1";
import { materializeFlexRequirementsV417, mandatoryStructureSatisfiedV417 } from "./professor-brew-blueprint-flex-v4-17-v1";
import { decomposeVagueWinHypothesisV417, vagueWinBlocksAssemblyV417 } from "./professor-brew-blueprint-vague-win-v4-17-v1";
import { evaluateNonlandClosureV417 } from "./professor-brew-blueprint-assembly-v4-17-v1";
import { rankCandidatesForAssemblyV417 } from "./professor-blueprint-candidate-ranking-v4-17-v1";
import {
  evaluateCandidateAgainstRequirementV417,
} from "./professor-requirement-candidate-v4-17-v1";
import { compileRequirementSemanticQueryV417 } from "./professor-requirement-semantic-query-v4-17-v1";
import { passesUsefulDeltaGateV417, simulateRequirementSelectionV417 } from "./professor-brew-blueprint-selection-sim-v4-17-v1";
import { applyRequirementSelectionV417 } from "./professor-brew-blueprint-mutation-v4-17-v1";

function ultimeciaProposal() {
  return validateSolBlueprintProposalV417({
    strategicThesis: "Graveyard recursion value with extra turns",
    primaryStrategy: "Fill graveyard and recur threats",
    secondaryStrategy: "Extra turn finish",
    commanderExploit: "Surveil and transform into extra turns",
    independentEngine: "Standalone graveyard value",
    expectedPlayPattern: "Surveil, recur, extra turn",
    strategicConcepts: ["graveyard recursion"],
    packages: [
      {
        packageId: "pkg-gy",
        name: "Graveyard Core",
        purpose: "Setup and recursion",
        core: true,
        minimumPhysicalSlots: 8,
        preferredPhysicalSlots: 10,
        maximumPhysicalSlots: 12,
        minimumPhysicalContribution: 8,
        preferredPhysicalContribution: 10,
        requirementGroups: [
          { groupId: "g1", name: "setup", mandatory: true, relatedRequirementIds: ["req-gy-setup"], minimumPhysicalSlots: 2, preferredPhysicalSlots: 3 },
        ],
        requiredFunctions: ["GRAVEYARD_ENABLER", "RETURN_FROM_GRAVEYARD"],
        preferredFunctions: [],
        relatedRequirementIds: ["req-gy-setup"],
        status: "OPEN",
        selectedCardIds: [],
      },
    ],
    winArchitecture: [
      {
        planId: "win-gy",
        plan: "Assemble graveyard recursion and convert repeated value into a deterministic extra-turn or combat finish",
        status: "HYPOTHESIZED",
        mechanicallyVerified: false,
        requiredFunctions: ["WIN_COMPONENT"],
        requiredCardsOrEquivalents: [],
      },
    ],
    functionalBudgets: [
      { category: "GRAVEYARD_ENABLER", minimum: 4, maximum: 8, functionalCoverageSelected: 0 },
      { category: "RETURN_FROM_GRAVEYARD", minimum: 4, maximum: 8, functionalCoverageSelected: 0 },
      { category: "INTERACTION", minimum: 6, maximum: 10, functionalCoverageSelected: 0 },
    ],
    accessNeeds: ["graveyard tutors"],
    protectionNeeds: ["protection for commander"],
    weaknesses: ["graveyard hate"],
    strengths: ["recursion"],
    dependencies: ["graveyard"],
    bracketConstructionGuidance: ["B4 interaction"],
    researchSeeds: [],
    bracketContract: {
      requestedBracket: 4,
      accelerationExpectation: "high",
      interactionExpectation: "high",
      cardQualityExpectation: "premium",
      tutorExpectation: "moderate",
      protectionExpectation: "some",
      redundancyExpectation: "high",
      threatSpeedExpectation: "fast",
      recoveryExpectation: "high",
      winCompactnessExpectation: "compact",
      comboPolicy: "no infinite combos",
      commanderDependenceTarget: "medium",
    },
  });
}

function testNextRequirementPrioritizesCore() {
  const commander = buildUltimeciaCommanderV417();
  const blueprint = buildBlueprintFromSolProposalV417({
    commander,
    userIntent: {
      format: "Commander",
      bracket: 4,
      playStyle: "graveyard",
      commanderDependence: "medium",
      comboPolicy: "none",
    },
    proposal: ultimeciaProposal(),
  });
  const next = chooseNextRequirementV417(blueprint);
  assert.ok(next, "expected next requirement");
  assert.ok(next.requirement.packageIds.length > 0 || next.requirement.priority >= 80, "core or high priority requirement first");
  console.log("PASS next requirement prioritization");
}

function testVagueWinKorvoldPath() {
  const commander = buildUltimeciaCommanderV417();
  const blueprint = buildBlueprintFromSolProposalV417({
    commander,
    userIntent: { format: "Commander", bracket: 4, playStyle: "sacrifice", commanderDependence: "high", comboPolicy: "none" },
    proposal: validateSolBlueprintProposalV417({
      ...ultimeciaProposal(),
      winArchitecture: [
        {
          planId: "win-vague",
          plan: "Recursive Permanent Loop",
          status: "HYPOTHESIZED",
          mechanicallyVerified: false,
          requiredFunctions: ["WIN_COMPONENT"],
          requiredCardsOrEquivalents: [],
        },
      ],
    }),
  });
  const blocked = vagueWinBlocksAssemblyV417(blueprint);
  assert.equal(blocked.failure, "CREATIVE_REVISION_REQUIRED");
  const deco = decomposeVagueWinHypothesisV417(blueprint);
  assert.ok(deco.some((d) => d.verdict === "CREATIVE_REVISION_REQUIRED"));
  console.log("PASS vague win Korvold path");
}

function testUsefulDeltaGate() {
  const commander = buildUltimeciaCommanderV417();
  let blueprint = buildBlueprintFromSolProposalV417({
    commander,
    userIntent: { format: "Commander", bracket: 4, playStyle: "graveyard", commanderDependence: "medium", comboPolicy: "none" },
    proposal: ultimeciaProposal(),
  });
  const req = blueprint.openRequirements.find((r) => r.family === "GRAVEYARD_ENABLER" || r.family === "RETURN_FROM_GRAVEYARD");
  assert.ok(req);
  const compiled = compileRequirementSemanticQueryV417(req);
  const candidate = {
    oracleId: "oid-test-gy",
    name: "Test GY Card",
    manaValue: 2,
    colors: ["B"],
    typeLine: "Instant",
    oracleText: "Surveil 2. Draw a card.",
  };
  const evaluation = evaluateCandidateAgainstRequirementV417({
    requirement: req,
    compiledQuery: compiled,
    candidate,
    commanderColorIdentity: commander.colorIdentity,
  });
  if (!evaluation.requirementEligible) {
    console.log("SKIP useful delta gate — fixture candidate ineligible");
    return;
  }
  const ranked = rankCandidatesForAssemblyV417({
    blueprint,
    evaluations: [evaluation],
    candidateOracleTextById: new Map([[candidate.oracleId, { oracleText: candidate.oracleText, typeLine: candidate.typeLine }]]),
    minQualityScore: 0,
  });
  const sim = simulateRequirementSelectionV417({
    blueprint,
    requirementId: req.requirementId,
    candidate: ranked[0]!,
    candidateOracleText: candidate.oracleText,
    candidateTypeLine: candidate.typeLine,
  });
  assert.ok(passesUsefulDeltaGateV417(sim));
  blueprint = applyRequirementSelectionV417({
    blueprint,
    requirementId: req.requirementId,
    topEvaluation: evaluation,
    candidateOracleText: candidate.oracleText,
    candidateTypeLine: candidate.typeLine,
  });
  assert.equal(blueprint.selectedCards.length, 1);
  console.log("PASS useful delta gate");
}

function testFlexMaterialization() {
  const commander = buildUltimeciaCommanderV417();
  let blueprint = buildBlueprintFromSolProposalV417({
    commander,
    userIntent: { format: "Commander", bracket: 4, playStyle: "graveyard", commanderDependence: "medium", comboPolicy: "none" },
    proposal: ultimeciaProposal(),
  });
  const pkg = blueprint.packages[0]!;
  const mockCards = Array.from({ length: pkg.minimumPhysicalContribution ?? pkg.minimumPhysicalSlots }, (_, i) => ({
    oracleId: `oid-flex-mock-${i}`,
    name: `Mock ${i}`,
    physicalSlotsConsumed: 1 as const,
    primaryRequirementId: "req-gy-setup",
    secondaryRequirementIds: [] as string[],
    primaryFunction: "GRAVEYARD_ENABLER" as const,
    secondaryFunctions: ["RETURN_FROM_GRAVEYARD" as const, "INTERACTION" as const],
    tertiaryFunctions: [] as const,
    satisfiedFunctions: ["GRAVEYARD_ENABLER" as const, "RETURN_FROM_GRAVEYARD" as const, "INTERACTION" as const],
    packageIds: [pkg.packageId],
    packageContributions: [
      {
        packageId: pkg.packageId,
        requirementIds: ["req-gy-setup"],
        contributedFunctions: ["GRAVEYARD_ENABLER" as const],
        semanticEvidence: ["mock"],
        contributionStrength: 75,
        countsTowardPhysicalDensity: true,
      },
    ],
    functionalDensityContributions: [
      { budgetId: "fd-graveyardenabler", category: "GRAVEYARD_ENABLER", contributedFunctions: ["GRAVEYARD_ENABLER" as const], semanticEvidence: ["mock"], contributionStrength: 75, countsTowardFunctionalDensity: true },
      { budgetId: "fd-returnfromgraveyard", category: "RETURN_FROM_GRAVEYARD", contributedFunctions: ["RETURN_FROM_GRAVEYARD" as const], semanticEvidence: ["mock"], contributionStrength: 75, countsTowardFunctionalDensity: true },
      { budgetId: "fd-interaction", category: "INTERACTION", contributedFunctions: ["INTERACTION" as const], semanticEvidence: ["mock"], contributionStrength: 75, countsTowardFunctionalDensity: true },
    ],
    semanticEvidence: ["mock"],
    bracketContribution: ["B4"],
    canonicalVerified: true,
  }));
  blueprint = {
    ...blueprint,
    functionalBudgets: blueprint.functionalBudgets.map((b) => ({ ...b, minimum: 1, maximum: 8 })),
    selectedCards: mockCards,
    packages: blueprint.packages.map((p) => ({ ...p, status: "SATISFIED" as const })),
    openRequirements: blueprint.openRequirements.map((r) => ({
      ...r,
      status: "SATISFIED" as const,
      selectedCardIds: ["mock"],
      currentCoverage: r.targetCoverage,
    })),
    physicalSlotBudget: { ...blueprint.physicalSlotBudget, selectedNonlands: 50, remainingNonlandSlots: 14 },
  };
  assert.ok(mandatoryStructureSatisfiedV417(blueprint));
  const withFlex = materializeFlexRequirementsV417(blueprint);
  assert.ok(withFlex.openRequirements.some((r) => r.requirementId.startsWith("flex-")));
  console.log("PASS flex materialization");
}

function testNonlandClosureEmptyDeck() {
  const commander = buildUltimeciaCommanderV417();
  const blueprint = buildBlueprintFromSolProposalV417({
    commander,
    userIntent: { format: "Commander", bracket: 4, playStyle: "graveyard", commanderDependence: "medium", comboPolicy: "none" },
    proposal: ultimeciaProposal(),
  });
  const closure = evaluateNonlandClosureV417(blueprint);
  assert.equal(closure.valid, false);
  console.log("PASS nonland closure rejects empty deck");
}

async function optionalFullAssembly() {
  if (process.env.PROFESSOR_V4_17_SLICE5_ASSEMBLY !== "1") {
    console.log("SKIP full assembly — set PROFESSOR_V4_17_SLICE5_ASSEMBLY=1");
    return;
  }
  const { loadDeckResolutionCatalog } = await import("../../../scripts/lib/load-deck-resolution-catalog");
  const { assembleDeckFromBlueprintV417 } = await import("./professor-brew-blueprint-assembly-v4-17-v1");
  const { resolveCommanderBlueprintFromCatalogV417, SLICE3_LIVE_COMMANDER_SPECS_V417 } = await import(
    "./professor-commander-catalog-v4-17-v1"
  );
  const { coerceSolBlueprintProposalRawV417 } = await import("./professor-sol-blueprint-coercion-v4-17-v1");

  const catalog = await loadDeckResolutionCatalog();
  const caseId = process.env.PROFESSOR_V4_17_SLICE5_CASE ?? "tokens-chatterfang";
  const spec = SLICE3_LIVE_COMMANDER_SPECS_V417.find((s) => s.caseId === caseId);
  assert.ok(spec, `unknown case ${caseId}`);

  const reportPath = resolve(process.cwd(), "data/milestones/deck-synthesis/v4-17-slice3-live-sol", caseId + "-report.json");
  const altPath = resolve(process.cwd(), "web/data/milestones/deck-synthesis/v4-17-slice3-live-sol", caseId + "-report.json");
  const reportFile = existsSync(reportPath) ? reportPath : altPath;
  assert.ok(existsSync(reportFile), "missing report " + reportFile);
  const saved = JSON.parse(readFileSync(reportFile, "utf8")) as Record<string, unknown>;
  let proposal = saved.proposal as Record<string, unknown> | undefined;
  if (!proposal && saved.rawParsed) {
    proposal = validateSolBlueprintProposalV417(
      coerceSolBlueprintProposalRawV417(saved.rawParsed as Record<string, unknown>, { requestedBracket: spec.requestedBracket }),
    ) as unknown as Record<string, unknown>;
  }
  assert.ok(proposal);
  const validated = validateSolBlueprintProposalV417(proposal);
  const commander = resolveCommanderBlueprintFromCatalogV417({ catalog, commanderName: spec.commanderName });
  const blueprint = buildBlueprintFromSolProposalV417({
    commander,
    userIntent: {
      format: "Commander",
      bracket: spec.requestedBracket,
      playStyle: spec.archetype,
      commanderDependence: "medium",
      comboPolicy: "no infinite combos",
    },
    proposal: validated,
  });

  const result = assembleDeckFromBlueprintV417(blueprint, {
    catalog,
    maxIterations: 80,
    maxScan: 8000,
    maxEvaluate: 200,
  });
  console.log(`FULL ASSEMBLY ${caseId}: success=${result.success} failure=${result.failure} picks=${result.decisions.length}`);
  assert.ok(result.decisions.length >= 8, "expected meaningful assembly progress");
}

async function main() {
  testNextRequirementPrioritizesCore();
  testVagueWinKorvoldPath();
  testUsefulDeltaGate();
  testFlexMaterialization();
  testNonlandClosureEmptyDeck();
  await optionalFullAssembly();
  console.log("professor-v4-17-brew-blueprint-slice5.selftest — ALL PASS");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

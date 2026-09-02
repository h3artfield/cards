/**
 * PROFESSOR v4.17 Slice 5.2 — functional density, mandatory closure, flex marginal utility.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { bracketQualityContractV417, type BrewBlueprintV417, type BrewRequirementV417 } from "./professor-brew-blueprint-v4-17-v1";
import { buildUltimeciaCommanderV417 } from "./professor-brew-blueprint-fixture-v4-17-v1";
import { buildBlueprintFromSolProposalV417 } from "./professor-sol-blueprint-live-v4-17-v1";
import { validateSolBlueprintProposalV417 } from "./professor-sol-blueprint-proposal-v4-17-v1";
import { requirementBracketContractV417 } from "./professor-requirement-bracket-v4-17-v1";
import {
  buildFunctionalDensityContributionsV417,
  computeFunctionalDensityStatesV417,
  computeMarginalBlueprintUtilityV417,
  mandatoryFunctionalDensityMinimumsSatisfiedV417,
  mandatoryStructureSatisfiedV417,
  materializeFunctionalDensityRequirementsV417,
  normalizeFunctionalBudgetCategoryV417,
  openFunctionalDensityCountV417,
} from "./professor-brew-blueprint-functional-density-v4-17-v1";
import { materializeFlexRequirementsV417 } from "./professor-brew-blueprint-flex-v4-17-v1";
import { passesUsefulDeltaGateV417 } from "./professor-brew-blueprint-selection-sim-v4-17-v1";
import { coerceSolBlueprintProposalRawV417 } from "./professor-sol-blueprint-coercion-v4-17-v1";
import { evaluateCandidateAgainstRequirementV417 } from "./professor-requirement-candidate-v4-17-v1";
import { compileRequirementSemanticQueryV417 } from "./professor-requirement-semantic-query-v4-17-v1";

function accelerationBlueprint(): BrewBlueprintV417 {
  const commander = buildUltimeciaCommanderV417();
  return buildBlueprintFromSolProposalV417({
    commander,
    userIntent: { format: "Commander", bracket: 4, playStyle: "spells", commanderDependence: "medium", comboPolicy: "none" },
    proposal: validateSolBlueprintProposalV417({
      strategicThesis: "Acceleration density test",
      primaryStrategy: "Ramp hard",
      secondaryStrategy: "Burst mana",
      commanderExploit: "Spell value",
      independentEngine: "Mana",
      expectedPlayPattern: "Ramp, cast",
      strategicConcepts: ["acceleration"],
      packages: [
        {
          packageId: "pkg-mana",
          name: "Mana",
          purpose: "Acceleration",
          core: true,
          minimumPhysicalSlots: 3,
          preferredPhysicalSlots: 5,
          maximumPhysicalSlots: 8,
          minimumPhysicalContribution: 3,
          preferredPhysicalContribution: 5,
          requirementGroups: [
            { groupId: "g1", name: "ramp", mandatory: true, relatedRequirementIds: ["req-accel"], minimumPhysicalSlots: 1, preferredPhysicalSlots: 2 },
          ],
          requiredFunctions: ["ACCELERATION"],
          preferredFunctions: [],
          relatedRequirementIds: ["req-accel"],
          status: "OPEN",
          selectedCardIds: [],
        },
      ],
      winArchitecture: [{ planId: "win-1", plan: "Cast big spells for lethal", status: "HYPOTHESIZED", mechanicallyVerified: false, requiredFunctions: ["WIN_COMPONENT"], requiredCardsOrEquivalents: [] }],
      functionalBudgets: [
        { category: "ACCELERATION", minimum: 10, maximum: 13, functionalCoverageSelected: 0 },
        { category: "INTERACTION", minimum: 4, maximum: 8, functionalCoverageSelected: 0 },
        { category: "CARD_VELOCITY", minimum: 4, maximum: 8, functionalCoverageSelected: 0 },
      ],
      accessNeeds: ["tutors"],
      protectionNeeds: ["protection"],
      weaknesses: ["removal"],
      strengths: ["speed"],
      dependencies: ["mana"],
      bracketConstructionGuidance: ["B4 ramp"],
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
        comboPolicy: "none",
        commanderDependenceTarget: "medium",
      },
    }),
  });
}

function testQuantitativeMinimumBlocksMandatoryStructure() {
  let blueprint = accelerationBlueprint();
  blueprint = {
    ...blueprint,
    openRequirements: blueprint.openRequirements.map((r) =>
      r.requirementId === "req-accel" ? { ...r, status: "SATISFIED" as const, selectedCardIds: ["oid-ring"] } : r,
    ),
    selectedCards: [
      {
        oracleId: "oid-ring",
        name: "Sol Ring",
        physicalSlotsConsumed: 1,
        primaryRequirementId: "req-accel",
        secondaryRequirementIds: [],
        primaryFunction: "ACCELERATION",
        secondaryFunctions: [],
        tertiaryFunctions: [],
        satisfiedFunctions: ["ACCELERATION", "RESOURCE_PRODUCTION"],
        packageIds: ["pkg-mana"],
        packageContributions: [],
        functionalDensityContributions: buildFunctionalDensityContributionsV417({
          blueprint,
          candidateOracleId: "oid-ring",
          satisfiedFunctions: ["ACCELERATION", "RESOURCE_PRODUCTION"],
          semanticEvidence: ["artifact mana"],
          contributionStrength: 90,
        }),
        semanticEvidence: [],
        bracketContribution: ["B4"],
        canonicalVerified: true,
      },
    ],
    physicalSlotBudget: { ...blueprint.physicalSlotBudget, selectedNonlands: 1, remainingNonlandSlots: 63 },
  };
  blueprint = materializeFunctionalDensityRequirementsV417(blueprint);
  const accel = computeFunctionalDensityStatesV417(blueprint).find((s) => s.category === "ACCELERATION");
  assert.equal(accel?.currentDistinctContributors, 1);
  assert.equal(accel?.status, "BELOW_MINIMUM");
  assert.equal(mandatoryStructureSatisfiedV417(blueprint), false);
  assert.ok(openFunctionalDensityCountV417(blueprint) >= 1);
  console.log("PASS binary SATISFIED + density 1/10 → mandatoryStructureSatisfied false");
}

function testUniqueContributorPerBudget() {
  const blueprint = accelerationBlueprint();
  const contribs = buildFunctionalDensityContributionsV417({
    blueprint,
    candidateOracleId: "oid-multi",
    satisfiedFunctions: ["ACCELERATION", "ACCELERATION", "RESOURCE_PRODUCTION"],
    semanticEvidence: ["ramp"],
    contributionStrength: 80,
  });
  const accel = contribs.find((c) => c.category === "ACCELERATION");
  assert.ok(accel);
  assert.equal(accel.contributedFunctions.filter((f) => f === "ACCELERATION").length, 1);
  console.log("PASS duplicate acceleration assertions → density +1 only");
}

function testRoleCompressionMultiBudget() {
  const blueprint = accelerationBlueprint();
  const contribs = buildFunctionalDensityContributionsV417({
    blueprint,
    candidateOracleId: "oid-rocks",
    satisfiedFunctions: ["ACCELERATION", "CARD_VELOCITY"],
    semanticEvidence: ["efficient rock"],
    contributionStrength: 75,
  });
  assert.ok(contribs.some((c) => c.category === "ACCELERATION"));
  assert.ok(contribs.some((c) => c.category === "CARD_VELOCITY"));
  console.log("PASS role compression counts toward multiple functional densities");
}

function testNoRemoteStubFunctionalCredit() {
  const norm = normalizeFunctionalBudgetCategoryV417("stackInteraction");
  assert.ok(norm.normalizedFunctions.includes("INTERACTION"));
  const blueprint = accelerationBlueprint();
  const contribs = buildFunctionalDensityContributionsV417({
    blueprint,
    candidateOracleId: "oid-unrelated",
    satisfiedFunctions: ["ENGINE_ENABLER"],
    semanticEvidence: [],
    contributionStrength: 50,
  });
  assert.equal(contribs.find((c) => c.category === "stackInteraction"), undefined);
  console.log("PASS no density credit without direct semantic function support");
}

function testMinimumClosure() {
  let blueprint = accelerationBlueprint();
  blueprint = { ...blueprint, functionalBudgets: [{ category: "ACCELERATION", minimum: 10, maximum: 13, functionalCoverageSelected: 0 }] };
  const cards = Array.from({ length: 10 }, (_, i) => ({
    oracleId: `oid-a-${i}`,
    name: `Ramp ${i}`,
    physicalSlotsConsumed: 1 as const,
    primaryRequirementId: "req-accel",
    secondaryRequirementIds: [] as string[],
    primaryFunction: "ACCELERATION" as const,
    secondaryFunctions: [] as const,
    tertiaryFunctions: [] as const,
    satisfiedFunctions: ["ACCELERATION" as const],
    packageIds: ["pkg-mana"],
    packageContributions: [],
    functionalDensityContributions: [
      {
        budgetId: "fd-acceleration",
        category: "ACCELERATION",
        contributedFunctions: ["ACCELERATION" as const],
        semanticEvidence: ["ramp"],
        contributionStrength: 80,
        countsTowardFunctionalDensity: true,
      },
    ],
    semanticEvidence: [],
    bracketContribution: ["B4"],
    canonicalVerified: true,
  }));
  blueprint = {
    ...blueprint,
    selectedCards: cards,
    openRequirements: blueprint.openRequirements.map((r) => ({ ...r, status: "SATISFIED" as const, selectedCardIds: cards.map((c) => c.oracleId) })),
    physicalSlotBudget: { ...blueprint.physicalSlotBudget, selectedNonlands: 10, remainingNonlandSlots: 54 },
  };
  const accel = computeFunctionalDensityStatesV417(blueprint).find((s) => s.category === "ACCELERATION");
  assert.equal(accel?.currentDistinctContributors, 10);
  assert.notEqual(accel?.status, "BELOW_MINIMUM");
  assert.ok(mandatoryFunctionalDensityMinimumsSatisfiedV417(blueprint));
  console.log("PASS acceleration 10/10 closes minimum");
}

function testPreferredContinuation() {
  let blueprint = accelerationBlueprint();
  blueprint = { ...blueprint, functionalBudgets: [{ category: "ACCELERATION", minimum: 10, maximum: 13, functionalCoverageSelected: 0 }] };
  const cards = Array.from({ length: 10 }, (_, i) => ({
    oracleId: `oid-p-${i}`,
    name: `Ramp ${i}`,
    physicalSlotsConsumed: 1 as const,
    primaryRequirementId: "req-accel",
    secondaryRequirementIds: [] as string[],
    primaryFunction: "ACCELERATION" as const,
    secondaryFunctions: [] as const,
    tertiaryFunctions: [] as const,
    satisfiedFunctions: ["ACCELERATION" as const],
    packageIds: ["pkg-mana"],
    packageContributions: [],
    functionalDensityContributions: [
      {
        budgetId: "fd-acceleration",
        category: "ACCELERATION",
        contributedFunctions: ["ACCELERATION" as const],
        semanticEvidence: [],
        contributionStrength: 80,
        countsTowardFunctionalDensity: true,
      },
    ],
    semanticEvidence: [],
    bracketContribution: ["B4"],
    canonicalVerified: true,
  }));
  blueprint = { ...blueprint, selectedCards: cards };
  blueprint = materializeFunctionalDensityRequirementsV417(blueprint);
  const accel = computeFunctionalDensityStatesV417(blueprint).find((s) => s.category === "ACCELERATION");
  assert.equal(accel?.status, "MINIMUM_SATISFIED");
  assert.ok((accel?.remainingPreferredDeficit ?? 0) > 0);
  console.log("PASS minimum satisfied with preferred still open");
}

function testSaturationPenalty() {
  const blueprint = accelerationBlueprint();
  const utility = computeMarginalBlueprintUtilityV417({
    blueprint: {
      ...blueprint,
      selectedCards: Array.from({ length: 13 }, (_, i) => ({
        oracleId: `oid-s-${i}`,
        name: `Ramp ${i}`,
        physicalSlotsConsumed: 1 as const,
        primaryRequirementId: "req-accel",
        secondaryRequirementIds: [],
        primaryFunction: "ACCELERATION" as const,
        secondaryFunctions: [],
        tertiaryFunctions: [],
        satisfiedFunctions: ["ACCELERATION" as const],
        packageIds: ["pkg-mana"],
        packageContributions: [],
        functionalDensityContributions: [],
        semanticEvidence: [],
        bracketContribution: [],
        canonicalVerified: true,
      })),
    },
    candidate: {
      requirementId: "fd-acceleration",
      oracleId: "oid-more-ramp",
      cardName: "More Ramp",
      requirementEligible: true,
      satisfiedFunctions: ["ACCELERATION"],
      semanticEvidence: [],
      missionFit: 70,
      finalRequirementScore: 70,
      rolePrecision: "PRECISE",
      roleCompression: 40,
      bracketFit: 70,
      bracketQuality: 70,
      commanderSynergy: 50,
      independentValue: 50,
      manaValue: 2,
    },
  });
  assert.ok(utility.saturationPenalty > 0);
  console.log("PASS saturation penalty on overfilled budget");
}

function testFlexUnderlyingFunction() {
  const flexReq: BrewRequirementV417 = {
    requirementId: "flex-flex_interaction-0",
    blueprintRevisionId: 0,
    family: "INTERACTION",
    purpose: "flex interaction",
    priority: 48,
    coverageMode: "FUNCTIONAL_COVERAGE",
    sharePolicy: "GLOBAL_SHAREABLE",
    physicalSlotsNeeded: { min: 0, preferred: 1, max: 2 },
    requiredFunctions: ["INTERACTION"],
    requiredMechanics: ["COUNTER_SPELL"],
    hardRequirements: [],
    preferredRequirements: [],
    acceptableFunctionalAlternatives: [],
    hardConstraints: [],
    softPreferences: [],
    packageIds: [],
    bracketQualityContract: bracketQualityContractV417(4),
    requirementBracketContract: requirementBracketContractV417("INTERACTION", 4),
    currentCoverage: 0,
    targetCoverage: 1,
    selectedCardIds: [],
    status: "OPEN",
  };
  const evaluation = evaluateCandidateAgainstRequirementV417({
    requirement: flexReq,
    compiledQuery: compileRequirementSemanticQueryV417(flexReq),
    candidate: {
      oracleId: "oid-counter",
      name: "Counterspell",
      typeLine: "Instant",
      oracleText: "Counter target spell.",
      manaValue: 2,
      colors: ["U"],
    },
    commanderColorIdentity: ["U", "B", "R"],
  });
  assert.equal(evaluation.requirementEligible, true);
  console.log("PASS FLEX_INTERACTION compiles to real INTERACTION eligibility");
}

function testMarginalUtilityAfterMandatory() {
  const blueprint = accelerationBlueprint();
  const utility = computeMarginalBlueprintUtilityV417({
    blueprint,
    candidate: {
      requirementId: "flex-flex_interaction-0",
      oracleId: "oid-counter",
      cardName: "Counterspell",
      requirementEligible: true,
      satisfiedFunctions: ["INTERACTION"],
      semanticEvidence: ["counter"],
      missionFit: 85,
      finalRequirementScore: 85,
      rolePrecision: "PRECISE",
      roleCompression: 55,
      bracketFit: 80,
      bracketQuality: 82,
      commanderSynergy: 70,
      independentValue: 75,
      manaValue: 2,
    },
  });
  assert.ok(utility.total > 0);
  assert.equal(
    passesUsefulDeltaGateV417({
      beforeCoverage: { selectedNonlands: 0, requirementStatuses: {}, packageStatuses: {}, functionalCoverage: {}, winStatuses: {} },
      afterCoverage: { selectedNonlands: 1, requirementStatuses: {}, packageStatuses: {}, functionalCoverage: {}, winStatuses: {} },
      primaryRequirementDelta: 0,
      secondaryCoverageDeltas: [],
      packageDeltas: [],
      winArchitectureDelta: null,
      coverageDeltaPerPhysicalSlot: 0,
      usefulBlueprintDelta: utility.total,
      marginalUtility: utility,
      simulatedBlueprint: blueprint,
    }),
    true,
  );
  console.log("PASS marginal utility > 0 without requirement status flip");
}

function testEarlyFlexRegressionKessShaped() {
  const reportPath = resolve(process.cwd(), "web/data/milestones/deck-synthesis/v4-17-slice3-live-sol/spellslinger-kess-report.json");
  const alt = resolve(process.cwd(), "data/milestones/deck-synthesis/v4-17-slice3-live-sol/spellslinger-kess-report.json");
  const path = existsSync(reportPath) ? reportPath : alt;
  if (!existsSync(path)) {
    console.log("SKIP Kess early-flex regression — no saved report");
    return;
  }
  const saved = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  const proposal = validateSolBlueprintProposalV417(
    saved.proposal ?? coerceSolBlueprintProposalRawV417(saved.rawParsed as Record<string, unknown>, { requestedBracket: 4 }),
  );
  let blueprint = buildBlueprintFromSolProposalV417({
    commander: buildUltimeciaCommanderV417(),
    userIntent: { format: "Commander", bracket: 4, playStyle: "spells", commanderDependence: "medium", comboPolicy: "none" },
    proposal,
  });
  blueprint = {
    ...blueprint,
    openRequirements: blueprint.openRequirements.map((r) => ({ ...r, status: "SATISFIED" as const, selectedCardIds: ["mock"] })),
    selectedCards: Array.from({ length: 19 }, (_, i) => ({
      oracleId: `oid-kess-${i}`,
      name: `Card ${i}`,
      physicalSlotsConsumed: 1 as const,
      primaryRequirementId: "req-accel",
      secondaryRequirementIds: [],
      primaryFunction: "ACCELERATION" as const,
      secondaryFunctions: ["INTERACTION" as const],
      tertiaryFunctions: [],
      satisfiedFunctions: i < 2 ? (["ACCELERATION"] as const) : (["INTERACTION"] as const),
      packageIds: blueprint.packages[0]?.packageId ? [blueprint.packages[0]!.packageId] : [],
      packageContributions: [],
      functionalDensityContributions: [],
      semanticEvidence: [],
      bracketContribution: [],
      canonicalVerified: true,
    })),
    physicalSlotBudget: { ...blueprint.physicalSlotBudget, selectedNonlands: 19, remainingNonlandSlots: 45 },
  };
  blueprint = materializeFunctionalDensityRequirementsV417(blueprint);
  assert.equal(mandatoryStructureSatisfiedV417(blueprint), false);
  const withFlex = materializeFlexRequirementsV417(blueprint);
  assert.equal(withFlex.openRequirements.filter((r) => r.requirementId.startsWith("flex-")).length, 0);
  const belowMin = computeFunctionalDensityStatesV417(blueprint).filter((s) => s.status === "BELOW_MINIMUM");
  assert.ok(belowMin.length > 0, "Kess-shaped 19/64 with binary reqs satisfied must still show quantitative deficits");
  console.log(`PASS Kess-shaped early-flex blocked — ${belowMin.length} budgets BELOW_MINIMUM`);
}

function testPackageFloorIndependentFromFunctionalDensity() {
  let blueprint = accelerationBlueprint();
  blueprint = {
    ...blueprint,
    packages: blueprint.packages.map((p) => ({ ...p, status: "SATISFIED" as const })),
    selectedCards: Array.from({ length: 3 }, (_, i) => ({
      oracleId: `oid-pkg-${i}`,
      name: `Pkg ${i}`,
      physicalSlotsConsumed: 1 as const,
      primaryRequirementId: "req-accel",
      secondaryRequirementIds: [],
      primaryFunction: "ACCELERATION" as const,
      secondaryFunctions: [],
      tertiaryFunctions: [],
      satisfiedFunctions: ["ACCELERATION" as const],
      packageIds: ["pkg-mana"],
      packageContributions: [
        {
          packageId: "pkg-mana",
          requirementIds: ["req-accel"],
          contributedFunctions: ["ACCELERATION" as const],
          semanticEvidence: [],
          contributionStrength: 70,
          countsTowardPhysicalDensity: true,
        },
      ],
      functionalDensityContributions: [
        {
          budgetId: "fd-acceleration",
          category: "ACCELERATION",
          contributedFunctions: ["ACCELERATION" as const],
          semanticEvidence: [],
          contributionStrength: 70,
          countsTowardFunctionalDensity: true,
        },
      ],
      semanticEvidence: [],
      bracketContribution: [],
      canonicalVerified: true,
    })),
  };
  const accel = computeFunctionalDensityStatesV417(blueprint).find((s) => s.category === "ACCELERATION");
  assert.equal(accel?.currentDistinctContributors, 3);
  assert.equal(accel?.status, "BELOW_MINIMUM");
  console.log("PASS package floor satisfied does not imply functional density satisfied");
}

function main() {
  testQuantitativeMinimumBlocksMandatoryStructure();
  testUniqueContributorPerBudget();
  testRoleCompressionMultiBudget();
  testNoRemoteStubFunctionalCredit();
  testMinimumClosure();
  testPreferredContinuation();
  testSaturationPenalty();
  testFlexUnderlyingFunction();
  testMarginalUtilityAfterMandatory();
  testEarlyFlexRegressionKessShaped();
  testPackageFloorIndependentFromFunctionalDensity();
  console.log("professor-v4-17-brew-blueprint-slice5-2.selftest — ALL PASS");
}

main();

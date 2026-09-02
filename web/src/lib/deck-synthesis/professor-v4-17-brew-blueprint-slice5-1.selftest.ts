/**
 * PROFESSOR v4.17 Slice 5.1 — package density closure, verified cross-package credit, flex convergence.
 */
import assert from "node:assert/strict";
import { bracketQualityContractV417, type BrewBlueprintV417, type BrewRequirementV417, type PackageContributionV417 } from "./professor-brew-blueprint-v4-17-v1";
import { buildUltimeciaCommanderV417 } from "./professor-brew-blueprint-fixture-v4-17-v1";
import { buildBlueprintFromSolProposalV417 } from "./professor-sol-blueprint-live-v4-17-v1";
import { validateSolBlueprintProposalV417 } from "./professor-sol-blueprint-proposal-v4-17-v1";
import { requirementBracketContractV417 } from "./professor-requirement-bracket-v4-17-v1";
import {
  computePackageDensityStatesV417,
  materializePackageDensityRequirementsV417,
  mandatoryPackageFloorsSatisfiedV417,
  openPackageDensityCountV417,
  runtimePhysicalLowerBoundFromDensity,
} from "./professor-brew-blueprint-package-density-v4-17-v1";
import { materializeFunctionalDensityRequirementsV417 } from "./professor-brew-blueprint-functional-density-v4-17-v1";
import { buildPackageContributionsV417, discoverVerifiedSecondaryRequirementsV417, allowsSecondaryFunctionalSatisfactionV417 } from "./professor-brew-blueprint-secondary-credit-v4-17-v1";
import { chooseNextRequirementsV417 } from "./professor-blueprint-next-requirement-v4-17-v1";
import { materializeFlexRequirementsV417, mandatoryStructureSatisfiedV417 } from "./professor-brew-blueprint-flex-v4-17-v1";
import { vagueWinBlocksAssemblyV417 } from "./professor-brew-blueprint-vague-win-v4-17-v1";
import { computeBlueprintPhysicalLowerBoundV417 } from "./professor-blueprint-feasibility-v4-17-v1";
import { compileRequirementSemanticQueryV417 } from "./professor-requirement-semantic-query-v4-17-v1";
import {
  evaluateCandidateAgainstRequirementV417,
  type RequirementCandidateEvaluationV417,
} from "./professor-requirement-candidate-v4-17-v1";
import { passesUsefulDeltaGateV417 } from "./professor-brew-blueprint-selection-sim-v4-17-v1";

function baseReq(overrides: Partial<BrewRequirementV417> & Pick<BrewRequirementV417, "requirementId" | "family" | "purpose">): BrewRequirementV417 {
  return {
    requirementId: overrides.requirementId,
    blueprintRevisionId: 0,
    family: overrides.family,
    purpose: overrides.purpose,
    priority: overrides.priority ?? 80,
    coverageMode: overrides.coverageMode ?? "FUNCTIONAL_COVERAGE",
    sharePolicy: overrides.sharePolicy ?? "GLOBAL_SHAREABLE",
    physicalSlotsNeeded: overrides.physicalSlotsNeeded ?? { min: 1, preferred: 1, max: 2 },
    requiredFunctions: overrides.requiredFunctions ?? [overrides.family === "PACKAGE_DENSITY" ? "ENGINE_ENABLER" : overrides.family],
    requiredMechanics: overrides.requiredMechanics ?? [],
    hardRequirements: [],
    preferredRequirements: [],
    acceptableFunctionalAlternatives: [],
    hardConstraints: [],
    softPreferences: [],
    packageIds: overrides.packageIds ?? [],
    bracketQualityContract: bracketQualityContractV417(4),
    requirementBracketContract: requirementBracketContractV417(overrides.requiredFunctions?.[0] ?? "ENGINE_ENABLER", 4),
    currentCoverage: overrides.currentCoverage ?? 0,
    targetCoverage: overrides.targetCoverage ?? 1,
    selectedCardIds: overrides.selectedCardIds ?? [],
    status: overrides.status ?? "OPEN",
    ...overrides,
  };
}

function densityFixtureBlueprint(): BrewBlueprintV417 {
  const commander = buildUltimeciaCommanderV417();
  const blueprint = buildBlueprintFromSolProposalV417({
    commander,
    userIntent: { format: "Commander", bracket: 4, playStyle: "graveyard", commanderDependence: "medium", comboPolicy: "none" },
    proposal: validateSolBlueprintProposalV417({
      strategicThesis: "Graveyard engine with density floor",
      primaryStrategy: "Fill graveyard and recur",
      secondaryStrategy: "Value loops",
      commanderExploit: "Surveil",
      independentEngine: "Standalone graveyard",
      expectedPlayPattern: "Setup, recur, win",
      strategicConcepts: ["graveyard"],
      packages: [
        {
          packageId: "pkg-gy",
          name: "Graveyard Engine",
          purpose: "Setup recursion payoff",
          core: true,
          minimumPhysicalSlots: 5,
          preferredPhysicalSlots: 7,
          maximumPhysicalSlots: 10,
          minimumPhysicalContribution: 5,
          preferredPhysicalContribution: 7,
          requirementGroups: [
            { groupId: "setup", name: "setup", mandatory: true, relatedRequirementIds: ["req-setup"], minimumPhysicalSlots: 1, preferredPhysicalSlots: 2 },
            { groupId: "recursion", name: "recursion", mandatory: true, relatedRequirementIds: ["req-recursion"], minimumPhysicalSlots: 1, preferredPhysicalSlots: 2 },
            { groupId: "payoff", name: "payoff", mandatory: true, relatedRequirementIds: ["req-payoff"], minimumPhysicalSlots: 1, preferredPhysicalSlots: 2 },
          ],
          requiredFunctions: ["GRAVEYARD_ENABLER", "RETURN_FROM_GRAVEYARD", "ENGINE_PAYOFF"],
          preferredFunctions: [],
          relatedRequirementIds: ["req-setup", "req-recursion", "req-payoff"],
          status: "OPEN",
          selectedCardIds: [],
        },
      ],
      winArchitecture: [
        {
          planId: "win-gy",
          plan: "Recur threats until board wins",
          status: "HYPOTHESIZED",
          mechanicallyVerified: false,
          requiredFunctions: ["WIN_COMPONENT"],
          requiredCardsOrEquivalents: [],
        },
      ],
      functionalBudgets: [
        { category: "GRAVEYARD_ENABLER", minimum: 2, maximum: 6, functionalCoverageSelected: 0 },
        { category: "RETURN_FROM_GRAVEYARD", minimum: 2, maximum: 6, functionalCoverageSelected: 0 },
        { category: "INTERACTION", minimum: 4, maximum: 8, functionalCoverageSelected: 0 },
      ],
      accessNeeds: ["graveyard tutors"],
      protectionNeeds: ["graveyard hate protection"],
      weaknesses: ["graveyard hate"],
      strengths: ["recursion depth"],
      dependencies: ["graveyard"],
      bracketConstructionGuidance: ["B4 interaction and redundancy"],
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

  const functionalReqs = ["req-setup", "req-recursion", "req-payoff"];
  const cards = ["oid-a", "oid-b", "oid-c"].map((oracleId, i) => ({
    oracleId,
    name: `Card ${i + 1}`,
    physicalSlotsConsumed: 1 as const,
    primaryRequirementId: functionalReqs[i]!,
    secondaryRequirementIds: [],
    primaryFunction: "GRAVEYARD_ENABLER" as const,
    secondaryFunctions: [] as const,
    tertiaryFunctions: [] as const,
    satisfiedFunctions: ["GRAVEYARD_ENABLER" as const],
    packageIds: ["pkg-gy"],
    packageContributions: [
      {
        packageId: "pkg-gy",
        requirementIds: [functionalReqs[i]!],
        contributedFunctions: ["GRAVEYARD_ENABLER" as const],
        semanticEvidence: ["fixture"],
        contributionStrength: 80,
        countsTowardPhysicalDensity: true,
      },
    ],
    functionalDensityContributions: [],
    semanticEvidence: ["fixture"],
    bracketContribution: ["B4"],
    canonicalVerified: true,
  }));

  return {
    ...blueprint,
    selectedCards: cards,
    physicalSlotBudget: { ...blueprint.physicalSlotBudget, selectedNonlands: 3, remainingNonlandSlots: 61 },
    openRequirements: blueprint.openRequirements.map((r) => {
      if (functionalReqs.includes(r.requirementId)) {
        return { ...r, status: "SATISFIED" as const, selectedCardIds: [cards[functionalReqs.indexOf(r.requirementId)]!.oracleId], currentCoverage: 1 };
      }
      return r;
    }),
  };
}

function mockEvaluation(overrides: Partial<RequirementCandidateEvaluationV417>): RequirementCandidateEvaluationV417 {
  return {
    requirementId: "req-a",
    oracleId: "oid-mock",
    cardName: "Mock Card",
    requirementEligible: true,
    satisfiedFunctions: ["INTERACTION"],
    semanticEvidence: ["mock"],
    missionFit: 80,
    finalRequirementScore: 80,
    rolePrecision: "PRECISE",
    roleCompression: 55,
    bracketFit: 75,
    ...overrides,
  };
}

function testPackageDensityOpensAfterFunctionsSatisfied() {
  const blueprint = materializePackageDensityRequirementsV417(densityFixtureBlueprint());
  const density = computePackageDensityStatesV417(blueprint);
  assert.equal(density[0]?.currentPhysicalContribution, 3);
  assert.equal(density[0]?.remainingMinimumDeficit, 2);
  assert.equal(density[0]?.status, "BELOW_MINIMUM");
  assert.ok(openPackageDensityCountV417(blueprint) >= 1, "PACKAGE_DENSITY objective should be open");
  const functionalStillSatisfied = blueprint.openRequirements
    .filter((r) => ["req-setup", "req-recursion", "req-payoff"].includes(r.requirementId))
    .every((r) => r.status === "SATISFIED");
  assert.ok(functionalStillSatisfied, "functional requirements stay SATISFIED");
  const next = chooseNextRequirementsV417(blueprint, 3)[0];
  assert.ok(next?.category === "PACKAGE_DENSITY" || next?.category === "FUNCTIONAL_DENSITY");
  console.log("PASS package floor unmet → PACKAGE_DENSITY open while functions SATISFIED");
}

function testUniquePhysicalCountPerPackage() {
  const blueprint = densityFixtureBlueprint();
  const evaluation = mockEvaluation({
    satisfiedFunctions: ["GRAVEYARD_ENABLER", "RETURN_FROM_GRAVEYARD", "ENGINE_PAYOFF"],
    oracleId: "oid-multi",
  });
  const primary = baseReq({
    requirementId: "req-setup",
    family: "GRAVEYARD_ENABLER",
    purpose: "setup",
    packageIds: ["pkg-gy"],
    status: "SATISFIED",
  });
  const contributions = buildPackageContributionsV417({
    blueprint,
    primaryRequirementId: "req-setup",
    primaryRequirement: primary,
    evaluation,
    verifiedSecondaries: [],
    candidateOracleId: "oid-multi",
  });
  assert.equal(contributions.length, 1);
  assert.equal(contributions[0]?.contributedFunctions.length, 3);
  assert.equal(contributions[0]?.countsTowardPhysicalDensity, true);
  console.log("PASS one card with three package functions → physical density +1");
}

function testCrossPackageVerifiedCompression() {
  const blueprint = densityFixtureBlueprint();
  const primaryReq = baseReq({ requirementId: "req-setup", family: "GRAVEYARD_ENABLER", purpose: "setup", packageIds: ["pkg-gy"] });
  const secondaryReq = baseReq({ requirementId: "req-interaction", family: "INTERACTION", purpose: "stack", packageIds: ["pkg-interaction"] });
  blueprint.openRequirements.push(secondaryReq);
  blueprint.packages.push({
    packageId: "pkg-interaction",
    name: "Interaction",
    purpose: "Stack interaction",
    core: true,
    minimumPhysicalSlots: 4,
    preferredPhysicalSlots: 6,
    maximumPhysicalSlots: 8,
    minimumPhysicalContribution: 4,
    preferredPhysicalContribution: 6,
    requirementGroups: [],
    requiredFunctions: ["INTERACTION"],
    preferredFunctions: [],
    relatedRequirementIds: ["req-interaction"],
    status: "OPEN",
    selectedCardIds: [],
  });

  const evaluation = mockEvaluation({ oracleId: "oid-dual", satisfiedFunctions: ["GRAVEYARD_ENABLER", "INTERACTION"] });
  const secondaryEval = mockEvaluation({ oracleId: "oid-dual", satisfiedFunctions: ["INTERACTION"], requirementId: "req-interaction" });
  const contributions = buildPackageContributionsV417({
    blueprint,
    primaryRequirementId: "req-setup",
    primaryRequirement: primaryReq,
    evaluation,
    verifiedSecondaries: [{ requirementId: "req-interaction", packageIds: ["pkg-interaction"], evaluation: secondaryEval }],
    candidateOracleId: "oid-dual",
  });
  assert.equal(contributions.length, 2);
  assert.ok(contributions.every((c) => c.countsTowardPhysicalDensity));
  console.log("PASS verified cross-package compression → both packages +1");
}

function testNoUncontrolledCrossPackageCredit() {
  const interactionReq = baseReq({
    requirementId: "req-interaction-a",
    family: "INTERACTION",
    purpose: "counter spells",
    packageIds: ["pkg-a"],
    requiredFunctions: ["INTERACTION"],
    requiredMechanics: ["COUNTER_SPELL"],
  });
  const protectionReq = baseReq({
    requirementId: "req-protection-b",
    family: "PROTECTION",
    purpose: "hexproof for commander",
    packageIds: ["pkg-b"],
    requiredFunctions: ["PROTECTION"],
    requiredMechanics: ["HEXPROOF"],
  });
  const blueprint = densityFixtureBlueprint();
  blueprint.openRequirements = [interactionReq, protectionReq];
  const candidate = {
    oracleId: "oid-counter",
    name: "Counterspell",
    typeLine: "Instant",
    oracleText: "Counter target spell.",
    manaValue: 2,
    colors: ["U"],
  };
  const verified = discoverVerifiedSecondaryRequirementsV417({
    blueprint,
    primaryRequirementId: "req-interaction-a",
    candidate,
    commanderColorIdentity: ["U", "B", "R"],
  });
  assert.equal(verified.length, 0, "counterspell must not credit unrelated protection package without eligibility proof");
  const primaryEval = evaluateCandidateAgainstRequirementV417({
    requirement: interactionReq,
    compiledQuery: compileRequirementSemanticQueryV417(interactionReq),
    candidate,
    commanderColorIdentity: ["U", "B", "R"],
  });
  assert.equal(primaryEval.requirementEligible, true);
  console.log("PASS no uncontrolled cross-package credit");
}

function testPackageFloorClosure() {
  let blueprint = densityFixtureBlueprint();
  for (let i = 3; i < 5; i++) {
    blueprint.selectedCards.push({
      oracleId: `oid-extra-${i}`,
      name: `Extra ${i}`,
      physicalSlotsConsumed: 1,
      primaryRequirementId: "req-setup",
      secondaryRequirementIds: [],
      primaryFunction: "GRAVEYARD_ENABLER",
      secondaryFunctions: [],
      tertiaryFunctions: [],
      satisfiedFunctions: ["GRAVEYARD_ENABLER"],
      packageIds: ["pkg-gy"],
      packageContributions: [
        {
          packageId: "pkg-gy",
          requirementIds: ["req-setup"],
          contributedFunctions: ["GRAVEYARD_ENABLER"],
          semanticEvidence: ["fixture"],
          contributionStrength: 75,
          countsTowardPhysicalDensity: true,
        },
      ],
      semanticEvidence: [],
      bracketContribution: ["B4"],
      canonicalVerified: true,
    });
  }
  blueprint = materializePackageDensityRequirementsV417(blueprint);
  const density = computePackageDensityStatesV417(blueprint);
  assert.equal(density[0]?.currentPhysicalContribution, 5);
  assert.notEqual(density[0]?.status, "BELOW_MINIMUM");
  assert.equal(openPackageDensityCountV417(blueprint), 0);
  assert.ok(mandatoryPackageFloorsSatisfiedV417(blueprint));
  console.log("PASS package floor 5/5 closes PACKAGE_DENSITY");
}

function testFlexTransition() {
  let blueprint = densityFixtureBlueprint();
  blueprint = {
    ...blueprint,
    functionalBudgets: blueprint.functionalBudgets.map((b) => ({ ...b, minimum: 1, maximum: 8 })),
  };
  for (let i = 3; i < 5; i++) {
    blueprint.selectedCards.push({
      oracleId: `oid-flex-${i}`,
      name: `Flex seed ${i}`,
      physicalSlotsConsumed: 1,
      primaryRequirementId: "req-setup",
      secondaryRequirementIds: [],
      primaryFunction: "GRAVEYARD_ENABLER",
      secondaryFunctions: ["RETURN_FROM_GRAVEYARD", "INTERACTION"],
      tertiaryFunctions: [],
      satisfiedFunctions: ["GRAVEYARD_ENABLER", "RETURN_FROM_GRAVEYARD", "INTERACTION"],
      packageIds: ["pkg-gy"],
      packageContributions: [
        {
          packageId: "pkg-gy",
          requirementIds: ["req-setup"],
          contributedFunctions: ["GRAVEYARD_ENABLER"],
          semanticEvidence: [],
          contributionStrength: 70,
          countsTowardPhysicalDensity: true,
        },
      ],
      functionalDensityContributions: [
        { budgetId: "fd-graveyardenabler", category: "GRAVEYARD_ENABLER", contributedFunctions: ["GRAVEYARD_ENABLER"], semanticEvidence: [], contributionStrength: 70, countsTowardFunctionalDensity: true },
        { budgetId: "fd-returnfromgraveyard", category: "RETURN_FROM_GRAVEYARD", contributedFunctions: ["RETURN_FROM_GRAVEYARD"], semanticEvidence: [], contributionStrength: 70, countsTowardFunctionalDensity: true },
        { budgetId: "fd-interaction", category: "INTERACTION", contributedFunctions: ["INTERACTION"], semanticEvidence: [], contributionStrength: 70, countsTowardFunctionalDensity: true },
      ],
      semanticEvidence: [],
      bracketContribution: ["B4"],
      canonicalVerified: true,
    });
  }
  blueprint = materializePackageDensityRequirementsV417(blueprint);
  blueprint = materializeFunctionalDensityRequirementsV417(blueprint);
  blueprint = {
    ...blueprint,
    packages: blueprint.packages.map((p) => ({ ...p, status: "SATISFIED" as const })),
    openRequirements: blueprint.openRequirements.map((r) => {
      if (
        r.family === "PACKAGE_DENSITY" ||
        r.family === "FUNCTIONAL_DENSITY" ||
        r.requirementId.startsWith("pkg-density-") ||
        r.requirementId.startsWith("fd-")
      ) {
        return { ...r, status: "SATISFIED" as const, currentCoverage: r.targetCoverage };
      }
      if (
        r.requirementId.startsWith("win-") ||
        r.requirementId.startsWith("infra-")
      ) {
        return { ...r, status: "SATISFIED" as const, currentCoverage: Math.max(r.currentCoverage, 1) };
      }
      return r;
    }),
    physicalSlotBudget: { ...blueprint.physicalSlotBudget, selectedNonlands: 42, remainingNonlandSlots: 22 },
  };
  assert.ok(mandatoryStructureSatisfiedV417(blueprint));
  const withFlex = materializeFlexRequirementsV417(blueprint);
  assert.ok(withFlex.openRequirements.some((r) => r.requirementId.startsWith("flex-")));
  console.log("PASS mandatory architecture satisfied + slots remaining → FLEX_* objectives");
}

function testNoFillerFlexGate() {
  assert.equal(
    passesUsefulDeltaGateV417({
      beforeCoverage: { selectedNonlands: 0, requirementStatuses: {}, packageStatuses: {}, functionalCoverage: {}, winStatuses: {} },
      afterCoverage: { selectedNonlands: 1, requirementStatuses: {}, packageStatuses: {}, functionalCoverage: {}, winStatuses: {} },
      primaryRequirementDelta: 0,
      secondaryCoverageDeltas: [],
      packageDeltas: [],
      winArchitectureDelta: null,
      coverageDeltaPerPhysicalSlot: 0,
      usefulBlueprintDelta: 0,
      simulatedBlueprint: densityFixtureBlueprint(),
    }),
    false,
  );
  console.log("PASS flex/no-op candidate rejected when usefulBlueprintDelta <= 0");
}

function testSigardaCombatClockAllowed() {
  const commander = buildUltimeciaCommanderV417();
  const blueprint = buildBlueprintFromSolProposalV417({
    commander,
    userIntent: { format: "Commander", bracket: 3, playStyle: "voltron", commanderDependence: "high", comboPolicy: "none" },
    proposal: validateSolBlueprintProposalV417({
      strategicThesis: "Voltron Sigarda",
      primaryStrategy: "Commander damage",
      secondaryStrategy: "Backup threats",
      commanderExploit: "Hexproof",
      independentEngine: "Equipment",
      expectedPlayPattern: "Suit up Sigarda",
      strategicConcepts: ["voltron"],
      packages: [
        {
          packageId: "pkg-voltron",
          name: "Voltron",
          purpose: "Power and evasion",
          core: true,
          minimumPhysicalSlots: 8,
          preferredPhysicalSlots: 10,
          maximumPhysicalSlots: 12,
          minimumPhysicalContribution: 8,
          preferredPhysicalContribution: 10,
          requirementGroups: [],
          requiredFunctions: ["ENGINE_ENABLER", "WIN_COMPONENT"],
          preferredFunctions: [],
          relatedRequirementIds: [],
          status: "OPEN",
          selectedCardIds: [],
        },
      ],
      winArchitecture: [
        {
          planId: "win-combat",
          plan: "Increase Sigarda combat damage and connect repeatedly for 21 commander damage with evasion and protection redundancy",
          status: "HYPOTHESIZED",
          mechanicallyVerified: false,
          requiredFunctions: ["WIN_COMPONENT"],
          requiredCardsOrEquivalents: [],
        },
      ],
      functionalBudgets: [
        { category: "ENGINE_ENABLER", minimum: 8, maximum: 12, functionalCoverageSelected: 0 },
        { category: "WIN_COMPONENT", minimum: 4, maximum: 8, functionalCoverageSelected: 0 },
        { category: "PROTECTION", minimum: 4, maximum: 8, functionalCoverageSelected: 0 },
      ],
      accessNeeds: ["equipment tutors"],
      protectionNeeds: ["hexproof redundancy"],
      weaknesses: ["board wipes"],
      strengths: ["commander evasion"],
      dependencies: ["equipment"],
      bracketConstructionGuidance: ["B3 combat clock"],
      researchSeeds: [],
      bracketContract: {
        requestedBracket: 3,
        accelerationExpectation: "moderate",
        interactionExpectation: "some",
        cardQualityExpectation: "solid",
        tutorExpectation: "limited",
        protectionExpectation: "some",
        redundancyExpectation: "some",
        threatSpeedExpectation: "combat",
        recoveryExpectation: "recast commander",
        winCompactnessExpectation: "combat clock",
        comboPolicy: "none",
        commanderDependenceTarget: "high",
      },
    }),
  });
  const blocked = vagueWinBlocksAssemblyV417(blueprint);
  assert.equal(blocked.blocked, false);
  assert.notEqual(blocked.failure, "CREATIVE_REVISION_REQUIRED");
  console.log("PASS Sigarda researchable COMBAT_CLOCK → assembly allowed");
}

function testSecondaryDoesNotCloseRemotePackageStub() {
  const blueprint = densityFixtureBlueprint();
  const primaryReq = baseReq({ requirementId: "req-setup", family: "GRAVEYARD_ENABLER", purpose: "setup", packageIds: ["pkg-gy"] });
  const remoteStub = baseReq({
    requirementId: "pkg-interaction-interaction",
    family: "INTERACTION",
    purpose: "interaction support",
    packageIds: ["pkg-interaction"],
    requiredFunctions: ["INTERACTION"],
    status: "OPEN",
  });
  blueprint.openRequirements.push(remoteStub);
  const evaluation = mockEvaluation({ oracleId: "oid-dual", satisfiedFunctions: ["GRAVEYARD_ENABLER", "INTERACTION"] });
  const secondaryEval = mockEvaluation({ oracleId: "oid-dual", satisfiedFunctions: ["INTERACTION"], requirementId: remoteStub.requirementId });
  const contributions = buildPackageContributionsV417({
    blueprint,
    primaryRequirementId: "req-setup",
    primaryRequirement: primaryReq,
    evaluation,
    verifiedSecondaries: [{ requirementId: remoteStub.requirementId, packageIds: ["pkg-interaction"], evaluation: secondaryEval }],
    candidateOracleId: "oid-dual",
  });
  assert.ok(contributions.some((c) => c.packageId === "pkg-interaction"), "cross-package density ledger allowed");
  assert.equal(
    allowsSecondaryFunctionalSatisfactionV417(primaryReq, remoteStub),
    false,
    "remote package function stub must not receive secondary functional satisfaction",
  );
  console.log("PASS remote pkg-* stub gets density credit but not functional auto-satisfy");
}

function testKorvoldVagueLoopBlocked() {
  const commander = buildUltimeciaCommanderV417();
  const blueprint = buildBlueprintFromSolProposalV417({
    commander,
    userIntent: { format: "Commander", bracket: 4, playStyle: "sacrifice", commanderDependence: "high", comboPolicy: "none" },
    proposal: validateSolBlueprintProposalV417({
      strategicThesis: "Sacrifice value",
      primaryStrategy: "Sacrifice loops",
      secondaryStrategy: "Value",
      commanderExploit: "Sacrifice",
      independentEngine: "Tokens",
      expectedPlayPattern: "Sacrifice",
      strategicConcepts: ["sacrifice"],
      packages: [
        {
          packageId: "pkg-sac",
          name: "Sacrifice",
          purpose: "Sac outlets",
          core: true,
          minimumPhysicalSlots: 8,
          preferredPhysicalSlots: 10,
          maximumPhysicalSlots: 12,
          minimumPhysicalContribution: 8,
          preferredPhysicalContribution: 10,
          requirementGroups: [],
          requiredFunctions: ["RESOURCE_CONSUMER"],
          preferredFunctions: [],
          relatedRequirementIds: [],
          status: "OPEN",
          selectedCardIds: [],
        },
      ],
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
      functionalBudgets: [
        { category: "RESOURCE_CONSUMER", minimum: 8, maximum: 12, functionalCoverageSelected: 0 },
        { category: "RESOURCE_PRODUCTION", minimum: 6, maximum: 10, functionalCoverageSelected: 0 },
        { category: "INTERACTION", minimum: 4, maximum: 8, functionalCoverageSelected: 0 },
      ],
      accessNeeds: ["sacrifice outlets"],
      protectionNeeds: ["combo protection"],
      weaknesses: ["removal"],
      strengths: ["value loops"],
      dependencies: ["sacrifice"],
      bracketConstructionGuidance: ["B4 sacrifice value"],
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
        commanderDependenceTarget: "high",
      },
    }),
  });
  const blocked = vagueWinBlocksAssemblyV417(blueprint);
  assert.equal(blocked.failure, "CREATIVE_REVISION_REQUIRED");
  console.log("PASS Korvold vague deterministic loop still blocked");
}

function testFeasibilityRuntimeAgreement() {
  let blueprint = densityFixtureBlueprint();
  const { lowerBound } = computeBlueprintPhysicalLowerBoundV417(blueprint);
  const runtimeDeficit = runtimePhysicalLowerBoundFromDensity(blueprint);
  assert.equal(lowerBound.correctedLowerBound, runtimeDeficit, "feasibility package floor deficit must match runtime density deficit");
  for (let i = 3; i < 5; i++) {
    blueprint.selectedCards.push({
      oracleId: `oid-agree-${i}`,
      name: `Agree ${i}`,
      physicalSlotsConsumed: 1,
      primaryRequirementId: "req-setup",
      secondaryRequirementIds: [],
      primaryFunction: "GRAVEYARD_ENABLER",
      secondaryFunctions: [],
      tertiaryFunctions: [],
      satisfiedFunctions: ["GRAVEYARD_ENABLER"],
      packageIds: ["pkg-gy"],
      packageContributions: [
        {
          packageId: "pkg-gy",
          requirementIds: ["req-setup"],
          contributedFunctions: ["GRAVEYARD_ENABLER"],
          semanticEvidence: [],
          contributionStrength: 70,
          countsTowardPhysicalDensity: true,
        },
      ],
      semanticEvidence: [],
      bracketContribution: ["B4"],
      canonicalVerified: true,
    });
  }
  const afterFeasibility = computeBlueprintPhysicalLowerBoundV417(blueprint);
  const afterRuntime = runtimePhysicalLowerBoundFromDensity(blueprint);
  assert.equal(afterFeasibility.lowerBound.correctedLowerBound, afterRuntime);
  assert.equal(afterRuntime, 0);
  console.log("PASS feasibility and assembly share package physical accounting");
}

function main() {
  testPackageDensityOpensAfterFunctionsSatisfied();
  testUniquePhysicalCountPerPackage();
  testCrossPackageVerifiedCompression();
  testNoUncontrolledCrossPackageCredit();
  testPackageFloorClosure();
  testFlexTransition();
  testNoFillerFlexGate();
  testSigardaCombatClockAllowed();
  testSecondaryDoesNotCloseRemotePackageStub();
  testKorvoldVagueLoopBlocked();
  testFeasibilityRuntimeAgreement();
  console.log("professor-v4-17-brew-blueprint-slice5-1.selftest — ALL PASS");
}

main();

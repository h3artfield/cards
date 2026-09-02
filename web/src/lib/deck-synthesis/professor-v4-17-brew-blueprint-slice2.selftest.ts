/**
 * PROFESSOR v4.17 Slice 2 — live Sol contract, requirement families, feasibility.
 * No OpenAI unless PROFESSOR_V4_17_LIVE_SOL=1. No Commander #10.
 */
import assert from "node:assert/strict";
import {
  SolBlueprintSchemaInvalidV417,
  validateSolBlueprintProposalV417,
} from "./professor-sol-blueprint-proposal-v4-17-v1";
import { compileRequirementSemanticQueryV417 } from "./professor-requirement-semantic-query-v4-17-v1";
import { evaluateCandidateAgainstRequirementV417 } from "./professor-requirement-candidate-v4-17-v1";
import {
  ARCHITECTURE_COMMANDER_CASES_V417,
  buildOverconstrainedBlueprintV417,
  runArchitectureCommanderReportV417,
} from "./professor-architecture-commanders-v4-17-v1";
import {
  buildFamilyRequirementV417,
  FAMILY_FIXTURE_CANDIDATES,
} from "./professor-requirement-family-fixtures-v4-17-v1";
import { runUltimeciaGraveyardRecursionFixtureV417 } from "./professor-brew-blueprint-fixture-v4-17-v1";
import { derivePackageStatusV417 } from "./professor-brew-blueprint-package-v4-17-v1";
import { familyScoreWeights } from "./professor-requirement-bracket-v4-17-v1";
import { normalizeSemanticConceptV417 } from "./professor-semantic-concept-normalizer-v4-17-v1";
import { liveSolBlueprintEnabledV417 } from "./professor-sol-blueprint-live-v4-17-v1";

const COLOR_ID_UBR = ["U", "B", "R"];
const COLOR_ID_WUBRG = ["W", "U", "B", "R", "G"];

function testSolSchemaValidation() {
  assert.throws(
    () => validateSolBlueprintProposalV417({ primaryStrategy: "x" }),
    (e: unknown) => e instanceof SolBlueprintSchemaInvalidV417,
  );
  const valid = validateSolBlueprintProposalV417({
    strategicThesis: "Test thesis",
    primaryStrategy: "Primary",
    secondaryStrategy: "Secondary",
    commanderExploit: "Exploit",
    independentEngine: "Engine",
    expectedPlayPattern: "Pattern",
    strategicConcepts: ["graveyard recursion"],
    packages: [
      {
        packageId: "pkg-1",
        name: "Core",
        purpose: "Core package",
        core: true,
        minimumPhysicalSlots: 3,
        preferredPhysicalSlots: 5,
        maximumPhysicalSlots: 8,
        requiredFunctions: ["RETURN_FROM_GRAVEYARD"],
        preferredFunctions: [],
        relatedRequirementIds: [],
        status: "OPEN",
        selectedCardIds: [],
      },
    ],
    winArchitecture: [
      {
        planId: "win-1",
        plan: "Win plan",
        status: "HYPOTHESIZED",
        mechanicallyVerified: false,
        requiredFunctions: ["WIN_COMPONENT"],
        requiredCardsOrEquivalents: [],
      },
    ],
    functionalBudgets: [
      { category: "ACCELERATION", minimum: 8, maximum: 12, functionalCoverageSelected: 0 },
      { category: "INTERACTION", minimum: 8, maximum: 12, functionalCoverageSelected: 0 },
      { category: "ENGINE", minimum: 10, maximum: 14, functionalCoverageSelected: 0 },
    ],
    accessNeeds: ["tutor engine"],
    protectionNeeds: ["protect commander"],
    weaknesses: ["removal"],
    strengths: ["synergy"],
    dependencies: ["ramp"],
    bracketConstructionGuidance: ["B4 efficiency"],
    researchSeeds: ["Reanimate"],
    bracketContract: {
      requestedBracket: 4,
      accelerationExpectation: "high",
      interactionExpectation: "high",
      cardQualityExpectation: "high",
      tutorExpectation: "limited",
      protectionExpectation: "some",
      redundancyExpectation: "high",
      threatSpeedExpectation: "mid",
      recoveryExpectation: "recursion",
      winCompactnessExpectation: "compact",
      comboPolicy: "none",
      commanderDependenceTarget: "medium",
    },
  });
  assert.equal(valid.primaryStrategy, "Primary");
  console.log("PASS Sol schema validation");
}

function testSemanticNormalization() {
  const verified = normalizeSemanticConceptV417("graveyard recursion");
  assert.equal(verified.status, "VERIFIED");
  const unsupported = normalizeSemanticConceptV417("quantum storm synergy");
  assert.equal(unsupported.status, "UNSUPPORTED");
  assert.equal(unsupported.mappedFunctions.length, 0);
  console.log("PASS semantic concept normalization");
}

function testRequirementFamiliesEligibility() {
  const families = ["INTERACTION", "ACCELERATION", "PROTECTION", "CARD_VELOCITY", "ACCESS", "WIN_COMPONENT", "ENGINE_ENABLER"] as const;
  for (const family of families) {
    const req = buildFamilyRequirementV417(family);
    const query = compileRequirementSemanticQueryV417(req);
    const fixtures = FAMILY_FIXTURE_CANDIDATES[family];
    const eligible = evaluateCandidateAgainstRequirementV417({
      requirement: req,
      compiledQuery: query,
      candidate: fixtures.eligible,
      commanderColorIdentity: COLOR_ID_WUBRG,
      genericEngineScore: 99,
    });
    const ineligible = evaluateCandidateAgainstRequirementV417({
      requirement: req,
      compiledQuery: query,
      candidate: fixtures.ineligible,
      commanderColorIdentity: COLOR_ID_WUBRG,
      genericEngineScore: 99,
    });
    assert.equal(eligible.requirementEligible, true, `${family} eligible`);
    assert.equal(ineligible.requirementEligible, false, `${family} ineligible`);
    assert.equal(ineligible.finalRequirementScore, 0, `${family} no score when ineligible`);
  }
  console.log("PASS requirement family eligibility fixtures");
}

function testFamilySpecificBracketScoring() {
  const interaction = familyScoreWeights("INTERACTION");
  const acceleration = familyScoreWeights("ACCELERATION");
  assert.notDeepEqual(interaction, acceleration);
  console.log("PASS family-specific bracket scoring weights");
}

function testMaterializerDiversity() {
  const reports = ARCHITECTURE_COMMANDER_CASES_V417.map(runArchitectureCommanderReportV417);
  assert.ok(reports.length >= 5);
  const gy = reports.find((r) => r.caseId === "graveyard-ultimecia")!;
  const spells = reports.find((r) => r.caseId === "spellslinger-kess")!;
  assert.ok(gy.requirementFamilies.includes("RETURN_FROM_GRAVEYARD"));
  assert.ok(spells.requirementFamilies.includes("CARD_VELOCITY"));
  assert.notDeepEqual(gy.requirementFamilies.sort(), spells.requirementFamilies.sort());
  console.log("PASS materializer produces diverse requirement sets");
}

function testPackageNotSatisfiedByOneCard() {
  const trace = runUltimeciaGraveyardRecursionFixtureV417();
  const pkg = trace.selectedBlueprint.packages.find((p) => p.packageId === "pkg-graveyard-recursion")!;
  const status = derivePackageStatusV417(pkg, trace.selectedBlueprint);
  assert.notEqual(status, "SATISFIED", "one recursion card must not satisfy entire graveyard engine");
  assert.equal(trace.selectedBlueprint.selectedCards[0]?.physicalSlotsConsumed, 1);
  console.log("PASS package requires mandatory groups + minimum physical contribution");
}

function testRoleCompression() {
  const trace = runUltimeciaGraveyardRecursionFixtureV417();
  const card = trace.selectedBlueprint.selectedCards[0]!;
  assert.equal(card.physicalSlotsConsumed, 1);
  assert.ok(card.semanticEvidence.length > 0);
  assert.ok(card.primaryFunction);
  console.log("PASS role compression with semantic evidence");
}

function testOverconstrainedBlueprint() {
  const blueprint = buildOverconstrainedBlueprintV417();
  assert.equal(blueprint.slotFeasibility.status, "BLUEPRINT_OVERCONSTRAINED");
  console.log("PASS BLUEPRINT_OVERCONSTRAINED detection");
}

function testArchitectureCommanderReports() {
  for (const testCase of ARCHITECTURE_COMMANDER_CASES_V417) {
    const report = runArchitectureCommanderReportV417(testCase);
    assert.ok(report.strategy.length > 0);
    assert.ok(report.materializedRequirementCount > 0);
    assert.ok(report.requirementFamilies.length > 0);
    assert.ok(["PASS", "NEEDS_RESEARCH", "REVISE"].includes(report.consistencyAudit.status));
    assert.equal(report.physicalFeasibility.feasible, true, `${report.caseId} should be feasible with default budgets`);
  }
  console.log("PASS architecture commander reports");
}

function testSlice1OrderingPreserved() {
  const trace = runUltimeciaGraveyardRecursionFixtureV417();
  const dreadhorde = trace.evaluations.find((e) => e.cardName === "Dreadhorde Invasion")!;
  const reanimate = trace.evaluations.find((e) => e.cardName === "Reanimate")!;
  assert.equal(dreadhorde.requirementEligible, false);
  assert.equal(reanimate.requirementEligible, true);
  console.log("PASS Slice-1 eligibility ordering preserved");
}

function testWinVerifiedRequiresMechanical() {
  assert.throws(
    () =>
      validateSolBlueprintProposalV417({
        strategicThesis: "t",
        primaryStrategy: "p",
        secondaryStrategy: "s",
        commanderExploit: "e",
        independentEngine: "i",
        expectedPlayPattern: "x",
        strategicConcepts: ["ramp"],
        packages: [
          {
            packageId: "p",
            name: "n",
            purpose: "p",
            core: true,
            minimumPhysicalSlots: 1,
            preferredPhysicalSlots: 2,
            maximumPhysicalSlots: 3,
            requiredFunctions: ["ACCELERATION"],
            preferredFunctions: [],
            relatedRequirementIds: [],
            status: "OPEN",
            selectedCardIds: [],
          },
        ],
        winArchitecture: [
          {
            planId: "w",
            plan: "win",
            status: "VERIFIED",
            mechanicallyVerified: false,
            requiredFunctions: [],
            requiredCardsOrEquivalents: [],
          },
        ],
        functionalBudgets: [
          { category: "A", minimum: 1, maximum: 2, functionalCoverageSelected: 0 },
          { category: "B", minimum: 1, maximum: 2, functionalCoverageSelected: 0 },
          { category: "C", minimum: 1, maximum: 2, functionalCoverageSelected: 0 },
        ],
        accessNeeds: [],
        protectionNeeds: [],
        weaknesses: ["w"],
        strengths: ["s"],
        dependencies: [],
        bracketConstructionGuidance: ["g"],
        researchSeeds: [],
        bracketContract: {
          requestedBracket: 4,
          accelerationExpectation: "a",
          interactionExpectation: "i",
          cardQualityExpectation: "c",
          tutorExpectation: "t",
          protectionExpectation: "p",
          redundancyExpectation: "r",
          threatSpeedExpectation: "t",
          recoveryExpectation: "r",
          winCompactnessExpectation: "w",
          comboPolicy: "n",
          commanderDependenceTarget: "m",
        },
      }),
    (e: unknown) => e instanceof SolBlueprintSchemaInvalidV417,
  );
  console.log("PASS win VERIFIED requires mechanical verifier");
}

async function testLiveSolOptional() {
  if (!liveSolBlueprintEnabledV417()) {
    console.log("SKIP live Sol (set PROFESSOR_V4_17_LIVE_SOL=1 + OPENAI_API_KEY)");
    return;
  }
  const { runLiveSolBlueprintV417 } = await import("./professor-sol-blueprint-live-v4-17-v1");
  const { buildUltimeciaCommanderV417 } = await import("./professor-brew-blueprint-fixture-v4-17-v1");
  const proposal = await runLiveSolBlueprintV417({
    commander: buildUltimeciaCommanderV417(),
    requestedBracket: 4,
    userPreferences: ["efficient graveyard recursion"],
  });
  assert.ok(proposal.strategicThesis.length > 0);
  console.log("PASS live Sol blueprint call");
}

async function main() {
  testSolSchemaValidation();
  testSemanticNormalization();
  testRequirementFamiliesEligibility();
  testFamilySpecificBracketScoring();
  testMaterializerDiversity();
  testPackageNotSatisfiedByOneCard();
  testRoleCompression();
  testOverconstrainedBlueprint();
  testArchitectureCommanderReports();
  testSlice1OrderingPreserved();
  testWinVerifiedRequiresMechanical();
  await testLiveSolOptional();
  console.log("\nAll PROFESSOR v4.17 Slice 2 acceptance checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

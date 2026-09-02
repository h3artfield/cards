/**
 * PROFESSOR v4.17 — Structured Brew Blueprint Slice 1 cheap acceptance.
 * No OpenAI. No Commander #10.
 */
import assert from "node:assert/strict";
import {
  assertBlueprintInvariantsV417,
  bracketQualityContractV417,
  roundTripBlueprintV417,
  type BrewRequirementV417,
} from "./professor-brew-blueprint-v4-17-v1";
import { compileRequirementSemanticQueryV417 } from "./professor-requirement-semantic-query-v4-17-v1";
import {
  evaluateCandidateAgainstRequirementV417,
  rankEligibleCandidatesForRequirementV417,
} from "./professor-requirement-candidate-v4-17-v1";
import { applyRequirementSelectionV417 } from "./professor-brew-blueprint-mutation-v4-17-v1";
import { derivePackageStatusV417 } from "./professor-brew-blueprint-package-v4-17-v1";
import { deriveWorkingDeckTheoryFromBlueprintV417 } from "./professor-brew-blueprint-legacy-v4-17-v1";
import {
  buildGraveyardRecursionRequirementV417,
  buildUltimeciaBlueprintFixtureV417,
  FIXTURE_CANDIDATES,
  runUltimeciaGraveyardRecursionFixtureV417,
  ULTIMECIA_ORACLE_ID,
} from "./professor-brew-blueprint-fixture-v4-17-v1";
import { buildUltimeciaCommanderV417 } from "./professor-brew-blueprint-fixture-v4-17-v1";
import { SOL_BLUEPRINT_SYSTEM_PROMPT_V417 } from "./professor-sol-blueprint-contract-v4-17-v1";

function testBlueprintSchemaRoundTrip() {
  const blueprint = buildUltimeciaBlueprintFixtureV417();
  assert.equal(blueprint.version, "professor-brew-blueprint-v4-17-v1");
  assert.equal(blueprint.commander.oracleId, ULTIMECIA_ORACLE_ID);
  assert.ok(blueprint.strategy.primaryStrategy);
  assert.ok(blueprint.bracketContract.requestedBracket === 4);
  assert.ok(blueprint.packages.length >= 1);
  assert.ok(blueprint.functionalBudgets.length >= 1);
  assert.ok(blueprint.openRequirements.length >= 1);
  assert.equal(blueprint.selectedCards.length, 0);

  const rt = roundTripBlueprintV417(blueprint);
  assert.deepEqual(rt.commander, blueprint.commander);
  assert.deepEqual(rt.openRequirements, blueprint.openRequirements);
  console.log("PASS schema round-trip");
}

function testSemanticQueryCompilation() {
  const requirement = buildGraveyardRecursionRequirementV417();
  const query = compileRequirementSemanticQueryV417(requirement);
  assert.equal(query.primaryRelation, "RETURNS_FROM");
  assert.ok(query.zoneTransitions.some((z) => z.includes("GRAVEYARD → BATTLEFIELD")));
  assert.equal(query.functionalMatchToken, "reanimation");
  assert.ok(query.compiledText.includes("RETURN_FROM_GRAVEYARD"));
  assert.ok(query.compiledText.includes("B4"));
  console.log("PASS semantic query compilation");
}

function testRequirementIneligibilityBeforeScoring() {
  const requirement = buildGraveyardRecursionRequirementV417();
  const query = compileRequirementSemanticQueryV417(requirement);
  const commander = buildUltimeciaCommanderV417();

  const unrelated = evaluateCandidateAgainstRequirementV417({
    requirement,
    compiledQuery: query,
    candidate: FIXTURE_CANDIDATES.find((c) => c.name === "Cultivate")!,
    commanderColorIdentity: commander.colorIdentity,
    genericEngineScore: 99,
    genericCharterScore: 99,
  });
  assert.equal(unrelated.requirementEligible, false);
  assert.equal(unrelated.finalRequirementScore, 0);
  assert.equal(unrelated.rejectionReason, "OFF_COLOR");

  const dreadhorde = evaluateCandidateAgainstRequirementV417({
    requirement,
    compiledQuery: query,
    candidate: FIXTURE_CANDIDATES.find((c) => c.name === "Dreadhorde Invasion")!,
    commanderColorIdentity: commander.colorIdentity,
    genericEngineScore: 99,
    genericCharterScore: 98,
  });
  assert.equal(dreadhorde.requirementEligible, false);
  assert.equal(dreadhorde.finalRequirementScore, 0);
  assert.ok(dreadhorde.rejectionReason?.startsWith("REQUIREMENT_INELIGIBLE") || dreadhorde.rejectionReason?.startsWith("WRONG_FUNCTION"));

  const thrax = evaluateCandidateAgainstRequirementV417({
    requirement,
    compiledQuery: query,
    candidate: FIXTURE_CANDIDATES.find((c) => c.name === "Thraxodemon")!,
    commanderColorIdentity: commander.colorIdentity,
    genericEngineScore: 95,
    genericCharterScore: 90,
  });
  assert.equal(thrax.requirementEligible, false);
  assert.equal(thrax.finalRequirementScore, 0);
  console.log("PASS requirement ineligibility gate");
}

function testUltimeciaRegression() {
  const trace = runUltimeciaGraveyardRecursionFixtureV417();

  const dreadhorde = trace.evaluations.find((e) => e.cardName === "Dreadhorde Invasion")!;
  const thrax = trace.evaluations.find((e) => e.cardName === "Thraxodemon")!;
  const reanimate = trace.evaluations.find((e) => e.cardName === "Reanimate")!;

  assert.equal(dreadhorde.requirementEligible, false);
  assert.equal(thrax.requirementEligible, false);
  assert.equal(reanimate.requirementEligible, true);
  assert.equal(trace.rankedEligible[0]?.cardName, "Reanimate");
  assert.equal(trace.selectedBlueprint.selectedCards[0]?.name, "Reanimate");
  assert.equal(trace.selectedBlueprint.selectedCards[0]?.primaryRequirementId, "req-graveyard-recursion-1");
  assert.equal(trace.selectedBlueprint.selectedCards[0]?.physicalSlotsConsumed, 1);
  assert.equal(trace.selectedBlueprint.physicalSlotBudget.selectedNonlands, 1);
  assert.equal(trace.selectedBlueprint.openRequirements[0]?.status, "SATISFIED");
  console.log("PASS Ultimecia regression — Reanimate beats unrelated high-score cards");
}

function testRelativeEligibleCompetition() {
  const requirement = buildGraveyardRecursionRequirementV417();
  const query = compileRequirementSemanticQueryV417(requirement);
  const commander = buildUltimeciaCommanderV417();
  const eligibleOnly = FIXTURE_CANDIDATES.filter((c) => c.name === "Reanimate" || c.name === "Animate Dead");

  const evaluations = eligibleOnly.map((c) =>
    evaluateCandidateAgainstRequirementV417({
      requirement,
      compiledQuery: query,
      candidate: c,
      commanderColorIdentity: commander.colorIdentity,
    }),
  );
  const ranked = rankEligibleCandidatesForRequirementV417(evaluations);
  assert.equal(ranked.length, 2);
  assert.ok(ranked.every((e) => e.requirementEligible));
  assert.ok(ranked[0]!.finalRequirementScore >= ranked[1]!.finalRequirementScore);
  console.log("PASS relative eligible competition");
}

function testBracketChangesRanking() {
  const commander = buildUltimeciaCommanderV417();
  const b2Req: BrewRequirementV417 = {
    ...buildGraveyardRecursionRequirementV417(),
    bracketQualityContract: bracketQualityContractV417(2),
  };
  const b4Req: BrewRequirementV417 = {
    ...buildGraveyardRecursionRequirementV417(),
    bracketQualityContract: bracketQualityContractV417(4),
  };
  const candidate = FIXTURE_CANDIDATES.find((c) => c.name === "Animate Dead")!;

  const b2 = evaluateCandidateAgainstRequirementV417({
    requirement: b2Req,
    compiledQuery: compileRequirementSemanticQueryV417(b2Req),
    candidate,
    commanderColorIdentity: commander.colorIdentity,
  });
  const b4 = evaluateCandidateAgainstRequirementV417({
    requirement: b4Req,
    compiledQuery: compileRequirementSemanticQueryV417(b4Req),
    candidate,
    commanderColorIdentity: commander.colorIdentity,
  });
  assert.equal(b2.bracketQuality <= b4.bracketQuality || b2.manaEfficiency <= b4.manaEfficiency, true);
  console.log("PASS bracket contract alters ranking dimensions");
}

function testMutationAndMultiRoleAccounting() {
  const trace = runUltimeciaGraveyardRecursionFixtureV417();
  const card = trace.selectedBlueprint.selectedCards[0]!;
  assert.equal(card.physicalSlotsConsumed, 1);
  assert.ok(card.satisfiedFunctions.includes("RETURN_FROM_GRAVEYARD"));
  assert.equal(trace.selectedBlueprint.physicalSlotBudget.selectedNonlands, 1);
  assertBlueprintInvariantsV417(trace.selectedBlueprint);

  const pkg = trace.selectedBlueprint.packages.find((p) => p.packageId === "pkg-graveyard-recursion")!;
  assert.equal(derivePackageStatusV417(pkg, trace.selectedBlueprint), "PARTIAL");
  console.log("PASS mutation + physical vs functional accounting");
}

function testLegacyProjection() {
  const trace = runUltimeciaGraveyardRecursionFixtureV417();
  const theory = deriveWorkingDeckTheoryFromBlueprintV417(trace.selectedBlueprint);
  assert.equal(theory.commander, trace.commander.name);
  assert.ok(theory.thesis.summary.length > 0);
  assert.ok(theory.packages.some((p) => p.packageId === "pkg-graveyard-recursion"));
  assert.equal(theory.version, "professor-working-deck-theory-v4");
  console.log("PASS legacy projection Blueprint → WorkingDeckTheory");
}

function testSolContractPresent() {
  assert.ok(SOL_BLUEPRINT_SYSTEM_PROMPT_V417.includes("researchSeeds"));
  assert.ok(SOL_BLUEPRINT_SYSTEM_PROMPT_V417.includes("Do NOT return a 100-card decklist"));
  console.log("PASS Sol blueprint contract");
}

function testNoOrphanSelection() {
  const trace = runUltimeciaGraveyardRecursionFixtureV417();
  assert.throws(() => {
    applyRequirementSelectionV417({
      blueprint: trace.blueprint,
      requirementId: "req-graveyard-recursion-1",
      topEvaluation: {
        ...trace.evaluations.find((e) => e.cardName === "Dreadhorde Invasion")!,
        requirementEligible: false,
      },
    });
  });
  console.log("PASS no orphan / ineligible selection");
}

function main() {
  testBlueprintSchemaRoundTrip();
  testSemanticQueryCompilation();
  testRequirementIneligibilityBeforeScoring();
  testUltimeciaRegression();
  testRelativeEligibleCompetition();
  testBracketChangesRanking();
  testMutationAndMultiRoleAccounting();
  testLegacyProjection();
  testSolContractPresent();
  testNoOrphanSelection();
  console.log("\nAll PROFESSOR v4.17 Slice 1 acceptance checks passed.");
}

main();

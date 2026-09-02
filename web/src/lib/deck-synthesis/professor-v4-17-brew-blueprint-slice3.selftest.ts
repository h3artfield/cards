/**
 * PROFESSOR v4.17 Slice 3 — deterministic regressions (no live Sol required).
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateSolBlueprintProposalV417 } from "./professor-sol-blueprint-proposal-v4-17-v1";
import { coerceSolBlueprintProposalRawV417 } from "./professor-sol-blueprint-coercion-v4-17-v1";
import { buildBlueprintFromSolProposalV417 } from "./professor-sol-blueprint-live-v4-17-v1";
import { adjudicateBlueprintV417 } from "./professor-blueprint-adjudication-v4-17-v1";
import { buildUltimeciaCommanderV417 } from "./professor-brew-blueprint-fixture-v4-17-v1";
import { applyBlueprintRevisionV417, assertRequirementRevisionProvenanceV417 } from "./professor-blueprint-revision-v4-17-v1";
import { evaluateResearchFindingsV417, rulesContradictionFindingV417 } from "./professor-blueprint-research-v4-17-v1";

function testEloquentFailureRejected() {
  const eloquentButBad = validateSolBlueprintProposalV417({
    strategicThesis: "A masterpiece of strategic prose that sounds brilliant.",
    primaryStrategy: "Generic midrange value in these colors.",
    secondaryStrategy: "Also generic.",
    commanderExploit: "Play good cards that synergize vaguely.",
    independentEngine: "Play good cards that synergize vaguely with the commander.",
    expectedPlayPattern: "Curve out and win.",
    strategicConcepts: ["quantum storm synergy", "abstract value"],
    packages: [
      {
        packageId: "pkg-vague",
        name: "Graveyard value",
        purpose: "Get value from graveyard",
        core: true,
        minimumPhysicalSlots: 50,
        preferredPhysicalSlots: 55,
        maximumPhysicalSlots: 60,
        minimumPhysicalContribution: 70,
        preferredPhysicalContribution: 75,
        requiredFunctions: ["RETURN_FROM_GRAVEYARD"],
        preferredFunctions: [],
        relatedRequirementIds: [],
        status: "OPEN",
        selectedCardIds: [],
      },
    ],
    winArchitecture: [
      {
        planId: "win-vague",
        plan: "Build an overwhelming board state.",
        status: "HYPOTHESIZED",
        mechanicallyVerified: false,
        requiredFunctions: ["WIN_COMPONENT"],
        requiredCardsOrEquivalents: [],
      },
    ],
    functionalBudgets: [
      { category: "A", minimum: 20, maximum: 30, functionalCoverageSelected: 0 },
      { category: "B", minimum: 20, maximum: 30, functionalCoverageSelected: 0 },
      { category: "C", minimum: 20, maximum: 30, functionalCoverageSelected: 0 },
    ],
    accessNeeds: [],
    protectionNeeds: [],
    weaknesses: ["nothing"],
    strengths: ["everything"],
    dependencies: [],
    bracketConstructionGuidance: ["casual battlecruiser"],
    researchSeeds: ["Good Card"],
    bracketContract: {
      requestedBracket: 4,
      accelerationExpectation: "slow",
      interactionExpectation: "low",
      cardQualityExpectation: "low",
      tutorExpectation: "none",
      protectionExpectation: "none",
      redundancyExpectation: "none",
      threatSpeedExpectation: "slow",
      recoveryExpectation: "none",
      winCompactnessExpectation: "none",
      comboPolicy: "none",
      commanderDependenceTarget: "high",
    },
  });

  const blueprint = buildBlueprintFromSolProposalV417({
    commander: buildUltimeciaCommanderV417(),
    userIntent: { format: "Commander", bracket: 4, playStyle: "test", commanderDependence: "high", comboPolicy: "none" },
    proposal: eloquentButBad,
  });
  const adj = adjudicateBlueprintV417({ proposal: eloquentButBad, blueprint, researchExecutability: "FAIL" });
  assert.notEqual(adj.decision, "ACCEPT");
  assert.equal(adj.winHypothesisResults[0]?.researchable, false);
  assert.equal(adj.physicalSlotFeasible, false);
  console.log("PASS eloquent failure rejected");
}

function testBlueprintRevisionRematerialization() {
  const proposal = validateSolBlueprintProposalV417({
    strategicThesis: "Graveyard recursion under B4",
    primaryStrategy: "Recursion",
    secondaryStrategy: "Control",
    commanderExploit: "Use surveil and graveyard recursion",
    independentEngine: "Self-mill recursion engine",
    expectedPlayPattern: "Fill yard then recur",
    strategicConcepts: ["graveyard recursion"],
    packages: [
      {
        packageId: "pkg-gy",
        name: "GY Engine",
        purpose: "Setup recursion payoff",
        core: true,
        minimumPhysicalSlots: 20,
        preferredPhysicalSlots: 25,
        maximumPhysicalSlots: 30,
        minimumPhysicalContribution: 20,
        preferredPhysicalContribution: 25,
        requirementGroups: [
          { groupId: "g1", name: "recursion", mandatory: true, relatedRequirementIds: ["req-rec"], minimumPhysicalSlots: 2, preferredPhysicalSlots: 3 },
        ],
        requiredFunctions: ["RETURN_FROM_GRAVEYARD"],
        preferredFunctions: [],
        relatedRequirementIds: [],
        status: "OPEN",
        selectedCardIds: [],
      },
    ],
    winArchitecture: [
      {
        planId: "w1",
        plan: "Recursion then extra turn combat finish",
        status: "HYPOTHESIZED",
        mechanicallyVerified: false,
        requiredFunctions: ["WIN_COMPONENT"],
        requiredCardsOrEquivalents: [],
      },
    ],
    functionalBudgets: [
      { category: "A", minimum: 8, maximum: 12, functionalCoverageSelected: 0 },
      { category: "B", minimum: 8, maximum: 12, functionalCoverageSelected: 0 },
      { category: "C", minimum: 8, maximum: 12, functionalCoverageSelected: 0 },
    ],
    accessNeeds: ["tutor recursion"],
    protectionNeeds: ["graveyard hate protection"],
    weaknesses: ["gy hate"],
    strengths: ["recursion"],
    dependencies: ["enablers"],
    bracketConstructionGuidance: ["B4 efficiency"],
    researchSeeds: ["Reanimate"],
    bracketContract: {
      requestedBracket: 4,
      accelerationExpectation: "moderate",
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

  const blueprint = buildBlueprintFromSolProposalV417({
    commander: buildUltimeciaCommanderV417(),
    userIntent: { format: "Commander", bracket: 4, playStyle: "test", commanderDependence: "medium", comboPolicy: "none" },
    proposal,
  });
  const oldIds = new Set(blueprint.openRequirements.map((r) => r.requirementId));
  const findings = [
    ...evaluateResearchFindingsV417({
      blueprint,
      retrievalResults: [{ requirementId: blueprint.openRequirements[0]!.requirementId, eligibleCount: 0, family: "RETURN_FROM_GRAVEYARD" }],
    }),
    rulesContradictionFindingV417({ requirementId: blueprint.openRequirements[0]!.requirementId, reason: "Rules veto test" }),
  ];
  const revised = applyBlueprintRevisionV417({
    blueprint,
    proposal,
    findings,
    summary: "Revision test",
  });
  assert.ok(revised.revisionHistory.length > blueprint.revisionHistory.length);
  assertRequirementRevisionProvenanceV417(revised);
  assert.ok(revised.openRequirements.every((r) => r.blueprintRevisionId === revised.revisionHistory.at(-1)!.revision));
  console.log("PASS blueprint revision rematerialization");
}

function testLiveSolShapeCoercion() {
  const rawPath = resolve(process.cwd(), "data/milestones/deck-synthesis/v4-17-slice3-live-sol/single-test-raw.json");
  if (!existsSync(rawPath)) {
    console.log("SKIP live Sol shape coercion — no saved raw artifact");
    return;
  }
  const saved = JSON.parse(readFileSync(rawPath, "utf8")) as { rawParsed?: Record<string, unknown> };
  assert.ok(saved.rawParsed && typeof saved.rawParsed === "object");
  const coerced = coerceSolBlueprintProposalRawV417(saved.rawParsed, { requestedBracket: 4 });
  const proposal = validateSolBlueprintProposalV417(coerced);
  assert.ok(proposal.packages.length >= 1);
  assert.ok(proposal.winArchitecture.length >= 1);
  assert.ok(proposal.functionalBudgets.length >= 3);
  assert.ok(typeof proposal.expectedPlayPattern === "string" && proposal.expectedPlayPattern.length > 20);
  console.log("PASS live Sol shape coercion");
}

function main() {
  testLiveSolShapeCoercion();
  testEloquentFailureRejected();
  testBlueprintRevisionRematerialization();
  console.log("\nAll PROFESSOR v4.17 Slice 3 deterministic checks passed.");
}

main();

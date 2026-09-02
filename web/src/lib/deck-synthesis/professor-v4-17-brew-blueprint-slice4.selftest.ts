/**
 * PROFESSOR v4.17 Slice 4 — physical allocation, semantic role truth, research precision.
 */
import assert from "node:assert/strict";
import { assessBlueprintSlotFeasibilityV417, computeBlueprintPhysicalLowerBoundV417 } from "./professor-blueprint-feasibility-v4-17-v1";
import { materializeRequirementsFromBlueprintV417 } from "./professor-requirement-materializer-v4-17-v1";
import { validateSolBlueprintProposalV417 } from "./professor-sol-blueprint-proposal-v4-17-v1";
import { buildBlueprintFromSolProposalV417 } from "./professor-sol-blueprint-live-v4-17-v1";
import { buildUltimeciaCommanderV417 } from "./professor-brew-blueprint-fixture-v4-17-v1";
import {
  evaluateCandidateAgainstRequirementV417,
  rankEligibleCandidatesForRequirementV417,
} from "./professor-requirement-candidate-v4-17-v1";
import { compileRequirementSemanticQueryV417 } from "./professor-requirement-semantic-query-v4-17-v1";
import { classifySemanticCoverage, normalizeSemanticConceptV417 } from "./professor-semantic-concept-normalizer-v4-17-v1";
import { evaluateResearchFindingsV417, buildResearchRequirementEvidenceV417 } from "./professor-blueprint-research-v4-17-v1";
import { isWinResearchableV417 } from "./professor-win-architecture-v4-17-v1";
import { applyBlueprintRevisionV417 } from "./professor-blueprint-revision-v4-17-v1";
import { bracketQualityContractV417 } from "./professor-brew-blueprint-v4-17-v1";
import { requirementBracketContractV417 } from "./professor-requirement-bracket-v4-17-v1";

function sigardaVoltronProposal() {
  return validateSolBlueprintProposalV417({
    strategicThesis: "Voltron Sigarda with hexproof protection",
    primaryStrategy: "Stack evasion and power on Sigarda",
    secondaryStrategy: "Backup combat threats",
    commanderExploit: "Sigarda grants hexproof to other permanents you control",
    independentEngine: "Standalone green-white value creatures and equipment",
    expectedPlayPattern: "Deploy Sigarda, suit up, attack for commander damage",
    strategicConcepts: ["voltron", "commander-damage clock"],
    packages: [
      {
        packageId: "pkg-voltron",
        name: "Voltron Enhancements",
        purpose: "Power, evasion, and protection for Sigarda",
        core: true,
        minimumPhysicalSlots: 8,
        preferredPhysicalSlots: 10,
        maximumPhysicalSlots: 12,
        minimumPhysicalContribution: 8,
        preferredPhysicalContribution: 10,
        requirementGroups: [
          { groupId: "g1", name: "setup", mandatory: true, relatedRequirementIds: ["req-v-setup"], minimumPhysicalSlots: 2, preferredPhysicalSlots: 3 },
          { groupId: "g2", name: "payoff", mandatory: true, relatedRequirementIds: ["req-v-payoff"], minimumPhysicalSlots: 2, preferredPhysicalSlots: 3 },
        ],
        requiredFunctions: ["ENGINE_ENABLER", "WIN_COMPONENT", "PROTECTION"],
        preferredFunctions: ["CARD_VELOCITY"],
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
      { category: "A", minimum: 8, maximum: 12, functionalCoverageSelected: 0 },
      { category: "B", minimum: 8, maximum: 12, functionalCoverageSelected: 0 },
      { category: "C", minimum: 8, maximum: 12, functionalCoverageSelected: 0 },
    ],
    accessNeeds: ["equipment tutors"],
    protectionNeeds: ["hexproof for commander"],
    weaknesses: ["board wipes"],
    strengths: ["hexproof"],
    dependencies: ["equipment"],
    bracketConstructionGuidance: ["B3 combat"],
    researchSeeds: ["Sword of Feast and Famine"],
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
  });
}

function testPhysicalAccountingNotSumOfFunctions() {
  const proposal = sigardaVoltronProposal();
  const blueprint = buildBlueprintFromSolProposalV417({
    commander: buildUltimeciaCommanderV417(),
    userIntent: { format: "Commander", bracket: 3, playStyle: "voltron", commanderDependence: "high", comboPolicy: "none" },
    proposal,
  });
  const { lowerBound } = computeBlueprintPhysicalLowerBoundV417(blueprint);
  assert.ok(lowerBound.naiveSum > lowerBound.correctedLowerBound, "naive sum should exceed corrected lower bound");
  assert.equal(lowerBound.correctedLowerBound, 8, "8-card package floor should not become 8+N function mins");
  console.log("PASS physical accounting — package floor not sum of functions");
}

function testRoleCompressionSharedPhysicalSlot() {
  const req = {
    requirementId: "req-shared",
    blueprintRevisionId: 0,
    family: "INTERACTION" as const,
    purpose: "stack interaction",
    priority: 80,
    coverageMode: "FUNCTIONAL_COVERAGE" as const,
    sharePolicy: "GLOBAL_SHAREABLE" as const,
    physicalSlotsNeeded: { min: 0, preferred: 1, max: 1 },
    requiredFunctions: ["INTERACTION" as const, "PROTECTION" as const],
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
    status: "OPEN" as const,
  };
  const counter = evaluateCandidateAgainstRequirementV417({
    requirement: { ...req, requiredFunctions: ["INTERACTION"], family: "INTERACTION" },
    compiledQuery: compileRequirementSemanticQueryV417({ ...req, requiredFunctions: ["INTERACTION"], family: "INTERACTION" }),
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
  assert.equal(counter.requirementEligible, true);
  assert.ok(counter.rolePrecision !== "FALSE_POSITIVE");
  console.log("PASS role compression — interaction card eligible");
}

function testProtectionActorTruth() {
  const protectionReq = {
    requirementId: "req-protect-engine",
    blueprintRevisionId: 0,
    family: "PROTECTION" as const,
    purpose: "Protection: protect engine permanent",
    priority: 80,
    coverageMode: "FUNCTIONAL_COVERAGE" as const,
    sharePolicy: "GLOBAL_SHAREABLE" as const,
    physicalSlotsNeeded: { min: 0, preferred: 1, max: 2 },
    requiredFunctions: ["PROTECTION" as const],
    requiredMechanics: ["HEXPROOF"],
    hardRequirements: [],
    preferredRequirements: [],
    acceptableFunctionalAlternatives: [],
    hardConstraints: [],
    softPreferences: [],
    packageIds: [],
    bracketQualityContract: bracketQualityContractV417(4),
    requirementBracketContract: requirementBracketContractV417("PROTECTION", 4),
    currentCoverage: 0,
    targetCoverage: 1,
    selectedCardIds: [],
    status: "OPEN" as const,
  };
  const compiled = compileRequirementSemanticQueryV417(protectionReq);
  for (const bad of [
    { name: "Darksteel Relic", text: "Indestructible", type: "Artifact" },
    { name: "Arcane Lighthouse", text: "Creatures your opponents control lose hexproof.", type: "Land" },
  ]) {
    const ev = evaluateCandidateAgainstRequirementV417({
      requirement: protectionReq,
      compiledQuery: compiled,
      candidate: { oracleId: `oid-${bad.name}`, name: bad.name, oracleText: bad.text, typeLine: bad.type, manaValue: 0, colors: [] },
      commanderColorIdentity: ["U", "B", "R"],
    });
    assert.equal(ev.requirementEligible, false, `${bad.name} must not qualify as protecting engine`);
    assert.equal(ev.rolePrecision, "FALSE_POSITIVE");
  }
  const good = evaluateCandidateAgainstRequirementV417({
    requirement: protectionReq,
    compiledQuery: compiled,
    candidate: {
      oracleId: "oid-snake",
      name: "Snakeskin Veil",
      oracleText: "Target permanent you control gains hexproof and indestructible until end of turn.",
      typeLine: "Instant",
      manaValue: 1,
      colors: ["G"],
    },
    commanderColorIdentity: ["G", "W"],
  });
  assert.equal(good.requirementEligible, true);
  assert.notEqual(good.rolePrecision, "FALSE_POSITIVE");
  console.log("PASS protection actor/object truth");
}

function testResearchPrecisionChallenge() {
  const fakeEvals = Array.from({ length: 12 }, (_, i) => ({
    version: "professor-requirement-candidate-v4-17-v1" as const,
    requirementId: "req-fake",
    oracleId: `oid-${i}`,
    cardName: i < 8 ? "Darksteel Relic" : "Snakeskin Veil",
    requirementEligible: true,
    satisfiedFunctions: ["PROTECTION" as const],
    unsatisfiedRequiredFunctions: [] as never[],
    hardConstraintPass: true,
    missionFit: 80,
    manaEfficiency: 80,
    reliability: 80,
    bracketQuality: 80,
    commanderSynergy: 55,
    independentValue: 60,
    roleCompression: 40,
    finalRequirementScore: 80,
    accepted: false,
    rejectionReason: null,
    functionalMatchType: "EXACT" as const,
    semanticEvidence: [],
    rolePrecision: (i < 8 ? "FALSE_POSITIVE" : "TRUE_ROLE_MATCH") as const,
  }));
  const evidence = buildResearchRequirementEvidenceV417({
    requirementId: "req-fake",
    family: "PROTECTION",
    evaluations: fakeEvals,
  });
  const findings = evaluateResearchFindingsV417({
    blueprint: {
      packages: [],
      slotFeasibility: { feasible: true, violations: [], remainingPhysicalSlots: 64, minimumPhysicalStillRequired: 0, naiveMinimumPhysicalStillRequired: 0, physicalLowerBound: { packageFloors: 0, distinctCardRequirements: 0, correctedLowerBound: 0, naiveSum: 0, inflationRemoved: 0 }, feasibilityTrace: [], status: "FEASIBLE" },
    } as never,
    retrievalResults: [{ requirementId: "req-fake", eligibleCount: 12, family: "PROTECTION", researchEvidence: evidence }],
  });
  assert.equal(findings[0]?.verdict, "CHALLENGE");
  console.log("PASS research precision — false positives → CHALLENGE not CONFIRM");
}

function testStrategicAbstractionNotGap() {
  const concept = normalizeSemanticConceptV417("graveyard as a second hand");
  assert.equal(concept.status, "STRATEGICALLY_SUPPORTED");
  assert.equal(concept.conceptKind, "STRATEGIC_ABSTRACTION");
  const coverage = classifySemanticCoverage([concept, normalizeSemanticConceptV417("surveil-driven card selection")]);
  assert.notEqual(coverage.strategicConceptSupport, "FAIL");
  console.log("PASS strategic abstraction composition");
}

function testCombatWinResearchable() {
  const win = isWinResearchableV417(
    "Increase Sigarda combat damage and connect repeatedly for 21 commander damage with evasion and protection",
  );
  assert.equal(win.researchable, true);
  assert.equal(win.type, "COMBAT_CLOCK");
  const vague = isWinResearchableV417("Recursive Permanent Loop");
  assert.equal(vague.researchable, false);
  console.log("PASS combat win researchability");
}

function testBlueprintRevisionRematerialization() {
  const proposal = sigardaVoltronProposal();
  const blueprint = buildBlueprintFromSolProposalV417({
    commander: buildUltimeciaCommanderV417(),
    userIntent: { format: "Commander", bracket: 3, playStyle: "test", commanderDependence: "high", comboPolicy: "none" },
    proposal,
  });
  const oldRev = blueprint.revisionHistory.at(-1)!.revision;
  const findings = evaluateResearchFindingsV417({
    blueprint,
    retrievalResults: [],
  }).filter((f) => f.verdict === "CHALLENGE" || f.verdict === "REJECT");
  const revised = applyBlueprintRevisionV417({
    blueprint,
    proposal,
    findings: findings.length ? findings : [{ findingId: "rf-test", targetType: "PACKAGE", targetId: "pkg-voltron", verdict: "CHALLENGE", summary: "test", evidence: [] }],
    summary: "Slice 4 revision test",
  });
  assert.ok(revised.revisionHistory.length > blueprint.revisionHistory.length);
  assert.ok(revised.openRequirements.every((r) => r.blueprintRevisionId > oldRev));
  console.log("PASS blueprint revision rematerialization");
}

function main() {
  testPhysicalAccountingNotSumOfFunctions();
  testRoleCompressionSharedPhysicalSlot();
  testProtectionActorTruth();
  testResearchPrecisionChallenge();
  testStrategicAbstractionNotGap();
  testCombatWinResearchable();
  testBlueprintRevisionRematerialization();
  console.log("\nAll PROFESSOR v4.17 Slice 4 acceptance checks passed.");
}

main();

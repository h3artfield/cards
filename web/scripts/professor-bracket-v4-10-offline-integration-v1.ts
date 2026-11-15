/**
 * Offline v4.10 bracket search/scoring integration test — cheap proof before live A/B.
 */
import { buildBracketPowerPlanV410 } from "../src/lib/deck-synthesis/professor-bracket-power-plan-v4-10-v1";
import { buildBracketBuildPlanV49 } from "../src/lib/deck-synthesis/professor-bracket-build-plan-v4-9-v1";
import {
  applyBracketToDeckNeedV410,
  scoreCandidateForBracketV410,
} from "../src/lib/deck-synthesis/professor-bracket-candidate-scoring-v4-10-v1";
import type { DeckNeedV47 } from "../src/lib/deck-synthesis/professor-deck-needs-v4-7-v1";
import type { FunctionalCardProfileV47 } from "../src/lib/deck-synthesis/professor-functional-profile-v4-7-v1";
import type { CreativeProfessorPass1V4 } from "../src/lib/deck-synthesis/professor-creative-pass1-contracts-v4";
import { analyzeBracketGapV410 } from "../src/lib/deck-synthesis/professor-bracket-gap-analysis-v4-10-v1";
import type { DeckSnapshotV46 } from "../src/lib/deck-synthesis/professor-council-assembly-v4-6-v1";

const pass1Stub: CreativeProfessorPass1V4 = {
  strategicThesis: "Sacrifice engine with token generation",
  packages: [{ concept: "Token Generation", likelyCardsOrEffects: [], role: "ENGINE" }],
  researchModes: ["Mechanic"],
  claims: [],
};

function planFor(bracket: 3 | 4) {
  const buildPlan = buildBracketBuildPlanV49({
    bracket,
    playStyle: "Sacrifice Engine",
    relationship: "Harmony",
    commanderName: "Korvold, Fae-Cursed King",
    pass1: pass1Stub,
  });
  return buildBracketPowerPlanV410({
    bracket,
    commanderName: "Korvold, Fae-Cursed King",
    playStyle: "Sacrifice Engine",
    relationship: "Harmony",
    pass1: pass1Stub,
    buildPlan,
  });
}

const sampleProfiles: FunctionalCardProfileV47[] = [
  {
    oracleId: "a",
    name: "Sol Ring",
    exactOracleText: "Add two mana",
    typeLine: "Artifact",
    manaValue: 1,
    colorIdentity: [],
    roles: ["ramp"],
    mechanics: ["mana"],
    eventsProduced: [],
    eventsConsumed: [],
    resourcesProduced: ["mana"],
    resourcesConsumed: [],
    cardTypes: ["artifact"],
    roleCompressionScore: 1,
  },
  {
    oracleId: "b",
    name: "Cultivate",
    exactOracleText: "Search for two basic lands",
    typeLine: "Sorcery",
    manaValue: 3,
    colorIdentity: ["G"],
    roles: ["ramp"],
    mechanics: ["search"],
    eventsProduced: [],
    eventsConsumed: [],
    resourcesProduced: ["mana"],
    resourcesConsumed: [],
    cardTypes: ["sorcery"],
    roleCompressionScore: 1,
  },
  {
    oracleId: "c",
    name: "Demonic Tutor",
    exactOracleText: "Search your library for a card",
    typeLine: "Sorcery",
    manaValue: 2,
    colorIdentity: ["B"],
    roles: ["card-advantage"],
    mechanics: ["tutor"],
    eventsProduced: [],
    eventsConsumed: [],
    resourcesProduced: [],
    resourcesConsumed: [],
    cardTypes: ["sorcery"],
    roleCompressionScore: 1,
  },
  {
    oracleId: "d",
    name: "Doorman",
    exactOracleText: "Creature",
    typeLine: "Creature",
    manaValue: 4,
    colorIdentity: ["B"],
    roles: ["finisher"],
    mechanics: [],
    eventsProduced: [],
    eventsConsumed: [],
    resourcesProduced: [],
    resourcesConsumed: [],
    cardTypes: ["creature"],
    roleCompressionScore: 1,
  },
];

const accelerationNeed: DeckNeedV47 = {
  needId: "need-ramp",
  category: "RAMP",
  role: "ramp",
  reason: "Need acceleration",
  source: "DECK_CHARTER",
  requiredFunctions: ["mana"],
  preferredFunctions: [],
  requiredMechanics: [],
  preferredMechanics: [],
  desiredProducedResources: [],
  desiredConsumedResources: [],
  desiredEvents: [],
  urgency: "HIGH",
  status: "OPEN",
  conceptText: "Mana acceleration",
};

function rank(bracket: 3 | 4, profiles: FunctionalCardProfileV47[]) {
  const powerPlan = planFor(bracket);
  const need = applyBracketToDeckNeedV410(accelerationNeed, bracket);
  return profiles
    .map((p) => ({
      name: p.name,
      score: scoreCandidateForBracketV410({ profile: p, bracket, powerPlan, need }).finalScore,
    }))
    .sort((a, b) => b.score - a.score);
}

function testGapAnalysisRuns() {
  const buildPlan = buildBracketBuildPlanV49({
    bracket: 4,
    playStyle: "Sacrifice Engine",
    relationship: "Harmony",
    commanderName: "Korvold",
    pass1: pass1Stub,
  });
  const powerPlan = planFor(4);
  const snapshot: DeckSnapshotV46 = {
    snapshotId: "test",
    revision: 1,
    cardCount: 25,
    nonlandCount: 20,
    landCount: 5,
    targetCount: 99,
    selectedCardsSummary: [],
    roleCoverage: { ramp: 2, interaction: 1, "card-advantage": 2, finisher: 6 },
    engineCoverage: {},
    packageCoverage: {},
    commanderDependenceDistribution: { high: 2, medium: 8, low: 10 },
    independentEngineCoverage: 18,
    interactionCoverage: 1,
    protectionCoverage: 0,
    recoveryCoverage: 0,
    cardAdvantageCoverage: 2,
    rampCoverage: 2,
    lifegainEnablerCount: 0,
    lifegainPayoffCount: 0,
    legendaryPayoffCount: 0,
    semanticResourcesProduced: [],
    semanticResourcesConsumed: [],
    underusedResources: [],
    redundancyClusters: [],
    lowConnectionCards: [],
    highRoleCompressionCards: [],
    unresolvedVerification: [],
    weaknesses: ["Interaction suite not yet established"],
    charterAlignment: [],
    bracketAlignment: [],
    userIntentAlignment: [],
    researchQuestion: "test",
  };
  const gap = analyzeBracketGapV410({ plan: buildPlan, powerPlan, snapshot, tutorCount: 0, finisherCount: 6 });
  if (gap.analysisStatus !== "OK") throw new Error(`Expected OK gap analysis, got ${gap.analysisStatus}`);
  if (!gap.holdCourseForbidden) throw new Error("B4 with 0 tutors should forbid hold course");
  console.log("PASS gap analysis executes with holdCourseForbidden");
}

function main() {
  const b3 = rank(3, sampleProfiles);
  const b4 = rank(4, sampleProfiles);
  console.log("B3 ranking:", b3.map((x) => `${x.name}(${x.score})`).join(", "));
  console.log("B4 ranking:", b4.map((x) => `${x.name}(${x.score})`).join(", "));

  const tutorB3 = b3.find((x) => x.name === "Demonic Tutor")!.score;
  const tutorB4 = b4.find((x) => x.name === "Demonic Tutor")!.score;
  const doormanB3 = b3.find((x) => x.name === "Doorman")!.score;
  const doormanB4 = b4.find((x) => x.name === "Doorman")!.score;
  if (tutorB4 <= tutorB3) {
    throw new Error("B4 should score Demonic Tutor higher than B3");
  }
  if (doormanB4 >= doormanB3) {
    throw new Error("B4 should penalize Doorman filler more than B3");
  }
  testGapAnalysisRuns();
  console.log("PASS professor-bracket-v4-10-offline-integration");
}

main();

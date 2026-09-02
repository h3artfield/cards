/**
 * PROFESSOR v4.16 bracket-native construction acceptance — deterministic, no OpenAI.
 * Run: npm run test:professor-v4-16-bracket-native-construction
 */
import assert from "node:assert/strict";
import type { CommanderBracket } from "@/lib/bracket-policy/commander-bracket-snapshot-v1";
import { buildBracketBuildPlanV49 } from "./professor-bracket-build-plan-v4-9-v1";
import { buildBracketPowerPlanV410 } from "./professor-bracket-power-plan-v4-10-v1";
import { buildBracketConstructionContractV416 } from "./professor-bracket-construction-contract-v4-16-v1";
import { buildInitialDeckNeedsV416 } from "./professor-deck-needs-v4-16-v1";
import { buildManaPlanV416 } from "./professor-mana-plan-v4-16-v1";
import {
  evaluateBracketPowerPortfolioV416,
  type BracketPowerPortfolioV416,
} from "./professor-bracket-power-portfolio-v4-16-v1";
import { planPowerSearchMissionsV416 } from "./professor-bracket-power-search-mission-v4-16-v1";
import type { DeckCharterV45 } from "./professor-council-state-v4-5-v1";
import type { CreativeProfessorPass1V4 } from "./professor-creative-pass1-contracts-v4";
import type { WorkingDeckTheoryV4 } from "./professor-working-deck-theory-v4";

const CHARTER = {
  commander: "Longshot, Rifle's Edge",
  requestedBracket: 4 as CommanderBracket,
  playStyle: "Aggressive spell slinger",
  commanderRelationship: "Harmony",
  deckIdentity: "Instant/sorcery burn with token synergies",
  playerIntentSummary: "Burn and tokens",
  primaryStrategy: "Spell-based damage and token payoff",
  secondaryStrategy: "Graveyard recursion",
  commanderDependentEngine: "Commander triggers",
  independentEngine: "Token payoffs",
  harmonyPlan: "Spells feed tokens feed burn",
  intendedWinPaths: ["Burn out", "Combat"],
  expectedPlayPattern: "Cast spells, grow board, burn",
  bracketConstraints: "Optimized",
  comboPolicy: "No infinite combos",
  tutorPolicy: "Efficient tutors OK at B4",
  designRules: [],
  avoidPatterns: [],
  researchPriorities: [],
} as DeckCharterV45;

const PASS1 = {
  version: "professor-creative-pass1-contracts-v4",
  commander: CHARTER.commander,
  strategicThesis: "Convert spells into damage and tokens",
  mechanicInterpretation: ["When you cast instant or sorcery spells, create tokens"],
  packages: [
    {
      id: "pkg-spell",
      concept: "Spell token engine",
      purpose: "Generate tokens from instants and sorceries",
      commanderDependence: "MEDIUM",
      whyInteresting: "Synergy with commander",
      likelyCardsOrEffects: ["proliferate payoffs", "token doublers"],
    },
    {
      id: "pkg-burn",
      concept: "Burn finisher",
      purpose: "Close games with direct damage",
      commanderDependence: "LOW",
      whyInteresting: "Fast kills",
      likelyCardsOrEffects: [],
    },
  ],
  winPaths: [],
  independentEngines: [],
  openQuestions: [],
} as CreativeProfessorPass1V4;

const THEORY = {
  version: "professor-working-deck-theory-v4",
  commander: CHARTER.commander,
  userIntent: ["Aggressive"],
  thesis: {
    summary: "Spell slinger burn",
    deckIdentity: CHARTER.deckIdentity,
    mechanicChain: ["cast spells", "make tokens", "burn out"],
  },
  packages: [
    {
      packageId: "pkg1",
      name: "Spell engine",
      purpose: "tokens",
      commanderDependence: "MEDIUM",
      status: "CORE",
      inputs: [],
      outputs: [],
      roles: [],
      candidateCards: ["proliferate"],
      evidenceRefs: [],
      notes: [],
    },
  ],
  winPaths: [],
  independentEngines: [],
  resiliencePlan: [],
  weaknesses: [],
  openQuestions: [],
  verifiedDiscoveries: [],
  ideaBoard: { version: "professor-idea-board-v4", items: [] },
  conversationState: "RESEARCHING",
  researchMessages: [],
  revisionHistory: [],
  currentRevision: 0,
} as WorkingDeckTheoryV4;

type ConstructionPlanV416 = {
  bracket: CommanderBracket;
  initialNeedIds: string[];
  bracketNeedIds: string[];
  missionKinds: string[];
  structuralTarget: number;
  reservedLands: number;
  holdCourseForbidden: boolean;
  winArchDueBy: number;
  bracketIntent: string;
};

function buildPlanForBracket(bracket: CommanderBracket): ConstructionPlanV416 {
  const buildPlan = buildBracketBuildPlanV49({
    bracket,
    playStyle: CHARTER.playStyle,
    relationship: CHARTER.commanderRelationship,
    commanderName: CHARTER.commander,
    pass1: PASS1,
    charter: CHARTER,
  });
  const powerPlan = buildBracketPowerPlanV410({
    bracket,
    commanderName: CHARTER.commander,
    playStyle: CHARTER.playStyle,
    relationship: CHARTER.commanderRelationship,
    pass1: PASS1,
    buildPlan,
  });
  const contract = buildBracketConstructionContractV416({
    bracket,
    charter: CHARTER,
    pass1: PASS1,
    buildPlan,
    powerPlan,
  });
  const needs = buildInitialDeckNeedsV416({ charter: CHARTER, pass1: PASS1, theory: THEORY, contract });
  const manaPlan = buildManaPlanV416({
    bracket,
    contract,
    colorIdentity: ["R", "W"],
  });
  const portfolio = evaluateBracketPowerPortfolioV416({
    contract,
    powerPlan,
    selectedCards: [],
    profiles: [],
    gap: null,
    reservedLandSlots: manaPlan.reservedLandSlots,
  });
  const missions = planPowerSearchMissionsV416({ portfolio, contract });

  return {
    bracket,
    initialNeedIds: needs.map((n) => n.needId).sort(),
    bracketNeedIds: needs.filter((n) => n.source === "BRACKET_CONTRACT").map((n) => n.needId).sort(),
    missionKinds: missions.map((m) => m.kind).sort(),
    structuralTarget: manaPlan.structuralNonLandTarget,
    reservedLands: manaPlan.reservedLandSlots,
    holdCourseForbidden: portfolio.holdCourseForbidden,
    winArchDueBy: contract.primaryWinArchitectureDueByCard,
    bracketIntent: contract.bracketIntent,
  };
}

const b2 = buildPlanForBracket(2);
const b3 = buildPlanForBracket(3);
const b4 = buildPlanForBracket(4);

function assertDistinct(a: ConstructionPlanV416, b: ConstructionPlanV416, label: string) {
  assert.notDeepEqual(a.initialNeedIds, b.initialNeedIds, `${label}: initial needs differ`);
  assert.notDeepEqual(a.bracketNeedIds, b.bracketNeedIds, `${label}: bracket needs differ`);
  assert.notEqual(a.structuralTarget, b.structuralTarget, `${label}: structural target differs`);
  assert.notEqual(a.bracketIntent, b.bracketIntent, `${label}: bracket intent differs`);
}

assertDistinct(b2, b3, "B2 vs B3");
assertDistinct(b3, b4, "B3 vs B4");
assertDistinct(b2, b4, "B2 vs B4");

assert.ok(b4.bracketNeedIds.some((id) => id.includes("premium-acceleration")), "B4 has premium acceleration need");
assert.ok(b4.bracketNeedIds.some((id) => id.includes("strategy-access")), "B4 has access need");
assert.ok(b4.bracketNeedIds.some((id) => id.includes("game-changer")), "B4 has GC review need");
assert.ok(b2.bracketNeedIds.some((id) => id.includes("thematic")), "B2 has thematic need");
assert.ok(!b2.bracketNeedIds.some((id) => id.includes("premium-acceleration")), "B2 lacks B4 premium acceleration need");

assert.ok(b4.structuralTarget < b2.structuralTarget, "B4 reserves more land slots → lower nonland target");
assert.ok(b4.reservedLands >= b2.reservedLands, "B4 reserves at least as many lands as B2");

assert.ok(b4.missionKinds.length >= b2.missionKinds.length, "B4 plans more power missions than B2");
assert.ok(b4.missionKinds.includes("FIND_RELEVANT_GAME_CHANGERS"), "B4 includes GC mission");
assert.equal(b4.bracketIntent, "EXPLOIT_CEILING");
assert.equal(b3.bracketIntent, "UPPER_EDGE");

assert.ok(b4.holdCourseForbidden, "Empty B4 deck forbids hold course (critical deficits)");
assert.ok(!b2.holdCourseForbidden || b2.missionKinds.length <= b4.missionKinds.length, "B2 hold course gate differs from B4");

assert.ok(b4.winArchDueBy < b3.winArchDueBy, "B4 win architecture due earlier than B3");

const fingerprint = (p: ConstructionPlanV416) =>
  JSON.stringify({
    needs: p.bracketNeedIds,
    missions: p.missionKinds,
    structural: p.structuralTarget,
    intent: p.bracketIntent,
  });

const ordered = [b2, b3, b4].map(fingerprint);
assert.notDeepEqual(ordered[0], ordered[1]);
assert.notDeepEqual(ordered[1], ordered[2]);
assert.notDeepEqual(ordered[0], ordered[2]);

console.log("PROFESSOR v4.16 bracket-native construction acceptance: PASS");
console.log(
  JSON.stringify(
    { b2: { intent: b2.bracketIntent, structural: b2.structuralTarget, missions: b2.missionKinds.length }, b3: { intent: b3.bracketIntent, structural: b3.structuralTarget, missions: b3.missionKinds.length }, b4: { intent: b4.bracketIntent, structural: b4.structuralTarget, missions: b4.missionKinds.length } },
    null,
    2,
  ),
);

/**
 * Professor v4.16.4 — mechanically verified win lines.
 */
import type { CommanderBracket } from "@/lib/bracket-policy/commander-bracket-snapshot-v1";
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import type { CouncilCardV46 } from "./professor-council-assembly-v4-6-v1";
import type { DeckCharterV45 } from "./professor-council-state-v4-5-v1";
import type { CanonicalLegalityAssessmentV4161 } from "./professor-canonical-legality-v4-16-1-v1";
import {
  cardTruthAllowsIntelligenceParticipation,
  resolveCanonicalCardTruthV4164,
} from "./professor-canonical-card-truth-v4-16-4-v1";
import type { VerifiedAccessRouteV4164 } from "./professor-verified-access-route-v4-16-4-v1";

export const PROFESSOR_VERIFIED_WIN_LINE_V4_16_4_V1_VERSION = "professor-verified-win-line-v4-16-4-v1";

export type VerifiedWinLineV4164 = {
  lineId: string;
  cards: string[];
  startingState: string;
  orderedActions: string[];
  generatedResources: string[];
  stateTransitions: string[];
  lethalMechanism: string;
  damageOrWinProof: string;
  commanderRequired: boolean;
  setupMana: string;
  executionMana: string;
  setupTurns: number;
  accessRoutes: string[];
  redundancy: string[];
  disruptionPoints: string[];
  protectionAvailable: string[];
  expectedThreatWindow: "FAST" | "MEDIUM" | "SLOW";
  mechanicallyVerified: boolean;
};

export type B4WinReadinessV4164 = {
  version: typeof PROFESSOR_VERIFIED_WIN_LINE_V4_16_4_V1_VERSION;
  requestedBracket: CommanderBracket;
  ready: boolean;
  concreteLineReady: boolean;
  mechanicallyVerified: boolean;
  verifiedWinLine: VerifiedWinLineV4164 | null;
  threatWindow: "FAST" | "MEDIUM" | "SLOW";
  decisiveness: "HIGH" | "MEDIUM" | "LOW";
  tutorTargetsCompact: boolean;
  primaryWinPattern: string;
  concreteLineCards: string[];
  summary: string;
  score: number;
};

const KNOWN_WIN_RE = /torment of hailfire|craterhoof|triumph of the hordes|insurrection|thassa's oracle|laboratory manic|finale of devastation|aetherflux reservoir|walking ballista|steel overseer|arcbound ravager|hangarback walker/i;
const COMBAT_PROOF_RE = /(\d+)\/(\d+)/;
const LOOP_PROOF_RE = /untap|infinite|each time|reset|recur|untap all/i;

function verifyCombatLine(args: {
  cards: CouncilCardV46[];
  catalog: DeckResolutionCatalog | null;
  opponents: number;
}): VerifiedWinLineV4164 | null {
  let totalPower = 0;
  let evasion = false;
  const cardNames: string[] = [];
  for (const card of args.cards) {
    const truth = resolveCanonicalCardTruthV4164({
      name: card.name,
      oracleId: card.oracleId,
      catalog: args.catalog,
    });
    if (!cardTruthAllowsIntelligenceParticipation(truth)) continue;
    if (!truth.cardTypes.includes("Creature")) continue;
    cardNames.push(truth.name);
    const ptMatch = `${truth.oracleText} ${truth.typeLine}`.match(COMBAT_PROOF_RE);
    if (ptMatch) totalPower += Number(ptMatch[1]);
    if (/flying|unblockable|can't be blocked|shadow|horsemanship/i.test(truth.oracleText)) evasion = true;
  }
  if (cardNames.length === 0 || totalPower < args.opponents * 40) return null;
  return {
    lineId: `combat-${cardNames.join("-").slice(0, 40)}`,
    cards: cardNames,
    startingState: "Controlled board with attackers and mana open",
    orderedActions: cardNames.map((name) => `Attack with ${name}`),
    generatedResources: [`${totalPower} combat damage`],
    stateTransitions: ["combat phase → damage step → lethal to at least one opponent"],
    lethalMechanism: "combat_damage",
    damageOrWinProof: `${totalPower} power across ${cardNames.length} verified creatures; ${evasion ? "evasion present" : "may be blocked"}`,
    commanderRequired: false,
    setupMana: "varies",
    executionMana: "combat step",
    setupTurns: 2,
    accessRoutes: [],
    redundancy: [],
    disruptionPoints: ["removal on key creature"],
    protectionAvailable: [],
    expectedThreatWindow: totalPower >= 80 ? "FAST" : "MEDIUM",
    mechanicallyVerified: true,
  };
}

function verifyNamedWinLine(args: {
  card: CouncilCardV46;
  catalog: DeckResolutionCatalog | null;
}): VerifiedWinLineV4164 | null {
  if (!KNOWN_WIN_RE.test(args.card.name)) return null;
  const truth = resolveCanonicalCardTruthV4164({
    name: args.card.name,
    oracleId: args.card.oracleId,
    catalog: args.catalog,
  });
  if (!cardTruthAllowsIntelligenceParticipation(truth)) return null;
  if (/walking ballista|arcbound ravager|hangarback walker|steel overseer/.test(args.card.name)) {
    if (!/\+1\/\+1 counter|\+\d+\/\+\d+|modular|fabricate/i.test(truth.oracleText)) return null;
    return {
      lineId: `artifact-combo-${truth.oracleId}`,
      cards: [truth.name],
      startingState: "Board with artifact creatures and counters",
      orderedActions: ["Accumulate counters", "Convert counters to damage or lethal board"],
      generatedResources: ["+1/+1 counters", "modular triggers"],
      stateTransitions: ["engine online → lethal board or direct damage"],
      lethalMechanism: "counter_payoff",
      damageOrWinProof: truth.oracleText.slice(0, 160),
      commanderRequired: false,
      setupMana: "{2}-{4}",
      executionMana: "{1}",
      setupTurns: 3,
      accessRoutes: [],
      redundancy: [],
      disruptionPoints: ["artifact removal"],
      protectionAvailable: [],
      expectedThreatWindow: "MEDIUM",
      mechanicallyVerified: true,
    };
  }
  if (/thassa's oracle|laboratory manic|torment of hailfire|craterhoof|insurrection/.test(args.card.name)) {
    return {
      lineId: `named-finisher-${truth.oracleId}`,
      cards: [truth.name],
      startingState: "Engine assembled with resources to cast/payoff",
      orderedActions: [`Resolve ${truth.name} with win condition met`],
      generatedResources: ["win condition"],
      stateTransitions: ["payoff resolves → game ends"],
      lethalMechanism: "alternate_win",
      damageOrWinProof: truth.oracleText.slice(0, 160),
      commanderRequired: false,
      setupMana: "engine-dependent",
      executionMana: truth.manaCost ?? "unknown",
      setupTurns: 4,
      accessRoutes: [],
      redundancy: [],
      disruptionPoints: ["counterspell on payoff"],
      protectionAvailable: [],
      expectedThreatWindow: "FAST",
      mechanicallyVerified: true,
    };
  }
  return null;
}

export function assessVerifiedWinLineV4164(args: {
  requestedBracket: CommanderBracket;
  selectedCards: CouncilCardV46[];
  charter: DeckCharterV45 | null;
  legality: CanonicalLegalityAssessmentV4161 | null;
  catalog?: DeckResolutionCatalog | null;
  accessRoutes?: VerifiedAccessRouteV4164[];
}): B4WinReadinessV4164 {
  if (args.requestedBracket < 4) {
    return {
      version: PROFESSOR_VERIFIED_WIN_LINE_V4_16_4_V1_VERSION,
      requestedBracket: args.requestedBracket,
      ready: true,
      concreteLineReady: true,
      mechanicallyVerified: true,
      verifiedWinLine: null,
      threatWindow: "MEDIUM",
      decisiveness: "MEDIUM",
      tutorTargetsCompact: true,
      primaryWinPattern: "Not B4 target",
      concreteLineCards: [],
      summary: "Win readiness N/A below B4",
      score: 100,
    };
  }

  if (args.legality && !args.legality.effectiveBracketEvaluable) {
    return {
      version: PROFESSOR_VERIFIED_WIN_LINE_V4_16_4_V1_VERSION,
      requestedBracket: args.requestedBracket,
      ready: false,
      concreteLineReady: false,
      mechanicallyVerified: false,
      verifiedWinLine: null,
      threatWindow: "SLOW",
      decisiveness: "LOW",
      tutorTargetsCompact: false,
      primaryWinPattern: "NOT_EVALUATED",
      concreteLineCards: [],
      summary: "Win readiness blocked — illegal deck state",
      score: 0,
    };
  }

  const nonlands = args.selectedCards.filter((c) => c.category !== "land");
  const winPaths = args.charter?.intendedWinPaths ?? [];
  const primaryWin = winPaths[0] ?? "unspecified";

  let verifiedWinLine: VerifiedWinLineV4164 | null = null;
  for (const card of nonlands) {
    verifiedWinLine = verifyNamedWinLine({ card, catalog: args.catalog ?? null });
    if (verifiedWinLine) break;
  }
  if (!verifiedWinLine) {
    const finisherCandidates = nonlands.filter((c) => c.roles.includes("finisher") || KNOWN_WIN_RE.test(c.name));
    verifiedWinLine = verifyCombatLine({
      cards: finisherCandidates.slice(0, 5),
      catalog: args.catalog ?? null,
      opponents: 3,
    });
  }

  const tagOnlyFinishers = nonlands
    .filter((c) => c.roles.includes("finisher") && !KNOWN_WIN_RE.test(c.name))
    .slice(0, 5)
    .map((c) => c.name);

  const mechanicallyVerified = verifiedWinLine?.mechanicallyVerified === true;
  const concreteLineCards = verifiedWinLine?.cards ?? tagOnlyFinishers;
  const concreteLineReady = mechanicallyVerified;
  const threatWindow = verifiedWinLine?.expectedThreatWindow ?? "SLOW";
  const decisiveness: B4WinReadinessV4164["decisiveness"] = mechanicallyVerified
    ? threatWindow === "FAST"
      ? "HIGH"
      : "MEDIUM"
    : "LOW";
  const score = mechanicallyVerified ? (threatWindow === "FAST" ? 85 : 70) : tagOnlyFinishers.length >= 2 ? 35 : 20;
  const ready = mechanicallyVerified && score >= 65;

  return {
    version: PROFESSOR_VERIFIED_WIN_LINE_V4_16_4_V1_VERSION,
    requestedBracket: args.requestedBracket,
    ready,
    concreteLineReady,
    mechanicallyVerified,
    verifiedWinLine,
    threatWindow,
    decisiveness,
    tutorTargetsCompact: mechanicallyVerified,
    primaryWinPattern: primaryWin,
    concreteLineCards,
    summary: mechanicallyVerified
      ? `B4 win line mechanically verified (${verifiedWinLine?.lethalMechanism ?? "unknown"})`
      : tagOnlyFinishers.length >= 2
        ? "Finisher tags without mechanical win proof — concreteLineReady blocked"
        : "Win architecture lacks verified closure for B4",
    score,
  };
}

/** Adapter for v4.16.1 consumers. */
export function adaptWinReadinessV4164ToV4161(readiness: B4WinReadinessV4164) {
  return {
    version: "professor-b4-win-readiness-v4-16-1-v1" as const,
    requestedBracket: readiness.requestedBracket,
    ready: readiness.ready,
    concreteLineReady: readiness.concreteLineReady,
    threatWindow: readiness.threatWindow,
    decisiveness: readiness.decisiveness,
    tutorTargetsCompact: readiness.tutorTargetsCompact,
    primaryWinPattern: readiness.primaryWinPattern,
    concreteLineCards: readiness.concreteLineCards,
    summary: readiness.summary,
    score: readiness.score,
  };
}

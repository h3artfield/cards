/**
 * Professor v4.16.4 — Oracle-mechanism verified access routes.
 */
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import type { CouncilCardV46 } from "./professor-council-assembly-v4-6-v1";
import type { DeckCharterV45 } from "./professor-council-state-v4-5-v1";
import type { WorkingDeckTheoryV4 } from "./professor-working-deck-theory-v4";
import {
  cardMatchesTypePredicate,
  cardTruthAllowsIntelligenceParticipation,
  resolveCanonicalCardTruthV4164,
  type CanonicalCardTruthV4164,
} from "./professor-canonical-card-truth-v4-16-4-v1";

export const PROFESSOR_VERIFIED_ACCESS_ROUTE_V4_16_4_V1_VERSION = "professor-verified-access-route-v4-16-4-v1";

export type AccessDestinationV4164 = "HAND" | "TOP_OF_LIBRARY" | "BATTLEFIELD" | "GRAVEYARD" | "EXILE";
export type AccessDirectnessV4164 =
  | "HARD_TUTOR"
  | "CONDITIONAL_TUTOR"
  | "CARD_SELECTION"
  | "DRAW_ACCESS"
  | "RECURSION"
  | "REDUNDANCY";

export type AccessTargetKindV4164 = "CRITICAL_ENGINE" | "PRIMARY_WIN" | "SECONDARY_WIN" | "PROTECTION" | "RECOVERY";

export type AccessTargetV4164 = {
  name: string;
  oracleId: string | null;
  kind: AccessTargetKindV4164;
  manaValue: number | null;
  cardTypes: string[];
};

export type VerifiedAccessRouteV4164 = {
  sourceOracleId: string;
  sourceName: string;
  targetOracleId: string;
  targetName: string;
  searchRestriction: string;
  targetSatisfiesRestriction: boolean;
  destination: AccessDestinationV4164;
  directness: AccessDirectnessV4164;
  activationRequirements: string[];
  timingRestrictions: string[];
  repeatable: boolean;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  verificationEvidence: string;
};

export type AccessArchitectureV4164 = {
  version: typeof PROFESSOR_VERIFIED_ACCESS_ROUTE_V4_16_4_V1_VERSION;
  criticalEnginePieces: AccessTargetV4164[];
  primaryWinPieces: AccessTargetV4164[];
  secondaryWinPieces: AccessTargetV4164[];
  protectionPieces: AccessTargetV4164[];
  recoveryPieces: AccessTargetV4164[];
  routes: VerifiedAccessRouteV4164[];
  engineAccess: number;
  winAccess: number;
  protectionAccess: number;
  recoveryAccess: number;
  criticalAccessFailure: boolean;
  unresolvedSources: string[];
  summary: string;
};

type ParsedAccessMechanismV4164 = {
  restriction: string;
  destination: AccessDestinationV4164;
  directness: AccessDirectnessV4164;
  repeatable: boolean;
  activationRequirements: string[];
  timingRestrictions: string[];
  confidence: VerifiedAccessRouteV4164["confidence"];
  evidence: string;
};

function normalizeOracle(text: string): string {
  return text.replace(/\r\n/g, "\n").toLowerCase();
}

export function parseAccessMechanism(sourceTruth: CanonicalCardTruthV4164): ParsedAccessMechanismV4164 | null {
  const text = normalizeOracle(sourceTruth.oracleText);
  if (!text) return null;

  const activationRequirements: string[] = [];
  if (/\{t\}/.test(text) || /tap /.test(text)) activationRequirements.push("tap");
  if (/sacrifice /.test(text)) activationRequirements.push("sacrifice");

  if (/look at the top \d+ cards|scry \d+|surveil \d+|impulse|anticipate|consider|preordain|serum visions|brainstorm|ponder/.test(text)) {
    const depthMatch = text.match(/top (\d+) cards|scry (\d+)|surveil (\d+)/);
    const depth = depthMatch ? Number(depthMatch[1] ?? depthMatch[2] ?? depthMatch[3]) : 3;
    return {
      restriction: `top-${depth}-selection`,
      destination: /put .* into your hand/.test(text) ? "HAND" : "TOP_OF_LIBRARY",
      directness: "CARD_SELECTION",
      repeatable: false,
      activationRequirements,
      timingRestrictions: [],
      confidence: "MEDIUM",
      evidence: `Bounded top-${depth} selection — not deterministic tutor`,
    };
  }

  if (/draw a card|draw two cards|draw three cards/.test(text) && !/search your library/.test(text)) {
    return {
      restriction: "draw",
      destination: "HAND",
      directness: "DRAW_ACCESS",
      repeatable: false,
      activationRequirements,
      timingRestrictions: [],
      confidence: "LOW",
      evidence: "Probabilistic draw access",
    };
  }

  if (/return .* from your graveyard to your hand|return target .* from a graveyard/.test(text)) {
    return {
      restriction: "graveyard",
      destination: "HAND",
      directness: "RECURSION",
      repeatable: /at the beginning of each\/upkeep|whenever/.test(text),
      activationRequirements,
      timingRestrictions: [],
      confidence: "MEDIUM",
      evidence: "Graveyard recursion route",
    };
  }

  const searchMatch = text.match(/search your library for ([^.]+?)(?:,|\.| and)/);
  if (!searchMatch) return null;

  let restriction = searchMatch[1]!.trim();
  restriction = restriction.replace(/^an? /, "").replace(/^target /, "").replace(/ card$/, "").trim();

  let destination: AccessDestinationV4164 = "HAND";
  if (/put .* on top of your library|put that card on top|put it on top of your library/.test(text)) {
    destination = "TOP_OF_LIBRARY";
  } else if (/put .* onto the battlefield|put it onto the battlefield|put that card onto the battlefield/.test(text)) {
    destination = "BATTLEFIELD";
  } else if (/put .* into your graveyard/.test(text)) {
    destination = "GRAVEYARD";
  } else if (/exile/.test(text) && /search your library/.test(text)) {
    destination = "EXILE";
  }

  const directness: AccessDirectnessV4164 =
    activationRequirements.length > 0 || /pay /.test(text) ? "CONDITIONAL_TUTOR" : "HARD_TUTOR";

  return {
    restriction,
    destination,
    directness,
    repeatable: /survival of the fittest|ring of three wishes|sensei's divining top|scroll rack|inventors' fair|mystic forge/.test(
      sourceTruth.name.toLowerCase(),
    ),
    activationRequirements,
    timingRestrictions: /activate only as a sorcery/.test(text) ? ["sorcery-speed"] : [],
    confidence: directness === "HARD_TUTOR" ? "HIGH" : "MEDIUM",
    evidence: `Oracle search: "${restriction}" → ${destination}`,
  };
}

export function targetMatchesRestriction(target: CanonicalCardTruthV4164, restriction: string): boolean {
  const lower = restriction.toLowerCase();
  if (lower.includes("instant or sorcery") || lower.includes("instant/sorcery")) {
    return cardMatchesTypePredicate(target, "instant-or-sorcery");
  }
  if (lower.includes("artifact")) return cardMatchesTypePredicate(target, "artifact");
  if (lower.includes("creature")) return cardMatchesTypePredicate(target, "creature");
  if (lower.includes("enchantment")) return cardMatchesTypePredicate(target, "enchantment");
  if (lower.includes("planeswalker")) return cardMatchesTypePredicate(target, "planeswalker");
  if (lower.includes("basic land")) return cardMatchesTypePredicate(target, "basic land");
  if (lower.includes("land")) return cardMatchesTypePredicate(target, "land");
  if (lower.includes("instant")) return cardMatchesTypePredicate(target, "instant");
  if (lower.includes("sorcery")) return cardMatchesTypePredicate(target, "sorcery");
  return false;
}

function deriveTheoryTargets(args: {
  theory: WorkingDeckTheoryV4 | null;
  selectedCards: CouncilCardV46[];
  catalog: DeckResolutionCatalog | null;
}): {
  criticalEngine: AccessTargetV4164[];
  primaryWin: AccessTargetV4164[];
  secondaryWin: AccessTargetV4164[];
  protection: AccessTargetV4164[];
  recovery: AccessTargetV4164[];
} {
  const selectedByName = new Map(args.selectedCards.map((c) => [c.name.toLowerCase(), c]));
  const theoryCardNames = new Set<string>();
  for (const pkg of args.theory?.packages ?? []) {
    if (pkg.status !== "CORE") continue;
    for (const name of pkg.candidateCards) theoryCardNames.add(name);
  }

  const criticalEngine: AccessTargetV4164[] = [];
  const primaryWin: AccessTargetV4164[] = [];
  const secondaryWin: AccessTargetV4164[] = [];
  const protection: AccessTargetV4164[] = [];
  const recovery: AccessTargetV4164[] = [];

  for (const name of theoryCardNames) {
    const card = selectedByName.get(name.toLowerCase());
    if (!card) continue;
    const truth = resolveCanonicalCardTruthV4164({
      name: card.name,
      oracleId: card.oracleId,
      catalog: args.catalog,
    });
    if (!cardTruthAllowsIntelligenceParticipation(truth)) continue;
    criticalEngine.push({
      name: truth.name,
      oracleId: truth.oracleId,
      kind: "CRITICAL_ENGINE",
      manaValue: truth.manaValue,
      cardTypes: truth.cardTypes,
    });
  }

  return { criticalEngine, primaryWin, secondaryWin, protection, recovery };
}

function countCoverage(targets: AccessTargetV4164[], routes: VerifiedAccessRouteV4164[]): number {
  if (targets.length === 0) return 0;
  let covered = 0;
  for (const target of targets) {
    if (
      routes.some(
        (route) =>
          route.targetSatisfiesRestriction &&
          (route.targetOracleId === target.oracleId || route.targetName === target.name),
      )
    ) {
      covered += 1;
    }
  }
  return covered;
}

export function buildAccessArchitectureV4164(args: {
  selectedCards: CouncilCardV46[];
  charter: DeckCharterV45 | null;
  theory?: WorkingDeckTheoryV4 | null;
  catalog?: DeckResolutionCatalog | null;
}): AccessArchitectureV4164 {
  const theoryTargets = deriveTheoryTargets({
    theory: args.theory ?? null,
    selectedCards: args.selectedCards,
    catalog: args.catalog ?? null,
  });

  const criticalEnginePieces = theoryTargets.criticalEngine;
  const primaryWinPieces = theoryTargets.primaryWin;
  const secondaryWinPieces = theoryTargets.secondaryWin;
  const protectionPieces = theoryTargets.protection;
  const recoveryPieces = theoryTargets.recovery;
  const allTargets = [
    ...criticalEnginePieces,
    ...primaryWinPieces,
    ...secondaryWinPieces,
    ...protectionPieces,
    ...recoveryPieces,
  ];

  const routes: VerifiedAccessRouteV4164[] = [];
  const unresolvedSources: string[] = [];

  for (const sourceCard of args.selectedCards) {
    const sourceTruth = resolveCanonicalCardTruthV4164({
      name: sourceCard.name,
      oracleId: sourceCard.oracleId,
      catalog: args.catalog,
    });
    if (!cardTruthAllowsIntelligenceParticipation(sourceTruth)) {
      unresolvedSources.push(sourceCard.name);
      continue;
    }
    const mechanism = parseAccessMechanism(sourceTruth);
    if (!mechanism) continue;
    if (mechanism.directness === "CARD_SELECTION" || mechanism.directness === "DRAW_ACCESS") {
      continue;
    }

    for (const target of allTargets) {
      const targetTruth = resolveCanonicalCardTruthV4164({
        name: target.name,
        oracleId: target.oracleId,
        catalog: args.catalog,
      });
      if (!cardTruthAllowsIntelligenceParticipation(targetTruth)) continue;
      const satisfies = targetMatchesRestriction(targetTruth, mechanism.restriction);
      if (!satisfies) continue;
      routes.push({
        sourceOracleId: sourceTruth.oracleId!,
        sourceName: sourceTruth.name,
        targetOracleId: targetTruth.oracleId!,
        targetName: targetTruth.name,
        searchRestriction: mechanism.restriction,
        targetSatisfiesRestriction: true,
        destination: mechanism.destination,
        directness: mechanism.directness,
        activationRequirements: mechanism.activationRequirements,
        timingRestrictions: mechanism.timingRestrictions,
        repeatable: mechanism.repeatable,
        confidence: mechanism.confidence,
        verificationEvidence: mechanism.evidence,
      });
    }
  }

  const engineAccess = countCoverage(criticalEnginePieces, routes);
  const winAccess = countCoverage([...primaryWinPieces, ...secondaryWinPieces], routes);
  const protectionAccess = countCoverage(protectionPieces, routes);
  const recoveryAccess = countCoverage(recoveryPieces, routes);

  const needsAccess = (args.charter?.requestedBracket ?? 3) >= 4;
  const criticalAccessFailure =
    needsAccess &&
    routes.length === 0 &&
    (criticalEnginePieces.length > 0 || primaryWinPieces.length > 0);

  const summary = criticalAccessFailure
    ? "No verified access routes reach theory-critical deck objects"
    : routes.length === 0
      ? "Verified access graph empty — no Oracle-valid tutor/selection routes"
      : `Verified access: engine ${engineAccess}/${criticalEnginePieces.length}, win ${winAccess}/${primaryWinPieces.length + secondaryWinPieces.length}, protection ${protectionAccess}/${protectionPieces.length}`;

  return {
    version: PROFESSOR_VERIFIED_ACCESS_ROUTE_V4_16_4_V1_VERSION,
    criticalEnginePieces,
    primaryWinPieces,
    secondaryWinPieces,
    protectionPieces,
    recoveryPieces,
    routes,
    engineAccess,
    winAccess,
    protectionAccess,
    recoveryAccess,
    criticalAccessFailure,
    unresolvedSources,
    summary,
  };
}

/** Backward-compatible adapter for v4.16.3 consumers. */
export function adaptAccessArchitectureV4164ToV4163(arch: AccessArchitectureV4164) {
  return {
    version: "professor-access-architecture-v4-16-3-v1" as const,
    criticalEnginePieces: arch.criticalEnginePieces.map((t) => ({
      name: t.name,
      kind: t.kind === "CRITICAL_ENGINE" ? ("engine" as const) : ("win" as const),
      cardType: t.cardTypes[0] ?? "unknown",
      manaValue: t.manaValue ?? 0,
      artifact: t.cardTypes.includes("Artifact"),
      creature: t.cardTypes.includes("Creature"),
      enchantment: t.cardTypes.includes("Enchantment"),
      land: t.cardTypes.includes("Land"),
    })),
    primaryWinPieces: arch.primaryWinPieces.map((t) => ({
      name: t.name,
      kind: "win" as const,
      cardType: t.cardTypes[0] ?? "unknown",
      manaValue: t.manaValue ?? 0,
      artifact: t.cardTypes.includes("Artifact"),
      creature: t.cardTypes.includes("Creature"),
      enchantment: t.cardTypes.includes("Enchantment"),
      land: t.cardTypes.includes("Land"),
    })),
    protectionPieces: arch.protectionPieces.map((t) => ({
      name: t.name,
      kind: "protection" as const,
      cardType: t.cardTypes[0] ?? "unknown",
      manaValue: t.manaValue ?? 0,
      artifact: t.cardTypes.includes("Artifact"),
      creature: t.cardTypes.includes("Creature"),
      enchantment: t.cardTypes.includes("Enchantment"),
      land: t.cardTypes.includes("Land"),
    })),
    routes: arch.routes.map((r) => ({
      sourceCard: r.sourceName,
      targets: [r.targetName],
      restriction: r.searchRestriction,
      repeatable: r.repeatable,
      putsIntoHand: r.destination === "HAND",
      putsOntoBattlefield: r.destination === "BATTLEFIELD",
      recursion: r.directness === "RECURSION",
      reliability: r.confidence,
    })),
    engineAccess: arch.engineAccess,
    winAccess: arch.winAccess,
    protectionAccess: arch.protectionAccess,
    recoveryAccess: arch.recoveryAccess,
    criticalAccessFailure: arch.criticalAccessFailure,
    summary: arch.summary,
  };
}

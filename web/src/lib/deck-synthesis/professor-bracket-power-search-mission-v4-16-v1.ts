/**
 * Bracket Power Search Mission v4.16 — dedicated Research during Council assembly.
 */
import type { CommanderBracket } from "@/lib/bracket-policy/commander-bracket-snapshot-v1";
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import type { CouncilCardV46 } from "./professor-council-assembly-v4-6-v1";
import type { DeckCharterV45 } from "./professor-council-state-v4-5-v1";
import type { DeckNeedV47 } from "./professor-deck-needs-v4-7-v1";
import type { BracketConstructionContractV416 } from "./professor-bracket-construction-contract-v4-16-v1";
import type { BracketPowerPortfolioV416 } from "./professor-bracket-power-portfolio-v4-16-v1";
import type { BracketPowerPlanV410 } from "./professor-bracket-power-plan-v4-10-v1";
import { buildFunctionalCardProfileV47 } from "./professor-functional-profile-v4-7-v1";
import { discoverTutorsForMissionV412 } from "./professor-bracket-upgrade-swap-v4-12-v1";
import { getLegalRelevantGameChangersV411 } from "./professor-game-changer-discovery-v4-11-v1";
import type { RankedTutorCandidateV412 } from "./professor-tutor-ranking-v4-12-v1";

export const PROFESSOR_BRACKET_POWER_SEARCH_MISSION_V4_16_V1_VERSION =
  "professor-bracket-power-search-mission-v4-16-v1";

export type BracketPowerSearchMissionKindV416 =
  | "FIND_ACCESS"
  | "FIND_FAST_ACCELERATION"
  | "FIND_PREMIUM_INTERACTION"
  | "FIND_PROTECTION"
  | "FIND_RELEVANT_GAME_CHANGERS"
  | "FIND_COMPACT_WIN_PACKAGE"
  | "IMPROVE_MANA_QUALITY"
  | "REDUCE_DEAD_CARD_RATE";

export type BracketPowerSearchMissionV416 = {
  missionId: string;
  kind: BracketPowerSearchMissionKindV416;
  reason: string;
  targetDimension: string;
  priority: "CRITICAL" | "HIGH";
};

export type BracketPowerSearchReportV416 = {
  mission: BracketPowerSearchMissionV416;
  candidates: string[];
  rejectedCandidates: Array<{ name: string; reason: string }>;
  selectedCandidates: string[];
  reason: string;
  portfolioEffect: string;
  suppressedDuplicate?: boolean;
};

export type BracketPowerSearchHistoryV416 = {
  candidatesAlreadyConsidered: string[];
  candidatesAlreadySelected: string[];
  candidatesAlreadyRejected: Array<{ name: string; reason: string }>;
  completedMissionKinds: BracketPowerSearchMissionKindV416[];
  gameChangerReviewComplete: boolean;
};

function candidateSetKey(names: readonly string[]): string {
  return [...names].sort().join("|");
}

function tutorToCouncilCard(tutor: RankedTutorCandidateV412, revision: number): CouncilCardV46 {
  return {
    cardId: `card-${tutor.oracleId}`,
    oracleId: tutor.oracleId,
    name: tutor.name,
    proposedBy: "RESEARCH",
    origin: "ORACLE_SEARCH",
    proposalReason: tutor.reason,
    functions: ["tutor", "access"],
    roles: ["card-advantage", "ramp"],
    packages: [],
    engines: [],
    commanderDependence: "LOW",
    worksWithoutCommander: "HIGH",
    semanticConnections: [],
    oracleVerified: true,
    legalityVerified: true,
    colorIdentityVerified: true,
    criticStatus: "CHARTER_OK",
    status: "CANDIDATE",
    addedAtRevision: revision,
    lastReviewedRevision: revision,
    category: "instant",
    manaValue: tutor.manaValue,
  };
}

export function planPowerSearchMissionsV416(args: {
  portfolio: BracketPowerPortfolioV416;
  contract: BracketConstructionContractV416;
  history?: BracketPowerSearchHistoryV416 | null;
}): BracketPowerSearchMissionV416[] {
  const missions: BracketPowerSearchMissionV416[] = [];
  let idx = 0;

  const push = (kind: BracketPowerSearchMissionKindV416, dim: string, priority: "CRITICAL" | "HIGH", reason: string) => {
    missions.push({
      missionId: `bpsm-${kind.toLowerCase()}-${idx++}`,
      kind,
      reason,
      targetDimension: dim,
      priority,
    });
  };

  if (args.portfolio.criticalDeficits.includes("ACCESS")) {
    push("FIND_ACCESS", "ACCESS", "CRITICAL", "Access below B4 floor — dedicated tutor/access search");
  }
  if (args.portfolio.criticalDeficits.includes("ACCELERATION")) {
    push("FIND_FAST_ACCELERATION", "ACCELERATION", "CRITICAL", "Acceleration deficit — premium ramp/fast mana search");
  }
  if (args.portfolio.criticalDeficits.includes("WIN_COMPACTNESS")) {
    push("FIND_COMPACT_WIN_PACKAGE", "WIN_COMPACTNESS", "CRITICAL", "No compact win architecture yet");
  }
  if (args.portfolio.criticalDeficits.includes("INTERACTION")) {
    push("FIND_PREMIUM_INTERACTION", "INTERACTION", "CRITICAL", "Interaction quality below bracket floor");
  }

  for (const dim of args.portfolio.highDeficits) {
    if (dim === "ACCESS") push("FIND_ACCESS", dim, "HIGH", "High access deficit");
    else if (dim === "ACCELERATION") push("FIND_FAST_ACCELERATION", dim, "HIGH", "High acceleration deficit");
    else if (dim === "PROTECTION") push("FIND_PROTECTION", dim, "HIGH", "Protection deficit");
    else if (dim === "GAME_CHANGERS" && args.contract.gameChangerReviewRequired) {
      push("FIND_RELEVANT_GAME_CHANGERS", dim, "HIGH", "Game Changer review required");
    }
  }

  const gcInDeck = args.portfolio.entries.find((e) => e.dimension === "GAME_CHANGERS");
  const gcSatisfied =
    args.history?.gameChangerReviewComplete ||
    (gcInDeck && gcInDeck.current !== "NONE" && gcInDeck.status !== "CRITICAL_DEFICIT");
  if (
    args.contract.requestedBracket >= 4 &&
    !missions.some((m) => m.kind === "FIND_RELEVANT_GAME_CHANGERS") &&
    !gcSatisfied &&
    !args.history?.completedMissionKinds.includes("FIND_RELEVANT_GAME_CHANGERS")
  ) {
    push("FIND_RELEVANT_GAME_CHANGERS", "GAME_CHANGERS", "HIGH", "B4 requires active Game Changer review");
  }

  const maxMissions = args.contract.requestedBracket >= 4 ? 5 : 4;
  const sorted = [...missions].sort((a, b) => {
    const pri = (p: "CRITICAL" | "HIGH") => (p === "CRITICAL" ? 0 : 1);
    return pri(a.priority) - pri(b.priority);
  });
  if (args.contract.requestedBracket >= 4) {
    const gc = sorted.find((m) => m.kind === "FIND_RELEVANT_GAME_CHANGERS");
    const rest = sorted.filter((m) => m.kind !== "FIND_RELEVANT_GAME_CHANGERS").slice(0, maxMissions - (gc ? 1 : 0));
    return gc ? [gc, ...rest] : rest.slice(0, maxMissions);
  }
  return sorted.slice(0, maxMissions);
}

function scoreGameChangerStrategicFit(args: {
  cardName: string;
  charter: DeckCharterV45;
}): { relevant: boolean; reason: string } {
  const blob = `${args.charter.primaryStrategy} ${args.charter.secondaryStrategy}`.toLowerCase();
  const name = args.cardName.toLowerCase();
  if (/mishra's workshop|ancient tomb|gaea's cradle|field of the dead/.test(name)) {
    if (!blob.includes("artifact") && !blob.includes("token") && !blob.includes("legendary")) {
      return { relevant: false, reason: "Land-based acceleration does not clearly serve this charter" };
    }
  }
  if (/survival of the fittest|worldly tutor|finale of devastation|enlightened tutor/.test(name)) {
    return { relevant: true, reason: "Access serves charter engine and win targets" };
  }
  if (/the one ring|chrome mox|mana vault|grim monolith/.test(name)) {
    return { relevant: true, reason: "Premium acceleration supports B4 curve" };
  }
  return { relevant: true, reason: "Game Changer reviewed for charter fit" };
}

export function executeBracketPowerSearchMissionV416(args: {
  mission: BracketPowerSearchMissionV416;
  catalog: DeckResolutionCatalog;
  charter: DeckCharterV45;
  colorIdentity: string[];
  bracket: CommanderBracket;
  powerPlan: BracketPowerPlanV410 | null;
  deckNeeds: DeckNeedV47[];
  selectedCards: CouncilCardV46[];
  revision: number;
  history?: BracketPowerSearchHistoryV416 | null;
}): { cards: CouncilCardV46[]; report: BracketPowerSearchReportV416; history: BracketPowerSearchHistoryV416 } {
  const excludeNames = new Set(args.selectedCards.map((c) => c.name.toLowerCase()));
  const charterKeywords = [
    args.charter.primaryStrategy,
    ...args.charter.deckIdentity.split(/\s+/).slice(0, 8),
  ].filter(Boolean);

  const prior = args.history ?? {
    candidatesAlreadyConsidered: [],
    candidatesAlreadySelected: [],
    candidatesAlreadyRejected: [],
    completedMissionKinds: [],
    gameChangerReviewComplete: false,
  };
  const cards: CouncilCardV46[] = [];
  const candidates: string[] = [];
  const rejected: Array<{ name: string; reason: string }> = [...prior.candidatesAlreadyRejected];
  const selected: string[] = [];
  const considered = new Set(prior.candidatesAlreadyConsidered.map((n) => n.toLowerCase()));
  let suppressedDuplicate = false;

  if (args.mission.kind === "FIND_ACCESS") {
    const tutors = discoverTutorsForMissionV412({
      catalog: args.catalog,
      colorIdentity: args.colorIdentity,
      excludeNames,
      bracket: args.bracket,
      charterKeywords,
    });
    for (const t of tutors.slice(0, 6)) {
      candidates.push(t.name);
      if (t.deckScore >= 40) {
        cards.push(tutorToCouncilCard(t, args.revision));
        selected.push(t.name);
      } else {
        rejected.push({ name: t.name, reason: `score ${t.deckScore} below threshold for charter fit` });
      }
    }
  } else if (args.mission.kind === "FIND_RELEVANT_GAME_CHANGERS") {
    const evaluations = getLegalRelevantGameChangersV411({
      catalog: args.catalog,
      colorIdentity: args.colorIdentity,
      bracket: args.bracket,
      charter: args.charter,
      deckNeeds: args.deckNeeds,
      selectedCards: args.selectedCards,
      powerPlan: args.powerPlan,
      maxEvaluate: 20,
    });
    const evalNames = evaluations.slice(0, 12).map((ev) => ev.card);
    if (
      prior.completedMissionKinds.includes("FIND_RELEVANT_GAME_CHANGERS") &&
      candidateSetKey(evalNames) === candidateSetKey(prior.candidatesAlreadyConsidered.slice(0, evalNames.length))
    ) {
      suppressedDuplicate = true;
    } else {
      for (const ev of evaluations.slice(0, 12)) {
        candidates.push(ev.card);
        considered.add(ev.card.toLowerCase());
        const fit = scoreGameChangerStrategicFit({ cardName: ev.card, charter: args.charter });
        const alreadyInDeck = args.selectedCards.some(
          (c) => c.name.toLowerCase() === ev.card.toLowerCase() || c.oracleId === ev.oracleId,
        );
        if (alreadyInDeck) {
          selected.push(ev.card);
          continue;
        }
        if (ev.selected && fit.relevant) {
          const golden = args.catalog.byOracleId.get(ev.oracleId);
          if (golden) {
            const profile = buildFunctionalCardProfileV47(golden);
            cards.push({
              cardId: `card-${ev.oracleId}`,
              oracleId: ev.oracleId,
              name: ev.card,
              proposedBy: "RESEARCH",
              origin: "ORACLE_SEARCH",
              proposalReason: fit.reason,
              functions: profile.roles,
              roles: profile.roles,
              packages: [],
              engines: [],
              commanderDependence: "MEDIUM",
              worksWithoutCommander: "MEDIUM",
              semanticConnections: [],
              oracleVerified: true,
              legalityVerified: true,
              colorIdentityVerified: true,
              criticStatus: "CHARTER_OK",
              status: "CANDIDATE",
              addedAtRevision: args.revision,
              lastReviewedRevision: args.revision,
              category: "spell",
              manaValue: golden.manaValue ?? 3,
            });
            selected.push(ev.card);
          }
        } else {
          rejected.push({
            name: ev.card,
            reason: ev.rejectionReason ?? fit.reason ?? "Not strategically relevant for this charter",
          });
        }
      }
    }
  } else if (args.mission.kind === "FIND_FAST_ACCELERATION") {
    const FAST = /sol ring|mana crypt|arcane signet|talismans?|signet|three visits|nature's lore|farseek|cultivate|kodama's reach|skyship plunderer|dockside|chrome mox/i;
    for (const [, golden] of args.catalog.byOracleId.entries()) {
      if (cards.length >= 8) break;
      const name = golden.canonicalName;
      if (!FAST.test(name)) continue;
      if (excludeNames.has(name.toLowerCase())) continue;
      candidates.push(name);
      const profile = buildFunctionalCardProfileV47(golden);
      if (profile.roles.includes("ramp") || /sol ring|mana crypt|signet|talisman/i.test(name)) {
        cards.push({
          cardId: `card-${golden.oracleId}`,
          oracleId: golden.oracleId,
          name,
          proposedBy: "RESEARCH",
          origin: "ORACLE_SEARCH",
          proposalReason: `B${args.bracket} acceleration mission`,
          functions: profile.roles,
          roles: profile.roles,
          packages: [],
          engines: [],
          commanderDependence: "LOW",
          worksWithoutCommander: "HIGH",
          semanticConnections: [],
          oracleVerified: true,
          legalityVerified: true,
          colorIdentityVerified: true,
          criticStatus: "CHARTER_OK",
          status: "CANDIDATE",
          addedAtRevision: args.revision,
          lastReviewedRevision: args.revision,
          category: /land/i.test(golden.typeLine ?? "") ? "land" : "artifact",
          manaValue: golden.manaValue ?? 2,
        });
        selected.push(name);
      }
    }
  }

  const completedKinds = [...prior.completedMissionKinds];
  if (!completedKinds.includes(args.mission.kind)) completedKinds.push(args.mission.kind);
  const gameChangerReviewComplete =
    args.mission.kind === "FIND_RELEVANT_GAME_CHANGERS" &&
    (suppressedDuplicate || candidates.every((c) => considered.has(c.toLowerCase())));

  const history: BracketPowerSearchHistoryV416 = {
    candidatesAlreadyConsidered: [...new Set([...prior.candidatesAlreadyConsidered, ...candidates])],
    candidatesAlreadySelected: [...new Set([...prior.candidatesAlreadySelected, ...selected])],
    candidatesAlreadyRejected: rejected,
    completedMissionKinds: completedKinds,
    gameChangerReviewComplete: prior.gameChangerReviewComplete || gameChangerReviewComplete,
  };

  const report: BracketPowerSearchReportV416 = {
    mission: args.mission,
    candidates,
    rejectedCandidates: rejected,
    selectedCandidates: selected,
    reason: args.mission.reason,
    portfolioEffect: suppressedDuplicate
      ? "Suppressed duplicate Game Changer mission — review complete"
      : selected.length > 0
        ? `Injected ${selected.length} candidates for ${args.mission.targetDimension}`
        : gameChangerReviewComplete
          ? "GAME_CHANGER_REVIEW_COMPLETE"
          : "No qualifying candidates found",
    suppressedDuplicate,
  };

  return { cards, report, history };
}

export function bracketPowerNeedsToDeckNeedsV416(args: {
  contract: BracketConstructionContractV416;
}): DeckNeedV47[] {
  const needs: DeckNeedV47[] = [];
  const bracket = args.contract.requestedBracket;
  const push = (needId: string, concept: string, urgency: DeckNeedV47["urgency"] = "HIGH") => {
    needs.push({
      needId,
      category: "ROLE_COMPRESSION",
      role: needId.replace("need-bracket-", ""),
      reason: concept,
      source: "BRACKET_CONTRACT",
      requiredFunctions: [],
      preferredFunctions: [],
      requiredMechanics: [],
      preferredMechanics: [],
      desiredProducedResources: [],
      desiredConsumedResources: [],
      desiredEvents: [],
      urgency,
      status: "OPEN",
      conceptText: concept,
    });
  };

  if (bracket >= 4) {
    push("need-bracket-premium-acceleration", "Premium acceleration and fast mana for B4 charter-aligned curve");
    push("need-bracket-strategy-access", "Optimized access architecture — engine, win, protection, recovery");
    push("need-bracket-efficient-interaction", "Strongest efficient legal interaction that fits this deck");
    push("need-bracket-protection", "Protection for key turns and combo pieces");
    push("need-bracket-compact-win", "Compact win architecture for this strategy");
    push("need-bracket-game-changer-review", "Game Changer review — consider/reject deliberately");
  } else if (bracket === 3) {
    push("need-bracket-upper-edge-synergy", "Upper edge of Upgraded — strong synergy without B4 speed", "MEDIUM");
    push("need-bracket-solid-interaction", "Solid interaction without cEDH efficiency", "MEDIUM");
    push("need-bracket-intentional-gc", "Intentional Game Changers within policy", "MEDIUM");
  } else {
    push("need-bracket-thematic-cohesion", "Thematic cohesion over raw power", "LOW");
  }

  return needs;
}

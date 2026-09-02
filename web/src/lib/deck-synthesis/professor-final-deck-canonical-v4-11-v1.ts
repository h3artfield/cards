/**
 * Canonical final deck v4.11 — post-mana-base deck + fresh snapshot before Head Professor.
 */
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import { normalizeOracleName } from "@/lib/deck-builder/golden-catalog/normalize-name";
import type { CouncilCardV46, CardDecisionV46 } from "./professor-council-assembly-v4-6-v1";
import {
  computeDeckSnapshotV47,
  evaluateLegalityGateV47,
  profileMapForSelected,
  type ProfessorCouncilStateV47,
} from "./professor-council-assembly-v4-7-v1";
import { COMMANDER_DECK_LIBRARY_SIZE_V47 } from "./professor-deck-completion-v4-7-v1";
import { appendManaBaseV48, discoverCatalogLandsV48 } from "./professor-mana-base-v4-8-v1";
import { buildProfessorManaBaseLandNamesV48 } from "./professor-brew-deck-list-v4-3-v1";
import { buildFunctionalCardProfileV47 } from "./professor-functional-profile-v4-7-v1";
import { computeFinalDeckFingerprintV411 } from "./professor-deck-fingerprint-v4-11-v1";

export const PROFESSOR_FINAL_DECK_CANONICAL_V4_11_V1_VERSION = "professor-final-deck-canonical-v4-11-v1";

export const TARGET_COMMANDER_LAND_COUNT_V411 = 36;
export const MIN_COMMANDER_LAND_COUNT_V411 = 33;

function councilBasicLand(args: { name: string; revision: number }): CouncilCardV46 {
  return {
    cardId: `card-basic-${normalizeOracleName(args.name)}`,
    oracleId: null,
    name: args.name,
    proposedBy: "RESEARCH",
    origin: "ORACLE_SEARCH",
    proposalReason: "Mana base rebalance — basic land",
    functions: ["land"],
    roles: ["land", "ramp"],
    packages: ["Mana Base"],
    engines: [],
    commanderDependence: "LOW",
    worksWithoutCommander: "HIGH",
    semanticConnections: ["mana-base"],
    oracleVerified: true,
    legalityVerified: true,
    colorIdentityVerified: true,
    criticStatus: "CHARTER_OK",
    status: "SELECTED",
    addedAtRevision: args.revision,
    lastReviewedRevision: args.revision,
    category: "land",
  };
}

function councilLandFromGolden(args: {
  card: import("@/lib/deck-builder/golden-catalog/schemas").GoldenCatalogOracleCard;
  revision: number;
}): CouncilCardV46 {
  const profile = buildFunctionalCardProfileV47(args.card);
  return {
    cardId: `card-${args.card.oracleId.slice(0, 8)}`,
    oracleId: args.card.oracleId,
    name: args.card.canonicalName,
    proposedBy: "RESEARCH",
    origin: "ORACLE_SEARCH",
    proposalReason: "Mana base rebalance — catalog land",
    functions: profile.roles.slice(0, 3),
    roles: profile.roles,
    packages: ["Mana Base"],
    engines: [],
    commanderDependence: "LOW",
    worksWithoutCommander: "HIGH",
    semanticConnections: ["mana-base"],
    oracleVerified: true,
    legalityVerified: true,
    colorIdentityVerified: true,
    criticStatus: "CHARTER_OK",
    status: "SELECTED",
    addedAtRevision: args.revision,
    lastReviewedRevision: args.revision,
    category: "land",
  };
}

function cutPriority(card: CouncilCardV46): number {
  let score = 0;
  if (card.category === "land") return -1000;
  if (/doorman|pummeler|line breaker|wei strike|guul draz|keldon raider|inquisitive puppet|ogre arsonist|ma chao/i.test(card.name)) {
    score += 100;
  }
  if (card.commanderDependence === "HIGH") score -= 10;
  if (card.roles.includes("interaction") || card.roles.includes("sacrifice-outlet")) score -= 5;
  if (card.roles.includes("finisher")) score += 5;
  return score;
}

export function rebalanceManaBaseV411(args: {
  state: ProfessorCouncilStateV47;
  catalog: DeckResolutionCatalog;
  colorIdentity: string[];
  commanderName: string;
  targetLandCount?: number;
}): ProfessorCouncilStateV47 {
  const target = args.targetLandCount ?? TARGET_COMMANDER_LAND_COUNT_V411;
  let selectedCards = [...args.state.selectedCards];
  let landCount = selectedCards.filter((c) => c.category === "land").length;
  if (landCount >= target) return args.state;

  const needed = target - landCount;
  const revision = args.state.assemblyRevision + 1;
  const cardDecisions: CardDecisionV46[] = [...args.state.cardDecisions];
  const excludeNames = new Set(selectedCards.map((c) => c.name.toLowerCase()));

  const cutCandidates = selectedCards
    .filter((c) => c.category !== "land")
    .sort((a, b) => cutPriority(b) - cutPriority(a));

  const cuts: CouncilCardV46[] = [];
  for (const card of cutCandidates) {
    if (cuts.length >= needed) break;
    cuts.push(card);
  }

  if (cuts.length < needed) return args.state;

  const cutNames = new Set(cuts.map((c) => normalizeOracleName(c.name)));
  selectedCards = selectedCards.filter((c) => !cutNames.has(normalizeOracleName(c.name)));

  for (const cut of cuts) {
    cardDecisions.push({
      decisionId: `dec-mana-cut-${revision}-${cut.cardId}`,
      cardId: cut.cardId,
      cardName: cut.name,
      action: "CUT",
      proposedBy: "RESEARCH",
      supportingCouncilTurnIds: [],
      reason: "Mana base rebalance — replace low-impact slot with land",
      revision,
    });
  }

  const catalogLands = discoverCatalogLandsV48({
    catalog: args.catalog,
    colorIdentity: args.colorIdentity,
    excludeNames,
    maxCount: needed,
  });

  const added: CouncilCardV46[] = [];
  for (const land of catalogLands) {
    if (added.length >= needed) break;
    const councilCard = councilLandFromGolden({ card: land, revision });
    added.push(councilCard);
    excludeNames.add(land.canonicalName.toLowerCase());
    cardDecisions.push({
      decisionId: `dec-mana-add-${revision}-${land.oracleId.slice(0, 8)}`,
      cardId: councilCard.cardId,
      cardName: councilCard.name,
      action: "ADD",
      proposedBy: "RESEARCH",
      supportingCouncilTurnIds: [],
      reason: "Mana base rebalance — catalog land",
      revision,
    });
  }

  const fallbackNames = buildProfessorManaBaseLandNamesV48({
    colorIdentity: args.colorIdentity,
    existingNames: [...excludeNames],
    count: needed - added.length,
  });
  for (const name of fallbackNames) {
    if (added.length >= needed) break;
    const councilCard = councilBasicLand({ name, revision });
    added.push(councilCard);
    excludeNames.add(name.toLowerCase());
    cardDecisions.push({
      decisionId: `dec-mana-add-${revision}-${name}`,
      cardId: councilCard.cardId,
      cardName: name,
      action: "ADD",
      proposedBy: "RESEARCH",
      supportingCouncilTurnIds: [],
      reason: "Mana base rebalance — basic land",
      revision,
    });
  }

  selectedCards = [...selectedCards, ...added];
  landCount = selectedCards.filter((c) => c.category === "land").length;

  const nextState: ProfessorCouncilStateV47 = {
    ...args.state,
    selectedCards,
    cardDecisions,
    assemblyRevision: revision,
    buildPhase: "PROVISIONAL_100",
    conversation: [
      ...args.state.conversation,
      {
        turnId: `t-mana-rebal-${revision}`,
        phase: "MANA_BASE",
        speaker: "RESEARCH",
        intent: "PROPOSE",
        respondsToTurnIds: [],
        message: `Mana base rebalance — cut ${cuts.map((c) => c.name).join(", ")} for ${added.length} lands (${landCount} total).`,
        developerDetail: added.map((c) => c.name).join(", "),
      },
    ],
  };
  nextState.legalityGate = evaluateLegalityGateV47({ state: nextState, commanderName: args.commanderName });
  return nextState;
}

export function recomputeFinalDeckSnapshotV411(args: {
  state: ProfessorCouncilStateV47;
  catalog: DeckResolutionCatalog;
}): ProfessorCouncilStateV47 {
  const functionalProfiles = profileMapForSelected(args.state.selectedCards, args.catalog, {});
  const hydratedState = { ...args.state, functionalProfiles };
  const snapshot = computeDeckSnapshotV47({ state: hydratedState, catalog: args.catalog });
  return {
    ...hydratedState,
    snapshots: [snapshot],
  };
}

export function ensureCanonicalFinalDeckV411(args: {
  state: ProfessorCouncilStateV47;
  catalog: DeckResolutionCatalog;
  colorIdentity: string[];
  commanderName: string;
}): {
  state: ProfessorCouncilStateV47;
  fingerprint: ReturnType<typeof computeFinalDeckFingerprintV411>;
  manaBaseAdjusted: boolean;
} {
  let state = args.state;
  let manaBaseAdjusted = false;

  const libraryCount = state.selectedCards.length;
  const landCount = state.selectedCards.filter((c) => c.category === "land").length;

  if (libraryCount < COMMANDER_DECK_LIBRARY_SIZE_V47) {
    state = appendManaBaseV48({
      state,
      catalog: args.catalog,
      colorIdentity: args.colorIdentity,
      commanderName: args.commanderName,
    });
    manaBaseAdjusted = true;
  } else if (landCount < MIN_COMMANDER_LAND_COUNT_V411) {
    state = rebalanceManaBaseV411({
      state,
      catalog: args.catalog,
      colorIdentity: args.colorIdentity,
      commanderName: args.commanderName,
    });
    manaBaseAdjusted = true;
  }

  state = recomputeFinalDeckSnapshotV411({ state, catalog: args.catalog });
  state = {
    ...state,
    buildPhase: "PROVISIONAL_100",
  };

  const fingerprint = computeFinalDeckFingerprintV411({ state, catalog: args.catalog });
  return { state, fingerprint, manaBaseAdjusted };
}

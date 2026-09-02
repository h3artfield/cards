/**
 * Professor mana base v4.8 — fill library to 99 after structural assembly.
 */
import type { GoldenCatalogOracleCard } from "@/lib/deck-builder/golden-catalog/schemas";
import { normalizeOracleName } from "@/lib/deck-builder/golden-catalog/normalize-name";
import { commanderLegalInIdentity } from "@/lib/semantic-visualization/filters-v1";
import { resolveBenchmarkCommanderName } from "./benchmark-commander-resolver-v1";
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import { isCurrentlyCommanderLegal } from "../../../scripts/lib/load-deck-resolution-catalog";
import { buildProfessorManaBaseLandNamesV48 } from "./professor-brew-deck-list-v4-3-v1";
import type { CouncilCardV46, CardDecisionV46 } from "./professor-council-assembly-v4-6-v1";
import type { CouncilTurnV45, DeckCharterV45 } from "./professor-council-state-v4-5-v1";
import type { ProfessorCouncilStateV47 } from "./professor-council-assembly-v4-7-v1";
import {
  COMMANDER_DECK_LIBRARY_SIZE_V47,
  evaluateLegalityGateV47,
} from "./professor-council-assembly-v4-7-v1";
import { buildFunctionalCardProfileV47 } from "./professor-functional-profile-v4-7-v1";
import {
  assessDeckSlotBudgetV4163,
  manaAssemblyLandAllowanceV4163,
} from "./professor-deck-slot-budget-v4-16-3-v1";

export const PROFESSOR_MANA_BASE_V4_8_V1_VERSION = "professor-mana-base-v4-8-v1";

const LAND_STAPLE_PRIORITY = [
  "Command Tower",
  "Path of Ancestry",
  "Exotic Orchard",
  "Reliquary Tower",
  "War Room",
  "Bonders' Enclave",
  "Castle Ardenvale",
  "Castle Vantress",
  "Castle Embereth",
  "Castle Garenbrig",
  "Temple of the False God",
  "Myriad Landscape",
  "Evolving Wilds",
  "Terramorphic Expanse",
  "Ash Barrens",
] as const;

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function isLandCard(card: GoldenCatalogOracleCard): boolean {
  const tl = (card.typeLine ?? "").toLowerCase();
  return /\bland\b/.test(tl) && !/\bcreature\b|\bartifact\b|\benchantment\b|\bplaneswalker\b/.test(tl);
}

function scoreLandCard(card: GoldenCatalogOracleCard, colorCount: number): number {
  const name = card.canonicalName.toLowerCase();
  let score = 1;
  if (name.includes("command tower")) score += 100;
  if (name.includes("path of ancestry") || name.includes("exotic orchard")) score += 90;
  if (name.includes("reliquary tower") || name.includes("war room")) score += 70;
  if (LAND_STAPLE_PRIORITY.some((s) => s.toLowerCase() === name)) score += 50;
  const identity = card.colorIdentity ?? [];
  if (identity.length >= 2 && colorCount >= 2) score += 20 + identity.length * 5;
  if (/\bforest\b|\bisland\b|\bplains\b|\bswamp\b|\bmountain\b/.test((card.typeLine ?? "").toLowerCase())) score += 5;
  if (card.manaValue === 0) score += 3;
  return score;
}


function tryLandCandidate(args: {
  card: GoldenCatalogOracleCard | null | undefined;
  colorIdentity: string[];
  excludeNames: Set<string>;
  seen: Set<string>;
  results: GoldenCatalogOracleCard[];
  maxCount: number;
}): void {
  if (!args.card || args.results.length >= args.maxCount) return;
  if (!isLandCard(args.card)) return;
  if (!isCurrentlyCommanderLegal(args.card)) return;
  if (!commanderLegalInIdentity(args.card.colorIdentity ?? [], args.colorIdentity)) return;
  const key = normalizeOracleName(args.card.canonicalName);
  if (args.excludeNames.has(key) || args.seen.has(key)) return;
  args.seen.add(key);
  args.results.push(args.card);
}

export function discoverCatalogLandsV48(args: {
  catalog: DeckResolutionCatalog;
  colorIdentity: string[];
  excludeNames: Set<string>;
  maxCount: number;
}): GoldenCatalogOracleCard[] {
  const results: GoldenCatalogOracleCard[] = [];
  const seen = new Set<string>();

  for (const stapleName of LAND_STAPLE_PRIORITY) {
    if (results.length >= args.maxCount) break;
    const audit = resolveBenchmarkCommanderName(args.catalog, stapleName);
    if (!audit.resolved || !audit.oracleId) continue;
    tryLandCandidate({
      card: args.catalog.byOracleId.get(audit.oracleId),
      colorIdentity: args.colorIdentity,
      excludeNames: args.excludeNames,
      seen,
      results,
      maxCount: args.maxCount,
    });
  }

  if (results.length < args.maxCount) {
    const ranked: { card: GoldenCatalogOracleCard; score: number }[] = [];
    for (const [, card] of args.catalog.byOracleId.entries()) {
      if (!isLandCard(card)) continue;
      if (!isCurrentlyCommanderLegal(card)) continue;
      if (!commanderLegalInIdentity(card.colorIdentity ?? [], args.colorIdentity)) continue;
      const key = normalizeOracleName(card.canonicalName);
      if (args.excludeNames.has(key) || seen.has(key)) continue;
      ranked.push({ card, score: scoreLandCard(card, args.colorIdentity.length) });
    }
    ranked.sort((a, b) => b.score - a.score || a.card.canonicalName.localeCompare(b.card.canonicalName));
    for (const entry of ranked) {
      if (results.length >= args.maxCount) break;
      tryLandCandidate({
        card: entry.card,
        colorIdentity: args.colorIdentity,
        excludeNames: args.excludeNames,
        seen,
        results,
        maxCount: args.maxCount,
      });
    }
  }

  return results;
}

function councilLandFromGolden(args: {
  card: GoldenCatalogOracleCard;
  revision: number;
  reason: string;
}): CouncilCardV46 {
  const profile = buildFunctionalCardProfileV47(args.card);
  return {
    cardId: `card-${args.card.oracleId}`,
    oracleId: args.card.oracleId,
    name: args.card.canonicalName,
    proposedBy: "RESEARCH",
    origin: "SEMANTIC_ORACLE",
    proposalReason: args.reason,
    functions: ["land", ...profile.roles],
    roles: profile.roles.includes("land") ? profile.roles : (["land", ...profile.roles] as string[]),
    packages: ["Mana Base"],
    engines: ["mana_acceleration"],
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

function councilBasicLand(args: { name: string; revision: number }): CouncilCardV46 {
  return {
    cardId: `card-${slugify(args.name)}`,
    oracleId: null,
    name: args.name,
    proposedBy: "RESEARCH",
    origin: "ORACLE_SEARCH",
    proposalReason: "Basic land — color fixing for assembled mana base.",
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

export function librarySlotsRemainingV48(selectedLibraryCount: number): number {
  return Math.max(0, COMMANDER_DECK_LIBRARY_SIZE_V47 - selectedLibraryCount);
}

export function appendManaBaseV48(args: {
  state: ProfessorCouncilStateV47;
  catalog: DeckResolutionCatalog;
  colorIdentity: string[];
  commanderName: string;
}): ProfessorCouncilStateV47 {
  const slotBudget = assessDeckSlotBudgetV4163({
    manaPlan: args.state.manaPlanV416 ?? null,
    selectedCards: args.state.selectedCards,
  });
  if (!slotBudget.structurallyComplete) {
    return {
      ...args.state,
      buildPhase: "STRUCTURALLY_INCOMPLETE",
      deckSlotBudgetV4163: slotBudget,
      legalityGate: evaluateLegalityGateV47({ state: args.state, commanderName: args.commanderName }),
    };
  }

  const slotsNeeded = manaAssemblyLandAllowanceV4163({
    slotBudget,
    libraryCount: args.state.selectedCards.length,
  });
  const landCountBefore = args.state.selectedCards.filter((c) => c.category === "land").length;
  if (slotsNeeded <= 0 && landCountBefore >= slotBudget.expectedLands - 2) {
    return {
      ...args.state,
      buildPhase: "MANA_BASE",
      legalityGate: evaluateLegalityGateV47({ state: args.state, commanderName: args.commanderName }),
    };
  }

  const excludeNames = new Set(args.state.selectedCards.map((c) => c.name.toLowerCase()));
  const revision = args.state.assemblyRevision + 1;
  const added: CouncilCardV46[] = [];
  const cardDecisions: CardDecisionV46[] = [...args.state.cardDecisions];
  const conversation: CouncilTurnV45[] = [...args.state.conversation];
  let turnCounter = conversation.length;

  const catalogLands = discoverCatalogLandsV48({
    catalog: args.catalog,
    colorIdentity: args.colorIdentity,
    excludeNames,
    maxCount: slotsNeeded,
  });

  for (const card of catalogLands) {
    if (added.length >= slotsNeeded) break;
    const key = card.canonicalName.toLowerCase();
    if (excludeNames.has(key)) continue;
    const councilCard = councilLandFromGolden({
      card,
      revision,
      reason: `Mana base — ${card.canonicalName} fits ${args.colorIdentity.join("") || "color"} identity.`,
    });
    added.push(councilCard);
    excludeNames.add(key);
    cardDecisions.push({
      decisionId: `dec-mana-${revision}-${card.oracleId.slice(0, 8)}`,
      cardId: councilCard.cardId,
      cardName: councilCard.name,
      action: "ADD",
      proposedBy: "RESEARCH",
      supportingCouncilTurnIds: [],
      reason: "Mana base construction — catalog land in color identity.",
      revision,
    });
  }

  const fallbackNames = buildProfessorManaBaseLandNamesV48({
    colorIdentity: args.colorIdentity,
    existingNames: [...excludeNames],
    count: slotsNeeded - added.length,
  });

  for (const name of fallbackNames) {
    if (added.length >= slotsNeeded) break;
    const key = name.toLowerCase();
    if (excludeNames.has(key)) continue;
    const councilCard = councilBasicLand({ name, revision });
    added.push(councilCard);
    excludeNames.add(key);
    cardDecisions.push({
      decisionId: `dec-mana-${revision}-${slugify(name)}`,
      cardId: councilCard.cardId,
      cardName: name,
      action: "ADD",
      proposedBy: "RESEARCH",
      supportingCouncilTurnIds: [],
      reason: "Mana base construction — basic land padding.",
      revision,
    });
  }

  const selectedCards = [...args.state.selectedCards, ...added];
  const landCount = selectedCards.filter((c) => c.category === "land").length;
  const nonlandCount = selectedCards.length - landCount;

  conversation.push({
    turnId: `t-${turnCounter++}`,
    phase: "ASSEMBLY",
    speaker: "RESEARCH",
    intent: "PROPOSE",
    respondsToTurnIds: [],
    message: `Mana base complete — added ${added.length} lands (${landCount} total lands, ${nonlandCount} nonlands) to reach ${selectedCards.length}/99 library cards before final review.`,
    developerDetail: added.map((c) => c.name).join(", "),
  });

  conversation.push({
    turnId: `t-${turnCounter++}`,
    phase: "ASSEMBLY",
    speaker: "CRITIC",
    intent: "VERIFY",
    respondsToTurnIds: [conversation[conversation.length - 2]!.turnId],
    message: `Singleton and color identity checked on ${added.length} new lands. Full deck legality gate runs next.`,
  });

  const nextState: ProfessorCouncilStateV47 = {
    ...args.state,
    selectedCards,
    cardDecisions,
    conversation,
    assemblyRevision: revision,
    buildPhase: selectedCards.length >= COMMANDER_DECK_LIBRARY_SIZE_V47 ? "PROVISIONAL_100" : "MANA_BASE",
    checkpointsCompleted: [...args.state.checkpointsCompleted, COMMANDER_DECK_LIBRARY_SIZE_V47],
    deckSlotBudgetV4163: assessDeckSlotBudgetV4163({
      manaPlan: args.state.manaPlanV416 ?? null,
      selectedCards,
    }),
  };

  nextState.legalityGate = evaluateLegalityGateV47({ state: nextState, commanderName: args.commanderName });
  return nextState;
}

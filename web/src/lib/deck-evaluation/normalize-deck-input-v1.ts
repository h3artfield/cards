import type { GoldenCatalogOracleCard } from "@/lib/deck-builder/golden-catalog/schemas";
import { isCurrentlyCommanderLegal, paperMetaForOracle, type DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import type { NormalizedDeckInstance, ResolvedCommander, ResolvedDeckCard } from "../commander-strategy/types";

export type SimpleDeckInput = {
  commanderOracleIds: string[];
  mainboard: Array<{ oracleId: string; quantity: number }>;
  deckHash?: string;
};

function resolvedMainboardRow(input: {
  oracleId: string;
  quantity: number;
  catalog: DeckResolutionCatalog;
}): ResolvedDeckCard | null {
  const card = input.catalog.byOracleId.get(input.oracleId);
  if (!card) return null;
  const paper = paperMetaForOracle(input.catalog, input.oracleId);
  return {
    sourceName: card.canonicalName ?? input.oracleId,
    quantity: input.quantity,
    normalizedName: (card.canonicalName ?? input.oracleId).toLowerCase(),
    oracleId: input.oracleId,
    canonicalOracleName: card.canonicalName,
    resolutionMethod: "oracle_id_direct",
    rawCatalogIdentity: true,
    paperEligible: paper.paperEligible,
    currentlyCommanderLegal: isCurrentlyCommanderLegal(card),
    appearedInHistoricalDeck: true,
    paperPopulationFrame: paper.paperPopulationFrame,
    resolutionStatus: "resolved",
  };
}

function resolvedCommander(oracleId: string, catalog: DeckResolutionCatalog): ResolvedCommander | null {
  const card = catalog.byOracleId.get(oracleId);
  if (!card) return null;
  const paper = paperMetaForOracle(catalog, oracleId);
  return {
    sourceName: card.canonicalName ?? oracleId,
    normalizedName: (card.canonicalName ?? oracleId).toLowerCase(),
    oracleId,
    canonicalOracleName: card.canonicalName,
    resolutionMethod: "oracle_id_direct",
    rawCatalogIdentity: true,
    paperEligible: paper.paperEligible,
    currentlyCommanderLegal: isCurrentlyCommanderLegal(card),
    appearedInHistoricalDeck: true,
    paperPopulationFrame: paper.paperPopulationFrame,
    resolutionStatus: "resolved",
    commanderSource: "deckObj",
  };
}

export function coerceNormalizedDeckInstance(input: {
  deck: NormalizedDeckInstance | SimpleDeckInput;
  catalog: DeckResolutionCatalog;
}): NormalizedDeckInstance {
  if ("deckInstanceId" in input.deck) return input.deck;

  const commanders = input.deck.commanderOracleIds
    .map((id) => resolvedCommander(id, input.catalog))
    .filter(Boolean) as ResolvedCommander[];
  const mainboard = input.deck.mainboard
    .map((row) => resolvedMainboardRow({ ...row, catalog: input.catalog }))
    .filter(Boolean) as ResolvedDeckCard[];

  const unresolved = input.deck.mainboard
    .filter((row) => !input.catalog.byOracleId.has(row.oracleId))
    .map((row) => row.oracleId);

  return {
    deckInstanceId: input.deck.deckHash ?? "eval-deck-v1",
    deckHash: input.deck.deckHash ?? "eval-deck-v1",
    tid: "eval",
    tournamentDate: "1970-01-01",
    sourceFormat: "commander",
    sourcePopulation: "topdeck_edh_tournaments",
    playerIdHash: "eval",
    commanders,
    commanderOracleIds: input.deck.commanderOracleIds,
    commanderResolutionStatus: commanders.length === input.deck.commanderOracleIds.length ? "resolved" : "partial",
    mainboard,
    cardResolutionRate:
      input.deck.mainboard.length > 0
        ? (input.deck.mainboard.length - unresolved.length) / input.deck.mainboard.length
        : 1,
    unresolvedCards: unresolved,
    deckObjAvailable: false,
    decklistAvailable: false,
    structuredCommanderAvailable: true,
    parsedTextCommanderAvailable: false,
    digitalOnlyCardCount: mainboard.filter((c) => !c.paperEligible).length,
    nonPaperCardCount: mainboard.filter((c) => !c.paperEligible).length,
  };
}

export function applySwapToDeck(input: {
  deck: NormalizedDeckInstance;
  removeOracleId: string;
  addOracleId: string;
  catalog: DeckResolutionCatalog;
}): NormalizedDeckInstance {
  const cmdSet = new Set(input.deck.commanderOracleIds);
  if (cmdSet.has(input.removeOracleId) || cmdSet.has(input.addOracleId)) {
    throw new Error("evaluateSwap v1 does not modify command zone — mainboard swaps only");
  }

  const mainboardMap = new Map<string, number>();
  for (const row of input.deck.mainboard) {
    if (!row.oracleId || row.oracleId === input.removeOracleId) continue;
    mainboardMap.set(row.oracleId, (mainboardMap.get(row.oracleId) ?? 0) + row.quantity);
  }
  mainboardMap.set(input.addOracleId, (mainboardMap.get(input.addOracleId) ?? 0) + 1);

  return coerceNormalizedDeckInstance({
    deck: {
      commanderOracleIds: input.deck.commanderOracleIds,
      deckHash: `${input.deck.deckHash}:swap:${input.removeOracleId}->${input.addOracleId}`,
      mainboard: [...mainboardMap.entries()].map(([oracleId, quantity]) => ({ oracleId, quantity })),
    },
    catalog: input.catalog,
  });
}

export function commanderColorIdentity(
  commanderOracleIds: string[],
  catalog: DeckResolutionCatalog,
): string[] {
  const colors = new Set<string>();
  for (const id of commanderOracleIds) {
    const card = catalog.byOracleId.get(id);
    for (const c of card?.colorIdentity ?? []) colors.add(c);
  }
  return [...colors].sort();
}

export function isBasicLand(card: GoldenCatalogOracleCard): boolean {
  return (card.typeLine ?? "").toLowerCase().includes("basic land");
}

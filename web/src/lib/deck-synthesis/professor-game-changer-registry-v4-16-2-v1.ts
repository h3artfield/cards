/**
 * Professor v4.16.2 — canonical Game Changer registry (single source of truth).
 */
import { normalizeOracleName } from "@/lib/deck-builder/golden-catalog/normalize-name";
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import {
  gameChangerOracleIdSet,
  loadCommanderGameChangerSnapshot,
  type CommanderGameChangerSnapshot,
} from "@/lib/commander-strategy/model-c/game-changer-snapshot-v1";
import type { CouncilCardV46 } from "./professor-council-assembly-v4-6-v1";

export const PROFESSOR_GAME_CHANGER_REGISTRY_V4_16_2_V1_VERSION =
  "professor-game-changer-registry-v4-16-2-v1";

let cachedSnapshot: CommanderGameChangerSnapshot | null = null;
let cachedNameSet: Set<string> | null = null;

export function getCanonicalGameChangerSnapshotV4162(): CommanderGameChangerSnapshot {
  if (!cachedSnapshot) cachedSnapshot = loadCommanderGameChangerSnapshot();
  return cachedSnapshot;
}

export function getCanonicalGameChangerOracleIdSetV4162(): Set<string> {
  return gameChangerOracleIdSet(getCanonicalGameChangerSnapshotV4162());
}

function officialNameSet(): Set<string> {
  if (!cachedNameSet) {
    cachedNameSet = new Set(
      getCanonicalGameChangerSnapshotV4162().officialCardNames.map((n) => normalizeOracleName(n)),
    );
  }
  return cachedNameSet;
}

export function isCanonicalGameChangerCardV4162(args: {
  oracleId?: string | null;
  name: string;
  catalog?: DeckResolutionCatalog | null;
}): boolean {
  const oracleIds = getCanonicalGameChangerOracleIdSetV4162();
  if (args.oracleId && oracleIds.has(args.oracleId)) return true;
  if (args.catalog && args.oracleId) {
    const golden = args.catalog.byOracleId.get(args.oracleId);
    if (golden && oracleIds.has(golden.oracleId)) return true;
  }
  return officialNameSet().has(normalizeOracleName(args.name));
}

export function listGameChangersInDeckV4162(args: {
  selectedCards: CouncilCardV46[];
  catalog?: DeckResolutionCatalog | null;
}): string[] {
  return args.selectedCards
    .filter((c) => c.category !== "land")
    .filter((c) => isCanonicalGameChangerCardV4162({ oracleId: c.oracleId, name: c.name, catalog: args.catalog }))
    .map((c) => c.name);
}

export function countGameChangersInDeckV4162(args: {
  selectedCards: CouncilCardV46[];
  catalog?: DeckResolutionCatalog | null;
}): number {
  return listGameChangersInDeckV4162(args).length;
}

export type GameChangerReviewStateV4162 = {
  version: typeof PROFESSOR_GAME_CHANGER_REGISTRY_V4_16_2_V1_VERSION;
  relevantGameChangersConsidered: string[];
  relevantGameChangersRejected: Array<{ name: string; reason: string }>;
  relevantGameChangersSelected: string[];
  gameChangersInCurrentDeck: string[];
  gameChangerReviewComplete: boolean;
};

export function buildGameChangerReviewStateV4162(args: {
  selectedCards: CouncilCardV46[];
  catalog?: DeckResolutionCatalog | null;
  considered?: string[];
  rejected?: Array<{ name: string; reason: string }>;
  selected?: string[];
  reviewComplete?: boolean;
}): GameChangerReviewStateV4162 {
  const inDeck = listGameChangersInDeckV4162({
    selectedCards: args.selectedCards,
    catalog: args.catalog,
  });
  return {
    version: PROFESSOR_GAME_CHANGER_REGISTRY_V4_16_2_V1_VERSION,
    relevantGameChangersConsidered: args.considered ?? [],
    relevantGameChangersRejected: args.rejected ?? [],
    relevantGameChangersSelected: args.selected ?? inDeck,
    gameChangersInCurrentDeck: inDeck,
    gameChangerReviewComplete: args.reviewComplete ?? false,
  };
}

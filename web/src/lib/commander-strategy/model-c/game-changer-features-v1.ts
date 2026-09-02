import type { GoldenCatalogOracleCard } from "@/lib/deck-builder/golden-catalog/schemas";
import type { NormalizedDeckInstance } from "../types";
import type { CommanderGameChangerSnapshot } from "./game-changer-snapshot-v1";
import { getEligibleMainboardCards } from "./deck-mainboard-v1";

export const GAME_CHANGER_FEATURE_NAMES = [
  "gc_countTotal",
  "gc_countMainboard",
  "gc_countCommandZone",
  "gc_hasGameChanger",
  "gc_fraction",
  "gc_band_0",
  "gc_band_1",
  "gc_band_2",
  "gc_band_3",
  "gc_band_4plus",
  "gc_exceedsBracket3GameChangerLimit",
] as const;

export type GameChangerDeckAudit = {
  gameChangerOracleIds: string[];
  gameChangerCountTotal: number;
  gameChangerCountMainboard: number;
  gameChangerCountCommandZone: number;
};

function bandFeatures(total: number): Record<string, number> {
  return {
    gc_band_0: total === 0 ? 1 : 0,
    gc_band_1: total === 1 ? 1 : 0,
    gc_band_2: total === 2 ? 1 : 0,
    gc_band_3: total === 3 ? 1 : 0,
    gc_band_4plus: total >= 4 ? 1 : 0,
  };
}

export function buildGameChangerDeckFeatures(input: {
  deck: NormalizedDeckInstance;
  snapshot: CommanderGameChangerSnapshot;
  catalogByOracleId: Map<string, GoldenCatalogOracleCard>;
}): { features: Record<string, number>; audit: GameChangerDeckAudit } {
  void input.catalogByOracleId;
  const gameChangerSet = new Set(input.snapshot.oracleIds);
  const matched = new Set<string>();

  let commandZoneCount = 0;
  for (const oracleId of input.deck.commanderOracleIds) {
    if (!gameChangerSet.has(oracleId)) continue;
    matched.add(oracleId);
    commandZoneCount += 1;
  }

  let mainboardCount = 0;
  const { cards: eligibleMainboard } = getEligibleMainboardCards(input.deck);
  for (const row of eligibleMainboard) {
    if (!gameChangerSet.has(row.oracleId)) continue;
    matched.add(row.oracleId);
    mainboardCount += row.quantity;
  }

  const total = commandZoneCount + mainboardCount;
  const deckCardDenominator =
    eligibleMainboard.reduce((s, c) => s + c.quantity, 0) + input.deck.commanderOracleIds.length;

  const features: Record<string, number> = {
    gc_countTotal: total,
    gc_countMainboard: mainboardCount,
    gc_countCommandZone: commandZoneCount,
    gc_hasGameChanger: total > 0 ? 1 : 0,
    gc_fraction: deckCardDenominator > 0 ? total / deckCardDenominator : 0,
    ...bandFeatures(total),
    gc_exceedsBracket3GameChangerLimit: total > 3 ? 1 : 0,
  };

  for (const name of GAME_CHANGER_FEATURE_NAMES) {
    if (!(name in features)) features[name] = 0;
  }

  return {
    features,
    audit: {
      gameChangerOracleIds: [...matched].sort(),
      gameChangerCountTotal: total,
      gameChangerCountMainboard: mainboardCount,
      gameChangerCountCommandZone: commandZoneCount,
    },
  };
}

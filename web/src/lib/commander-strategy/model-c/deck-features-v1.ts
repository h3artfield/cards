import type { ShadowSemanticIndex } from "../shadow-semantic-index";
import type { NormalizedDeckInstance } from "../types";
import type { DeckResolutionCatalog } from "../../../../scripts/lib/load-deck-resolution-catalog";
import { buildBasicStructureFeatures, BASIC_STRUCTURE_FEATURE_NAMES } from "./basic-structure-v1";
import { buildDeckSemanticCensus, getEligibleMainboardCards } from "./deck-mainboard-v1";
import { buildGameChangerDeckFeatures } from "./game-changer-features-v1";
import type { CommanderGameChangerSnapshot } from "./game-changer-snapshot-v1";
import { buildRc8SemanticDeckFeatures } from "./semantic-deck-features-v1";
import type { DeckSemanticCensus, EligibleMainboardCard } from "./types";
import type { GameChangerDeckAudit } from "./game-changer-features-v1";

export type DeckFeatureBundle = {
  census: DeckSemanticCensus;
  basicStructureFull: Record<string, number>;
  basicStructure: Record<string, number>;
  gameChanger: Record<string, number>;
  gameChangerAudit: GameChangerDeckAudit;
  semantic: Record<string, number>;
  cardIdentityRaw: Map<string, number>;
  cards: EligibleMainboardCard[];
};

export function projectBasicStructureFeatures(
  fullBasic: Record<string, number>,
  basicColumns: readonly string[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const col of basicColumns) out[col] = fullBasic[col] ?? 0;
  return out;
}

export function buildDeckFeatureBundle(input: {
  deck: NormalizedDeckInstance;
  catalog: DeckResolutionCatalog;
  shadowIndex: ShadowSemanticIndex;
  gameChangerSnapshot: CommanderGameChangerSnapshot;
  basicColumns?: readonly string[];
}): DeckFeatureBundle {
  const census = buildDeckSemanticCensus(input);
  const { cards } = getEligibleMainboardCards(input.deck);
  const cardIdentityRaw = new Map<string, number>();
  for (const row of cards) {
    cardIdentityRaw.set(row.oracleId, (cardIdentityRaw.get(row.oracleId) ?? 0) + row.quantity);
  }

  const fullBasic = buildBasicStructureFeatures({
    cards,
    catalogByOracleId: input.catalog.byOracleId,
  });
  const basicColumns = input.basicColumns ?? BASIC_STRUCTURE_FEATURE_NAMES;
  const { features: gameChanger, audit: gameChangerAudit } = buildGameChangerDeckFeatures({
    deck: input.deck,
    snapshot: input.gameChangerSnapshot,
    catalogByOracleId: input.catalog.byOracleId,
  });

  return {
    census,
    cards,
    basicStructureFull: fullBasic,
    basicStructure: projectBasicStructureFeatures(fullBasic, basicColumns),
    gameChanger,
    gameChangerAudit,
    semantic: buildRc8SemanticDeckFeatures({
      cards,
      catalog: input.catalog,
      shadowIndex: input.shadowIndex,
      census,
    }),
    cardIdentityRaw,
  };
}

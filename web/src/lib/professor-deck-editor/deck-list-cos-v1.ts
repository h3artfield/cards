import { scoreCommanderOptimizationV1 } from "@/lib/commander-optimization-score/v1";
import { COS_V1_PROFILE_META } from "@/lib/commander-optimization-score/v1/profile-scalars";
import type { CosV1ProfileAxisId } from "@/lib/commander-optimization-score/v1/types";
import { normalizeOracleName } from "@/lib/deck-builder/golden-catalog/normalize-name";
import { getDeckResolutionCatalogRuntime } from "@/lib/deck-synthesis/professor-brew-catalog-runtime-v1";
import type { EditableDeckV1 } from "./types-v1";

export type DeckListCosSnapshotV1 = {
  competitiveStrength: number | null;
  profile: ReadonlyArray<{
    id: CosV1ProfileAxisId;
    label: string;
    percentile: number;
    measurable: boolean;
  }>;
};

let catalogPromise: ReturnType<typeof getDeckResolutionCatalogRuntime> | null = null;

function catalogRuntime() {
  catalogPromise ??= getDeckResolutionCatalogRuntime();
  return catalogPromise;
}

/** Lightweight COS for deck tiles — same engine as Check bracket. */
export async function cosSnapshotForEditableDeckV1(
  deck: EditableDeckV1,
): Promise<DeckListCosSnapshotV1 | null> {
  const commanderOracleId = deck.commander.oracleId?.trim();
  if (!commanderOracleId) return null;

  const mainboard = deck.cards
    .filter((card) => card.board === "mainboard")
    .map((card) => ({
      oracleId: card.oracleId ?? undefined,
      name: card.name,
      quantity: card.copies,
    }));
  if (!mainboard.length) return null;

  const catalog = await catalogRuntime();
  const resolveName = (name: string) => {
    const hits = catalog.byNormalizedName.get(normalizeOracleName(name));
    if (hits?.length === 1) return { oracleId: hits[0]!.oracleId, name: hits[0]!.canonicalName };
    const exact = hits?.find((c) => c.canonicalName === name);
    if (exact) return { oracleId: exact.oracleId, name: exact.canonicalName };
    return null;
  };

  try {
    const score = await scoreCommanderOptimizationV1({
      commanderOracleIds: [commanderOracleId],
      mainboard,
      oracleLookup: {
        resolveName,
        cardByOracleId: (oracleId) => {
          const card = catalog.byOracleId.get(oracleId);
          if (!card) return null;
          return {
            name: card.canonicalName,
            typeLine: card.typeLine,
            manaValue: card.manaValue ?? card.cmc ?? null,
            oracleText: card.oracleText ?? "",
            colorIdentity: card.colorIdentity,
          };
        },
      },
    });

    const profileById = new Map(score.profile.map((axis) => [axis.id, axis]));
    const profile = COS_V1_PROFILE_META.map((meta) => {
      const axis = profileById.get(meta.id);
      return {
        id: meta.id,
        label: meta.label,
        percentile: axis?.percentile ?? 0,
        measurable: axis?.measurable ?? false,
      };
    });
    return {
      competitiveStrength: score.competitiveStrength,
      profile,
    };
  } catch {
    return null;
  }
}

export async function cosSnapshotsForEditableDecksV1(
  decks: readonly EditableDeckV1[],
): Promise<Map<string, DeckListCosSnapshotV1>> {
  const entries = await Promise.all(
    decks.map(async (deck) => {
      const snapshot = await cosSnapshotForEditableDeckV1(deck);
      return snapshot ? ([deck.deckId, snapshot] as const) : null;
    }),
  );
  return new Map(entries.filter((entry): entry is [string, DeckListCosSnapshotV1] => entry != null));
}

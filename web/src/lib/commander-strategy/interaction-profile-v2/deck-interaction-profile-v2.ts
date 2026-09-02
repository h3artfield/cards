/**
 * Deck-level Interaction Profile v2 — separate mainboard and command zone blocks.
 */
import type { GoldenCatalogOracleCard } from "@/lib/deck-builder/golden-catalog/schemas";
import type { ShadowSemanticIndex } from "../shadow-semantic-index";
import type { DeckInteractionProfileV2 } from "./types";
import { DECK_INTERACTION_PROFILE_V2_VERSION } from "./types";
import { buildCardInteractionProfileV2 } from "./card-interaction-profile-v2";
import { deckFeatureKey, RPS_ONTOLOGY_V2 } from "./rps-ontology-v2";
import type { RpsAxisFamily, RpsVectorKind } from "./types";

function weightedMean(
  rows: Array<{ weight: number; score: number }>,
): number {
  let num = 0;
  let den = 0;
  for (const r of rows) {
    num += r.weight * r.score;
    den += r.weight;
  }
  return den > 0 ? num / den : 0;
}

function aggregateZone(input: {
  cards: Array<{ oracleId: string; quantity: number; card: GoldenCatalogOracleCard }>;
  shadowIndex: ShadowSemanticIndex;
  zonePrefix: "mb" | "cmd";
}): Record<string, number> {
  const accum = new Map<string, Array<{ weight: number; score: number }>>();

  for (const row of input.cards) {
    const shadow = input.shadowIndex.byOracleId.get(row.oracleId);
    if (!shadow) continue;
    const profile = buildCardInteractionProfileV2({
      oracleId: row.oracleId,
      card: row.card,
      actions: shadow.semantic.actions,
      abilities: shadow.semantic.abilities,
    });
    for (const axis of RPS_ONTOLOGY_V2) {
      for (const vector of axis.vectors) {
        const score = profile.axes[axis.family]?.[vector]?.score ?? 0;
        const key = deckFeatureKey(input.zonePrefix, axis.family, vector);
        const bucket = accum.get(key) ?? [];
        bucket.push({ weight: row.quantity, score });
        accum.set(key, bucket);
      }
    }
  }

  const out: Record<string, number> = {};
  for (const key of [...accum.keys()].sort()) {
    out[key] = weightedMean(accum.get(key)!);
  }
  return out;
}

export function buildDeckInteractionProfileV2(input: {
  mainboard: Array<{ oracleId: string; quantity: number; paperEligible: boolean }>;
  commandZoneOracleIds: string[];
  catalog: { byOracleId: Map<string, GoldenCatalogOracleCard> };
  shadowIndex: ShadowSemanticIndex;
  commanderExcludedFromMainboard?: Set<string>;
}): DeckInteractionProfileV2 {
  const cmdSet = new Set(input.commandZoneOracleIds);
  const mbCards = input.mainboard
    .filter((c) => c.paperEligible && !cmdSet.has(c.oracleId))
    .flatMap((c) => {
      const card = input.catalog.byOracleId.get(c.oracleId);
      return card ? [{ oracleId: c.oracleId, quantity: c.quantity, card }] : [];
    });

  const cmdCards = input.commandZoneOracleIds.flatMap((oracleId) => {
    const card = input.catalog.byOracleId.get(oracleId);
    return card ? [{ oracleId, quantity: 1, card }] : [];
  });

  return {
    profileVersion: DECK_INTERACTION_PROFILE_V2_VERSION,
    mainboard: aggregateZone({ cards: mbCards, shadowIndex: input.shadowIndex, zonePrefix: "mb" }),
    commandZone: aggregateZone({ cards: cmdCards, shadowIndex: input.shadowIndex, zonePrefix: "cmd" }),
  };
}

export function mergeDeckProfileVectors(profile: DeckInteractionProfileV2): Record<string, number> {
  return { ...profile.mainboard, ...profile.commandZone };
}

/** Pairwise matchup term for one opponent pair (design — D2). */
export function computePairwiseTerms(input: {
  my: Record<string, number>;
  opp: Record<string, number>;
}): Record<string, number> {
  const out: Record<string, number> = {};
  const families: RpsAxisFamily[] = RPS_ONTOLOGY_V2.map((a) => a.family);
  for (const family of families) {
    const myRel = input.my[`ipv2_mb_${family}_reliance`] ?? input.my[`ipv2_cmd_${family}_reliance`] ?? 0;
    const myExp = input.my[`ipv2_mb_${family}_exposure`] ?? input.my[`ipv2_cmd_${family}_exposure`] ?? 0;
    const myDis = input.my[`ipv2_mb_${family}_disruption`] ?? input.my[`ipv2_cmd_${family}_disruption`] ?? 0;
    const myRes = input.my[`ipv2_mb_${family}_resilience`] ?? input.my[`ipv2_cmd_${family}_resilience`] ?? 0;
    const oppRel = input.opp[`ipv2_mb_${family}_reliance`] ?? input.opp[`ipv2_cmd_${family}_reliance`] ?? 0;
    const oppDis = input.opp[`ipv2_mb_${family}_disruption`] ?? input.opp[`ipv2_cmd_${family}_disruption`] ?? 0;
    const oppExp = input.opp[`ipv2_mb_${family}_exposure`] ?? input.opp[`ipv2_cmd_${family}_exposure`] ?? 0;

    out[`pair_oppDisruptsMy_${family}`] = oppDis * myRel;
    out[`pair_myDisruptsOpp_${family}`] = myDis * oppRel;
    out[`pair_myDisruptsOppExp_${family}`] = myDis * oppExp;
    out[`pair_myResilienceVsOppDisrupt_${family}`] = myRes * oppDis;
  }
  return out;
}

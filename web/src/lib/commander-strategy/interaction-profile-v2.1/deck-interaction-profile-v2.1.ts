/**
 * Deck-level Interaction Profile v2.1 — separate MB/CMD blocks, tightened aggregation.
 */
import type { GoldenCatalogOracleCard } from "@/lib/deck-builder/golden-catalog/schemas";
import type { ShadowSemanticIndex } from "../shadow-semantic-index";
import type { DeckInteractionProfileV2_1, RpsVectorKind } from "./types";
import { DECK_INTERACTION_PROFILE_V2_1_VERSION } from "./types";
import { buildCardInteractionProfileV2_1 } from "./card-interaction-profile-v2.1";
import {
  deckFeatureKey,
  RELIANCE_CONTRIBUTOR_THRESHOLD,
  RPS_ONTOLOGY_V2_1,
} from "./rps-ontology-v2.1";
import type { RpsAxisFamily } from "./types";
import {
  MATCHUP_PAIRINGS_V2_1,
  profileKey,
  type MatchupPairingDef,
} from "./matchup-ontology-v2.1";

function weightedMean(rows: Array<{ weight: number; score: number }>): number {
  let num = 0;
  let den = 0;
  for (const r of rows) {
    num += r.weight * r.score;
    den += r.weight;
  }
  return den > 0 ? num / den : 0;
}

function relianceContributorFraction(
  rows: Array<{ weight: number; score: number }>,
  totalCards: number,
): number {
  if (totalCards <= 0) return 0;
  let contributors = 0;
  for (const r of rows) {
    if (r.score >= RELIANCE_CONTRIBUTOR_THRESHOLD) contributors += r.weight;
  }
  return Math.min(1, contributors / totalCards);
}

function aggregateVector(
  rows: Array<{ weight: number; score: number }>,
  vector: RpsVectorKind,
  totalCards: number,
): number {
  if (rows.length === 0) return 0;
  if (vector === "reliance") return relianceContributorFraction(rows, totalCards);
  if (vector === "exposure") return weightedMean(rows);
  return weightedMean(rows);
}

function aggregateZone(input: {
  cards: Array<{ oracleId: string; quantity: number; card: GoldenCatalogOracleCard }>;
  shadowIndex: ShadowSemanticIndex;
  zonePrefix: "mb" | "cmd";
}): Record<string, number> {
  const totalCards = input.cards.reduce((s, c) => s + c.quantity, 0);
  const accum = new Map<string, Array<{ weight: number; score: number }>>();

  for (const row of input.cards) {
    const shadow = input.shadowIndex.byOracleId.get(row.oracleId);
    if (!shadow) continue;
    const profile = buildCardInteractionProfileV2_1({
      oracleId: row.oracleId,
      card: row.card,
      actions: shadow.semantic.actions,
      abilities: shadow.semantic.abilities,
    });
    for (const axis of RPS_ONTOLOGY_V2_1) {
      const zone = input.zonePrefix === "mb" ? "mainboard" : "commandZone";
      if (!axis.zones.includes(zone)) continue;
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
    const vector = key.split("_").pop() as RpsVectorKind;
    out[key] = aggregateVector(accum.get(key)!, vector, totalCards);
  }
  return out;
}

export function buildDeckInteractionProfileV2_1(input: {
  mainboard: Array<{ oracleId: string; quantity: number; paperEligible: boolean }>;
  commandZoneOracleIds: string[];
  catalog: { byOracleId: Map<string, GoldenCatalogOracleCard> };
  shadowIndex: ShadowSemanticIndex;
}): DeckInteractionProfileV2_1 {
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
    profileVersion: DECK_INTERACTION_PROFILE_V2_1_VERSION,
    mainboard: aggregateZone({ cards: mbCards, shadowIndex: input.shadowIndex, zonePrefix: "mb" }),
    commandZone: aggregateZone({ cards: cmdCards, shadowIndex: input.shadowIndex, zonePrefix: "cmd" }),
  };
}

export function mergeDeckProfileVectors(profile: DeckInteractionProfileV2_1): Record<string, number> {
  return { ...profile.mainboard, ...profile.commandZone };
}

function vectorValue(profile: Record<string, number>, zone: "mainboard" | "commandZone", family: string, vector: string): number {
  return profile[profileKey(zone, family, vector)] ?? 0;
}

export function computeMatchupTerm(
  pairing: MatchupPairingDef,
  myProfile: Record<string, number>,
  oppProfile: Record<string, number>,
): number {
  const oppVal = vectorValue(oppProfile, pairing.oppVector.zone, pairing.oppVector.family, pairing.oppVector.vector);
  const myVal = vectorValue(myProfile, pairing.myVector.zone, pairing.myVector.family, pairing.myVector.vector);
  if (pairing.direction === "oppDisruptsMy") return oppVal * myVal;
  return myVal * oppVal;
}

export function computeAllMatchupTerms(input: {
  my: Record<string, number>;
  opp: Record<string, number>;
}): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of MATCHUP_PAIRINGS_V2_1) {
    out[p.termKey] = computeMatchupTerm(p, input.my, input.opp);
  }
  return out;
}

/** Trace dead-pair root cause (P3). */
export function traceMatchupPairing(input: {
  pairing: MatchupPairingDef;
  myProfile: Record<string, number>;
  oppProfile: Record<string, number>;
}): {
  termKey: string;
  oppSourceKey: string;
  oppSourceValue: number;
  mySourceKey: string;
  mySourceValue: number;
  product: number;
  zeroReason: string | null;
} {
  const oppSourceKey = profileKey(input.pairing.oppVector.zone, input.pairing.oppVector.family, input.pairing.oppVector.vector);
  const mySourceKey = profileKey(input.pairing.myVector.zone, input.pairing.myVector.family, input.pairing.myVector.vector);
  const oppSourceValue = input.oppProfile[oppSourceKey] ?? 0;
  const mySourceValue = input.myProfile[mySourceKey] ?? 0;
  const product = computeMatchupTerm(input.pairing, input.myProfile, input.oppProfile);
  let zeroReason: string | null = null;
  if (product === 0) {
    if (oppSourceValue === 0 && mySourceValue === 0) zeroReason = "both source vectors zero";
    else if (oppSourceValue === 0) zeroReason = `opp source ${oppSourceKey} is zero`;
    else zeroReason = `my source ${mySourceKey} is zero`;
  }
  return { termKey: input.pairing.termKey, oppSourceKey, oppSourceValue, mySourceKey, mySourceValue, product, zeroReason };
}

export { MATCHUP_PAIRINGS_V2_1 };

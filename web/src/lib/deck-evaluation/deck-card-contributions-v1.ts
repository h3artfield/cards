import type { GoldenCatalogOracleCard } from "@/lib/deck-builder/golden-catalog/schemas";
import type { ShadowSemanticIndex } from "../commander-strategy/shadow-semantic-index";
import {
  buildCardInteractionProfileV2_1,
} from "../commander-strategy/interaction-profile-v2.1/card-interaction-profile-v2.1";
import {
  deckFeatureKey,
  RPS_ONTOLOGY_V2_1,
} from "../commander-strategy/interaction-profile-v2.1/rps-ontology-v2.1";
import type { RpsAxisFamily, RpsVectorKind } from "../commander-strategy/interaction-profile-v2.1/types";
import type { CardContributionRecord } from "./types";

function dimensionIdForKey(key: string): string {
  const body = key.replace(/^ipv2_1_(mb|cmd)_/, "");
  const lastUnderscore = body.lastIndexOf("_");
  if (lastUnderscore < 0) return body;
  return body.slice(0, lastUnderscore);
}

export function buildCardContributions(input: {
  mainboard: Array<{ oracleId: string; quantity: number; card: GoldenCatalogOracleCard }>;
  commandZone: Array<{ oracleId: string; card: GoldenCatalogOracleCard }>;
  shadowIndex: ShadowSemanticIndex;
}): CardContributionRecord[] {
  const records: CardContributionRecord[] = [];

  function processCard(row: {
    oracleId: string;
    quantity: number;
    card: GoldenCatalogOracleCard;
    zone: "mainboard" | "commandZone";
  }) {
    const shadow = input.shadowIndex.byOracleId.get(row.oracleId);
    if (!shadow) return;
    const profile = buildCardInteractionProfileV2_1({
      oracleId: row.oracleId,
      card: row.card,
      actions: shadow.semantic.actions,
      abilities: shadow.semantic.abilities,
    });
    const zonePrefix = row.zone === "mainboard" ? "mb" : "cmd";
    for (const axis of RPS_ONTOLOGY_V2_1) {
      const zoneName = row.zone === "mainboard" ? "mainboard" : "commandZone";
      if (!axis.zones.includes(zoneName)) continue;
      for (const vector of axis.vectors) {
        const scored = profile.axes[axis.family as RpsAxisFamily]?.[vector as RpsVectorKind];
        if (!scored || scored.score <= 0) continue;
        const ipv2Key = deckFeatureKey(zonePrefix, axis.family, vector);
        records.push({
          oracleId: row.oracleId,
          cardName: row.card.canonicalName ?? row.oracleId,
          zone: row.zone,
          quantity: row.quantity,
          dimensionId: dimensionIdForKey(ipv2Key),
          ipv2Key,
          vectorKind: vector,
          rawScore: scored.score,
          weightedContribution: scored.score * row.quantity,
          contributionShare: 0,
          rulesTriggered: scored.evidence.map((e) => e.rule),
          evidenceRefs: scored.evidence,
        });
      }
    }
  }

  for (const row of input.mainboard) {
    processCard({ ...row, zone: "mainboard" });
  }
  for (const row of input.commandZone) {
    processCard({ oracleId: row.oracleId, quantity: 1, card: row.card, zone: "commandZone" });
  }

  const totalsByKey = new Map<string, number>();
  for (const rec of records) {
    totalsByKey.set(rec.ipv2Key, (totalsByKey.get(rec.ipv2Key) ?? 0) + rec.weightedContribution);
  }
  for (const rec of records) {
    const total = totalsByKey.get(rec.ipv2Key) ?? 0;
    rec.contributionShare = total > 0 ? rec.weightedContribution / total : 0;
  }

  return records.sort(
    (a, b) => b.contributionShare - a.contributionShare || a.ipv2Key.localeCompare(b.ipv2Key),
  );
}

export function zoneCoefficientMassFromContributions(
  contributions: CardContributionRecord[],
): Record<string, number> {
  const mass: Record<string, number> = {
    mainboardSelf: 0,
    commandZoneSelf: 0,
  };
  for (const rec of contributions) {
    const sq = rec.contributionShare * rec.contributionShare;
    if (rec.zone === "mainboard") mass.mainboardSelf! += sq;
    else mass.commandZoneSelf! += sq;
  }
  return mass;
}

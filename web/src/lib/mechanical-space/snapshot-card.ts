import type { GoldenCatalogOracleCard } from "@/lib/deck-builder/golden-catalog/schemas";
import type { SemanticMapPoint } from "@/lib/semantic-visualization/types";

/** Minimal golden-shaped card for recomputing the frozen RC8 feature vector. */
export function goldenCardFromSemanticPoint(point: SemanticMapPoint): GoldenCatalogOracleCard {
  return {
    id: point.oracleId,
    oracleId: point.oracleId,
    canonicalName: point.name,
    normalizedName: point.normalizedName,
    layout: point.layout,
    cardFaces:
      point.power || point.toughness
        ? [{ power: point.power, toughness: point.toughness }]
        : undefined,
    manaCost: point.manaCost,
    manaValue: point.manaValue,
    cmc: point.manaValue,
    colors: point.colorIdentity,
    colorIdentity: point.colorIdentity,
    typeLine: point.typeLine,
    supertypes: [],
    types: point.types,
    subtypes: point.subtypes,
    keywords: [],
    legalities: { commander: "legal" },
    commanderClassification: {
      structurallyEligible: point.commanderEligible,
      eligibilityBasis: point.commanderEligible ? "legendary_creature" : "not_eligible",
      commanderFormatStatus: "LEGAL",
      canOccupyCommandZone: point.commanderEligible,
      canBeSoleCommander: point.commanderEligible,
      canBePartOfCommandZone: point.commanderEligible,
      requiresCompatiblePair: false,
      pairingMechanic: "none",
      requiresPairedCommander: false,
      commanderColorIdentity: point.colorIdentity,
      reason: "reconstructed from frozen semantic-map point",
      sourceVersion: "mechanical-space-snapshot-v1",
    } as GoldenCatalogOracleCard["commanderClassification"],
    commanderEligibility: {
      eligible: point.commanderEligible,
      basis: point.commanderEligible ? "legendary_creature" : "not_eligible",
      commanderColorIdentity: point.colorIdentity,
      reason: "reconstructed from frozen semantic-map point",
      sourceVersion: "mechanical-space-snapshot-v1",
      canBeSoleCommander: point.commanderEligible,
    } as GoldenCatalogOracleCard["commanderEligibility"] & { canBeSoleCommander?: boolean },
    commanderEligibilityVersion: "mechanical-space-snapshot-v1",
    oracleTags: [],
    printingIds: [],
    sourceVersion: "mechanical-space-snapshot-v1",
    updatedAt: "2026-08-11T06:13:17.048Z",
  };
}

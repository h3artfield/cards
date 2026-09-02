/**
 * Professor v4.16.4 — one canonical Oracle record for all intelligence layers.
 */
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import type { CardFace, GoldenCatalogOracleCard } from "../deck-builder/golden-catalog/schemas";
import { resolveCanonicalCardIdentity } from "./professor-canonical-card-identity-v4-15-1-v1";

export const PROFESSOR_CANONICAL_CARD_TRUTH_V4_16_4_V1_VERSION = "professor-canonical-card-truth-v4-16-4-v1";

export type CardTruthResolutionStatusV4164 = "RESOLVED" | "CARD_TRUTH_UNRESOLVED";

export type CanonicalCardTruthV4164 = {
  version: typeof PROFESSOR_CANONICAL_CARD_TRUTH_V4_16_4_V1_VERSION;
  status: CardTruthResolutionStatusV4164;
  oracleId: string | null;
  name: string;
  manaCost?: string;
  manaValue: number | null;
  colors: string[];
  colorIdentity: string[];
  typeLine: string;
  supertypes: string[];
  cardTypes: string[];
  subtypes: string[];
  oracleText: string;
  keywords: string[];
  layout?: string;
  faces?: CardFace[];
  commanderLegality?: string;
};

export function parseTypeLineParts(typeLine: string): {
  supertypes: string[];
  cardTypes: string[];
  subtypes: string[];
} {
  const dash = typeLine.split("—").map((part) => part.trim());
  const left = dash[0] ?? typeLine;
  const subtypePart = dash[1] ?? "";
  const tokens = left.split(/\s+/).filter(Boolean);
  const knownSupertypes = new Set(["Legendary", "Basic", "Snow", "World"]);
  const knownTypes = new Set([
    "Artifact",
    "Battle",
    "Conspiracy",
    "Creature",
    "Enchantment",
    "Instant",
    "Kindred",
    "Land",
    "Planeswalker",
    "Sorcery",
    "Tribal",
  ]);
  const supertypes: string[] = [];
  const cardTypes: string[] = [];
  for (const token of tokens) {
    if (knownSupertypes.has(token)) supertypes.push(token);
    else if (knownTypes.has(token)) cardTypes.push(token);
  }
  const subtypes = subtypePart
    ? subtypePart.split(/\s+/).filter(Boolean)
    : [];
  return { supertypes, cardTypes, subtypes };
}

function truthFromGolden(card: GoldenCatalogOracleCard): CanonicalCardTruthV4164 {
  const parsed = parseTypeLineParts(card.typeLine ?? "");
  return {
    version: PROFESSOR_CANONICAL_CARD_TRUTH_V4_16_4_V1_VERSION,
    status: "RESOLVED",
    oracleId: card.oracleId,
    name: card.canonicalName,
    manaCost: card.manaCost,
    manaValue: card.manaValue,
    colors: [...(card.colors ?? [])],
    colorIdentity: [...(card.colorIdentity ?? [])],
    typeLine: card.typeLine ?? "",
    supertypes: card.supertypes?.length ? [...card.supertypes] : parsed.supertypes,
    cardTypes: card.types?.length ? [...card.types] : parsed.cardTypes,
    subtypes: card.subtypes?.length ? [...card.subtypes] : parsed.subtypes,
    oracleText: card.oracleText ?? "",
    keywords: [...(card.keywords ?? [])],
    layout: card.layout,
    faces: card.cardFaces,
    commanderLegality: card.legalities?.commander,
  };
}

export function resolveCanonicalCardTruthV4164(args: {
  name?: string | null;
  oracleId?: string | null;
  catalog?: DeckResolutionCatalog | null;
}): CanonicalCardTruthV4164 {
  const identity = resolveCanonicalCardIdentity({
    name: args.name,
    oracleId: args.oracleId,
    catalog: args.catalog ?? undefined,
  });
  const oracleId = identity.oracleId;
  const golden = oracleId && args.catalog ? args.catalog.byOracleId.get(oracleId) : null;
  if (golden) return truthFromGolden(golden);

  if (args.catalog && identity.canonicalName) {
    const normalized = identity.canonicalName.toLowerCase();
    for (const card of args.catalog.byOracleId.values()) {
      if (card.canonicalName.toLowerCase() === normalized) {
        return truthFromGolden(card);
      }
    }
  }

  return {
    version: PROFESSOR_CANONICAL_CARD_TRUTH_V4_16_4_V1_VERSION,
    status: "CARD_TRUTH_UNRESOLVED",
    oracleId,
    name: identity.canonicalName || identity.displayName || "unknown",
    manaValue: null,
    colors: [],
    colorIdentity: [],
    typeLine: "",
    supertypes: [],
    cardTypes: [],
    subtypes: [],
    oracleText: "",
    keywords: [],
  };
}

export function cardTruthAllowsIntelligenceParticipation(truth: CanonicalCardTruthV4164): boolean {
  return truth.status === "RESOLVED" && Boolean(truth.oracleId);
}

export function cardMatchesTypePredicate(
  truth: CanonicalCardTruthV4164,
  predicate: string,
): boolean {
  const lower = predicate.toLowerCase();
  const typeBlob = `${truth.typeLine} ${truth.cardTypes.join(" ")} ${truth.supertypes.join(" ")}`.toLowerCase();
  if (lower === "instant-or-sorcery" || lower === "instant or sorcery") {
    return truth.cardTypes.includes("Instant") || truth.cardTypes.includes("Sorcery");
  }
  if (lower === "artifact") return truth.cardTypes.includes("Artifact");
  if (lower === "creature") return truth.cardTypes.includes("Creature");
  if (lower === "enchantment") return truth.cardTypes.includes("Enchantment");
  if (lower === "planeswalker") return truth.cardTypes.includes("Planeswalker");
  if (lower === "land") return truth.cardTypes.includes("Land");
  if (lower === "basic land") {
    return truth.cardTypes.includes("Land") && truth.supertypes.includes("Basic");
  }
  if (lower.startsWith("instant")) return truth.cardTypes.includes("Instant");
  if (lower.startsWith("sorcery")) return truth.cardTypes.includes("Sorcery");
  return typeBlob.includes(lower);
}

export function cardLegalInCommanderColorIdentity(args: {
  card: CanonicalCardTruthV4164;
  commanderColorIdentity: string[];
}): boolean {
  if (args.card.status !== "RESOLVED") return false;
  if (args.commanderColorIdentity.length === 0) return true;
  const cardColors = args.card.colorIdentity.length > 0 ? args.card.colorIdentity : args.card.colors;
  return cardColors.every((color) => args.commanderColorIdentity.includes(color));
}

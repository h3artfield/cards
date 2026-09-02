import type { GoldenCatalogOracleCard } from "@/lib/deck-builder/golden-catalog/schemas";
import type { EligibleMainboardCard } from "./types";

const MV_BUCKETS = ["mv_0", "mv_1", "mv_2", "mv_3", "mv_4", "mv_5", "mv_6", "mv_7plus"] as const;

export const BASIC_STRUCTURE_FEATURE_NAMES = [
  "basic_landCountFraction",
  "basic_nonLandCountFraction",
  "basic_averageManaValue",
  "basic_medianManaValue",
  ...MV_BUCKETS.map((b) => `basic_${b}`),
  "basic_colorIdentityW",
  "basic_colorIdentityU",
  "basic_colorIdentityB",
  "basic_colorIdentityR",
  "basic_colorIdentityG",
  "basic_colorIdentityColorlessFraction",
  "basic_colorIdentityMulticolorCardFraction",
  "basic_creatureFraction",
  "basic_instantFraction",
  "basic_sorceryFraction",
  "basic_artifactFraction",
  "basic_enchantmentFraction",
  "basic_planeswalkerFraction",
  "basic_battleFraction",
  "basic_basicLandFraction",
  "basic_nonBasicLandFraction",
] as const;

function mvBucket(mv: number): (typeof MV_BUCKETS)[number] {
  if (mv <= 0) return "mv_0";
  if (mv >= 7) return "mv_7plus";
  return MV_BUCKETS[mv] ?? "mv_7plus";
}

/** Basic Land = Land type + Basic supertype (not subtype — e.g. Plains is a subtype). */
export function isBasicLandCard(card: GoldenCatalogOracleCard): boolean {
  return (card.types ?? []).includes("Land") && (card.supertypes ?? []).includes("Basic");
}

function isLand(card: GoldenCatalogOracleCard): boolean {
  return (card.types ?? []).includes("Land");
}

export function buildBasicStructureFeatures(input: {
  cards: EligibleMainboardCard[];
  catalogByOracleId: Map<string, GoldenCatalogOracleCard>;
}): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(
    BASIC_STRUCTURE_FEATURE_NAMES.map((name) => [name, 0]),
  );

  let totalQty = 0;
  let landQty = 0;
  let basicLandQty = 0;
  const mvWeighted: number[] = [];
  const mvValues: number[] = [];
  const typeCounts: Record<string, number> = {
    Creature: 0,
    Instant: 0,
    Sorcery: 0,
    Artifact: 0,
    Enchantment: 0,
    Planeswalker: 0,
    Battle: 0,
  };
  let colorlessCards = 0;
  let multicolorCards = 0;
  const colorCardCounts = { W: 0, U: 0, B: 0, R: 0, G: 0 };

  for (const row of input.cards) {
    const card = input.catalogByOracleId.get(row.oracleId);
    if (!card) continue;
    const qty = row.quantity;
    totalQty += qty;
    const mv = card.manaValue ?? card.cmc ?? 0;

    for (let i = 0; i < qty; i += 1) mvValues.push(mv);
    mvWeighted.push(mv * qty);

    const bucket = mvBucket(Math.max(0, Math.round(mv)));
    out[`basic_${bucket}`] = (out[`basic_${bucket}`] ?? 0) + qty;

    if (isLand(card)) {
      landQty += qty;
      if (isBasicLandCard(card)) basicLandQty += qty;
    }

    for (const t of card.types ?? []) {
      if (t in typeCounts) typeCounts[t as keyof typeof typeCounts] += qty;
    }

    const colors = card.colorIdentity ?? [];
    if (colors.length === 0) colorlessCards += qty;
    if (colors.length > 1) multicolorCards += qty;
    for (const c of colors) {
      if (c in colorCardCounts) colorCardCounts[c as keyof typeof colorCardCounts] += qty;
    }
  }

  if (totalQty === 0) return out;

  out.basic_landCountFraction = landQty / totalQty;
  out.basic_nonLandCountFraction = (totalQty - landQty) / totalQty;
  out.basic_averageManaValue = mvWeighted.reduce((a, b) => a + b, 0) / totalQty;
  mvValues.sort((a, b) => a - b);
  const mid = Math.floor(mvValues.length / 2);
  out.basic_medianManaValue =
    mvValues.length % 2 === 0
      ? (mvValues[mid - 1]! + mvValues[mid]!) / 2
      : mvValues[mid] ?? 0;

  for (const b of MV_BUCKETS) out[`basic_${b}`] = (out[`basic_${b}`] ?? 0) / totalQty;

  out.basic_colorIdentityW = colorCardCounts.W / totalQty;
  out.basic_colorIdentityU = colorCardCounts.U / totalQty;
  out.basic_colorIdentityB = colorCardCounts.B / totalQty;
  out.basic_colorIdentityR = colorCardCounts.R / totalQty;
  out.basic_colorIdentityG = colorCardCounts.G / totalQty;
  out.basic_colorIdentityColorlessFraction = colorlessCards / totalQty;
  out.basic_colorIdentityMulticolorCardFraction = multicolorCards / totalQty;

  out.basic_creatureFraction = typeCounts.Creature / totalQty;
  out.basic_instantFraction = typeCounts.Instant / totalQty;
  out.basic_sorceryFraction = typeCounts.Sorcery / totalQty;
  out.basic_artifactFraction = typeCounts.Artifact / totalQty;
  out.basic_enchantmentFraction = typeCounts.Enchantment / totalQty;
  out.basic_planeswalkerFraction = typeCounts.Planeswalker / totalQty;
  out.basic_battleFraction = typeCounts.Battle / totalQty;
  out.basic_basicLandFraction = basicLandQty / totalQty;
  out.basic_nonBasicLandFraction = (landQty - basicLandQty) / totalQty;

  return out;
}

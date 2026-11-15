/**
 * Card-structure-aware catalog population classification (A–E).
 *
 * Eligibility is defined from actual card structure, not top-level oracle_text alone.
 */
import { createHash } from "node:crypto";
import type { GoldenCatalogOracleCard } from "../../src/lib/deck-builder/golden-catalog/schemas";
import {
  combinedGoldenOracleText,
  goldenFaceRecords,
  goldenOracleTextHash,
  normalizeOracleTextForCompare,
} from "./load-golden-catalog-index";

export type CatalogPopulationCategory = "A" | "B" | "C" | "D" | "E";

export type CanonicalOracleFaceInput = {
  faceIndex: number;
  faceId: string;
  name: string;
  typeLine: string;
  oracleText: string;
};

export type CanonicalOracleInput = {
  oracleId: string;
  canonicalName: string;
  layout?: string;
  structure: "single_face" | "multi_face";
  faces: CanonicalOracleFaceInput[];
  combinedOracleText: string;
  cardStructureHash: string;
};

export type CatalogPopulationClassification = {
  oracleId: string;
  canonicalName: string;
  category: CatalogPopulationCategory;
  reason: string;
  layout?: string;
  typeLine: string;
  cardFacesCount: number;
  topLevelOracleTextPresent: boolean;
  anyFaceOracleTextPresent: boolean;
  combinedOracleTextPresent: boolean;
  parserEligible: boolean;
  studyPopulationEligible: boolean;
  canonicalInput: CanonicalOracleInput;
};

/** Layouts that require card_faces for a complete oracle record. */
export const MULTI_FACE_LAYOUTS = new Set([
  "transform",
  "modal_dfc",
  "meld",
  "split",
  "flip",
  "double_faced_token",
  "adventure",
  "reversible_card",
  "prototype",
]);

/** Layouts representing non-functional / non-Oracle semantic objects. */
export const NON_CARD_LAYOUTS = new Set([
  "token",
  "emblem",
  "vanguard",
  "scheme",
  "plane",
  "art_series",
]);

const VANILLA_CARD_TYPES = new Set([
  "Creature",
  "Land",
  "Artifact",
  "Enchantment",
  "Planeswalker",
  "Battle",
  "Instant",
  "Sorcery",
  "Kindred",
  "Tribal",
]);

function hasTopLevelOracleText(card: GoldenCatalogOracleCard): boolean {
  return normalizeOracleTextForCompare(card.oracleText).length > 0;
}

function faceOracleTexts(card: GoldenCatalogOracleCard): string[] {
  if (!card.cardFaces?.length) return [];
  return card.cardFaces.map((f) => normalizeOracleTextForCompare(f.oracleText)).filter(Boolean);
}

function anyFaceOracleText(card: GoldenCatalogOracleCard): boolean {
  return faceOracleTexts(card).length > 0;
}

function isNonCardTypeLine(typeLine: string): boolean {
  return /\bToken\b/i.test(typeLine) || /\bEmblem\b/i.test(typeLine) || /\bVanguard\b/i.test(typeLine);
}

function missingRequiredIdentity(card: GoldenCatalogOracleCard): string | null {
  if (!card.oracleId?.trim()) return "missing_oracle_id";
  if (!card.canonicalName?.trim()) return "missing_canonical_name";
  if (!card.typeLine?.trim()) return "missing_type_line";
  return null;
}

function multiFaceStructureDefect(card: GoldenCatalogOracleCard): string | null {
  const layout = card.layout ?? "normal";
  if (!MULTI_FACE_LAYOUTS.has(layout)) return null;

  const faces = card.cardFaces ?? [];
  if (faces.length === 0) return `layout_${layout}_missing_card_faces`;
  if (layout === "split" && faces.length < 2) return "split_layout_requires_two_faces";
  if (layout === "transform" && faces.length < 2) return "transform_layout_requires_two_faces";
  if (layout === "modal_dfc" && faces.length < 2) return "modal_dfc_layout_requires_two_faces";
  if (layout === "adventure" && faces.length < 2) return "adventure_layout_requires_two_faces";
  if (layout === "meld" && faces.length < 2) return "meld_layout_requires_two_faces";
  return null;
}

function isLegitimateBlankMagicCard(card: GoldenCatalogOracleCard): boolean {
  const identityGap = missingRequiredIdentity(card);
  if (identityGap) return false;

  const layout = card.layout ?? "normal";
  if (NON_CARD_LAYOUTS.has(layout)) return false;
  if (isNonCardTypeLine(card.typeLine)) return false;

  const structureDefect = multiFaceStructureDefect(card);
  if (structureDefect) return false;

  const hasRecognizedType = card.types.some((t) => VANILLA_CARD_TYPES.has(t));
  if (!hasRecognizedType && card.types.length > 0) return false;

  // Empty rules text with supertypes only (e.g. "Basic Land") or recognized types is valid.
  return true;
}

function isNonCardObject(card: GoldenCatalogOracleCard): boolean {
  const layout = card.layout ?? "normal";
  if (NON_CARD_LAYOUTS.has(layout)) return true;
  if (isNonCardTypeLine(card.typeLine)) return true;
  return false;
}

export function buildCanonicalOracleInput(card: GoldenCatalogOracleCard): CanonicalOracleInput {
  const faces = goldenFaceRecords(card).map((face) => ({
    faceIndex: face.faceIndex,
    faceId: face.faceId,
    name: face.faceName,
    typeLine:
      card.cardFaces?.[face.faceIndex]?.typeLine ??
      (face.faceIndex === 0 ? card.typeLine : ""),
    oracleText: normalizeOracleTextForCompare(face.oracleText),
  }));

  const structure: CanonicalOracleInput["structure"] =
    faces.length > 1 || (card.layout && MULTI_FACE_LAYOUTS.has(card.layout))
      ? "multi_face"
      : "single_face";

  const combinedOracleText = combinedGoldenOracleText(card);
  const hashPayload = faces
    .map(
      (f) =>
        `${f.faceId}|${f.name}|${f.typeLine}|${goldenOracleTextHash(f.oracleText)}`,
    )
    .join("\n");
  const cardStructureHash = createHash("sha256")
    .update(`${card.oracleId}\n${card.layout ?? ""}\n${hashPayload}`)
    .digest("hex");

  return {
    oracleId: card.oracleId,
    canonicalName: card.canonicalName,
    layout: card.layout,
    structure,
    faces,
    combinedOracleText,
    cardStructureHash,
  };
}

export function classifyCatalogPopulationRecord(
  card: GoldenCatalogOracleCard,
): CatalogPopulationClassification {
  const topLevelOracleTextPresent = hasTopLevelOracleText(card);
  const anyFaceOracleTextPresent = anyFaceOracleText(card);
  const combinedOracleTextPresent =
    normalizeOracleTextForCompare(combinedGoldenOracleText(card)).length > 0;
  const canonicalInput = buildCanonicalOracleInput(card);
  const cardFacesCount = card.cardFaces?.length ?? 0;

  let category: CatalogPopulationCategory;
  let reason: string;

  if (topLevelOracleTextPresent) {
    category = "A";
    reason = "top_level_oracle_text_present";
  } else if (anyFaceOracleTextPresent) {
    category = "B";
    reason = "face_only_oracle_text_present";
  } else {
    const identityGap = missingRequiredIdentity(card);
    if (identityGap) {
      category = "E";
      reason = identityGap;
    } else {
      const structureDefect = multiFaceStructureDefect(card);
      if (structureDefect) {
        category = "E";
        reason = structureDefect;
      } else if (isNonCardObject(card)) {
        category = "D";
        reason = NON_CARD_LAYOUTS.has(card.layout ?? "")
          ? `non_card_layout_${card.layout}`
          : "non_card_type_line";
      } else if (isLegitimateBlankMagicCard(card)) {
        category = "C";
        reason = "legitimate_blank_rules_text";
      } else {
        category = "E";
        reason = "unclassified_incomplete_record";
      }
    }
  }

  const studyPopulationEligible = category === "A" || category === "B" || category === "C";
  const parserEligible = studyPopulationEligible;

  return {
    oracleId: card.oracleId,
    canonicalName: card.canonicalName,
    category,
    reason,
    layout: card.layout,
    typeLine: card.typeLine ?? "",
    cardFacesCount,
    topLevelOracleTextPresent,
    anyFaceOracleTextPresent,
    combinedOracleTextPresent,
    parserEligible,
    studyPopulationEligible,
    canonicalInput,
  };
}

export type CategoryDetailRow = {
  oracleId: string;
  canonicalName: string;
  category: CatalogPopulationCategory;
  reason: string;
  layout?: string;
  typeLine: string;
  cardFacesCount: number;
};

export function summarizeCategoryDetails(
  rows: CatalogPopulationClassification[],
  category: CatalogPopulationCategory,
  exampleLimit = 8,
): {
  count: number;
  layoutDistribution: Record<string, number>;
  typeLineSamples: string[];
  cardFacesCountDistribution: Record<string, number>;
  representativeExamples: CategoryDetailRow[];
} {
  const subset = rows.filter((r) => r.category === category);
  const layoutDistribution: Record<string, number> = {};
  const cardFacesCountDistribution: Record<string, number> = {};
  const typeLineSet = new Set<string>();

  for (const row of subset) {
    const layoutKey = row.layout ?? "(none)";
    layoutDistribution[layoutKey] = (layoutDistribution[layoutKey] ?? 0) + 1;
    const faceKey = String(row.cardFacesCount);
    cardFacesCountDistribution[faceKey] = (cardFacesCountDistribution[faceKey] ?? 0) + 1;
    if (typeLineSet.size < 20) typeLineSet.add(row.typeLine);
  }

  const byLayout = new Map<string, CatalogPopulationClassification[]>();
  for (const row of subset) {
    const key = row.layout ?? "(none)";
    const bucket = byLayout.get(key) ?? [];
    bucket.push(row);
    byLayout.set(key, bucket);
  }

  const representativeExamples: CategoryDetailRow[] = [];
  for (const [, bucket] of [...byLayout.entries()].sort((a, b) => b[1].length - a[1].length)) {
    for (const row of bucket.slice(0, 2)) {
      if (representativeExamples.length >= exampleLimit) break;
      representativeExamples.push({
        oracleId: row.oracleId,
        canonicalName: row.canonicalName,
        category: row.category,
        reason: row.reason,
        layout: row.layout,
        typeLine: row.typeLine,
        cardFacesCount: row.cardFacesCount,
      });
    }
    if (representativeExamples.length >= exampleLimit) break;
  }

  return {
    count: subset.length,
    layoutDistribution: Object.fromEntries(
      Object.entries(layoutDistribution).sort((a, b) => b[1] - a[1]),
    ),
    typeLineSamples: [...typeLineSet].slice(0, 20),
    cardFacesCountDistribution: Object.fromEntries(
      Object.entries(cardFacesCountDistribution).sort((a, b) => Number(a[0]) - Number(b[0])),
    ),
    representativeExamples,
  };
}

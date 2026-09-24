/**
 * Multi-strategy catalog card resolution — face names, split ordering, Adventure pairs.
 */
import { normalizeOracleName } from "../../src/lib/deck-builder/golden-catalog/normalize-name";
import {
  combinedGoldenOracleText,
  goldenFaceRecords,
  lookupGoldenByName,
  type GoldenCatalogIndex,
  type GoldenCatalogOracleCard,
} from "./load-golden-catalog-index";

export type SeedNameClassification =
  | "exact_canonical"
  | "exact_face_name"
  | "reversed_split_name"
  | "partial_multiface_name"
  | "adventure_spell_name"
  | "adventure_creature_name"
  | "oracle_id"
  | "alias_lookup"
  | "fuzzy_confirmed"
  | "typo"
  | "wrong_companion_face"
  | "stale_historical_name"
  | "ambiguous_face_name"
  | "truly_nonexistent"
  | "catalog_omission";

export interface CatalogFaceRef {
  card: GoldenCatalogOracleCard;
  faceIndex: number;
  faceName: string;
  faceId: string;
}

export interface CatalogResolverIndexes {
  byNormalizedFaceName: Map<string, CatalogFaceRef[]>;
  /** Explicit alias → canonical full name (curated corrections). */
  aliases: Map<string, string>;
}

const CURATED_ALIASES: Record<string, string> = {
  "dawndusk": "Dusk // Dawn",
  "duskdawn": "Dusk // Dawn",
  "brazenborrower": "Brazen Borrower // Petty Theft",
  "emberethshieldbreakerheartofardente": "Embereth Shieldbreaker // Battle Display",
  "emberethshieldbreaker": "Embereth Shieldbreaker // Battle Display",
  "heartofardente": "Battle Display",
};

export function buildCatalogResolverIndexes(catalog: GoldenCatalogIndex): CatalogResolverIndexes {
  const byNormalizedFaceName = new Map<string, CatalogFaceRef[]>();

  for (const card of catalog.byOracleId.values()) {
    const faces = goldenFaceRecords(card);
    for (const face of faces) {
      const norm = normalizeOracleName(face.faceName);
      const bucket = byNormalizedFaceName.get(norm) ?? [];
      bucket.push({
        card,
        faceIndex: face.faceIndex,
        faceName: face.faceName,
        faceId: face.faceId,
      });
      byNormalizedFaceName.set(norm, bucket);
    }
    // Also index canonical name as a face ref (front)
    const canonNorm = normalizeOracleName(card.canonicalName);
    if (!byNormalizedFaceName.has(canonNorm)) {
      byNormalizedFaceName.set(canonNorm, [
        {
          card,
          faceIndex: 0,
          faceName: card.canonicalName,
          faceId: "front",
        },
      ]);
    }
  }

  const aliases = new Map<string, string>();
  for (const [k, v] of Object.entries(CURATED_ALIASES)) {
    aliases.set(k, v);
  }

  return { byNormalizedFaceName, aliases };
}

function reversedSplitName(name: string): string | null {
  if (!name.includes("//")) return null;
  const parts = name.split("//").map((p) => p.trim());
  if (parts.length !== 2) return null;
  return `${parts[1]} // ${parts[0]}`;
}

function pickUniqueCard(refs: CatalogFaceRef[]): GoldenCatalogOracleCard | null {
  const ids = new Set(refs.map((r) => r.card.oracleId));
  if (ids.size !== 1) return null;
  return refs[0]!.card;
}

function lookupByFaceName(
  indexes: CatalogResolverIndexes,
  name: string,
): { card: GoldenCatalogOracleCard; faceIndex: number; faceName: string; faceId: string } | null {
  const refs = indexes.byNormalizedFaceName.get(normalizeOracleName(name));
  if (!refs?.length) return null;
  const card = pickUniqueCard(refs);
  if (!card) {
    // If multiple cards share face name, prefer exact face name match
    const exact = refs.find((r) => r.faceName === name);
    if (exact) return exact;
    return refs[0] ?? null;
  }
  const ref = refs.find((r) => r.card.oracleId === card.oracleId && r.faceName === name) ?? refs.find((r) => r.card.oracleId === card.oracleId);
  return ref ?? null;
}

export interface ResolveCatalogSeedInput {
  name?: string;
  oracleId?: string;
  layout?: string;
  face?: string;
}

export interface CatalogResolutionResult {
  card: GoldenCatalogOracleCard;
  canonicalName: string;
  oracleId: string;
  oracleText: string;
  layout?: string;
  faceIndex?: number;
  faceName?: string;
  faceId?: string;
  matchedBy: SeedNameClassification;
  attemptedName: string;
  correctedName?: string;
}

export function resolveCatalogSeed(
  catalog: GoldenCatalogIndex,
  indexes: CatalogResolverIndexes,
  input: ResolveCatalogSeedInput,
): CatalogResolutionResult | null {
  const attempted = input.name?.trim() ?? input.oracleId ?? "";

  if (input.oracleId) {
    const card = catalog.byOracleId.get(input.oracleId);
    if (card) {
      return finalizeResolution(card, "oracle_id", attempted, input.face);
    }
  }

  if (!input.name?.trim()) return null;
  const name = input.name.trim();

  // Curated alias → canonical name (no recursive alias chain)
  const aliasTarget = indexes.aliases.get(normalizeOracleName(name));
  if (aliasTarget && aliasTarget !== name) {
    const aliasCard = lookupGoldenByName(catalog, aliasTarget);
    if (aliasCard) {
      const cls: SeedNameClassification = name.includes("//")
        ? "wrong_companion_face"
        : "partial_multiface_name";
      return {
        ...finalizeResolution(aliasCard, cls, name, input.face)!,
        correctedName: aliasTarget,
      };
    }
    const aliasFace = lookupByFaceName(indexes, aliasTarget);
    if (aliasFace) {
      return {
        ...finalizeResolution(
          aliasFace.card,
          "partial_multiface_name",
          name,
          input.face ?? aliasFace.faceId,
          aliasFace.faceIndex,
          aliasFace.faceName,
          aliasFace.faceId,
        )!,
        correctedName: aliasFace.card.canonicalName,
      };
    }
  }

  // Exact canonical
  const exact = lookupGoldenByName(catalog, name);
  if (exact) {
    return finalizeResolution(exact, "exact_canonical", name, input.face);
  }

  // Face name
  const faceHit = lookupByFaceName(indexes, name);
  if (faceHit) {
    return finalizeResolution(
      faceHit.card,
      "exact_face_name",
      name,
      input.face ?? faceHit.faceId,
      faceHit.faceIndex,
      faceHit.faceName,
      faceHit.faceId,
    );
  }

  // Reversed split
  const reversed = reversedSplitName(name);
  if (reversed) {
    const rev = lookupGoldenByName(catalog, reversed);
    if (rev) {
      return {
        ...finalizeResolution(rev, "reversed_split_name", name, input.face)!,
        correctedName: reversed,
      };
    }
    const revFace = lookupByFaceName(indexes, reversed.split("//")[0]?.trim() ?? "");
    if (revFace) {
      return {
        ...finalizeResolution(revFace.card, "reversed_split_name", name, input.face, revFace.faceIndex, revFace.faceName, revFace.faceId)!,
        correctedName: revFace.card.canonicalName,
      };
    }
  }

  // Partial multiface: single side before //
  if (!name.includes("//")) {
    for (const card of catalog.byOracleId.values()) {
      if (!card.canonicalName.includes("//")) continue;
      const [left, right] = card.canonicalName.split("//").map((s) => s.trim());
      if (normalizeOracleName(left) === normalizeOracleName(name) || normalizeOracleName(right) === normalizeOracleName(name)) {
        const faces = goldenFaceRecords(card);
        const faceIdx = normalizeOracleName(left) === normalizeOracleName(name) ? 0 : 1;
        const face = faces[faceIdx];
        const cls: SeedNameClassification =
          card.layout === "adventure" && faceIdx === 1 ? "adventure_spell_name" : "partial_multiface_name";
        return finalizeResolution(
          card,
          cls,
          name,
          input.face ?? face?.faceId,
          face?.faceIndex,
          face?.faceName,
          face?.faceId,
        );
      }
    }
  }

  // Unique prefix on canonical name (Purphoros → Purphoros, God of the Forge)
  const prefixMatches: GoldenCatalogOracleCard[] = [];
  for (const card of catalog.byOracleId.values()) {
    if (card.canonicalName.toLowerCase().startsWith(name.toLowerCase())) {
      prefixMatches.push(card);
    }
  }
  if (prefixMatches.length === 1) {
    return finalizeResolution(prefixMatches[0]!, "stale_historical_name", name, input.face);
  }

  // Fuzzy: normalized contains (single candidate only)
  const norm = normalizeOracleName(name);
  const fuzzyCanonical: GoldenCatalogOracleCard[] = [];
  for (const card of catalog.byOracleId.values()) {
    const cn = normalizeOracleName(card.canonicalName);
    if (cn.includes(norm) || norm.includes(cn)) fuzzyCanonical.push(card);
  }
  if (fuzzyCanonical.length === 1) {
    return finalizeResolution(fuzzyCanonical[0]!, "fuzzy_confirmed", name, input.face);
  }

  return null;
}

/** Find catalog card whose combined oracle text contains the query (unique match preferred). */
export function resolveByOracleTextEvidence(
  catalog: GoldenCatalogIndex,
  oracleTextFragment: string,
): CatalogResolutionResult | null {
  const normFragment = oracleTextFragment.trim().toLowerCase();
  if (normFragment.length < 12) return null;

  const matches: GoldenCatalogOracleCard[] = [];
  for (const card of catalog.byOracleId.values()) {
    const combined = combinedGoldenOracleText(card).toLowerCase();
    if (combined.includes(normFragment)) matches.push(card);
  }
  if (matches.length === 1) {
    return finalizeResolution(matches[0]!, "alias_lookup", oracleTextFragment);
  }
  // Prefer shortest oracle text (closest fragment card)
  if (matches.length > 1) {
    matches.sort((a, b) => combinedGoldenOracleText(a).length - combinedGoldenOracleText(b).length);
    const shortest = matches[0]!;
    if (combinedGoldenOracleText(shortest).length <= normFragment.length * 2) {
      return finalizeResolution(shortest, "alias_lookup", oracleTextFragment);
    }
  }
  return null;
}

function finalizeResolution(
  card: GoldenCatalogOracleCard,
  matchedBy: SeedNameClassification,
  attemptedName: string,
  face?: string,
  faceIndex?: number,
  faceName?: string,
  faceId?: string,
): CatalogResolutionResult {
  const faces = goldenFaceRecords(card);
  let fi = faceIndex;
  let fn = faceName;
  let fid = faceId;
  if (face && fi === undefined) {
    if (face === "front" || face === "back") {
      const f = faces.find((x) => x.faceId === face);
      fi = f?.faceIndex;
      fn = f?.faceName;
      fid = f?.faceId;
    }
  }
  return {
    card,
    canonicalName: card.canonicalName,
    oracleId: card.oracleId,
    oracleText: combinedGoldenOracleText(card),
    layout: card.layout,
    faceIndex: fi,
    faceName: fn,
    faceId: fid,
    matchedBy,
    attemptedName,
  };
}

export function classifyUnresolvedSeed(
  attemptedName: string,
  catalog: GoldenCatalogIndex,
  indexes: CatalogResolverIndexes,
): SeedNameClassification {
  if (indexes.aliases.has(normalizeOracleName(attemptedName))) return "typo";
  if (attemptedName.includes("//") && reversedSplitName(attemptedName)) {
    const rev = reversedSplitName(attemptedName)!;
    if (lookupGoldenByName(catalog, rev)) return "reversed_split_name";
  }
  if (!attemptedName.includes("//")) {
    for (const card of catalog.byOracleId.values()) {
      if (card.canonicalName.includes("//")) {
        const parts = card.canonicalName.split("//").map((s) => s.trim());
        if (parts.some((p) => normalizeOracleName(p) === normalizeOracleName(attemptedName))) {
          return "partial_multiface_name";
        }
      }
    }
  }
  return "truly_nonexistent";
}

import type { CatalogPrinting } from "./schemas";
import { normalizeOracleName } from "./normalize-name";
import { isCommanderFormatLegal } from "../commander-classification";
import { catalogCardFromScryfall } from "../scryfall-catalog";

function extractOracleId(raw: Record<string, unknown>): string | undefined {
  const top = raw.oracle_id as string | undefined;
  if (top?.trim()) return top.trim();
  const faces = raw.card_faces as Array<{ oracle_id?: string }> | undefined;
  for (const face of faces ?? []) {
    if (face.oracle_id?.trim()) return face.oracle_id.trim();
  }
  return undefined;
}

function extractName(raw: Record<string, unknown>): string | undefined {
  const top = raw.name as string | undefined;
  if (top?.trim()) return top.trim();
  const faces = raw.card_faces as Array<{ name?: string }> | undefined;
  return faces?.[0]?.name?.trim();
}

function extractImages(raw: Record<string, unknown>): CatalogPrinting["images"] {
  const imageUris = raw.image_uris as Record<string, string> | undefined;
  const cardFaces = raw.card_faces as Array<{ image_uris?: Record<string, string> }> | undefined;
  const uris = imageUris ?? cardFaces?.[0]?.image_uris;
  if (!uris) return undefined;
  return {
    small: uris.small,
    normal: uris.normal,
    large: uris.large,
    artCrop: uris.art_crop,
  };
}

export function isPaperPrinting(raw: Record<string, unknown>): boolean {
  const games = raw.games as string[] | undefined;
  if (games?.length && !games.includes("paper")) return false;
  if (raw.layout === "token") return false;
  const typeLine = String(raw.type_line ?? "").toLowerCase();
  if (typeLine.includes("token")) return false;
  return true;
}

/** Parse one Scryfall default_cards bulk row into a golden printing record. */
export function parsePrintingFromBulk(
  raw: Record<string, unknown>,
  input?: { bulkUpdatedAt?: string },
): CatalogPrinting | null {
  const scryfallId = raw.id as string | undefined;
  const oracleId = extractOracleId(raw);
  const name = extractName(raw);
  if (!scryfallId || !oracleId || !name) return null;
  if (!isPaperPrinting(raw)) return null;

  const legalities = (raw.legalities as Record<string, string>) ?? {};
  const finishes = (raw.finishes as string[] | undefined) ?? [];
  const now = new Date().toISOString();
  const bulkStamp = input?.bulkUpdatedAt ?? now;
  const legacy = catalogCardFromScryfall(raw);

  return {
    scryfallId,
    oracleId,
    name,
    normalizedName: normalizeOracleName(name),
    setCode: String(raw.set ?? ""),
    setName: raw.set_name as string | undefined,
    collectorNumber: String(raw.collector_number ?? ""),
    language: raw.lang as string | undefined,
    finishes: finishes.length ? finishes : undefined,
    rarity: raw.rarity as string | undefined,
    releasedAt: raw.released_at as string | undefined,
    images: extractImages(raw),
    tcgplayerId:
      raw.tcgplayer_id != null ? String(raw.tcgplayer_id) : undefined,
    cardmarketId:
      raw.cardmarket_id != null ? String(raw.cardmarket_id) : undefined,
    foil: finishes.includes("foil"),
    nonfoil: finishes.includes("nonfoil"),
    promo: Boolean(raw.promo),
    digital: Boolean(raw.digital),
    games: raw.games as string[] | undefined,
    commanderFormatLegal: isCommanderFormatLegal(legalities),
    colorIdentity: (raw.color_identity as string[]) ?? [],
    colors: legacy?.colors,
    typeLine: String(raw.type_line ?? ""),
    oracleText: legacy?.oracleText,
    manaCost: raw.mana_cost as string | undefined,
    cmc: Number(raw.cmc ?? 0),
    keywords: legacy?.keywords,
    catalogStatus: "current",
    sourceVersion: `scryfall-default_cards:${bulkStamp}`,
    lastSeenBulkVersion: `scryfall-default_cards:${bulkStamp}`,
    updatedAt: now,
  };
}

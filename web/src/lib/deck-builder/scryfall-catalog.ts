import { scryfallFetch } from "../processing/scryfall-client";
import type { CatalogCard } from "./types";

function extractOracleText(raw: Record<string, unknown>): string | undefined {
  const top = raw.oracle_text as string | undefined;
  if (top?.trim()) return top.trim();
  const faces = raw.card_faces as Array<{ oracle_text?: string }> | undefined;
  if (faces?.length) {
    const combined = faces
      .map((face) => face.oracle_text?.trim())
      .filter(Boolean)
      .join("\n//\n");
    if (combined) return combined;
  }
  return undefined;
}

function extractKeywords(raw: Record<string, unknown>): string[] {
  const keywords = raw.keywords as string[] | undefined;
  if (keywords?.length) return keywords;
  const faces = raw.card_faces as Array<{ keywords?: string[] }> | undefined;
  const merged = new Set<string>();
  for (const face of faces ?? []) {
    for (const keyword of face.keywords ?? []) merged.add(keyword);
  }
  return [...merged];
}

export function catalogCardFromScryfall(raw: Record<string, unknown>): CatalogCard | null {
  const id = raw.id as string | undefined;
  const name =
    (raw.name as string | undefined)?.trim() ||
    (raw.card_faces as Array<{ name?: string }> | undefined)?.[0]?.name?.trim();
  if (!id || !name) return null;

  const oracleId =
    (raw.oracle_id as string | undefined)?.trim() ||
    (raw.card_faces as Array<{ oracle_id?: string }> | undefined)
      ?.map((f) => f.oracle_id?.trim())
      .find(Boolean);

  const legalities = raw.legalities as Record<string, string> | undefined;
  const commanderFormatLegal = legalities?.commander === "legal";
  const imageUris = raw.image_uris as Record<string, string> | undefined;
  const cardFaces = raw.card_faces as Array<{ image_uris?: Record<string, string> }> | undefined;
  const faceImages = cardFaces?.[0]?.image_uris ?? imageUris;
  const tcgplayer = raw.tcgplayer_id as number | undefined;
  const edhrecRank = raw.edhrec_rank as number | undefined;
  const keywords = extractKeywords(raw);
  const colors = (raw.colors as string[] | undefined) ?? [];

  return {
    id,
    oracleId,
    name,
    set: String(raw.set ?? ""),
    setName: raw.set_name as string | undefined,
    collectorNumber: String(raw.collector_number ?? ""),
    manaCost: raw.mana_cost as string | undefined,
    cmc: Number(raw.cmc ?? 0),
    typeLine: String(raw.type_line ?? ""),
    oracleText: extractOracleText(raw),
    keywords: keywords.length ? keywords : undefined,
    colors: colors.length ? colors : undefined,
    colorIdentity: (raw.color_identity as string[]) ?? [],
    rarity: raw.rarity as string | undefined,
    commanderFormatLegal,
    isCommander: false,
    legalities,
    imageNormal: faceImages?.normal,
    imageArtCrop: faceImages?.art_crop,
    tcgplayerId: tcgplayer != null ? String(tcgplayer) : undefined,
    edhrecRank,
    gameChanger: Boolean(raw.game_changer),
    scryfallUri: raw.scryfall_uri as string | undefined,
    updatedAt: new Date().toISOString(),
  };
}

export async function fetchScryfallCardById(
  scryfallId: string,
): Promise<CatalogCard | null> {
  try {
    const res = await scryfallFetch(
      `https://api.scryfall.com/cards/${encodeURIComponent(scryfallId)}`,
    );
    if (!res.ok) return null;
    const raw = (await res.json()) as Record<string, unknown>;
    return catalogCardFromScryfall(raw);
  } catch {
    return null;
  }
}

export async function fetchScryfallByTcgplayerId(
  tcgplayerId: string,
): Promise<CatalogCard | null> {
  try {
    const res = await scryfallFetch(
      `https://api.scryfall.com/cards/tcgplayer/${encodeURIComponent(tcgplayerId)}`,
    );
    if (!res.ok) return null;
    const raw = (await res.json()) as Record<string, unknown>;
    return catalogCardFromScryfall(raw);
  } catch {
    return null;
  }
}

export async function importScryfallCardsBatch(
  scryfallIds: string[],
  onEach?: (card: CatalogCard) => Promise<void>,
): Promise<{ imported: number; failed: number }> {
  let imported = 0;
  let failed = 0;
  const unique = [...new Set(scryfallIds.filter(Boolean))];

  for (const id of unique) {
    const card = await fetchScryfallCardById(id);
    if (card) {
      await onEach?.(card);
      imported += 1;
    } else {
      failed += 1;
    }
    await new Promise((r) => setTimeout(r, 100));
  }

  return { imported, failed };
}

/** Fetch Scryfall bulk data metadata and return a download URI for the given type. */
export async function fetchScryfallBulkDownloadUri(
  type = "default_cards",
): Promise<string | null> {
  try {
    const res = await scryfallFetch("https://api.scryfall.com/bulk-data");
    if (!res.ok) return null;
    const body = (await res.json()) as {
      data?: Array<{
        type: string;
        download_uri?: string;
        jsonl_download_uri?: string;
      }>;
    };
    const entry = body.data?.find((d) => d.type === type);
    return entry?.jsonl_download_uri ?? entry?.download_uri ?? null;
  } catch {
    return null;
  }
}

/** Fetch Scryfall bulk data metadata and return default_cards JSONL download URI. */
export async function fetchScryfallBulkJsonlUri(): Promise<string | null> {
  return fetchScryfallBulkDownloadUri("default_cards");
}

/** Parse commander-legal cards from bulk JSON array (filter in memory). */
export function filterCommanderLegalFromBulk(
  cards: Record<string, unknown>[],
): CatalogCard[] {
  const out: CatalogCard[] = [];
  const seen = new Set<string>();
  for (const raw of cards) {
    const legalities = raw.legalities as Record<string, string> | undefined;
    if (legalities?.commander !== "legal") continue;
    const parsed = catalogCardFromScryfall(raw);
    if (!parsed || seen.has(parsed.id)) continue;
    seen.add(parsed.id);
    out.push(parsed);
  }
  return out;
}

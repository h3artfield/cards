import type { CatalogSource } from "../card-flow-v2/types";
import type { CardCategory, CollectionCard } from "../types";
import { dataStore } from "../storage/data-store";
import { collectionCardQuantity } from "./owned-index";
import { parseCollectionFinish, type CollectionFinish } from "./collection-finish";

export const SCAN_CATALOG_GAMES = ["magic", "pokemon", "yugioh"] as const;
export type ScanCatalogGame = (typeof SCAN_CATALOG_GAMES)[number];

export type CollectionCatalogAddInput = {
  category: ScanCatalogGame;
  catalogSource: CatalogSource;
  catalogId: string;
  displayName: string;
  setName?: string;
  cardNumber?: string;
  quantity?: number;
  finish?: CollectionFinish;
};

const CATALOG_SOURCES: CatalogSource[] = [
  "scryfall",
  "pokemon_tcg",
  "ygoprodeck",
];

export function inferCatalogSource(category: ScanCatalogGame): CatalogSource {
  if (category === "magic") return "scryfall";
  if (category === "pokemon") return "pokemon_tcg";
  return "ygoprodeck";
}

export function parseCatalogSource(value: unknown): CatalogSource | null {
  if (typeof value !== "string") return null;
  const raw = value.trim().toLowerCase();
  if (raw === "pokemontcg" || raw === "pokemon-tcg") return "pokemon_tcg";
  if (CATALOG_SOURCES.includes(raw as CatalogSource)) {
    return raw as CatalogSource;
  }
  return null;
}

export function parseScanCatalogGame(value: unknown): ScanCatalogGame | null {
  if (typeof value !== "string") return null;
  const raw = value.trim().toLowerCase();
  return SCAN_CATALOG_GAMES.includes(raw as ScanCatalogGame)
    ? (raw as ScanCatalogGame)
    : null;
}

export function parseCollectionCatalogAdd(
  body: Record<string, unknown>,
): CollectionCatalogAddInput | null {
  const catalogId =
    typeof body.catalogId === "string" ? body.catalogId.trim() : "";
  if (!catalogId) return null;

  const category =
    parseScanCatalogGame(body.category) ??
    (parseCatalogSource(body.catalogSource) === "scryfall"
      ? "magic"
      : parseCatalogSource(body.catalogSource) === "pokemon_tcg"
        ? "pokemon"
        : parseCatalogSource(body.catalogSource) === "ygoprodeck"
          ? "yugioh"
          : null);
  if (!category) return null;

  const catalogSource =
    parseCatalogSource(body.catalogSource) ?? inferCatalogSource(category);
  const displayName =
    typeof body.displayName === "string" ? body.displayName.trim() : "";
  const setName =
    typeof body.setName === "string" ? body.setName.trim() || undefined : undefined;
  const cardNumber =
    typeof body.cardNumber === "string"
      ? body.cardNumber.replace(/^#/, "").trim() || undefined
      : undefined;
  const quantityRaw =
    typeof body.quantity === "number"
      ? body.quantity
      : typeof body.quantity === "string"
        ? Number(body.quantity)
        : 1;
  const quantity = Math.max(1, Math.floor(quantityRaw) || 1);

  return {
    category,
    catalogSource,
    catalogId,
    displayName,
    setName,
    cardNumber,
    quantity,
    finish: parseCollectionFinish(body.finish),
  };
}

export function collectionPrintingMatchKey(
  card: Pick<
    CollectionCard,
    "catalogSource" | "catalogId" | "scryfallId" | "category" | "finish"
  >,
): string | null {
  const finish = parseCollectionFinish(card.finish);
  if (card.catalogSource && card.catalogId?.trim()) {
    return `${card.catalogSource}:${card.catalogId.trim()}:${finish}`;
  }
  if (card.scryfallId?.trim()) return `scryfall:${card.scryfallId.trim()}:${finish}`;
  return null;
}

export function catalogAddMatchKey(input: CollectionCatalogAddInput): string {
  const finish = parseCollectionFinish(input.finish);
  if (input.category === "magic") return `scryfall:${input.catalogId}:${finish}`;
  return `${input.catalogSource}:${input.catalogId}:${finish}`;
}

export function findOwnedCatalogPrinting(
  cards: CollectionCard[],
  key: string,
): CollectionCard | undefined {
  return cards.find(
    (card) =>
      card.status === "owned" && collectionPrintingMatchKey(card) === key,
  );
}

export async function incrementOwnedPrinting(
  card: CollectionCard,
  quantity: number,
): Promise<CollectionCard> {
  const next = collectionCardQuantity(card) + Math.max(1, Math.floor(quantity) || 1);
  return dataStore.saveCollectionCard({
    ...card,
    quantity: next,
    updatedAt: new Date().toISOString(),
  });
}

type ResolvedCatalogCard = {
  displayName: string;
  setName?: string;
  cardNumber?: string;
  frontImageUrl: string;
  category: CardCategory;
  catalogSource: CatalogSource;
  catalogId: string;
};

export async function fetchPokemonCatalogCard(
  catalogId: string,
): Promise<ResolvedCatalogCard | null> {
  const apiKey = process.env.POKEMON_TCG_API_KEY;
  const headers: HeadersInit = apiKey ? { "X-Api-Key": apiKey } : {};
  try {
    const res = await fetch(
      `https://api.pokemontcg.io/v2/cards/${encodeURIComponent(catalogId)}`,
      { headers },
    );
    if (!res.ok) return null;
    const payload = (await res.json()) as {
      data?: {
        id?: string;
        name?: string;
        number?: string;
        set?: { name?: string };
        images?: { large?: string; small?: string };
      };
    };
    const card = payload.data;
    const id = card?.id?.trim();
    const name = card?.name?.trim();
    const image = card?.images?.large ?? card?.images?.small;
    if (!id || !name || !image) return null;
    return {
      displayName: name,
      setName: card.set?.name?.trim() || undefined,
      cardNumber: card.number?.trim() || undefined,
      frontImageUrl: image,
      category: "pokemon",
      catalogSource: "pokemon_tcg",
      catalogId: id,
    };
  } catch {
    return null;
  }
}

export async function fetchYugiohCatalogCard(
  catalogId: string,
): Promise<ResolvedCatalogCard | null> {
  try {
    const res = await fetch(
      `https://db.ygoprodeck.com/api/v7/cardinfo.php?id=${encodeURIComponent(catalogId)}`,
    );
    if (!res.ok) return null;
    const payload = (await res.json()) as {
      data?: Array<{
        id?: number;
        name?: string;
        card_images?: Array<{ image_url?: string }>;
        card_sets?: Array<{ set_name?: string; set_code?: string }>;
      }>;
    };
    const card = payload.data?.[0];
    const id = card?.id != null ? String(card.id) : "";
    const name = card?.name?.trim();
    const image = card?.card_images?.[0]?.image_url;
    if (!id || !name || !image) return null;
    const set = card.card_sets?.[0];
    return {
      displayName: name,
      setName: set?.set_name?.trim() || set?.set_code?.trim() || undefined,
      frontImageUrl: image,
      category: "yugioh",
      catalogSource: "ygoprodeck",
      catalogId: id,
    };
  } catch {
    return null;
  }
}


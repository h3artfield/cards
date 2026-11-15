import { NextRequest } from "next/server";
import { jsonError, jsonOk, handleRouteError } from "@/lib/api-utils";
import { resolveStoreBySlug } from "@/lib/deck-builder/deck-builder-service";
import { deckBuilderStore } from "@/lib/deck-builder/deck-builder-store";
import {
  inferInventoryFinish,
  inventoryFinishBadgeLabel,
} from "@/lib/inventory/inventory-finish-v1";
import { inventoryEffectiveQuantity } from "@/lib/inventory/status";
import { collectorNumbersAgree } from "@/lib/inventory/resolve-display-image";
import { isPokemonInventoryItem } from "@/lib/inventory/image-cache-trust";
import { lookupScryfallShelfRules } from "@/lib/inventory/image-fallback";
import { lookupPokemonShelfRules } from "@/lib/inventory/pokemon-shelf-text";
import { dataStore } from "@/lib/storage/data-store";
import { getAdminFirestore } from "@/lib/firebase/admin";
import { isCardLinkKeyV1 } from "@/lib/inventory/card-link-key";
import { inventoryImageProxyPath } from "@/lib/inventory/resolve-display-image";
import {
  PRICE_HISTORY_COLLECTION,
  type InventoryPriceHistoryV1,
} from "@/lib/pricing/nightly-price-refresh";
import type { InventoryItem } from "@/lib/types";

export const maxDuration = 30;

const FORMATS = [
  "commander",
  "standard",
  "modern",
  "pioneer",
  "legacy",
  "vintage",
  "pauper",
] as const;

type PrintingExtra = {
  flavorText?: string;
  artist?: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
  legalities?: Record<string, string>;
};

async function scryfallPrinting(
  scryfallId: string,
): Promise<PrintingExtra | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);
  try {
    const res = await fetch(
      `https://api.scryfall.com/cards/${encodeURIComponent(scryfallId)}`,
      {
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "User-Agent": "CardScanner9000/inventory",
        },
      },
    );
    if (!res.ok) return null;
    const raw = (await res.json()) as Record<string, unknown>;
    const faces = raw.card_faces as Array<Record<string, unknown>> | undefined;
    const face = faces?.[0];
    const legalities = raw.legalities as Record<string, string> | undefined;
    return {
      flavorText:
        (raw.flavor_text as string | undefined) ??
        (face?.flavor_text as string | undefined),
      artist:
        (raw.artist as string | undefined) ?? (face?.artist as string | undefined),
      power: (raw.power as string | undefined) ?? (face?.power as string | undefined),
      toughness:
        (raw.toughness as string | undefined) ??
        (face?.toughness as string | undefined),
      loyalty:
        (raw.loyalty as string | undefined) ?? (face?.loyalty as string | undefined),
      legalities,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function findByCardLinkKey(storeId: string, key: string): Promise<InventoryItem | null> {
  const items = await dataStore.getInventory(storeId);
  const matches = items.filter((i) => i.cardLinkKey === key);
  return matches.find((i) => inventoryEffectiveQuantity(i) > 0) ?? matches[0] ?? null;
}

async function readPriceHistory(
  itemId: string,
): Promise<{ points: Array<[number, number]>; min1y: number | null; max1y: number | null } | null> {
  const db = getAdminFirestore();
  if (!db) return null;
  const snap = await db.collection(PRICE_HISTORY_COLLECTION).doc(itemId).get().catch(() => null);
  const data = snap?.data() as InventoryPriceHistoryV1 | undefined;
  if (!data?.points?.length) return null;
  return { points: data.points, min1y: data.min1y, max1y: data.max1y };
}

function shelfName(item: InventoryItem): string {
  return (
    item.productName?.trim() ||
    item.displayName.split(" — ")[0]?.trim() ||
    item.displayName
  );
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const store = await resolveStoreBySlug(slug);
    if (!store) return jsonError("Store not found", 404);

    const itemId = req.nextUrl.searchParams.get("itemId")?.trim();
    const linkKey = req.nextUrl.searchParams.get("key")?.trim().toLowerCase();
    if (!itemId && !linkKey) return jsonError("itemId or key is required", 400);
    if (linkKey && !isCardLinkKeyV1(linkKey)) return jsonError("Card not found", 404);

    const item = itemId
      ? await dataStore.getInventoryItem(itemId)
      : await findByCardLinkKey(store.id, linkKey!);
    if (!item || item.storeId !== store.id) return jsonError("Item not found", 404);
    const history = await readPriceHistory(item.id);

    const catalog = item.catalogScryfallId
      ? await deckBuilderStore.getCatalogCard(item.catalogScryfallId)
      : null;
    const samePrinting =
      catalog != null && collectorNumbersAgree(item.cardNumber, catalog.collectorNumber);
    const printing = samePrinting ? catalog : null;
    const storedOracle = item.catalogOracleText?.trim() || printing?.oracleText?.trim();
    const pokemon = isPokemonInventoryItem(item);
    const magicShelf =
      storedOracle || pokemon ? null : await lookupScryfallShelfRules(item);
    const pokeShelf =
      storedOracle || !pokemon ? null : await lookupPokemonShelfRules(item);

    const extra =
      printing != null && !pokemon ? await scryfallPrinting(printing.id) : null;

    const finishKind = inferInventoryFinish(item);

    const legalities: Record<string, string> = {};
    const sourceLegalities = extra?.legalities ?? printing?.legalities ?? magicShelf?.legalities;
    for (const format of FORMATS) {
      const status = sourceLegalities?.[format];
      if (status) legalities[format] = status;
    }

    return jsonOk({
      name: shelfName(item),
      manaCost: item.catalogManaCost ?? printing?.manaCost ?? magicShelf?.manaCost,
      cmc: item.catalogCmc ?? printing?.cmc ?? magicShelf?.cmc,
      typeLine:
        item.catalogTypeLine ?? printing?.typeLine ?? pokeShelf?.typeLine ?? magicShelf?.typeLine,
      oracleText: storedOracle || pokeShelf?.oracleText || magicShelf?.oracleText,
      keywords: item.catalogKeywords ?? printing?.keywords ?? magicShelf?.keywords ?? [],
      colorIdentity:
        item.catalogColorIdentity ??
        printing?.colorIdentity ??
        magicShelf?.colorIdentity ??
        [],
      flavorText: extra?.flavorText ?? pokeShelf?.flavorText ?? magicShelf?.flavorText,
      artist: extra?.artist ?? pokeShelf?.artist ?? magicShelf?.artist,
      power: extra?.power ?? magicShelf?.power,
      toughness: extra?.toughness ?? magicShelf?.toughness,
      loyalty: extra?.loyalty ?? magicShelf?.loyalty,
      legalities,
      setName: item.setName ?? printing?.setName,
      collectorNumber: item.cardNumber ?? printing?.collectorNumber,
      rarity: item.rarity?.trim() || item.catalogRarity || printing?.rarity || pokeShelf?.rarity || magicShelf?.rarity,
      condition: item.tcgplayerCondition ?? item.condition,
      finishLabel: inventoryFinishBadgeLabel(finishKind),
      qty: inventoryEffectiveQuantity(item),
      listPrice: item.listPrice,
      inventoryItemId: item.id,
      imageProxyUrl: inventoryImageProxyPath(slug, item.id),
      tcgMarketPrice: item.marketPriceSource === "justtcg" ? item.tcgMarketPrice : undefined,
      marketPriceAt: item.marketPriceSource === "justtcg" ? item.marketPriceAt : undefined,
      quantityInStore: item.quantityInStore,
      quantityOnline: item.quantityOnline,
      history,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

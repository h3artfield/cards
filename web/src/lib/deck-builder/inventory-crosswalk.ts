import { v4 as uuidv4 } from "uuid";
import type { InventoryItem } from "../types";
import type { CardCrosswalk, CatalogCard } from "./types";
import { scryfallFetch } from "../processing/scryfall-client";
import { catalogCardFromScryfall } from "./scryfall-catalog";
import { ensureCatalogCard } from "./catalog-resolver";
import { cardNameFromInventoryItem } from "../inventory/image-fallback";

export async function resolveCrosswalkForInventoryItem(input: {
  storeId: string;
  item: InventoryItem;
  existing?: CardCrosswalk | null;
}): Promise<{ crosswalk: CardCrosswalk; catalogCard: CatalogCard | null } | null> {
  const { item, storeId } = input;
  if (input.existing?.scryfallId) {
    const catalogCard = await ensureCatalogCard(input.existing.scryfallId);
    return {
      crosswalk: input.existing,
      catalogCard,
    };
  }

  const now = new Date().toISOString();
  const name = cardNameFromInventoryItem(item);
  if (!name) return null;

  let catalogCard: CatalogCard | null = null;
  let matchMethod: CardCrosswalk["matchMethod"] = "name_set";

  if (item.tcgplayerProductId) {
    const { fetchScryfallByTcgplayerId } = await import("./scryfall-catalog");
    catalogCard = await fetchScryfallByTcgplayerId(item.tcgplayerProductId);
    if (catalogCard) matchMethod = "tcgplayer_id";
  }

  if (!catalogCard && item.setName && item.cardNumber) {
    const { resolveCatalogForEnrichment } = await import(
      "./inventory-catalog-enrichment"
    );
    const resolved = await resolveCatalogForEnrichment(item);
    if ("catalog" in resolved) {
      catalogCard = resolved.catalog;
      matchMethod =
        resolved.matchMethod === "tcgplayer_id" ? "tcgplayer_id" : "name_set";
    }
  }

  if (!catalogCard) {
    try {
      const res = await scryfallFetch(
        `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(name)}`,
      );
      if (res.ok) {
        catalogCard = catalogCardFromScryfall(
          (await res.json()) as Record<string, unknown>,
        );
      }
    } catch {
      return null;
    }
  }

  if (!catalogCard) return null;

  return {
    crosswalk: {
      id: uuidv4(),
      storeId,
      inventoryItemId: item.id,
      tcgplayerProductId: item.tcgplayerProductId,
      scryfallId: catalogCard.id,
      matchMethod,
      updatedAt: now,
    },
    catalogCard,
  };
}

export async function backfillCrosswalkBatch(input: {
  storeId: string;
  items: InventoryItem[];
  existingCrosswalks: Map<string, CardCrosswalk>;
  limit: number;
  saveCrosswalk: (cw: CardCrosswalk) => Promise<void>;
  saveCatalogCard: (card: CatalogCard) => Promise<void>;
}): Promise<{ processed: number; linked: number; remaining: number }> {
  const candidates = input.items.filter(
    (i) => !input.existingCrosswalks.has(i.id),
  );
  const batch = candidates.slice(0, Math.max(1, input.limit));
  let linked = 0;

  for (const item of batch) {
    const result = await resolveCrosswalkForInventoryItem({
      storeId: input.storeId,
      item,
      existing: input.existingCrosswalks.get(item.id),
    });
    if (result) {
      await input.saveCrosswalk(result.crosswalk);
      input.existingCrosswalks.set(item.id, result.crosswalk);
      if (result.catalogCard) {
        await input.saveCatalogCard(result.catalogCard);
      }
      linked += 1;
    }
    await new Promise((r) => setTimeout(r, 120));
  }

  const remaining = input.items.filter(
    (i) => !input.existingCrosswalks.has(i.id),
  ).length;

  return { processed: batch.length, linked, remaining };
}

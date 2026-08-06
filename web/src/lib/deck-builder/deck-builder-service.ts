import { dataStore } from "../storage/data-store";
import {
  inventoryEffectiveQuantity,
  isCatalogImportItem,
  isInventoryAvailable,
} from "../inventory/status";
import { deckBuilderStore } from "./deck-builder-store";
import { syncEdhrecTheme } from "./sync-edhrec";
import type {
  CatalogCard,
  DeckBuilderInventoryCard,
  EdhrecCardRecommendation,
  EdhrecCommanderMeta,
} from "./types";
import { backfillCrosswalkBatch } from "./inventory-crosswalk";

export async function resolveStoreBySlug(slug: string) {
  const cleaned = slug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return dataStore.getStoreBySlug(cleaned);
}

export async function getOrSyncEdhrecMeta(input: {
  commanderSlug: string;
  themeSlug?: string;
}): Promise<EdhrecCommanderMeta | null> {
  const id = input.themeSlug
    ? `${input.commanderSlug}__${input.themeSlug}`
    : input.commanderSlug;
  let meta = await deckBuilderStore.getEdhrecMeta(id);
  if (meta) return meta;

  if (input.themeSlug) {
    meta = await syncEdhrecTheme({
      commanderSlug: input.commanderSlug,
      themeSlug: input.themeSlug,
      saveMeta: (m) => deckBuilderStore.saveEdhrecMeta(m),
      saveCatalogCard: (c) => deckBuilderStore.saveCatalogCard(c),
    });
  }
  return meta;
}

function cardMatchesColorIdentity(
  card: CatalogCard,
  identity: string[],
): boolean {
  if (!identity.length) return true;
  return card.colorIdentity.every((c) => identity.includes(c));
}

export async function buildDeckBuilderInventory(input: {
  storeId: string;
  commanderColorIdentity: string[];
  edhrecMeta?: EdhrecCommanderMeta | null;
  query?: string;
  limit?: number;
}): Promise<DeckBuilderInventoryCard[]> {
  const all = await dataStore.getInventory(input.storeId);
  const catalog = all.filter(
    (i) =>
      isCatalogImportItem(i) &&
      isInventoryAvailable(i) &&
      inventoryEffectiveQuantity(i) > 0,
  );
  const crosswalks = await deckBuilderStore.listCrosswalks(input.storeId);
  const cwByItem = new Map(crosswalks.map((c) => [c.inventoryItemId, c]));
  const recById = new Map(
    (input.edhrecMeta?.recommendations ?? []).map((r) => [r.scryfallId, r]),
  );

  const q = input.query?.trim().toLowerCase() ?? "";
  const limit = input.limit ?? 200;
  const out: DeckBuilderInventoryCard[] = [];

  for (const item of catalog) {
    const cw = cwByItem.get(item.id);
    if (!cw?.scryfallId) continue;
    const card = await deckBuilderStore.getCatalogCard(cw.scryfallId);
    if (!card || !card.commanderFormatLegal) continue;
    if (!cardMatchesColorIdentity(card, input.commanderColorIdentity)) continue;
    if (q && !card.name.toLowerCase().includes(q)) continue;

    const rec = recById.get(card.id);
    out.push({
      inventoryItemId: item.id,
      scryfallId: card.id,
      name: card.name,
      imageUrl: item.frontImageUrl ?? card.imageNormal,
      qty: inventoryEffectiveQuantity(item),
      listPrice: item.listPrice,
      tcgLowPrice: item.tcgLowPrice,
      synergy: rec?.synergy,
      inclusion: rec?.inclusion,
      category: rec?.category,
      colorIdentity: card.colorIdentity,
      cmc: card.cmc,
      typeLine: card.typeLine,
    });
    if (out.length >= limit) break;
  }

  out.sort((a, b) => (b.synergy ?? 0) - (a.synergy ?? 0));
  return out;
}

export async function getEdhrecRecommendationsEnriched(input: {
  storeId: string;
  edhrecMeta: EdhrecCommanderMeta;
  category?: string;
  limit?: number;
}): Promise<
  Array<
    EdhrecCardRecommendation & {
      inStock: boolean;
      stockQty: number;
      listPrice?: number;
      imageUrl?: string;
      catalog?: CatalogCard | null;
    }
  >
> {
  const crosswalks = await deckBuilderStore.listCrosswalks(input.storeId);
  const scryfallToQty = new Map<string, { qty: number; listPrice?: number; image?: string }>();
  const inventory = await dataStore.getInventory(input.storeId);

  for (const cw of crosswalks) {
    const item = inventory.find((i) => i.id === cw.inventoryItemId);
    if (!item || !isInventoryAvailable(item)) continue;
    const qty = inventoryEffectiveQuantity(item);
    if (qty <= 0) continue;
    const prev = scryfallToQty.get(cw.scryfallId);
    scryfallToQty.set(cw.scryfallId, {
      qty: (prev?.qty ?? 0) + qty,
      listPrice: item.listPrice ?? prev?.listPrice,
      image: item.frontImageUrl ?? prev?.image,
    });
  }

  let recs = input.edhrecMeta.recommendations;
  if (input.category) {
    const cat = input.category.toLowerCase();
    recs = recs.filter(
      (r) =>
        r.category.toLowerCase().includes(cat) ||
        r.categoryTag.toLowerCase().includes(cat),
    );
  }

  const limit = input.limit ?? 100;
  const slice = recs.slice(0, limit);
  const enriched = await Promise.all(
    slice.map(async (r) => {
      const stock = scryfallToQty.get(r.scryfallId);
      const catalog = await deckBuilderStore.getCatalogCard(r.scryfallId);
      return {
        ...r,
        inStock: Boolean(stock && stock.qty > 0),
        stockQty: stock?.qty ?? 0,
        listPrice: stock?.listPrice,
        imageUrl: stock?.image ?? catalog?.imageNormal,
        catalog,
      };
    }),
  );
  return enriched;
}

export async function runCrosswalkBatch(input: {
  storeId: string;
  limit: number;
}) {
  const items = (await dataStore.getInventory(input.storeId)).filter(
    (i) => isCatalogImportItem(i) && isInventoryAvailable(i),
  );
  const existing = await deckBuilderStore.listCrosswalks(input.storeId);
  const map = new Map(existing.map((c) => [c.inventoryItemId, c]));
  return backfillCrosswalkBatch({
    storeId: input.storeId,
    items,
    existingCrosswalks: map,
    limit: input.limit,
    saveCrosswalk: (cw) => deckBuilderStore.saveCrosswalk(cw),
    saveCatalogCard: (c) => deckBuilderStore.saveCatalogCard(c),
  });
}

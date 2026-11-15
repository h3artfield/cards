import { getAdminFirestore } from "../firebase/admin";
import { invalidateStoreInventoryCache } from "../deck-builder/store-inventory-cache";
import { shelfLocationV1 } from "../inventory/shelf-location";
import { isCatalogImportItem, inventoryEffectiveStatus } from "../inventory/status";
import { PRICE_ALERT_THRESHOLD_V1, priceChangeRatioV1, shelfPriceFromMarketV1 } from "../inventory/shelf-price";
import { pushShopifyLevelsAfterImport } from "../shopify/sync-inventory-levels";
import { dataStore } from "../storage/data-store";
import type { InventoryItem } from "../types";
import {
  JUSTTCG_BATCH_LIMIT,
  justTcgBatchV1,
  justTcgBySkuV1,
  justTcgVariantPriceV1,
  nearestJustTcgVariantV1,
  type JustTcgPointV1,
  type JustTcgVariantV1,
} from "./justtcg-client";

export const PRICE_ALERTS_COLLECTION = "inventoryPriceAlerts";
export const PRICE_HISTORY_COLLECTION = "inventoryPriceHistory";
export const PRICE_RUNS_COLLECTION = "inventoryPriceRuns";

export type InventoryPriceAlertV1 = {
  id: string;
  storeId: string;
  inventoryItemId: string;
  displayName: string;
  condition: string;
  previousPrice: number;
  newPrice: number;
  previousMarket: number | null;
  newMarket: number;
  /** Signed share of the previous price, e.g. -0.32. */
  change: number;
  runDate: string;
  status: "open" | "dismissed";
  createdAt: string;
  dismissedAt?: string;
};

export type InventoryPriceHistoryV1 = {
  storeId: string;
  inventoryItemId: string;
  /** Daily [unix seconds, price] for the past year, oldest first. */
  points: Array<[number, number]>;
  min1y: number | null;
  max1y: number | null;
  updatedAt: string;
};

export type PriceRunReportV1 = {
  storeId: string;
  runDate: string;
  startedAt: string;
  updatedAt: string;
  finished: boolean;
  requests: number;
  priced: number;
  changed: number;
  unpriced: number;
  alerts: number;
  /** Cards newly listed under "Cards to move" this run. */
  toMove: number;
  shopifyPricePushed: number;
  shopifyFailed: number;
  requestsRemaining: number | null;
  lastError?: string;
};

const DAY = 86_400;

/** UTC day the run belongs to; a card already refreshed on it is skipped. */
export function priceRunDateV1(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function wantsRefresh(item: InventoryItem, runDate: string): boolean {
  if (!isCatalogImportItem(item) || !item.tcgplayerProductId) return false;
  if (inventoryEffectiveStatus(item) === "sold") return false;
  if (inventoryEffectiveStatus(item) === "withdrawn" && !item.shopifyListing) return false;
  return !item.marketPriceAt || item.marketPriceAt.slice(0, 10) < runDate;
}

/**
 * A card with no location takes the one the rules give it. A card that has one
 * keeps it: when the rules now say elsewhere, the move is suggested for staff
 * to confirm, so the sheet never says a card is somewhere it is not.
 */
function locationUpdate(
  item: InventoryItem,
  market: number,
  stamp: string,
): Pick<InventoryItem, "shelfLocation" | "suggestedLocation" | "suggestedLocationAt"> {
  const ruled = shelfLocationV1({
    productLine: item.productLine ?? "",
    market,
    colors: item.catalogColors,
    colorIdentity: item.catalogColorIdentity,
    typeLine: item.catalogTypeLine,
  });
  if (!ruled) return {};
  // Saves merge and skip undefined, so "" is what clears a suggestion.
  if (!item.shelfLocation?.trim()) return { shelfLocation: ruled, suggestedLocation: "", suggestedLocationAt: "" };
  if (ruled === item.shelfLocation || ruled === item.keptLocationFor) {
    return item.suggestedLocation ? { suggestedLocation: "", suggestedLocationAt: "" } : {};
  }
  if (ruled === item.suggestedLocation) return {};
  return { suggestedLocation: ruled, suggestedLocationAt: stamp };
}

/** One point per day, the last price seen that day. */
function dailyPoints(history: JustTcgPointV1[] | null | undefined): Array<[number, number]> {
  const byDay = new Map<number, number>();
  for (const pt of history ?? []) {
    if (!(pt.p > 0)) continue;
    byDay.set(Math.floor(pt.t / DAY) * DAY, Math.round(pt.p * 100) / 100);
  }
  return [...byDay.entries()].sort((a, b) => a[0] - b[0]);
}

/**
 * Refreshes market prices from JustTCG for every in-stock card not yet
 * priced today, 100 products per request, until the time budget runs out;
 * the scheduler calls again and it picks up where it stopped. New shelf
 * prices go to Shopify, and a move of more than 20% either way leaves an
 * alert for staff.
 */
export async function runNightlyPriceRefreshV1(input: {
  storeId: string;
  budgetMs: number;
  now?: Date;
}): Promise<PriceRunReportV1> {
  const db = getAdminFirestore();
  if (!db) throw new Error("Firestore is not configured");
  const started = Date.now();
  const now = input.now ?? new Date();
  const runDate = priceRunDateV1(now);
  const runRef = db.collection(PRICE_RUNS_COLLECTION).doc(`${input.storeId}_${runDate}`);
  const prior = (await runRef.get()).data() as PriceRunReportV1 | undefined;
  const report: PriceRunReportV1 = prior ?? {
    storeId: input.storeId,
    runDate,
    startedAt: now.toISOString(),
    updatedAt: now.toISOString(),
    finished: false,
    requests: 0,
    priced: 0,
    changed: 0,
    unpriced: 0,
    alerts: 0,
    toMove: 0,
    shopifyPricePushed: 0,
    shopifyFailed: 0,
    requestsRemaining: null,
  };

  const inventory = await dataStore.getInventory(input.storeId);
  const due = inventory.filter((i) => wantsRefresh(i, runDate));
  const byProduct = new Map<string, InventoryItem[]>();
  for (const item of due) {
    const id = item.tcgplayerProductId!.trim();
    byProduct.set(id, [...(byProduct.get(id) ?? []), item]);
  }
  const products = [...byProduct.keys()];

  for (let i = 0; i < products.length; i += JUSTTCG_BATCH_LIMIT) {
    if (Date.now() - started > input.budgetMs) break;
    const chunk = products.slice(i, i + JUSTTCG_BATCH_LIMIT);
    let cards;
    try {
      const res = await justTcgBatchV1(chunk.map((tcgplayerId) => ({ tcgplayerId })), { history: "1y" });
      cards = res.cards;
      report.requests += 1;
      report.requestsRemaining = res.remaining;
    } catch (err) {
      report.lastError = err instanceof Error ? err.message : String(err);
      break;
    }
    const cardByProduct = new Map(cards.filter((c) => c.tcgplayerId).map((c) => [String(c.tcgplayerId), c]));
    // Rows imported straight from a seller export carry SKU ids, which JustTCG looks up separately.
    const notFound = chunk.filter((id) => !cardByProduct.has(id));
    const bySku = new Map<string, JustTcgVariantV1>();
    if (notFound.length) {
      try {
        const res = await justTcgBySkuV1(notFound);
        report.requests += res.requests;
        for (const [sku, hit] of res.bySku) bySku.set(sku, hit.variant);
      } catch (err) {
        report.lastError = err instanceof Error ? err.message : String(err);
      }
    }
    const stamp = new Date().toISOString();
    const changedItems: InventoryItem[] = [];
    const writer = db.bulkWriter();

    for (const productId of chunk) {
      const card = cardByProduct.get(productId);
      for (const item of byProduct.get(productId) ?? []) {
        const variant = card
          ? nearestJustTcgVariantV1(card, item.tcgplayerCondition ?? "Near Mint")
          : (bySku.get(productId) ?? null);
        const market = variant ? justTcgVariantPriceV1(variant) : null;
        if (!variant || market == null) {
          report.unpriced += 1;
          await dataStore.saveInventoryItem({ ...item, marketPriceAt: stamp });
          continue;
        }
        const shelf = shelfPriceFromMarketV1(market)!;
        const previous = item.listPrice ?? null;
        const next: InventoryItem = {
          ...item,
          tcgMarketPrice: market,
          marketPrice: market,
          listPrice: shelf,
          marketPriceAt: stamp,
          marketPriceSource: "justtcg",
          ...locationUpdate(item, market, stamp),
        };
        if (next.suggestedLocation && next.suggestedLocation !== item.suggestedLocation) report.toMove += 1;
        await dataStore.saveInventoryItem(next);
        report.priced += 1;
        if (previous == null || Math.abs(previous - shelf) >= 0.005) {
          report.changed += 1;
          changedItems.push(next);
        }

        const ratio = priceChangeRatioV1(previous, shelf);
        if (ratio != null && Math.abs(ratio) > PRICE_ALERT_THRESHOLD_V1) {
          const id = `${input.storeId}_${item.id}_${runDate}`;
          const alert: InventoryPriceAlertV1 = {
            id,
            storeId: input.storeId,
            inventoryItemId: item.id,
            displayName: item.productName || item.displayName,
            condition: item.tcgplayerCondition ?? "",
            previousPrice: previous!,
            newPrice: shelf,
            previousMarket: item.tcgMarketPrice ?? null,
            newMarket: market,
            change: Math.round(ratio * 1000) / 1000,
            runDate,
            status: "open",
            createdAt: stamp,
          };
          void writer.set(db.collection(PRICE_ALERTS_COLLECTION).doc(id), alert);
          report.alerts += 1;
        }

        const points = dailyPoints(variant.priceHistory);
        if (points.length) {
          const history: InventoryPriceHistoryV1 = {
            storeId: input.storeId,
            inventoryItemId: item.id,
            points,
            min1y: variant.minPrice1y ?? null,
            max1y: variant.maxPrice1y ?? null,
            updatedAt: stamp,
          };
          void writer.set(db.collection(PRICE_HISTORY_COLLECTION).doc(item.id), history);
        }
      }
    }
    await writer.close();

    if (changedItems.length) {
      const sync = await pushShopifyLevelsAfterImport(input.storeId, changedItems);
      report.shopifyPricePushed += sync.pricePushed;
      report.shopifyFailed += sync.failed;
    }
  }

  invalidateStoreInventoryCache(input.storeId);
  const remainingDue = (await dataStore.getInventory(input.storeId)).filter((i) => wantsRefresh(i, runDate)).length;
  report.finished = remainingDue === 0;
  report.updatedAt = new Date().toISOString();
  await runRef.set(JSON.parse(JSON.stringify(report)) as PriceRunReportV1);
  return report;
}

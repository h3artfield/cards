import { NextRequest } from "next/server";
import { requireAdminSession, requireStoreScope } from "@/lib/admin-auth";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api-utils";
import { getScryfallBulkIndex } from "@/lib/deck-builder/scryfall-bulk-index";
import type { ScryfallBulkIndex } from "@/lib/deck-builder/scryfall-bulk-index";
import { cardLinkBaseUrlV1 } from "@/lib/inventory/card-link-base";
import { cardLinkKeyV1 } from "@/lib/inventory/card-link-key";
import {
  combineInventoryListsV1,
  combinedCsvV1,
  finishRowV1,
  sortRowsV1,
  storeListNeedsCatalogV1,
  type CombinedRowV1,
  type InventoryCsvFileV1,
  type KnownListingV1,
} from "@/lib/inventory/combined-list";
import {
  searchUnmatchedStoreRowsV1,
  searchUnpricedRowsV1,
  type PricedBySearchV1,
} from "@/lib/inventory/combined-list-search";
import {
  JUSTTCG_BATCH_LIMIT,
  justTcgBatchV1,
  justTcgBySkuV1,
  justTcgConfiguredV1,
  justTcgPriceNoteV1,
  justTcgVariantPriceV1,
  nearestJustTcgVariantV1,
  type JustTcgCardV1,
} from "@/lib/pricing/justtcg-client";
import { parseTcgplayerInventoryExportCsv } from "@/lib/tcgplayer-inventory/parse-export-csv";
import { buildTcgplayerListingKey } from "@/lib/tcgplayer-inventory/listing-key";
import { dataStore } from "@/lib/storage/data-store";

export const maxDuration = 300;

/** Per combine; the JustTCG Starter plan allows 1,000 requests a day shared with the nightly price run. */
const SEARCH_MAX_REQUESTS = 120;
const SEARCH_DEADLINE_MS = 90_000;

/** Up to 100 cards per JustTCG request. */
const PRICE_MAX_REQUESTS = 60;
const PRICE_DEADLINE_MS = 200_000;

/** Name searches for cards JustTCG returned nothing for by id; one request each. */
const RETRY_MAX_REQUESTS = 80;
/** Leaves room under maxDuration for the last request and the response. */
const RETRY_DEADLINE_MS = 275_000;

type Prices = { prices: Map<string, number>; notes: Map<string, string> };

const listingKeyOf = (r: { tcgplayerProductId: string; condition: string }) =>
  buildTcgplayerListingKey(r.tcgplayerProductId, r.condition);

function priceFromCard(card: JustTcgCardV1, condition: string): { market: number; note: string } | null {
  const variant = nearestJustTcgVariantV1(card, condition);
  const market = variant ? justTcgVariantPriceV1(variant) : null;
  return variant && market != null ? { market, note: justTcgPriceNoteV1(variant, condition) } : null;
}

function setPrice(p: Prices, key: string, price: { market: number; note: string }) {
  p.prices.set(key, price.market);
  if (price.note) p.notes.set(key, price.note);
  else p.notes.delete(key);
}

/**
 * A TCGplayer seller export's "TCGplayer Id" is a SKU (one per condition).
 * JustTCG maps each to its product id, which the catalog, the store's own
 * list and the nightly run all use, and prices that exact variant.
 */
async function resolveSkusV1(tcgplayerFiles: InventoryCsvFileV1[], p: Prices) {
  const skuToProduct = new Map<string, string>();
  const rows = tcgplayerFiles.flatMap((f) => parseTcgplayerInventoryExportCsv(f.text).rows);
  if (!rows.length || !justTcgConfiguredV1()) return { skuToProduct };
  try {
    const { bySku } = await justTcgBySkuV1(rows.map((r) => r.tcgplayerProductId));
    for (const r of rows) {
      const hit = bySku.get(r.tcgplayerProductId);
      if (!hit) continue;
      skuToProduct.set(r.tcgplayerProductId, hit.productId);
      const condition = r.condition || "Near Mint";
      const exact = justTcgVariantPriceV1(hit.variant);
      const price =
        exact != null ? { market: exact, note: justTcgPriceNoteV1(hit.variant, condition) } : priceFromCard(hit.card, condition);
      if (price) setPrice(p, buildTcgplayerListingKey(hit.productId, condition), price);
    }
    return { skuToProduct };
  } catch (err) {
    return { skuToProduct, error: err instanceof Error ? err.message : String(err) };
  }
}

/** JustTCG prices by product id for every row the SKU lookup didn't price, unpriced rows first. */
async function priceRowsWithJustTcgV1(rows: CombinedRowV1[], p: Prices, deadline: number): Promise<string | undefined> {
  const todo = rows
    .filter((r) => r.tcgplayerProductId && !p.prices.has(listingKeyOf(r)))
    .sort((a, b) => Number(a.tcgMarketPrice != null) - Number(b.tcgMarketPrice != null));
  if (!todo.length) return undefined;
  if (!justTcgConfiguredV1()) return "JustTCG is not configured";
  const ids = [...new Set(todo.map((r) => r.tcgplayerProductId))];
  const cards = new Map<string, JustTcgCardV1>();
  let error: string | undefined;
  for (let i = 0; i < ids.length && i / JUSTTCG_BATCH_LIMIT < PRICE_MAX_REQUESTS; i += JUSTTCG_BATCH_LIMIT) {
    if (Date.now() > deadline) {
      error = "Ran out of time; the nightly JustTCG run prices the rest";
      break;
    }
    try {
      const res = await justTcgBatchV1(ids.slice(i, i + JUSTTCG_BATCH_LIMIT).map((tcgplayerId) => ({ tcgplayerId })));
      for (const c of res.cards) if (c.tcgplayerId) cards.set(String(c.tcgplayerId), c);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      break;
    }
  }
  for (const r of todo) {
    const card = cards.get(r.tcgplayerProductId);
    const price = card ? priceFromCard(card, r.condition) : null;
    if (price) setPrice(p, listingKeyOf(r), price);
  }
  return error;
}

/**
 * Applies the name-search results: prices the card, corrects its TCGplayer
 * Id (merging into a row that already has the right one), and records why
 * the rest are still unpriced.
 */
function applySearchV1(
  rows: CombinedRowV1[],
  found: Map<string, PricedBySearchV1>,
  reasons: Map<string, string>,
  catalog: ScryfallBulkIndex | null,
  known: Map<string, KnownListingV1>,
): CombinedRowV1[] {
  const byKey = new Map(rows.map((r) => [listingKeyOf(r), r]));
  for (const row of rows) {
    const key = listingKeyOf(row);
    const hit = found.get(key);
    const price = hit ? priceFromCard(hit.card, row.condition) : null;
    if (!hit || !price) {
      const reason = hit ? "JustTCG lists this card but has no price for any version" : reasons.get(key);
      if (reason && row.tcgMarketPrice == null) row.priceNote = `No price: ${reason}`;
      else if (reason) row.priceNote += `; JustTCG search: ${reason}`;
      continue;
    }
    const oldId = row.tcgplayerProductId;
    const corrected = hit.tcgplayerId !== oldId;
    const newKey = buildTcgplayerListingKey(hit.tcgplayerId, row.condition);
    const twin = corrected ? byKey.get(newKey) : undefined;
    if (twin && twin !== row) {
      twin.inStore += row.inStore;
      twin.online += row.online;
      twin.ingestedAt ||= row.ingestedAt;
      byKey.delete(key);
      continue;
    }
    row.tcgplayerProductId = hit.tcgplayerId;
    row.cardLinkKey = cardLinkKeyV1(hit.tcgplayerId, row.condition);
    row.tcgMarketPrice = price.market;
    row.priceNote = [
      corrected ? `Found by name search; TCGplayer Id corrected from ${oldId || "blank"}` : "Found by name search",
      price.note,
    ]
      .filter(Boolean)
      .join("; ");
    finishRowV1(row, catalog, known.get(newKey));
    if (corrected) {
      byKey.delete(key);
      byKey.set(newKey, row);
    }
  }
  return sortRowsV1([...byKey.values()]);
}

/**
 * Joins the TCGplayer export and the store's shelf list into one list in
 * the store's sheet layout. Nothing is saved: the combined CSV then goes
 * through the TCGplayer import preview and apply like any export.
 */
export async function POST(req: NextRequest) {
  const started = Date.now();
  try {
    const auth = requireAdminSession(req);
    if (auth instanceof Response) return auth;
    const scope = requireStoreScope(auth, req);
    if (scope instanceof Response) return scope;

    const body = (await req.json()) as {
      tcgplayerFiles?: InventoryCsvFileV1[];
      storeFiles?: InventoryCsvFileV1[];
    };
    const clean = (files: InventoryCsvFileV1[] | undefined) =>
      (Array.isArray(files) ? files : [])
        .filter((f) => typeof f?.text === "string" && f.text.trim())
        .map((f) => ({ name: String(f.name ?? ""), text: f.text }));
    const tcgplayerFiles = clean(body.tcgplayerFiles);
    const storeFiles = clean(body.storeFiles);
    if (!tcgplayerFiles.length && !storeFiles.length) return jsonError("Upload at least one list", 400);

    const store = await dataStore.getStore(scope.storeId);
    if (!store) return jsonError("Store not found", 404);

    // Magic colours and card types decide shelf locations, and shelf-only rows need the catalog to find their id.
    const anyMagic =
      storeListNeedsCatalogV1(storeFiles) ||
      tcgplayerFiles.some((f) => parseTcgplayerInventoryExportCsv(f.text).rows.some((r) => /magic/i.test(r.productLine)));
    let catalog: ScryfallBulkIndex | null = null;
    if (anyMagic) {
      catalog = await getScryfallBulkIndex().catch((err: unknown) => {
        console.warn("[combined-import] catalog unavailable:", err);
        return null;
      });
    }

    const known = new Map<string, KnownListingV1>();
    for (const item of await dataStore.getInventory(scope.storeId)) {
      if (!item.tcgplayerProductId) continue;
      const key = buildTcgplayerListingKey(item.tcgplayerProductId, item.tcgplayerCondition ?? "Near Mint");
      const prev = known.get(key);
      const soldDay = item.soldAt?.slice(0, 10);
      known.set(key, {
        market: item.tcgMarketPrice ?? prev?.market ?? null,
        colors: item.catalogColors ?? prev?.colors,
        colorIdentity: item.catalogColorIdentity ?? prev?.colorIdentity,
        typeLine: item.catalogTypeLine ?? prev?.typeLine,
        lastSold: [prev?.lastSold, soldDay].filter(Boolean).sort().pop(),
      });
    }

    const p: Prices = { prices: new Map(), notes: new Map() };
    const skus = await resolveSkusV1(tcgplayerFiles, p);

    const base = {
      tcgplayerFiles,
      storeFiles,
      catalog,
      known,
      skuToProduct: skus.skuToProduct,
      linkBaseUrl: cardLinkBaseUrlV1(),
      storeSlug: store.storeSlug,
    };
    let combined = combineInventoryListsV1(base);
    const search = await searchUnmatchedStoreRowsV1(combined.unmatched, {
      maxRequests: SEARCH_MAX_REQUESTS,
      deadlineMs: SEARCH_DEADLINE_MS,
    });
    const resolved = search.resolved.size ? search.resolved : undefined;
    if (resolved) combined = combineInventoryListsV1({ ...base, resolved });

    let error = await priceRowsWithJustTcgV1(combined.rows, p, started + PRICE_DEADLINE_MS);
    if (skus.error) error ??= `TCGplayer SKU lookup failed: ${skus.error}`;
    combined = combineInventoryListsV1({ ...base, resolved, justTcgPrices: p.prices, priceNotes: p.notes });

    // Everything JustTCG didn't price by id, including rows on the file's or a saved price.
    const unpriced = combined.rows
      .filter((r) => !p.prices.has(listingKeyOf(r)))
      .sort((a, b) => Number(a.tcgMarketPrice != null) - Number(b.tcgMarketPrice != null));
    const retry = await searchUnpricedRowsV1(
      unpriced.map((r) => ({
        key: listingKeyOf(r),
        productLine: r.productLine,
        productName: r.productName,
        setName: r.setName,
        number: r.number,
        condition: r.condition,
      })),
      { maxRequests: RETRY_MAX_REQUESTS, deadline: started + RETRY_DEADLINE_MS },
    );
    const rows = applySearchV1(combined.rows, retry.found, retry.reasons, catalog, known);

    const stillUnpriced = rows.filter((r) => r.tcgMarketPrice == null);
    const estimated = rows.filter((r) => r.priceNote && r.tcgMarketPrice != null).length;
    return jsonOk({
      csv: combinedCsvV1(rows, base.linkBaseUrl, base.storeSlug),
      counts: { ...combined.counts, matchedSearch: search.resolved.size, foundByNameSearch: retry.found.size },
      pricing: {
        priced: rows.length - stillUnpriced.length,
        estimated,
        missing: stillUnpriced.length,
        retried: unpriced.length,
        unpriced: stillUnpriced.slice(0, 200).map((r) => ({
          name: r.productName,
          setName: r.setName,
          condition: r.condition,
          tcgplayerId: r.tcgplayerProductId,
          reason: r.priceNote.replace(/^No price:?\s*/, "") || "No price found",
        })),
        error,
      },
      search: { requests: search.searched, notSearched: search.skipped },
      rowCount: rows.length,
      units: rows.reduce((t, r) => ({ inStore: t.inStore + r.inStore, online: t.online + r.online }), { inStore: 0, online: 0 }),
      unmatched: combined.unmatched,
      sample: rows.slice(0, 8),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

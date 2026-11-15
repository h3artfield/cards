import { v4 as uuidv4 } from "uuid";
import { cardLinkKeyV1 } from "../inventory/card-link-key";
import { hasTrustedFirebaseImageCache } from "../inventory/image-cache-trust";
import { inventoryQuantityAvailable, isTcgplayerImportItem } from "../inventory/status";
import type { InventoryItem } from "../types";
import {
  buildCsvProductLineScope,
  isItemInCsvScope,
  listCsvProductLines,
} from "./import-guard";
import { parseTcgplayerInventoryExportCsv } from "./parse-export-csv";
import { resolveTcgplayerProductImageUrl } from "./product-image";
import type {
  TcgplayerImportMode,
  TcgplayerImportPreview,
  TcgplayerImportPreviewRow,
  TcgplayerInventoryCsvRow,
} from "./types";

function nearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.005;
}

function hasChannelListing(item: InventoryItem): boolean {
  return Boolean(item.shopifyListing);
}

function previewCsvRow(
  csvRow: TcgplayerInventoryCsvRow,
  existing: InventoryItem | undefined,
): TcgplayerImportPreviewRow {
  if (!existing) {
    if (csvRow.quantity <= 0) {
      return {
        action: "create",
        listingKey: csvRow.listingKey,
        tcgplayerProductId: csvRow.tcgplayerProductId,
        displayName: csvRow.displayName,
        condition: csvRow.condition,
        quantity: csvRow.quantity,
        listPrice: csvRow.listPrice,
        message:
          "Catalog placeholder — 0 qty (sealed/restock slot; updates on next import)",
        csvRow,
      };
    }
    return {
      action: "create",
      listingKey: csvRow.listingKey,
      tcgplayerProductId: csvRow.tcgplayerProductId,
      displayName: csvRow.displayName,
      condition: csvRow.condition,
      quantity: csvRow.quantity,
      listPrice: csvRow.listPrice,
      csvRow,
    };
  }

  if (existing.status === "sold") {
    if (csvRow.quantity > 0) {
      return {
        action: "conflict",
        listingKey: csvRow.listingKey,
        tcgplayerProductId: csvRow.tcgplayerProductId,
        displayName: csvRow.displayName,
        condition: csvRow.condition,
        quantity: csvRow.quantity,
        listPrice: csvRow.listPrice,
        previousQuantity: existing.quantity,
        previousListPrice: existing.listPrice,
        inventoryItemId: existing.id,
        message: "Already sold in app — CSV shows quantity > 0",
        csvRow,
      };
    }
    return {
      action: "unchanged",
      listingKey: csvRow.listingKey,
      tcgplayerProductId: csvRow.tcgplayerProductId,
      displayName: csvRow.displayName,
      condition: csvRow.condition,
      quantity: csvRow.quantity,
      listPrice: csvRow.listPrice,
      previousQuantity: existing.quantity,
      previousListPrice: existing.listPrice,
      inventoryItemId: existing.id,
      message: "Already sold — no change",
      csvRow,
    };
  }

  const qtyChanged = (existing.quantity ?? 0) !== csvRow.quantity;
  const priceChanged =
    csvRow.storePrice > 0 &&
    !nearlyEqual(existing.listPrice ?? 0, csvRow.storePrice);
  const metaChanged =
    existing.displayName !== csvRow.displayName ||
    existing.tcgMarketPrice !== csvRow.tcgMarketPrice ||
    (csvRow.quantityInStore != null && existing.quantityInStore !== csvRow.quantityInStore) ||
    (csvRow.quantityOnline != null && existing.quantityOnline !== csvRow.quantityOnline) ||
    (csvRow.shelfLocation != null && existing.shelfLocation !== csvRow.shelfLocation) ||
    !existing.cardLinkKey ||
    (csvRow.tcgLowPrice > 0 &&
      !nearlyEqual(existing.tcgLowPrice ?? 0, csvRow.tcgLowPrice));

  if (csvRow.quantity <= 0) {
    if (hasChannelListing(existing)) {
      return {
        action: "conflict",
        listingKey: csvRow.listingKey,
        tcgplayerProductId: csvRow.tcgplayerProductId,
        displayName: csvRow.displayName,
        condition: csvRow.condition,
        quantity: csvRow.quantity,
        listPrice: csvRow.listPrice,
        previousQuantity: existing.quantity,
        previousListPrice: existing.listPrice,
        inventoryItemId: existing.id,
        message: "CSV qty 0 but item is listed on Shopify — review manually",
        csvRow,
      };
    }
    return {
      action: "withdraw",
      listingKey: csvRow.listingKey,
      tcgplayerProductId: csvRow.tcgplayerProductId,
      displayName: csvRow.displayName,
      condition: csvRow.condition,
      quantity: csvRow.quantity,
      listPrice: csvRow.listPrice,
      previousQuantity: existing.quantity,
      previousListPrice: existing.listPrice,
      inventoryItemId: existing.id,
      message: "Quantity zero — mark withdrawn",
      csvRow,
    };
  }

  if (!qtyChanged && !priceChanged && !metaChanged) {
    return {
      action: "unchanged",
      listingKey: csvRow.listingKey,
      tcgplayerProductId: csvRow.tcgplayerProductId,
      displayName: csvRow.displayName,
      condition: csvRow.condition,
      quantity: csvRow.quantity,
      listPrice: csvRow.listPrice,
      previousQuantity: existing.quantity,
      previousListPrice: existing.listPrice,
      inventoryItemId: existing.id,
      csvRow,
    };
  }

  return {
    action: "update",
    listingKey: csvRow.listingKey,
    tcgplayerProductId: csvRow.tcgplayerProductId,
    displayName: csvRow.displayName,
    condition: csvRow.condition,
    quantity: csvRow.quantity,
    listPrice: csvRow.listPrice,
    previousQuantity: existing.quantity,
    previousListPrice: existing.listPrice,
    inventoryItemId: existing.id,
    csvRow,
  };
}

export function buildTcgplayerImportPreview(
  csvText: string,
  existingInventory: InventoryItem[],
  mode: TcgplayerImportMode = "replace",
): TcgplayerImportPreview {
  const { rows: csvRows, skipped } = parseTcgplayerInventoryExportCsv(csvText);
  if (mode === "add") {
    return buildAddStockPreview(csvRows, skipped, existingInventory);
  }

  const importItems = existingInventory.filter(isTcgplayerImportItem);
  const byKey = new Map(
    importItems
      .filter((i) => i.tcgplayerListingKey)
      .map((i) => [i.tcgplayerListingKey!, i]),
  );

  const seenKeys = new Set<string>();
  const previewRows: TcgplayerImportPreviewRow[] = [];

  for (const csvRow of csvRows) {
    seenKeys.add(csvRow.listingKey);
    previewRows.push(previewCsvRow(csvRow, byKey.get(csvRow.listingKey)));
  }

  const missingFromCsv: TcgplayerImportPreview["missingFromCsv"] = [];
  const productLineScope = buildCsvProductLineScope(csvRows);
  let outOfScopeRows = 0;
  let outOfScopeUnits = 0;

  for (const item of importItems) {
    if (!item.tcgplayerListingKey || seenKeys.has(item.tcgplayerListingKey)) {
      continue;
    }
    if (item.status === "sold") continue;

    /* A file covering only some product lines says nothing about the rest —
       leave those rows alone instead of reading absence as "sold out". */
    if (!isItemInCsvScope(item, productLineScope)) {
      outOfScopeRows += 1;
      outOfScopeUnits += Math.max(0, item.quantity ?? 0);
      continue;
    }

    if (hasChannelListing(item)) {
      missingFromCsv.push({
        inventoryItemId: item.id,
        listingKey: item.tcgplayerListingKey,
        displayName: item.displayName,
        quantity: item.quantity ?? 0,
        action: "conflict",
        message: "Missing from CSV but listed on Shopify — review manually",
      });
      continue;
    }

    missingFromCsv.push({
      inventoryItemId: item.id,
      listingKey: item.tcgplayerListingKey,
      displayName: item.displayName,
      quantity: item.quantity ?? 0,
      action: "withdraw",
      message: "Missing from CSV — mark withdrawn",
    });
  }

  const count = (action: TcgplayerImportPreviewRow["action"]) =>
    previewRows.filter((r) => r.action === action).length;

  const createRows = previewRows.filter((r) => r.action === "create");

  const inStockRowsBefore = importItems.filter(
    (i) => i.status !== "sold" && (i.quantity ?? 0) > 0,
  ).length;

  let withdrawnInStockRows = 0;
  let withdrawnUnits = 0;
  for (const row of previewRows) {
    if (row.action !== "withdraw") continue;
    const previous = row.previousQuantity ?? 0;
    if (previous <= 0) continue;
    withdrawnInStockRows += 1;
    withdrawnUnits += previous;
  }
  for (const missing of missingFromCsv) {
    if (missing.action !== "withdraw" || missing.quantity <= 0) continue;
    withdrawnInStockRows += 1;
    withdrawnUnits += missing.quantity;
  }

  return {
    mode: "replace",
    parsedCount: csvRows.length,
    skippedCount: skipped,
    csvProductLines: listCsvProductLines(csvRows),
    outOfScopeRows,
    outOfScopeUnits,
    inStockRowsBefore,
    withdrawnInStockRows,
    withdrawnUnits,
    creates: createRows.length,
    createsInStock: createRows.filter((r) => r.quantity > 0).length,
    createsCatalog: createRows.filter((r) => r.quantity <= 0).length,
    updates: count("update"),
    unchanged: count("unchanged"),
    conflicts: count("conflict") + missingFromCsv.filter((m) => m.action === "conflict").length,
    withdrawals:
      count("withdraw") + missingFromCsv.filter((m) => m.action === "withdraw").length,
    unitsAdded: 0,
    ignoredZeroQtyRows: 0,
    rows: previewRows,
    missingFromCsv,
  };
}

function sumOptional(a: number | undefined, b: number | undefined): number | undefined {
  return a == null && b == null ? undefined : (a ?? 0) + (b ?? 0);
}

/** One row per listing key, quantities summed; prices and location come from the first row that has them. */
export function mergeDuplicateCsvRows(
  rows: TcgplayerInventoryCsvRow[],
): TcgplayerInventoryCsvRow[] {
  const byKey = new Map<string, TcgplayerInventoryCsvRow>();
  for (const row of rows) {
    const prev = byKey.get(row.listingKey);
    if (!prev) {
      byKey.set(row.listingKey, row);
      continue;
    }
    const quantityInStore = sumOptional(prev.quantityInStore, row.quantityInStore);
    const quantityOnline = sumOptional(prev.quantityOnline, row.quantityOnline);
    const shelfLocation = prev.shelfLocation || row.shelfLocation;
    const ingestedAt = prev.ingestedAt || row.ingestedAt;
    byKey.set(row.listingKey, {
      ...prev,
      totalQuantity: prev.totalQuantity + row.totalQuantity,
      storeReserveQty: prev.storeReserveQty + row.storeReserveQty,
      quantity: prev.quantity + row.quantity,
      quantityOnHand: prev.quantityOnHand + row.quantityOnHand,
      tcgplayerReportedReserve: prev.tcgplayerReportedReserve + row.tcgplayerReportedReserve,
      quantityAvailable: prev.quantityAvailable + row.quantityAvailable,
      storePrice: prev.storePrice > 0 ? prev.storePrice : row.storePrice,
      listPrice: prev.listPrice > 0 ? prev.listPrice : row.listPrice,
      tcgMarketPrice: prev.tcgMarketPrice > 0 ? prev.tcgMarketPrice : row.tcgMarketPrice,
      tcgLowPrice: prev.tcgLowPrice > 0 ? prev.tcgLowPrice : row.tcgLowPrice,
      ...(quantityInStore != null ? { quantityInStore } : {}),
      ...(quantityOnline != null ? { quantityOnline } : {}),
      ...(shelfLocation ? { shelfLocation } : {}),
      ...(ingestedAt ? { ingestedAt } : {}),
    });
  }
  return [...byKey.values()];
}

/** Withdrawn and sold rows keep stale counts, so a new batch starts them from zero. */
function stockBeforeAdd(item: InventoryItem): number {
  if (item.status === "sold" || item.status === "withdrawn") return 0;
  return Math.max(0, item.quantity ?? 0);
}

function listPriceAfterAdd(existing: InventoryItem, csvRow: TcgplayerInventoryCsvRow): number | undefined {
  if ((existing.listPrice ?? 0) > 0) return existing.listPrice;
  return csvRow.storePrice > 0 ? csvRow.storePrice : existing.listPrice;
}

function buildAddStockPreview(
  parsedRows: TcgplayerInventoryCsvRow[],
  skipped: number,
  existingInventory: InventoryItem[],
): TcgplayerImportPreview {
  const importItems = existingInventory.filter(isTcgplayerImportItem);
  const byKey = new Map<string, InventoryItem>();
  for (const item of importItems) {
    if (!item.tcgplayerListingKey) continue;
    const current = byKey.get(item.tcgplayerListingKey);
    if (!current || (current.status === "sold" && item.status !== "sold")) {
      byKey.set(item.tcgplayerListingKey, item);
    }
  }

  const merged = mergeDuplicateCsvRows(parsedRows);
  const csvRows = merged.filter((r) => r.quantity > 0);
  const previewRows: TcgplayerImportPreviewRow[] = [];
  let unitsAdded = 0;

  for (const csvRow of csvRows) {
    unitsAdded += csvRow.quantity;
    const existing = byKey.get(csvRow.listingKey);
    const base = {
      listingKey: csvRow.listingKey,
      tcgplayerProductId: csvRow.tcgplayerProductId,
      displayName: csvRow.displayName,
      condition: csvRow.condition,
      addedQuantity: csvRow.quantity,
      csvRow,
    };
    if (!existing) {
      previewRows.push({
        ...base,
        action: "create",
        quantity: csvRow.quantity,
        listPrice: csvRow.listPrice,
      });
      continue;
    }
    const before = stockBeforeAdd(existing);
    previewRows.push({
      ...base,
      action: "update",
      quantity: before + csvRow.quantity,
      listPrice: listPriceAfterAdd(existing, csvRow) ?? 0,
      previousQuantity: before,
      previousListPrice: existing.listPrice,
      inventoryItemId: existing.id,
      message:
        existing.status === "sold"
          ? "Was sold — restocking"
          : before === 0
            ? "Back in stock"
            : undefined,
    });
  }

  const creates = previewRows.filter((r) => r.action === "create").length;
  return {
    mode: "add",
    parsedCount: parsedRows.length,
    skippedCount: skipped,
    csvProductLines: listCsvProductLines(csvRows),
    outOfScopeRows: 0,
    outOfScopeUnits: 0,
    inStockRowsBefore: importItems.filter(
      (i) => i.status !== "sold" && (i.quantity ?? 0) > 0,
    ).length,
    withdrawnInStockRows: 0,
    withdrawnUnits: 0,
    creates,
    createsInStock: creates,
    createsCatalog: 0,
    updates: previewRows.length - creates,
    unchanged: 0,
    conflicts: 0,
    withdrawals: 0,
    unitsAdded,
    ignoredZeroQtyRows: merged.length - csvRows.length,
    rows: previewRows,
    missingFromCsv: [],
  };
}

function inferItemType(
  productLine: string,
  condition: string,
): InventoryItem["itemType"] {
  const text = `${productLine} ${condition}`.toLowerCase();
  if (
    text.includes("unopened") ||
    text.includes("sealed") ||
    text.includes("deck box") ||
    text.includes("booster") ||
    text.includes("box")
  ) {
    return "unknown";
  }
  return "raw";
}

export function inventoryItemFromCsvRow(
  csvRow: TcgplayerInventoryCsvRow,
  storeId: string,
  now: string,
): InventoryItem {
  return {
    id: uuidv4(),
    storeId,
    source: "tcgplayer_import",
    displayName: csvRow.displayName,
    category: csvRow.category,
    setName: csvRow.setName || undefined,
    cardNumber: csvRow.number || undefined,
    itemType: inferItemType(csvRow.productLine, csvRow.condition),
    frontImageUrl: resolveTcgplayerProductImageUrl(csvRow.tcgplayerProductId),
    marketPrice: csvRow.tcgMarketPrice > 0 ? csvRow.tcgMarketPrice : undefined,
    acquiredAt: now,
    tcgplayerProductId: csvRow.tcgplayerProductId,
    tcgplayerCondition: csvRow.condition,
    tcgplayerListingKey: csvRow.listingKey,
    productLine: csvRow.productLine,
    productName: csvRow.productName,
    title: csvRow.title,
    rarity: csvRow.rarity,
    quantity: csvRow.quantity,
    quantityOnHand: csvRow.quantityOnHand,
    tcgplayerReportedReserve: csvRow.tcgplayerReportedReserve,
    quantityAvailable: csvRow.quantityAvailable,
    listPrice: csvRow.storePrice > 0 ? csvRow.storePrice : undefined,
    tcgMarketPrice: csvRow.tcgMarketPrice > 0 ? csvRow.tcgMarketPrice : undefined,
    tcgLowPrice: csvRow.tcgLowPrice > 0 ? csvRow.tcgLowPrice : undefined,
    tcgLowPriceAt: csvRow.tcgLowPrice > 0 ? now : undefined,
    lastTcgplayerImportAt: now,
    status: csvRow.quantity > 0 ? "on_hand" : "withdrawn",
    imageCacheFailedAt: undefined,
    ...storeListFields(csvRow),
    ...(csvRow.ingestedAt ? { ingestedAt: csvRow.ingestedAt } : { ingestedAt: now }),
  };
}

/** Channel split, shelf location and label key, which plain TCGplayer exports do not carry. */
function storeListFields(csvRow: TcgplayerInventoryCsvRow): Partial<InventoryItem> {
  const key = cardLinkKeyV1(csvRow.tcgplayerProductId, csvRow.condition);
  return {
    ...(key ? { cardLinkKey: key } : {}),
    ...(csvRow.quantityInStore != null ? { quantityInStore: csvRow.quantityInStore } : {}),
    ...(csvRow.quantityOnline != null ? { quantityOnline: csvRow.quantityOnline } : {}),
    ...(csvRow.shelfLocation ? { shelfLocation: csvRow.shelfLocation } : {}),
  };
}

export function mergeCsvIntoInventoryItem(
  existing: InventoryItem,
  csvRow: TcgplayerInventoryCsvRow,
  now: string,
): InventoryItem {
  const nextStatus =
    existing.status === "sold"
      ? "sold"
      : csvRow.quantity > 0
        ? existing.shopifyListing
          ? "listed"
          : "on_hand"
        : "withdrawn";

  const productChanged =
    existing.tcgplayerProductId !== csvRow.tcgplayerProductId ||
    existing.tcgplayerListingKey !== csvRow.listingKey;

  const keepCachedImage =
    !productChanged && hasTrustedFirebaseImageCache(existing);

  return {
    ...existing,
    displayName: csvRow.displayName,
    category: csvRow.category,
    setName: csvRow.setName || undefined,
    cardNumber: csvRow.number || undefined,
    frontImageUrl: keepCachedImage
      ? existing.frontImageUrl
      : resolveTcgplayerProductImageUrl(csvRow.tcgplayerProductId),
    marketPrice: csvRow.tcgMarketPrice > 0 ? csvRow.tcgMarketPrice : existing.marketPrice,
    tcgplayerProductId: csvRow.tcgplayerProductId,
    tcgplayerCondition: csvRow.condition,
    tcgplayerListingKey: csvRow.listingKey,
    productLine: csvRow.productLine,
    productName: csvRow.productName,
    title: csvRow.title,
    rarity: csvRow.rarity,
    quantity: csvRow.quantity,
    quantityOnHand: csvRow.quantityOnHand,
    tcgplayerReportedReserve: csvRow.tcgplayerReportedReserve,
    quantityAvailable: csvRow.quantityAvailable,
    listPrice:
      csvRow.storePrice > 0 ? csvRow.storePrice : existing.listPrice,
    tcgMarketPrice: csvRow.tcgMarketPrice > 0 ? csvRow.tcgMarketPrice : existing.tcgMarketPrice,
    tcgLowPrice:
      csvRow.tcgLowPrice > 0 ? csvRow.tcgLowPrice : existing.tcgLowPrice,
    tcgLowPriceAt:
      csvRow.tcgLowPrice > 0 ? now : existing.tcgLowPriceAt,
    lastTcgplayerImportAt: now,
    status: nextStatus,
    imageCacheFailedAt: undefined,
    /* A plain TCGplayer export has no channel split; an old split only stands while the total still matches it. */
    ...(csvRow.quantityInStore == null &&
    (existing.quantityInStore ?? 0) + (existing.quantityOnline ?? 0) !== csvRow.quantityOnHand
      ? { quantityInStore: undefined, quantityOnline: undefined }
      : {}),
    ...storeListFields(csvRow),
    ...(csvRow.ingestedAt && !existing.ingestedAt ? { ingestedAt: csvRow.ingestedAt } : {}),
    ...(productChanged
      ? { imageCachedAt: undefined, imageCacheVersion: undefined }
      : {}),
  };
}

/** Add mode: a new batch on top of current stock. Shelf location and shelf price already set stay put. */
export function addCsvToInventoryItem(
  existing: InventoryItem,
  csvRow: TcgplayerInventoryCsvRow,
  now: string,
): InventoryItem {
  const added = csvRow.quantity;
  const before = stockBeforeAdd(existing);
  const inStock = before > 0;
  const fileHasSplit = csvRow.quantityInStore != null || csvRow.quantityOnline != null;
  const existingHasSplit = existing.quantityInStore != null || existing.quantityOnline != null;
  /* Unsplit stock can't be attributed to a channel, so its split stays as it was. */
  const split =
    fileHasSplit && (!inStock || existingHasSplit)
      ? {
          quantityInStore:
            (inStock ? existing.quantityInStore ?? 0 : 0) + (csvRow.quantityInStore ?? 0),
          quantityOnline:
            (inStock ? existing.quantityOnline ?? 0 : 0) + (csvRow.quantityOnline ?? 0),
        }
      : { quantityInStore: existing.quantityInStore, quantityOnline: existing.quantityOnline };
  const keptLocation = existing.shelfLocation?.trim() ? existing.shelfLocation : undefined;

  return {
    ...mergeCsvIntoInventoryItem(existing, csvRow, now),
    quantity: before + added,
    quantityOnHand: (inStock ? existing.quantityOnHand ?? before : 0) + added,
    quantityAvailable: (inStock ? inventoryQuantityAvailable(existing) : 0) + added,
    tcgplayerReportedReserve:
      (inStock ? existing.tcgplayerReportedReserve ?? 0 : 0) + csvRow.tcgplayerReportedReserve,
    listPrice: listPriceAfterAdd(existing, csvRow),
    status: existing.shopifyListing ? "listed" : "on_hand",
    ...split,
    ...(keptLocation
      ? { shelfLocation: keptLocation }
      : csvRow.shelfLocation
        ? { shelfLocation: csvRow.shelfLocation }
        : {}),
  };
}

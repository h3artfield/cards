import { v4 as uuidv4 } from "uuid";
import { isTcgplayerImportItem } from "../inventory/status";
import type { InventoryItem } from "../types";
import { parseTcgplayerInventoryExportCsv } from "./parse-export-csv";
import { resolveTcgplayerProductImageUrl } from "./product-image";
import type {
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
): TcgplayerImportPreview {
  const { rows: csvRows, skipped } = parseTcgplayerInventoryExportCsv(csvText);

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

  for (const item of importItems) {
    if (!item.tcgplayerListingKey || seenKeys.has(item.tcgplayerListingKey)) {
      continue;
    }
    if (item.status === "sold") continue;

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

  return {
    parsedCount: csvRows.length,
    skippedCount: skipped,
    creates: createRows.length,
    createsInStock: createRows.filter((r) => r.quantity > 0).length,
    createsCatalog: createRows.filter((r) => r.quantity <= 0).length,
    updates: count("update"),
    unchanged: count("unchanged"),
    conflicts: count("conflict") + missingFromCsv.filter((m) => m.action === "conflict").length,
    withdrawals:
      count("withdraw") + missingFromCsv.filter((m) => m.action === "withdraw").length,
    rows: previewRows,
    missingFromCsv,
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

  return {
    ...existing,
    displayName: csvRow.displayName,
    category: csvRow.category,
    setName: csvRow.setName || undefined,
    cardNumber: csvRow.number || undefined,
    frontImageUrl:
      existing.frontImageUrl ||
      resolveTcgplayerProductImageUrl(csvRow.tcgplayerProductId),
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
  };
}

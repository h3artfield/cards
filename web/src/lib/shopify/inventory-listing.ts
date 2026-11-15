import {
  isFirebaseStorageUrl,
  isTcgplayerCdnUrl,
} from "../inventory/image-url";
import { inventoryImageProxyPath } from "../inventory/resolve-display-image";
import {
  inventoryEffectiveQuantity,
  isCatalogImportItem,
  isInventorySold,
} from "../inventory/status";
import type { InventoryItem } from "../types";
import { buildShopifySkuForInventory } from "./product-builder";
import type { ShopifyIntegration } from "./types";

/**
 * Shopify listings built straight from imported inventory rows. These have no
 * ScannedCard behind them, so price, quantity, and copy come from the CSV.
 */
export type CatalogExportReason =
  | "eligible"
  | "integration_disabled"
  | "not_catalog_item"
  | "sold"
  | "withdrawn"
  | "out_of_stock"
  | "missing_price"
  | "missing_location"
  | "already_exported";

export type CatalogExportEligibility = {
  eligible: boolean;
  reason: CatalogExportReason;
  message: string;
};

export function hasShopifyListing(item: InventoryItem): boolean {
  return Boolean(item.shopifyListing?.productId);
}

export function catalogExportQuantity(item: InventoryItem): number {
  return Math.max(0, Math.trunc(inventoryEffectiveQuantity(item)));
}

/**
 * Shelf price for the listing. The store's own TCGplayer price wins; market
 * fallbacks only apply when the CSV had no store price.
 */
export function resolveCatalogExportPrice(
  item: InventoryItem,
  integration: ShopifyIntegration,
): number | null {
  const listPrice = item.listPrice ?? 0;
  if (listPrice > 0) return round2(listPrice);

  const market = item.tcgMarketPrice ?? item.marketPrice ?? 0;
  if (market <= 0) return null;

  if (integration.priceStrategy === "marketPlusMarkup") {
    const pct = integration.markupPercent ?? 0;
    const marked = market * (1 + pct / 100);
    return marked > 0 ? round2(marked) : null;
  }

  return round2(market);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function catalogExportEligibility(
  item: InventoryItem,
  integration: ShopifyIntegration | undefined,
  options?: { allowReexport?: boolean },
): CatalogExportEligibility {
  if (!integration?.enabled) {
    return {
      eligible: false,
      reason: "integration_disabled",
      message: "Shopify integration is not enabled.",
    };
  }

  if (!isCatalogImportItem(item)) {
    return {
      eligible: false,
      reason: "not_catalog_item",
      message: "Buyback singles export from the order or inventory card view.",
    };
  }

  // Tracked variants with no stocking location can never be bought.
  if (!integration.defaultLocationId) {
    return {
      eligible: false,
      reason: "missing_location",
      message:
        "Pick a Shopify inventory location in settings before listing stock.",
    };
  }

  if (isInventorySold(item)) {
    return {
      eligible: false,
      reason: "sold",
      message: "Row is sold out — re-import to restock before listing.",
    };
  }

  if (item.status === "withdrawn") {
    return {
      eligible: false,
      reason: "withdrawn",
      message: "Row is withdrawn — restock in TCGplayer and re-import.",
    };
  }

  if (catalogExportQuantity(item) <= 0) {
    return {
      eligible: false,
      reason: "out_of_stock",
      message: "No sellable units on this row.",
    };
  }

  if (resolveCatalogExportPrice(item, integration) == null) {
    return {
      eligible: false,
      reason: "missing_price",
      message: "No store price or market price on this row.",
    };
  }

  if (hasShopifyListing(item) && !options?.allowReexport) {
    return {
      eligible: false,
      reason: "already_exported",
      message: "Already listed on Shopify — quantity syncs on re-import.",
    };
  }

  return {
    eligible: true,
    reason: "eligible",
    message: options?.allowReexport
      ? "Ready to create a new Shopify listing."
      : "Ready for Shopify.",
  };
}

export function catalogListingSku(item: InventoryItem): string {
  return buildShopifySkuForInventory(item.id);
}

function conditionLabel(item: InventoryItem): string | undefined {
  const raw = item.tcgplayerCondition?.trim() || item.condition?.trim();
  if (!raw) return undefined;
  if (item.itemType === "graded" && item.slabCompany) {
    const grade = item.slabGrade?.trim();
    return grade ? `${item.slabCompany} ${grade}` : item.slabCompany;
  }
  return raw;
}

export function buildCatalogProductTitle(item: InventoryItem): string {
  const name = item.productName?.trim() || item.displayName.trim();
  const setPart = [
    item.setName?.trim(),
    item.cardNumber?.trim() ? `#${item.cardNumber.trim()}` : undefined,
  ]
    .filter(Boolean)
    .join(" ");

  const parts = [name];
  if (setPart) parts.push(setPart);
  const condition = conditionLabel(item);
  if (condition) parts.push(condition);
  return parts.join(" — ");
}

function categoryLabel(item: InventoryItem): string {
  if (item.productLine?.trim()) return item.productLine.trim();
  switch (item.category) {
    case "magic":
      return "Magic: The Gathering";
    case "pokemon":
      return "Pokémon";
    case "yugioh":
      return "Yu-Gi-Oh!";
    case "sports":
      return "Sports";
    default:
      return "Trading Card";
  }
}

export function buildCatalogDescriptionHtml(item: InventoryItem): string {
  const name = item.productName?.trim() || item.displayName.trim();
  const condition = conditionLabel(item);
  const lines = [
    `<p><strong>${escapeHtml(name)}</strong></p>`,
    "<ul>",
    `<li>Game: ${escapeHtml(categoryLabel(item))}</li>`,
    item.setName ? `<li>Set: ${escapeHtml(item.setName)}</li>` : "",
    item.cardNumber ? `<li>Number: ${escapeHtml(item.cardNumber)}</li>` : "",
    item.rarity ? `<li>Rarity: ${escapeHtml(item.rarity)}</li>` : "",
    condition ? `<li>Condition: ${escapeHtml(condition)}</li>` : "",
    "</ul>",
    "<p><em>Stock is kept in sync with our in-store inventory.</em></p>",
  ].filter(Boolean);
  return lines.join("\n");
}

export function buildCatalogTags(
  item: InventoryItem,
  integration: ShopifyIntegration,
): string[] {
  const tags = new Set<string>(integration.defaultTags ?? []);
  tags.add("cardscanner9000");
  tags.add("single");
  tags.add("catalog-import");

  switch (item.category) {
    case "magic":
      tags.add("magic");
      tags.add("mtg");
      break;
    case "pokemon":
      tags.add("pokemon");
      break;
    case "yugioh":
      tags.add("yugioh");
      break;
    case "sports":
      tags.add("sports");
      break;
  }

  const condition = item.tcgplayerCondition?.trim() || item.condition?.trim();
  if (condition) tags.add(condition.toLowerCase().replace(/\s+/g, "-"));
  if (item.catalogSetCode) tags.add(item.catalogSetCode.toLowerCase());
  if (item.rarity) tags.add(item.rarity.toLowerCase().replace(/\s+/g, "-"));

  return [...tags].slice(0, 250);
}

/**
 * Shopify downloads product media server-side, and the TCGplayer CDN refuses
 * those fetches, so only Firebase Storage URLs can be handed over directly.
 * Everything else goes through our own image proxy, which resolves the art
 * from the catalog (Scryfall) and caches it on the way past.
 */
export function catalogProductImageUrls(
  item: InventoryItem,
  options?: { storeSlug?: string; appBaseUrl?: string },
): string[] {
  const url = item.frontImageUrl?.trim();
  if (isFirebaseStorageUrl(url)) return [url!];

  const base = options?.appBaseUrl?.trim().replace(/\/$/, "");
  const reachable =
    base && !base.includes("localhost") && !base.includes("127.0.0.1");
  if (reachable && options?.storeSlug) {
    return [`${base}${inventoryImageProxyPath(options.storeSlug, item.id)}`];
  }

  if (!url || url.startsWith("data:") || isTcgplayerCdnUrl(url)) return [];
  return [url];
}

export type CatalogSyncPlan = {
  /** Absolute units Shopify should show. */
  quantity: number;
  quantityChanged: boolean;
  price: number | null;
  priceChanged: boolean;
  /** Sold-out rows leave the storefront; restocked SKUs come back. */
  status: "ACTIVE" | "DRAFT";
  statusChanged: boolean;
};

/** What a re-import needs to push for an already-listed row. */
export function planCatalogListingSync(
  item: InventoryItem,
  integration: ShopifyIntegration,
): CatalogSyncPlan {
  const listing = item.shopifyListing;
  const quantity = isInventorySold(item) ? 0 : catalogExportQuantity(item);
  const price = resolveCatalogExportPrice(item, integration);
  // Out of stock always leaves the storefront. In stock returns to whatever the
  // store chose as its default, so a shop that stages exports as drafts keeps
  // reviewing them by hand instead of having us publish on its behalf.
  const inStockStatus =
    integration.defaultProductStatus === "ACTIVE" ? "ACTIVE" : "DRAFT";
  const status = quantity > 0 ? inStockStatus : "DRAFT";

  // Rows exported before status tracking existed have no syncedStatus. Fall
  // back to how the export would have created them so only real changes push.
  const lastStatus = listing?.syncedStatus ?? inStockStatus;

  return {
    quantity,
    quantityChanged: listing?.syncedQuantity !== quantity,
    price,
    priceChanged: price != null && listing?.exportPrice !== price,
    status,
    statusChanged: lastStatus !== status,
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

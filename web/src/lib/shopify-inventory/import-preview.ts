import { v4 as uuidv4 } from "uuid";
import { parseShopifySku } from "../shopify/product-builder";
import {
  isShopifyImportItem,
  isTcgplayerImportItem,
} from "../inventory/status";
import type { InventoryItem, InventoryShopifyListing } from "../types";
import type {
  ShopifyCatalogVariant,
  ShopifyImportPreview,
  ShopifyImportPreviewRow,
} from "./types";
import { shopifyVariantLabel } from "./fetch-products";

function buildShopifyListing(
  variant: ShopifyCatalogVariant,
  shopDomain: string,
): InventoryShopifyListing {
  const productNumeric = variant.productId.match(/\/(\d+)$/)?.[1] ?? "";
  const domain = shopDomain.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return {
    sku: variant.sku ?? "",
    productId: variant.productId,
    variantId: variant.variantId,
    inventoryItemId: variant.inventoryItemId ?? "",
    exportPrice: variant.price,
    exportedAt: new Date().toISOString(),
    productAdminUrl: productNumeric
      ? `https://${domain}/admin/products/${productNumeric}`
      : undefined,
    productOnlineUrl: variant.productHandle
      ? `https://${domain}/products/${variant.productHandle}`
      : undefined,
  };
}

function findExistingForVariant(
  variant: ShopifyCatalogVariant,
  existingInventory: InventoryItem[],
): InventoryItem | undefined {
  const byKey = existingInventory.find(
    (i) => i.shopifyVariantKey === variant.shopifyVariantKey,
  );
  if (byKey) return byKey;

  const byListing = existingInventory.find(
    (i) => i.shopifyListing?.variantId === variant.variantId,
  );
  if (byListing) return byListing;

  if (variant.sku) {
    const parsed = parseShopifySku(variant.sku);
    if (parsed?.kind === "inventory") {
      return existingInventory.find((i) => i.id === parsed.inventoryItemId);
    }
  }

  return undefined;
}

function hasChannelConflict(item: InventoryItem): boolean {
  if (item.status === "sold") return true;
  if (isTcgplayerImportItem(item) && (item.quantity ?? 0) > 0) return true;
  return false;
}

function previewRow(
  variant: ShopifyCatalogVariant,
  existing: InventoryItem | undefined,
): ShopifyImportPreviewRow {
  if (!existing) {
    return { action: "create", variant };
  }

  if (hasChannelConflict(existing)) {
    return {
      action: "conflict",
      variant,
      inventoryItemId: existing.id,
      message: "Existing row is sold or managed on another channel",
    };
  }

  const qtySame = (existing.quantity ?? 0) === variant.quantity;
  const priceSame = (existing.listPrice ?? 0) === variant.price;
  const imageSame =
    (existing.frontImageUrl ?? "") === (variant.imageUrl ?? existing.frontImageUrl ?? "");

  if (qtySame && priceSame && imageSame && isShopifyImportItem(existing)) {
    return {
      action: "unchanged",
      variant,
      inventoryItemId: existing.id,
    };
  }

  return {
    action: "update",
    variant,
    inventoryItemId: existing.id,
  };
}

export function inventoryItemFromShopifyVariant(input: {
  variant: ShopifyCatalogVariant;
  storeId: string;
  shopDomain: string;
  now: string;
}): InventoryItem {
  const { variant, storeId, shopDomain, now } = input;
  const listing = buildShopifyListing(variant, shopDomain);
  return {
    id: uuidv4(),
    storeId,
    source: "shopify_import",
    displayName: shopifyVariantLabel(variant),
    productName: variant.productTitle,
    title: variant.variantTitle,
    productLine: variant.productType || variant.productVendor,
    setName: variant.productVendor,
    frontImageUrl: variant.imageUrl,
    listPrice: variant.price,
    marketPrice: variant.price,
    quantity: variant.quantity,
    shopifyVariantKey: variant.shopifyVariantKey,
    shopifyListing: listing,
    acquiredAt: now,
    lastShopifyImportAt: now,
    status: variant.quantity > 0 ? "listed" : "withdrawn",
    listedAt: variant.quantity > 0 ? now : undefined,
  };
}

export function mergeShopifyIntoInventoryItem(input: {
  existing: InventoryItem;
  variant: ShopifyCatalogVariant;
  shopDomain: string;
  now: string;
}): InventoryItem {
  const { existing, variant, shopDomain, now } = input;
  const listing = buildShopifyListing(variant, shopDomain);
  const wasBuyback = !isShopifyImportItem(existing);

  return {
    ...existing,
    source: wasBuyback ? existing.source : "shopify_import",
    displayName: shopifyVariantLabel(variant),
    productName: variant.productTitle,
    title: variant.variantTitle,
    productLine: variant.productType || variant.productVendor || existing.productLine,
    frontImageUrl: variant.imageUrl ?? existing.frontImageUrl,
    listPrice: variant.price,
    marketPrice: variant.price,
    quantity: variant.quantity,
    shopifyVariantKey: variant.shopifyVariantKey,
    shopifyListing: listing,
    lastShopifyImportAt: now,
    status:
      variant.quantity > 0
        ? existing.status === "sold"
          ? "sold"
          : "listed"
        : "withdrawn",
    listedAt: variant.quantity > 0 ? existing.listedAt ?? now : existing.listedAt,
  };
}

export function buildShopifyImportPreview(input: {
  variants: ShopifyCatalogVariant[];
  existingInventory: InventoryItem[];
  shopDomain: string;
}): ShopifyImportPreview {
  const rows: ShopifyImportPreviewRow[] = input.variants.map((variant) =>
    previewRow(variant, findExistingForVariant(variant, input.existingInventory)),
  );

  const seenVariantKeys = new Set(input.variants.map((v) => v.shopifyVariantKey));
  const missingFromShopify: ShopifyImportPreview["missingFromShopify"] = [];

  for (const item of input.existingInventory) {
    if (!isShopifyImportItem(item) || item.status === "sold") continue;
    if (!item.shopifyVariantKey || seenVariantKeys.has(item.shopifyVariantKey)) {
      continue;
    }
    missingFromShopify.push({
      inventoryItemId: item.id,
      displayName: item.displayName,
      action: hasChannelConflict(item) ? "conflict" : "withdraw",
    });
  }

  return {
    totalShopifyVariants: input.variants.length,
    creates: rows.filter((r) => r.action === "create").length,
    updates: rows.filter((r) => r.action === "update").length,
    unchanged: rows.filter((r) => r.action === "unchanged").length,
    withdraws:
      rows.filter((r) => r.action === "withdraw").length +
      missingFromShopify.filter((m) => m.action === "withdraw").length,
    conflicts:
      rows.filter((r) => r.action === "conflict").length +
      missingFromShopify.filter((m) => m.action === "conflict").length,
    rows,
    missingFromShopify,
  };
}

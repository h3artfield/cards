import type { InventoryItem } from "../types";

export interface ShopifyCatalogVariant {
  productId: string;
  productTitle: string;
  productHandle: string;
  productVendor?: string;
  productType?: string;
  productStatus: string;
  variantId: string;
  variantTitle: string;
  sku?: string;
  price: number;
  quantity: number;
  inventoryItemId?: string;
  imageUrl?: string;
  shopifyVariantKey: string;
}

export type ShopifyImportRowAction =
  | "create"
  | "update"
  | "unchanged"
  | "withdraw"
  | "conflict";

export interface ShopifyImportPreviewRow {
  action: ShopifyImportRowAction;
  variant: ShopifyCatalogVariant;
  inventoryItemId?: string;
  message?: string;
}

export interface ShopifyImportPreview {
  totalShopifyVariants: number;
  creates: number;
  updates: number;
  unchanged: number;
  withdraws: number;
  conflicts: number;
  rows: ShopifyImportPreviewRow[];
  missingFromShopify: Array<{
    inventoryItemId: string;
    displayName: string;
    action: "withdraw" | "conflict";
  }>;
}

export interface ShopifyImportApplyResult {
  created: number;
  updated: number;
  withdrawn: number;
  skipped: number;
  conflicts: number;
  items: InventoryItem[];
}

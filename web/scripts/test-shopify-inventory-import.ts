/**
 * Shopify inventory import tests.
 * Run: npm run test:shopify-inventory-import
 */
import { buildShopifyImportPreview } from "../src/lib/shopify-inventory/import-preview";
import { applyShopifyInventoryImport } from "../src/lib/shopify-inventory/apply-import";
import type { ShopifyCatalogVariant } from "../src/lib/shopify-inventory/types";
import type { InventoryItem } from "../src/lib/types";

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

const variant: ShopifyCatalogVariant = {
  productId: "gid://shopify/Product/1",
  productTitle: "Test Snowboard",
  productHandle: "test-snowboard",
  productVendor: "Burton",
  productType: "Snowboard",
  productStatus: "ACTIVE",
  variantId: "gid://shopify/ProductVariant/10",
  variantTitle: "Default Title",
  sku: "SNOW-1",
  price: 699.95,
  quantity: 3,
  inventoryItemId: "gid://shopify/InventoryItem/100",
  imageUrl: "https://cdn.shopify.com/s/image.jpg",
  shopifyVariantKey: "gid://shopify/ProductVariant/10",
};

console.log("\nShopify inventory import\n");

const preview = buildShopifyImportPreview({
  variants: [variant],
  existingInventory: [],
  shopDomain: "test.myshopify.com",
});
assert(preview.creates === 1, "preview creates one row");

const apply1 = applyShopifyInventoryImport({
  variants: [variant],
  storeId: "store-1",
  shopDomain: "test.myshopify.com",
  existingInventory: [],
});
assert(apply1.created === 1, "apply creates one item");
assert(apply1.items[0]?.source === "shopify_import", "marks shopify_import source");
assert(apply1.items[0]?.quantity === 3, "stores quantity");

const existing: InventoryItem = {
  ...apply1.items[0]!,
};
const variantUpdated = { ...variant, quantity: 5, price: 649.95 };
const preview2 = buildShopifyImportPreview({
  variants: [variantUpdated],
  existingInventory: [existing],
  shopDomain: "test.myshopify.com",
});
assert(preview2.updates === 1, "detects update on second pull");

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);

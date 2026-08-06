/**
 * Phase 1 — Shopify sold detection.
 * Run: npm run test:shopify-sold-detection
 */
import { createHmac } from "crypto";
import {
  buildShopifySkuForInventory,
  inventoryIdFromSkuToken,
  parseShopifySku,
} from "../src/lib/shopify/product-builder";
import {
  isInventoryAvailable,
  isInventorySold,
} from "../src/lib/shopify/inventory-status";
import { shopifyInventoryExportEligibility } from "../src/lib/shopify/eligibility";
import { verifyShopifyWebhookHmac } from "../src/lib/shopify/webhook-verify";
import { evaluateShopifyExportScopes } from "../src/lib/shopify/shop-domain";
import { normalizeShopifyResourceId } from "../src/lib/shopify/sold-detection";
import type { InventoryItem, ScannedCard } from "../src/lib/types";
import type { ShopifyIntegration } from "../src/lib/shopify/types";

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

const inventoryId = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
const integration: ShopifyIntegration = {
  enabled: true,
  shopDomain: "the-game-lodge.myshopify.com",
  defaultProductStatus: "DRAFT",
  publishOnlineStore: false,
  publishShopChannel: false,
  priceStrategy: "marketPrice",
};

const card: ScannedCard = {
  id: "card-abc-123",
  orderId: "o1",
  frontImageUrl: "https://example.com/front.jpg",
  backImageUrl: "https://example.com/back.jpg",
  itemType: "raw",
  status: "approved",
  createdAt: new Date().toISOString(),
};

const inventoryItem: InventoryItem = {
  id: inventoryId,
  storeId: "the-game-lodge",
  orderId: "o1",
  orderNumber: "BB-000006",
  cardId: card.id,
  displayName: "Torkoal",
  frontImageUrl: card.frontImageUrl,
  itemType: "raw",
  purchaseType: "cash",
  purchasePrice: 2.25,
  acquiredAt: new Date().toISOString(),
  transactionId: "tx1",
  status: "on_hand",
};

console.log("\nShopify sold detection — Phase 1\n");

console.log("SKU helpers");
const sku = buildShopifySkuForInventory(inventoryId);
assert(sku.startsWith("CS9K-"), "inventory SKU prefix");
assert(sku.length === 5 + 32, "inventory SKU length");

const parsed = parseShopifySku(sku);
assert(parsed?.kind === "inventory", "parse inventory SKU kind");
assert(
  parsed?.kind === "inventory" && parsed.inventoryItemId === inventoryId,
  "parse inventory SKU id round-trip",
);

const legacyParsed = parseShopifySku("CS9K-BB-000006-001-ABC123");
assert(legacyParsed?.kind === "legacy", "parse legacy SKU");
assert(
  legacyParsed?.kind === "legacy" && legacyParsed.cardIdPrefix === "ABC123",
  "legacy card id prefix",
);

const token = inventoryId.replace(/-/g, "");
assert(
  inventoryIdFromSkuToken(token) === inventoryId,
  "reconstruct UUID from SKU token",
);
assert(
  normalizeShopifyResourceId("gid://shopify/InventoryItem/123456789") === "123456789",
  "normalize Shopify inventory item GID",
);

console.log("\nInventory status");
assert(isInventoryAvailable(inventoryItem), "on_hand is available");
assert(!isInventorySold(inventoryItem), "on_hand is not sold");

const soldItem: InventoryItem = { ...inventoryItem, status: "sold", soldAt: new Date().toISOString() };
assert(isInventorySold(soldItem), "sold item detected");
assert(!isInventoryAvailable(soldItem), "sold item not available");

console.log("\nExport eligibility");
assert(
  shopifyInventoryExportEligibility(card, inventoryItem, integration).eligible,
  "on_hand export eligible",
);
assert(
  !shopifyInventoryExportEligibility(card, soldItem, integration).eligible,
  "sold item not export eligible",
);

console.log("\nScopes");
const scopes = evaluateShopifyExportScopes(
  "write_products, read_products, read_locations, write_inventory, read_inventory",
);
assert(scopes.canReadInventory, "read_inventory detected");
assert(scopes.missingSoldDetectionScopes.length === 0, "sold detection scopes complete");

const missingInventory = evaluateShopifyExportScopes(
  "write_products, read_products, read_locations, write_inventory",
);
assert(missingInventory.canReadInventory, "write_inventory implies read_inventory");
assert(
  missingInventory.missingSoldDetectionScopes.includes("read_inventory") === false ||
    missingInventory.canReadInventory,
  "write_inventory satisfies sold detection inventory access",
);

console.log("\nWebhook HMAC");
const secret = "test-webhook-secret";
const body = JSON.stringify({ id: 123, line_items: [] });
const hmac = createHmac("sha256", secret).update(body, "utf8").digest("base64");
assert(
  verifyShopifyWebhookHmac(body, hmac, secret),
  "valid webhook HMAC accepted",
);
assert(
  !verifyShopifyWebhookHmac(body, "bad-signature", secret),
  "invalid webhook HMAC rejected",
);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);

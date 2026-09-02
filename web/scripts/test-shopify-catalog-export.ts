import assert from "node:assert/strict";
import {
  buildCatalogProductTitle,
  buildCatalogTags,
  catalogExportEligibility,
  catalogExportQuantity,
  catalogListingSku,
  catalogProductImageUrls,
  planCatalogListingSync,
  resolveCatalogExportPrice,
} from "../src/lib/shopify/inventory-listing";
import { parseShopifySku } from "../src/lib/shopify/product-builder";
import {
  applySaleToQuantities,
  isSaleAlreadyApplied,
  shopifySaleRef,
} from "../src/lib/shopify/sold-detection";
import type { ShopifyIntegration } from "../src/lib/shopify/types";
import type { InventoryItem } from "../src/lib/types";

const INTEGRATION: ShopifyIntegration = {
  enabled: true,
  shopDomain: "test-shop.myshopify.com",
  defaultProductStatus: "ACTIVE",
  publishOnlineStore: true,
  publishShopChannel: false,
  priceStrategy: "marketPrice",
  defaultLocationId: "gid://shopify/Location/1",
  defaultTags: ["store-default"],
};

function csvItem(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: "11111111-2222-3333-4444-555555555555",
    storeId: "store-1",
    source: "tcgplayer_import",
    displayName: "Lightning Bolt",
    productName: "Lightning Bolt",
    category: "magic",
    setName: "Modern Horizons 2",
    cardNumber: "401",
    rarity: "Uncommon",
    productLine: "Magic: The Gathering",
    tcgplayerProductId: "12345",
    tcgplayerCondition: "Near Mint",
    tcgplayerListingKey: "12345:Near Mint",
    frontImageUrl: "https://cdn.test/lightning-bolt.jpg",
    quantity: 5,
    quantityOnHand: 5,
    quantityAvailable: 5,
    listPrice: 3.49,
    tcgMarketPrice: 4.2,
    acquiredAt: "2026-01-01T00:00:00.000Z",
    status: "on_hand",
    ...overrides,
  };
}

function buybackItem(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    storeId: "store-1",
    displayName: "Black Lotus",
    cardId: "card-1",
    orderId: "order-1",
    acquiredAt: "2026-01-01T00:00:00.000Z",
    status: "on_hand",
    ...overrides,
  };
}

function main() {
  // Price: the store's own TCGplayer price wins over market.
  assert.equal(resolveCatalogExportPrice(csvItem(), INTEGRATION), 3.49);
  assert.equal(
    resolveCatalogExportPrice(csvItem({ listPrice: undefined }), INTEGRATION),
    4.2,
  );
  assert.equal(
    resolveCatalogExportPrice(
      csvItem({ listPrice: undefined }),
      { ...INTEGRATION, priceStrategy: "marketPlusMarkup", markupPercent: 10 },
    ),
    4.62,
  );
  assert.equal(
    resolveCatalogExportPrice(
      csvItem({ listPrice: undefined, tcgMarketPrice: undefined, marketPrice: undefined }),
      INTEGRATION,
    ),
    null,
  );

  // Quantity comes from sellable units, with holds subtracted.
  assert.equal(catalogExportQuantity(csvItem()), 5);
  assert.equal(
    catalogExportQuantity(csvItem({ quantityReserved: 2 })),
    3,
    "reservations must not be offered for sale on Shopify",
  );
  assert.equal(catalogExportQuantity(csvItem({ status: "sold" })), 0);

  // Eligibility.
  assert.equal(catalogExportEligibility(csvItem(), INTEGRATION).eligible, true);
  assert.equal(
    catalogExportEligibility(csvItem(), { ...INTEGRATION, enabled: false }).reason,
    "integration_disabled",
  );
  assert.equal(
    catalogExportEligibility(buybackItem(), INTEGRATION).reason,
    "not_catalog_item",
  );
  assert.equal(
    catalogExportEligibility(csvItem({ status: "sold" }), INTEGRATION).reason,
    "sold",
  );
  assert.equal(
    catalogExportEligibility(csvItem(), {
      ...INTEGRATION,
      defaultLocationId: undefined,
    }).reason,
    "missing_location",
    "tracked variants with no location can never be purchased",
  );
  assert.equal(
    catalogExportEligibility(
      csvItem({ status: "withdrawn", quantity: 0, quantityOnHand: 0, quantityAvailable: 0 }),
      INTEGRATION,
    ).reason,
    "withdrawn",
  );
  assert.equal(
    catalogExportEligibility(
      csvItem({ quantity: 0, quantityOnHand: 0, quantityAvailable: 0 }),
      INTEGRATION,
    ).reason,
    "out_of_stock",
  );
  assert.equal(
    catalogExportEligibility(
      csvItem({ listPrice: undefined, tcgMarketPrice: undefined }),
      INTEGRATION,
    ).reason,
    "missing_price",
  );

  const listed = csvItem({
    status: "listed",
    shopifyListing: {
      sku: catalogListingSku(csvItem()),
      productId: "gid://shopify/Product/1",
      variantId: "gid://shopify/ProductVariant/1",
      inventoryItemId: "gid://shopify/InventoryItem/1",
      exportPrice: 3.49,
      exportedAt: "2026-01-02T00:00:00.000Z",
      syncedQuantity: 5,
    },
  });
  assert.equal(
    catalogExportEligibility(listed, INTEGRATION).reason,
    "already_exported",
  );
  assert.equal(
    catalogExportEligibility(listed, INTEGRATION, { allowReexport: true })
      .eligible,
    true,
  );

  // SKU round-trips so the sold webhook can find the row again.
  const sku = catalogListingSku(csvItem());
  const parsed = parseShopifySku(sku);
  assert.equal(parsed?.kind, "inventory");
  assert.equal(
    parsed?.kind === "inventory" ? parsed.inventoryItemId : null,
    csvItem().id,
  );

  // Product copy.
  assert.equal(
    buildCatalogProductTitle(csvItem()),
    "Lightning Bolt — Modern Horizons 2 #401 — Near Mint",
  );
  const tags = buildCatalogTags(csvItem(), INTEGRATION);
  assert.ok(tags.includes("store-default"));
  assert.ok(tags.includes("catalog-import"));
  assert.ok(tags.includes("mtg"));
  assert.ok(tags.includes("near-mint"));
  assert.deepEqual(catalogProductImageUrls(csvItem()), [
    "https://cdn.test/lightning-bolt.jpg",
  ]);
  assert.deepEqual(
    catalogProductImageUrls(csvItem({ frontImageUrl: "data:image/jpeg;base64,AAA" })),
    [],
    "inline data URLs cannot be sent to Shopify as product media",
  );

  // Re-import sync planning.
  const unchanged = planCatalogListingSync(listed, INTEGRATION);
  assert.equal(unchanged.quantityChanged, false);
  assert.equal(unchanged.priceChanged, false);

  const restocked = planCatalogListingSync(
    { ...listed, quantity: 9, quantityOnHand: 9, quantityAvailable: 9 },
    INTEGRATION,
  );
  assert.equal(restocked.quantity, 9);
  assert.equal(restocked.quantityChanged, true);

  const repriced = planCatalogListingSync(
    { ...listed, listPrice: 4.75 },
    INTEGRATION,
  );
  assert.equal(repriced.price, 4.75);
  assert.equal(repriced.priceChanged, true);

  const soldOut = planCatalogListingSync(
    { ...listed, status: "sold" },
    INTEGRATION,
  );
  assert.equal(soldOut.quantity, 0);
  assert.equal(
    soldOut.quantityChanged,
    true,
    "a sold row must push zero so Shopify stops selling it",
  );

  // A sale of one copy decrements instead of closing the row.
  const partial = applySaleToQuantities(csvItem(), 1);
  assert.equal(partial.remaining, 4);
  assert.equal(partial.item.quantity, 4);
  assert.equal(partial.item.quantityOnHand, 4);
  assert.equal(partial.item.quantityAvailable, 4);

  const cleared = applySaleToQuantities(csvItem({ quantity: 2, quantityOnHand: 2, quantityAvailable: 2 }), 2);
  assert.equal(cleared.remaining, 0);

  const oversold = applySaleToQuantities(csvItem(), 99);
  assert.equal(oversold.remaining, 0);
  assert.equal(oversold.item.quantity, 0);

  const single = applySaleToQuantities(buybackItem(), 1);
  assert.equal(
    single.remaining,
    0,
    "buyback singles always close on the first sale",
  );

  // Webhook replays are ignored per line item.
  const ref = shopifySaleRef("5001", "9001");
  assert.equal(ref, "5001:9001");
  assert.equal(shopifySaleRef(undefined, "9001"), null);
  assert.equal(isSaleAlreadyApplied(csvItem(), ref), false);
  assert.equal(
    isSaleAlreadyApplied(
      csvItem({ shopifySoldLineItemIds: ["5001:9001"] }),
      ref,
    ),
    true,
  );

  console.log("shopify catalog export: all assertions passed");
}

main();

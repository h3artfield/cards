import assert from "node:assert/strict";
import {
  buildShopifyCheckoutUrl,
  shopifyVariantNumericId,
} from "../src/lib/shopify/checkout-permalink";
import {
  addCartLine,
  cartItemCount,
  cartSubtotal,
  parseStoredCart,
  pruneCartLines,
  removeCartLine,
  setCartLineQuantity,
  type CartLine,
} from "../src/lib/store-inventory/cart";
import { validateCartForCheckout } from "../src/lib/store-inventory/validate-cart";
import type { InventoryItem } from "../src/lib/types";

function line(overrides: Partial<CartLine> = {}): CartLine {
  return {
    inventoryItemId: "item-1",
    name: "Lightning Bolt",
    setName: "Modern Horizons 2",
    unitPrice: 3.49,
    quantity: 1,
    maxQuantity: 5,
    ...overrides,
  };
}

function listedItem(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: "item-1",
    storeId: "store-1",
    source: "tcgplayer_import",
    displayName: "Lightning Bolt",
    tcgplayerListingKey: "12345:Near Mint",
    quantity: 3,
    quantityOnHand: 3,
    quantityAvailable: 3,
    listPrice: 3.49,
    acquiredAt: "2026-01-01T00:00:00.000Z",
    status: "listed",
    shopifyListing: {
      sku: "CS9K-ITEM1",
      productId: "gid://shopify/Product/1",
      variantId: "gid://shopify/ProductVariant/98765",
      inventoryItemId: "gid://shopify/InventoryItem/1",
      exportPrice: 3.49,
      exportedAt: "2026-01-02T00:00:00.000Z",
      syncedQuantity: 3,
    },
    ...overrides,
  };
}

function main() {
  // Cart math.
  let cart = addCartLine([], line());
  assert.equal(cart.length, 1);
  assert.equal(cart[0]!.quantity, 1);

  cart = addCartLine(cart, line());
  assert.equal(cart.length, 1, "the same card stacks instead of duplicating");
  assert.equal(cart[0]!.quantity, 2);

  cart = addCartLine(cart, line({ quantity: 99 }));
  assert.equal(cart[0]!.quantity, 5, "cannot exceed units on the shelf");

  cart = setCartLineQuantity(cart, "item-1", 2);
  assert.equal(cart[0]!.quantity, 2);
  assert.equal(cartItemCount(cart), 2);
  assert.equal(cartSubtotal(cart), 6.98);

  cart = addCartLine(cart, line({ inventoryItemId: "item-2", unitPrice: 10 }));
  assert.equal(cartSubtotal(cart), 16.98);
  assert.equal(
    setCartLineQuantity(cart, "item-1", 0).length,
    1,
    "stepping to zero removes the line",
  );
  assert.equal(removeCartLine(cart, "item-2").length, 1);
  assert.deepEqual(
    pruneCartLines(cart, ["item-1", "missing"]).map((l) => l.inventoryItemId),
    ["item-2"],
  );

  // Stored carts survive junk without throwing.
  assert.deepEqual(parseStoredCart(null), []);
  assert.deepEqual(parseStoredCart("not json"), []);
  assert.deepEqual(parseStoredCart('{"nope":1}'), []);
  const restored = parseStoredCart(
    JSON.stringify([line({ quantity: 400 }), { junk: true }]),
  );
  assert.equal(restored.length, 1);
  assert.equal(restored[0]!.quantity, 5);

  // Shopify permalinks.
  assert.equal(
    shopifyVariantNumericId("gid://shopify/ProductVariant/98765"),
    "98765",
  );
  assert.equal(shopifyVariantNumericId("98765"), "98765");
  assert.equal(shopifyVariantNumericId("not-an-id"), null);
  assert.equal(shopifyVariantNumericId(undefined), null);

  assert.equal(
    buildShopifyCheckoutUrl({
      shopDomain: "test-shop.myshopify.com",
      lines: [
        { variantId: "gid://shopify/ProductVariant/1", quantity: 2 },
        { variantId: "gid://shopify/ProductVariant/2", quantity: 1 },
      ],
    }),
    "https://test-shop.myshopify.com/cart/1:2,2:1",
  );
  assert.equal(
    buildShopifyCheckoutUrl({
      shopDomain: "https://test-shop.myshopify.com/",
      lines: [{ variantId: "gid://shopify/ProductVariant/1", quantity: 1 }],
    }),
    "https://test-shop.myshopify.com/cart/1:1",
  );
  assert.equal(
    buildShopifyCheckoutUrl({ shopDomain: undefined, lines: [] }),
    null,
  );
  assert.equal(
    buildShopifyCheckoutUrl({
      shopDomain: "test-shop.myshopify.com",
      lines: [{ variantId: "junk", quantity: 1 }],
    }),
    null,
  );

  // Server-side validation.
  const ok = validateCartForCheckout(
    [{ inventoryItemId: "item-1", quantity: 2 }],
    [listedItem()],
  );
  assert.equal(ok.lines.length, 1);
  assert.equal(ok.lines[0]!.variantId, "gid://shopify/ProductVariant/98765");
  assert.equal(ok.lines[0]!.quantity, 2);
  assert.equal(ok.subtotal, 6.98);
  assert.deepEqual(ok.rejected, []);

  const clamped = validateCartForCheckout(
    [{ inventoryItemId: "item-1", quantity: 10 }],
    [listedItem()],
  );
  assert.equal(clamped.lines[0]!.quantity, 3, "clamped to units on hand");
  assert.equal(clamped.lines[0]!.requestedQuantity, 10);

  const missing = validateCartForCheckout(
    [{ inventoryItemId: "gone", quantity: 1 }],
    [listedItem()],
  );
  assert.equal(missing.lines.length, 0);
  assert.equal(missing.rejected[0]!.reason, "not_found");

  assert.equal(
    validateCartForCheckout(
      [{ inventoryItemId: "item-1", quantity: 1 }],
      [listedItem({ status: "sold" })],
    ).rejected[0]!.reason,
    "sold",
  );

  assert.equal(
    validateCartForCheckout(
      [{ inventoryItemId: "item-1", quantity: 1 }],
      [
        listedItem({
          quantity: 0,
          quantityOnHand: 0,
          quantityAvailable: 0,
        }),
      ],
    ).rejected[0]!.reason,
    "out_of_stock",
  );

  const notListed = validateCartForCheckout(
    [{ inventoryItemId: "item-1", quantity: 1 }],
    [listedItem({ shopifyListing: undefined, status: "on_hand" })],
  );
  assert.equal(notListed.rejected[0]!.reason, "not_listed");
  assert.match(notListed.rejected[0]!.message, /ask staff/i);

  assert.equal(
    validateCartForCheckout(
      [{ inventoryItemId: "item-1", quantity: 1 }],
      [
        listedItem({
          listPrice: undefined,
          tcgMarketPrice: undefined,
          marketPrice: undefined,
          shopifyListing: {
            ...listedItem().shopifyListing!,
            exportPrice: 0,
          },
        }),
      ],
    ).rejected[0]!.reason,
    "no_price",
  );

  const duplicated = validateCartForCheckout(
    [
      { inventoryItemId: "item-1", quantity: 1 },
      { inventoryItemId: "item-1", quantity: 1 },
    ],
    [listedItem()],
  );
  assert.equal(
    duplicated.lines.length,
    1,
    "a repeated row must not be charged twice",
  );

  console.log("store cart checkout: all assertions passed");
}

main();

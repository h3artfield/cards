import assert from "node:assert/strict";
import {
  buildManualInventoryItem,
  ManualAddError,
  manualConditionLabel,
} from "../src/lib/inventory/manual-add";
import {
  inventoryEffectiveQuantity,
  isBuybackInventoryItem,
  isCatalogImportItem,
  isInventoryAvailable,
  isManualInventoryItem,
  isTcgplayerImportItem,
} from "../src/lib/inventory/status";
import {
  buildCatalogProductTitle,
  catalogExportEligibility,
} from "../src/lib/shopify/inventory-listing";
import { applyTcgplayerInventoryImport } from "../src/lib/tcgplayer-inventory/apply-import";
import type { ShopifyIntegration } from "../src/lib/shopify/types";

const INTEGRATION: ShopifyIntegration = {
  enabled: true,
  shopDomain: "test-shop.myshopify.com",
  defaultProductStatus: "ACTIVE",
  publishOnlineStore: true,
  publishShopChannel: false,
  priceStrategy: "marketPrice",
  defaultLocationId: "gid://shopify/Location/1",
  defaultTags: [],
};

function packRow(overrides: Record<string, unknown> = {}) {
  return buildManualInventoryItem({
    storeId: "store-1",
    id: "manual-1",
    displayName: "Lightning Bolt",
    setName: "Modern Horizons 2",
    cardNumber: "401",
    condition: "NM",
    quantity: 4,
    price: 3.5,
    now: "2026-09-02T00:00:00.000Z",
    ...overrides,
  });
}

function main() {
  const row = packRow();

  assert.equal(row.source, "manual");
  assert.equal(row.status, "on_hand");
  assert.equal(row.listPrice, 3.5);

  // Quantity has to land on every field the rest of the app reads.
  assert.equal(row.quantity, 4);
  assert.equal(row.quantityOnHand, 4);
  assert.equal(row.quantityAvailable, 4);
  assert.equal(
    inventoryEffectiveQuantity(row),
    4,
    "a clerk adding four copies must not collapse to a single buyback unit",
  );

  // Manual rows are catalog stock: deck builder, browsing, and Shopify export.
  assert.equal(isManualInventoryItem(row), true);
  assert.equal(isCatalogImportItem(row), true);
  assert.equal(isBuybackInventoryItem(row), false);
  assert.equal(isInventoryAvailable(row), true);
  assert.equal(
    catalogExportEligibility(row, INTEGRATION).eligible,
    true,
    "a priced clerk-added row must be listable on Shopify",
  );

  // Condition reaches the storefront as a human label, same as a CSV row.
  assert.equal(manualConditionLabel("LP"), "Lightly Played");
  assert.equal(
    buildCatalogProductTitle(row),
    "Lightning Bolt — Modern Horizons 2 #401 — Near Mint",
  );

  // The row must never look like a TCGplayer listing, because the importer
  // withdraws TCGplayer rows that are missing from a new CSV. Cards we opened
  // from packs are not on TCGplayer yet and must survive an import.
  assert.equal(isTcgplayerImportItem(row), false);
  const imported = applyTcgplayerInventoryImport({
    csvText:
      "TCGplayer Id,Product Line,Set Name,Product Name,Title,Number,Rarity,Condition,TCG Market Price,TCG Direct Low,TCG Low Price With Shipping,TCG Low Price,Total Quantity,Add to Quantity,TCG Marketplace Price,Photo URL\n" +
      "12345,Magic,Dominaria,Shock,,100,C,Near Mint,0.10,0.05,0.30,0.05,2,0,0.25,\n",
    storeId: "store-1",
    existingInventory: [row],
    skipConflicts: true,
  });
  const touchedManual = imported.items.find((i) => i.id === "manual-1");
  assert.equal(
    touchedManual,
    undefined,
    "a TCGplayer import must leave clerk-added stock completely alone",
  );

  // Validation: the clerk gets told which field is wrong.
  const bad: [Record<string, unknown>, string][] = [
    [{ displayName: "   " }, "displayName"],
    [{ quantity: 0 }, "quantity"],
    [{ quantity: 2.5 }, "quantity"],
    [{ quantity: 99_999 }, "quantity"],
    [{ price: 0 }, "price"],
    [{ price: -1 }, "price"],
    [{ price: Number.NaN }, "price"],
    [{ condition: "MINT" }, "condition"],
  ];
  for (const [overrides, field] of bad) {
    assert.throws(
      () => packRow(overrides),
      (err: unknown) =>
        err instanceof ManualAddError && err.field === field,
      `expected ${field} to be rejected for ${JSON.stringify(overrides)}`,
    );
  }

  // Cost is optional, and recorded as a trade when present.
  assert.equal(packRow().purchasePrice, undefined);
  assert.equal(packRow().purchaseType, undefined);
  assert.equal(packRow({ unitCost: 1.239 }).purchasePrice, 1.24);
  assert.equal(packRow({ unitCost: 1.239 }).purchaseType, "trade");

  console.log("inventory manual add: all assertions passed");
}

main();

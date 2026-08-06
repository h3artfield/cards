/**
 * Unit tests for manual catalog match helpers.
 * Run: npx --yes tsx scripts/test-manual-catalog-match.ts
 */
import assert from "node:assert/strict";
import {
  applyEnrichmentToInventoryItem,
  crosswalkFromEnrichment,
  enrichmentFromCatalog,
} from "../src/lib/deck-builder/inventory-catalog-enrichment";
import type { CatalogCard } from "../src/lib/deck-builder/types";
import type { InventoryItem } from "../src/lib/types";

const catalog: CatalogCard = {
  id: "scry-123",
  oracleId: "oracle-456",
  name: "Sol Ring",
  set: "cmr",
  setName: "Commander Legends",
  collectorNumber: "472",
  cmc: 1,
  typeLine: "Artifact",
  colorIdentity: [],
  commanderFormatLegal: false,
  isCommander: false,
  oracleText: "{T}: Add {C}{C}.",
  keywords: [],
  updatedAt: new Date().toISOString(),
};

const item: InventoryItem = {
  id: "inv-1",
  storeId: "store-1",
  displayName: "Sol Ring — Near Mint",
  acquiredAt: new Date().toISOString(),
  category: "magic",
  productLine: "Magic",
  cardNumber: "472",
  tcgplayerProductId: "12345",
  catalogMatchMethod: "unresolved",
};

const enrichment = enrichmentFromCatalog(catalog, "manual", null);
assert.equal(enrichment.matchMethod, "manual");
assert.equal(enrichment.scryfallId, "scry-123");

const updated = applyEnrichmentToInventoryItem(item, enrichment);
assert.equal(updated.catalogScryfallId, "scry-123");
assert.equal(updated.catalogOracleId, "oracle-456");
assert.equal(updated.catalogMatchMethod, "manual");
assert.equal(updated.catalogOracleText, "{T}: Add {C}{C}.");

const crosswalk = crosswalkFromEnrichment({
  storeId: "store-1",
  item,
  enrichment,
});
assert.equal(crosswalk.matchMethod, "manual");
assert.equal(crosswalk.scryfallId, "scry-123");
assert.equal(crosswalk.inventoryItemId, "inv-1");

console.log("manual catalog match tests passed");

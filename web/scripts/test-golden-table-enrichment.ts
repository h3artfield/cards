/**
 * Unit tests for oracle tags index + golden-table enrichment (no network).
 */
import assert from "node:assert/strict";
import {
  applyEnrichmentToInventoryItem,
  enrichmentFromCatalog,
} from "../src/lib/deck-builder/inventory-catalog-enrichment";
import { catalogCardFromScryfall } from "../src/lib/deck-builder/scryfall-catalog";
import {
  buildOracleTagsIndexFromEntries,
  lookupOracleTags,
} from "../src/lib/deck-builder/scryfall-oracle-tags";
import { needsGoldenTableBackfill } from "../src/lib/inventory/magic-items";
import type { InventoryItem } from "../src/lib/types";

function testCatalogCardExtractsSemanticFields() {
  const card = catalogCardFromScryfall({
    id: "living-death-id",
    oracle_id: "oracle-living-death",
    name: "Living Death",
    set: "tmp",
    collector_number: "132",
    cmc: 5,
    type_line: "Sorcery",
    oracle_text: "Each player exiles all creature cards from their graveyard...",
    keywords: ["Flashback"],
    colors: ["B"],
    color_identity: ["B"],
    legalities: { commander: "legal" },
    rarity: "rare",
    games: ["paper"],
  });
  assert.ok(card);
  assert.equal(card!.oracleId, "oracle-living-death");
  assert.equal(card!.oracleText?.includes("graveyard"), true);
  assert.deepEqual(card!.keywords, ["Flashback"]);
  assert.equal(card!.rarity, "rare");
}

function testOracleTagsIndex() {
  const index = buildOracleTagsIndexFromEntries([
    {
      type: "oracle",
      slug: "mass-reanimation",
      taggings: [
        { oracle_id: "oracle-living-death", weight: "strong" },
        { oracle_id: "oracle-other", weight: "weak" },
      ],
    },
    {
      type: "oracle",
      slug: "removal",
      taggings: [{ oracle_id: "oracle-other", weight: "median" }],
    },
  ]);
  assert.deepEqual(lookupOracleTags(index, "oracle-living-death"), [
    "mass-reanimation",
  ]);
  assert.deepEqual(lookupOracleTags(index, "oracle-other"), ["removal"]);
}

function testGoldenTableEnrichment() {
  const catalog = catalogCardFromScryfall({
    id: "living-death-id",
    oracle_id: "oracle-living-death",
    name: "Living Death",
    set: "tmp",
    collector_number: "132",
    cmc: 5,
    type_line: "Sorcery",
    oracle_text: "Each player exiles all creature cards from their graveyard...",
    keywords: [],
    color_identity: ["B"],
    legalities: { commander: "legal" },
    games: ["paper"],
  })!;
  const tagsIndex = buildOracleTagsIndexFromEntries([
    {
      type: "oracle",
      slug: "mass-reanimation",
      taggings: [{ oracle_id: "oracle-living-death", weight: "strong" }],
    },
  ]);
  const enrichment = enrichmentFromCatalog(catalog, "tcgplayer_id", tagsIndex);
  const item = applyEnrichmentToInventoryItem(
    {
      id: "inv-1",
      storeId: "store-1",
      displayName: "Living Death",
      acquiredAt: new Date().toISOString(),
    } as InventoryItem,
    enrichment,
  );
  assert.equal(item.catalogOracleId, "oracle-living-death");
  assert.equal(item.catalogCmc, 5);
  assert.equal(item.catalogOracleText?.includes("graveyard"), true);
  assert.deepEqual(item.catalogOracleTags, ["mass-reanimation"]);
  assert.equal(needsGoldenTableBackfill(item), false);
}

function testNeedsGoldenTableBackfill() {
  const linked = {
    catalogScryfallId: "abc",
    catalogOracleId: "oid",
    catalogOracleText: "text",
    catalogKeywords: [],
  } as InventoryItem;
  assert.equal(needsGoldenTableBackfill(linked), false);

  const stale = {
    catalogScryfallId: "abc",
    catalogCmc: 3,
  } as InventoryItem;
  assert.equal(needsGoldenTableBackfill(stale), true);

  const oracleOnly = {
    catalogScryfallId: "abc",
    catalogOracleId: "oid",
    catalogKeywords: [],
  } as InventoryItem;
  assert.equal(needsGoldenTableBackfill(oracleOnly), false);
}

testCatalogCardExtractsSemanticFields();
testOracleTagsIndex();
testGoldenTableEnrichment();
testNeedsGoldenTableBackfill();

console.log("golden-table enrichment tests passed");

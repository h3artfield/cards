/**
 * Unit tests for Scryfall bulk index lookups (no network).
 */
import assert from "node:assert/strict";
import {
  buildBulkIndexFromJsonl,
  resolveCatalogFromBulkIndex,
} from "../src/lib/deck-builder/scryfall-bulk-index";
import type { InventoryItem } from "../src/lib/types";

const FIXTURE_JSONL = [
  JSON.stringify({
    id: "sol-ring-id",
    name: "Sol Ring",
    set: "cmr",
    set_name: "Commander Legends",
    collector_number: "472",
    cmc: 1,
    type_line: "Artifact",
    color_identity: [],
    legalities: { commander: "legal" },
    tcgplayer_id: 123456,
    games: ["paper"],
  }),
  JSON.stringify({
    id: "atraxa-id",
    name: "Atraxa, Praetors' Voice",
    set: "m3c",
    set_name: "Modern Horizons 3 Commander",
    collector_number: "1",
    cmc: 4,
    type_line: "Legendary Creature — Phyrexian Angel",
    color_identity: ["W", "U", "B", "G"],
    legalities: { commander: "legal" },
    games: ["paper"],
  }),
  JSON.stringify({
    id: "token-id",
    name: "Soldier Token",
    set: "m21",
    set_name: "Core Set 2021",
    collector_number: "1",
    type_line: "Token Creature — Soldier",
    layout: "token",
    games: ["paper"],
  }),
].join("\n");

function fakeItem(overrides: Partial<InventoryItem>): InventoryItem {
  return {
    id: "inv-1",
    storeId: "store-1",
    displayName: "Test",
    acquiredAt: new Date().toISOString(),
    ...overrides,
  } as InventoryItem;
}

function testTcgplayerLookup() {
  const index = buildBulkIndexFromJsonl(FIXTURE_JSONL);
  const hit = resolveCatalogFromBulkIndex(
    fakeItem({ tcgplayerProductId: "123456", productName: "Sol Ring" }),
    index,
  );
  assert.ok(hit);
  assert.equal(hit!.catalog.id, "sol-ring-id");
  assert.equal(hit!.matchMethod, "tcgplayer_id");
}

function testSetNameAndCollectorLookup() {
  const index = buildBulkIndexFromJsonl(FIXTURE_JSONL);
  const hit = resolveCatalogFromBulkIndex(
    fakeItem({
      setName: "Commander Legends",
      cardNumber: "472",
      productName: "Sol Ring",
    }),
    index,
  );
  assert.ok(hit);
  assert.equal(hit!.catalog.id, "sol-ring-id");
  assert.equal(hit!.matchMethod, "set_search");
}

function testNameLookup() {
  const index = buildBulkIndexFromJsonl(FIXTURE_JSONL);
  const hit = resolveCatalogFromBulkIndex(
    fakeItem({ productName: "Atraxa, Praetors' Voice" }),
    index,
  );
  assert.ok(hit);
  assert.equal(hit!.catalog.id, "atraxa-id");
  assert.equal(hit!.matchMethod, "name_search");
}

function testSkipsTokens() {
  const index = buildBulkIndexFromJsonl(FIXTURE_JSONL);
  assert.equal(index.cardCount, 2);
  const miss = resolveCatalogFromBulkIndex(
    fakeItem({
      setName: "Core Set 2021",
      cardNumber: "1",
      productName: "Soldier Token",
    }),
    index,
  );
  assert.equal(miss, null);
}

let failed = 0;
for (const [name, fn] of [
  ["tcgplayer lookup", testTcgplayerLookup],
  ["set + collector lookup", testSetNameAndCollectorLookup],
  ["name lookup", testNameLookup],
  ["skips tokens", testSkipsTokens],
] as const) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL ${name}:`, err);
  }
}

console.log(`\n${failed === 0 ? "ALL PASS" : `${failed} FAILED`}`);
process.exit(failed > 0 ? 1 : 0);

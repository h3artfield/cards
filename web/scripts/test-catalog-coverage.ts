/**
 * Unit tests for P1 catalog coverage + match queue.
 * Run: npx --yes tsx scripts/test-catalog-coverage.ts
 */
import assert from "node:assert/strict";
import { computeCatalogCoverage } from "../src/lib/deck-builder/catalog-coverage";
import {
  buildCatalogMatchQueue,
  countConflictInventoryRows,
  detectTcgplayerScryfallConflicts,
} from "../src/lib/deck-builder/catalog-match-queue";
import type { InventoryItem } from "../src/lib/types";

function item(partial: Partial<InventoryItem> & Pick<InventoryItem, "id">): InventoryItem {
  return {
    storeId: "store-1",
    displayName: partial.displayName ?? "Test Card",
    acquiredAt: partial.acquiredAt ?? new Date().toISOString(),
    category: "magic",
    productLine: "Magic",
    cardNumber: partial.cardNumber ?? "001",
    ...partial,
  };
}

function testCoverageCounts() {
  const rows = [
    item({
      id: "1",
      catalogSyncedAt: "2026-01-01",
      catalogScryfallId: "sf-1",
      catalogOracleId: "oracle-1",
      catalogOracleText: "Draw a card.",
      catalogCanBeSoleCommander: true,
      catalogOracleTags: ["draw"],
      catalogKeywords: [],
      catalogMatchMethod: "tcgplayer_id",
      tcgplayerProductId: "111",
    }),
    item({
      id: "2",
      catalogSyncedAt: "2026-01-01",
      catalogMatchMethod: "unresolved",
    }),
    item({
      id: "3",
      displayName: "Deck Box",
      productLine: "Magic Supplies",
      cardNumber: undefined,
    }),
  ];

  const report = computeCatalogCoverage(rows);
  assert.equal(report.counts.total, 2);
  assert.equal(report.counts.linked, 1);
  assert.equal(report.counts.unresolved, 1);
  assert.equal(report.counts.withOracleId, 1);
  assert.equal(report.rates.oracleIdPct, 50);
}

function testConflictDetection() {
  const rows = [
    item({
      id: "a",
      tcgplayerProductId: "999",
      catalogSyncedAt: "2026-01-01",
      catalogScryfallId: "print-a",
      catalogMatchMethod: "tcgplayer_id",
    }),
    item({
      id: "b",
      tcgplayerProductId: "999",
      catalogSyncedAt: "2026-01-01",
      catalogScryfallId: "print-b",
      catalogMatchMethod: "tcgplayer_id",
    }),
  ];

  const conflicts = detectTcgplayerScryfallConflicts(rows);
  assert.equal(conflicts.size, 1);
  assert.equal(conflicts.get("999")?.size, 2);
  assert.equal(countConflictInventoryRows(rows), 2);

  const queue = buildCatalogMatchQueue(rows, {
    reasons: ["conflict"],
  });
  assert.equal(queue.total, 2);
  assert.equal(queue.rows[0]?.reason, "conflict");
}

function testFuzzyMatchQueue() {
  const rows = [
    item({
      id: "fuzzy-1",
      catalogSyncedAt: "2026-01-01",
      catalogScryfallId: "sf-fuzzy",
      catalogMatchMethod: "name_fuzzy",
    }),
  ];

  const queue = buildCatalogMatchQueue(rows, { reasons: ["fuzzy_match"] });
  assert.equal(queue.total, 1);
  assert.equal(queue.rows[0]?.reason, "fuzzy_match");
}

testCoverageCounts();
testConflictDetection();
testFuzzyMatchQueue();

console.log("catalog coverage + match queue tests passed");

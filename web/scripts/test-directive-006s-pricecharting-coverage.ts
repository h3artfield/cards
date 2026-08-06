/**
 * Directive 006S — PriceCharting CSV coverage expansion tests.
 * Run: npm run test:directive-006s-pricecharting-coverage
 */
import { importPriceChartingCsv } from "../src/lib/prices/pricecharting-csv-import";
import { buildIdentityKey, inferIdentityFromPriceChartingRow } from "../src/lib/prices/identity-key";
import { createScryfallSetResolver } from "../src/lib/prices/scryfall-set-resolver";
import type { ScryfallSetEntry } from "../src/lib/prices/scryfall-set-resolver";
import { inferYugiohIdentityFromPriceChartingRow } from "../src/lib/prices/yugioh-pc-identity";
import { inferMtgIdentityFromPriceChartingRow } from "../src/lib/prices/mtg-pc-identity";

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

function mockResolver(entries: Record<string, string>): ReturnType<typeof createScryfallSetResolver> {
  const idx = new Map<string, ScryfallSetEntry>();
  for (const [name, code] of Object.entries(entries)) {
    const norm = name.toLowerCase();
    idx.set(norm, { code, name });
  }
  return createScryfallSetResolver(idx);
}

function runYugiohPatterns() {
  console.log("\n1. Yu-Gi-Oh card ID patterns");
  const stas = inferYugiohIdentityFromPriceChartingRow({
    productName: "Ally of Justice Clausolas STAS-EN008",
    consoleName: "YuGiOh 2 Player Starter Set",
    genre: "YuGiOh Card",
  });
  assert(stas.exactIdentityMatch === true, "STAS-EN008 exact match");
  assert(stas.collectorNumber === "STAS-EN008", "STAS-EN008 collector number");

  const ra = inferYugiohIdentityFromPriceChartingRow({
    productName: "Alpha, the Master of Beasts [Secret Rare] RA01-EN022",
    consoleName: "YuGiOh 25th Anniversary Rarity Collection",
    genre: "YuGiOh Card",
  });
  assert(ra.collectorNumber === "RA01-EN022", "RA01-EN022 from bracket rarity");

  const bpt = inferYugiohIdentityFromPriceChartingRow({
    productName: "Beast of Talwar BPT-J01",
    consoleName: "YuGiOH Japanese Booster Pack Collectors Tin",
    genre: "YuGiOh Card",
  });
  assert(bpt.collectorNumber === "BPT-J01", "BPT-J01 Japanese promo");
}

function runMtgSetResolver() {
  console.log("\n2. MTG Scryfall set-name resolver");
  const resolver = mockResolver({
    Bloomburrow: "BLB",
    "Final Fantasy": "FIN",
    "Commander Masters": "CMM",
  });

  const blb = inferMtgIdentityFromPriceChartingRow(
    { productName: "Agate Assault #122", consoleName: "Magic Bloomburrow", genre: "Magic Card" },
    resolver,
  );
  assert(blb.setCode === "BLB", "Bloomburrow → BLB");
  assert(blb.exactIdentityMatch === true, "BLB row exact match");
  assert(blb.collectorNumber === "122", "BLB collector #122");

  const fin = inferMtgIdentityFromPriceChartingRow(
    { productName: "Prompto Argentum #148", consoleName: "Magic Final Fantasy", genre: "Magic Cards" },
    resolver,
  );
  assert(fin.setCode === "FIN", "Final Fantasy → FIN");
}

function runPlstIdentity() {
  console.log("\n3. The List printing identity (PLST separate from origin)");
  const resolver = mockResolver({ "The List": "PLST" });
  const plst = inferMtgIdentityFromPriceChartingRow(
    {
      productName: "Argentum Armor #198",
      consoleName: "Magic The List Reprints",
      genre: "Magic Cards",
    },
    resolver,
    { originSet: "AFC", originCollectorNumber: "198" },
  );
  assert(plst.setCode === "PLST", "printing set is PLST");
  assert(plst.originSet === "AFC", "origin set AFC preserved");
  assert(plst.collectorNumber === "AFC-198", "collector AFC-198 composite");

  const key = buildIdentityKey(plst);
  assert(key === "mtg|PLST|AFC-198|nonfoil|normal|en", "PLST identity key format");
  assert(key !== "mtg|AFC|347|nonfoil|normal|en", "PLST not collapsed to AFC production");
}

function runCatalogVsSnapshot() {
  console.log("\n4. Catalog all rows; snapshots only for exact identity");
  const csv = [
    "id,product-name,console-name,genre,loose-price",
    '1,"Agate Assault #122","Magic Bloomburrow",Magic Card,0.13',
    '2,"Mystery Card","Magic Unknown Set",Magic Card,1.00',
  ].join("\n");

  const resolver = mockResolver({ Bloomburrow: "BLB" });
  const result = importPriceChartingCsv({
    fileText: csv,
    capturedDate: "2026-07-01",
    category: "mtg",
    identityContext: { scryfallSetResolver: resolver },
  });

  assert(result.products.length === 2, "both rows cataloged");
  assert(result.snapshots.length === 1, "only exact row snapshotted");
  assert(result.products[1]?.exactIdentityMatch === false, "unresolved row flagged in catalog");
  assert(result.run.rowsCataloged === 2, "rowsCataloged counts all products");
}

function runOnePieceOpId() {
  console.log("\n5. One Piece OP07-002 style IDs");
  const op = inferIdentityFromPriceChartingRow({
    productName: "Ain OP07-002",
    consoleName: "One Piece 500 Years in the Future",
    genre: "One Piece Cards",
  });
  assert(op.exactIdentityMatch === true, "OP07-002 exact");
  assert(op.collectorNumber === "OP07-002", "OP ID preserved");
}

function runGrushaKey() {
  console.log("\n6. Grusha reverse holo identity unchanged");
  const g = inferIdentityFromPriceChartingRow({
    productName: "Grusha [Reverse Holo] #184",
    consoleName: "Pokemon Paldea Evolved",
    genre: "Pokemon Card",
  });
  const key = buildIdentityKey(g);
  assert(key === "pokemon|paldea-evolved|184|reverse_holo|en", "Grusha reverse holo key");
}

function main() {
  console.log("Directive 006S — PriceCharting coverage tests\n");
  runYugiohPatterns();
  runMtgSetResolver();
  runPlstIdentity();
  runCatalogVsSnapshot();
  runOnePieceOpId();
  runGrushaKey();

  console.log(`\n006S: ${failed === 0 ? "ALL PASS" : `${failed} FAILED`} (${passed} checks)`);
  process.exit(failed > 0 ? 1 : 0);
}

main();

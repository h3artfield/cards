/**
 * TCGplayer inventory CSV import tests.
 * Run: npm run test:tcgplayer-inventory-import
 */
import { applyTcgplayerInventoryImport } from "../src/lib/tcgplayer-inventory/apply-import";
import { buildTcgplayerImportPreview } from "../src/lib/tcgplayer-inventory/import-preview";
import { parseTcgplayerInventoryExportCsv } from "../src/lib/tcgplayer-inventory/parse-export-csv";
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

const SAMPLE_CSV = `TCGplayer Id,Product Line,Set Name,Product Name,Title,Number,Rarity,Condition,TCG Market Price,TCG Direct Low,TCG Low Price,Total Quantity,Add to Quantity,TCG Marketplace Price,My Store Reserve Qty,My Store Price
8735381,Flesh & Blood TCG,Arcane Rising,Spark of Genius,Spark of Genius,ARC009,Super Rare,Near Mint 1st Edition,22.2,,20,1,0,20.01,1,20
8735382,Pokemon International,Prismatic Evolutions,Cap of Quick Thinking,Cap of Quick Thinking,EVO249,Rare,Near Mint,4.7,,5.73,2,0,4.86,2,4.86
8735383,Flesh & Blood TCG,Bright Lights,Skyzyk,Skyzyk,AST003,Majestic,Near Mint Rainbow Foil,104.59,,105,0,0,104.59,0,104.59`;

console.log("\nTCGplayer inventory import\n");

console.log("Parse CSV");
const { rows, skipped } = parseTcgplayerInventoryExportCsv(SAMPLE_CSV);
assert(rows.length === 3, "parses three inventory rows");
assert(skipped === 0, "no skipped rows");
assert(rows[0]!.tcgplayerProductId === "8735381", "TCGplayer Id preserved");
assert(rows[0]!.quantity === 1, "uses Total Quantity");
assert(rows[0]!.quantityOnHand === 1, "stores quantityOnHand");
assert(rows[0]!.tcgplayerReportedReserve === 1, "stores tcgplayerReportedReserve");
assert(rows[0]!.quantityAvailable === 1, "quantityAvailable matches on hand");
assert(rows[1]!.quantity === 2, "quantity 2 for second row");

console.log("\nTotal Quantity — reserve tracked separately from sellable count");
const RESERVE_CSV = `TCGplayer Id,Product Line,Set Name,Product Name,Title,Number,Rarity,Condition,TCG Market Price,TCG Direct Low,TCG Low Price,Total Quantity,Add to Quantity,TCG Marketplace Price,My Store Reserve Qty,My Store Price
888,Magic,Test,Physical Stock,Physical Stock,001,Common,Near Mint,5,,4,20,0,5,3,4.00`;
const reserveIgnored = parseTcgplayerInventoryExportCsv(RESERVE_CSV);
assert(reserveIgnored.rows[0]!.quantity === 20, "sellable count uses Total Quantity");
assert(reserveIgnored.rows[0]!.quantityOnHand === 20, "on hand from Total Quantity");
assert(reserveIgnored.rows[0]!.tcgplayerReportedReserve === 3, "TCGplayer reserve stored separately");
assert(reserveIgnored.rows[0]!.quantityAvailable === 20, "available equals on hand at import");
assert(rows[0]!.listPrice === 20, "My Store Price used");
assert(rows[0]!.listingKey.includes("8735381"), "listing key includes product id");
assert(rows[0]!.tcgMarketPrice === 22.2, "TCG market price parsed");
assert(rows[0]!.tcgLowPrice === 20, "TCG low price parsed from CSV");
assert(rows[1]!.tcgLowPrice === 5.73, "TCG low price with decimals");
assert(rows[0]!.storePrice === 20, "My Store Price parsed to storePrice");
assert(rows[1]!.listPrice === 4.86, "My Store Price keeps cents");

console.log("\nParse CSV without My Store Price");
const NO_STORE_CSV = `TCGplayer Id,Product Line,Set Name,Product Name,Title,Number,Rarity,Condition,TCG Market Price,TCG Direct Low,TCG Low Price,Total Quantity,Add to Quantity,TCG Marketplace Price,My Store Reserve Qty,My Store Price
999,Flesh & Blood TCG,Test,Test Card,Test Card,T001,Common,Near Mint,22.2,,20,1,0,20.01,0,`;
const noStore = parseTcgplayerInventoryExportCsv(NO_STORE_CSV);
assert(noStore.rows[0]!.listPrice === 0, "listPrice empty when My Store Price blank");
assert(
  noStore.rows[0]!.tcgMarketplacePrice === 20.01,
  "marketplace price still parsed",
);

console.log("\nParse CSV with extra column (My Store Price in column Q)");
const EXTRA_COL_CSV = `TCGplayer Id,Product Line,Set Name,Product Name,Title,Number,Rarity,Condition,TCG Market Price,TCG Direct Low,TCG Low Price,Total Quantity,Add to Quantity,TCG Marketplace Price,My Store Reserve Qty,Language,My Store Price
999,Magic,MH3,Test Card,Test Card,001,Rare,Near Mint,5,,4,1,0,5,1,English,4.86`;
const extraCol = parseTcgplayerInventoryExportCsv(EXTRA_COL_CSV);
assert(extraCol.rows[0]!.listPrice === 4.86, "My Store Price found with extra column");

console.log("\nRe-import updates shelf price from My Store Price cents");
const existingWithMarketplacePrice: InventoryItem = {
  id: "item-1",
  storeId: "store-1",
  source: "tcgplayer_import",
  displayName: "Cap of Quick Thinking — Near Mint",
  acquiredAt: new Date().toISOString(),
  tcgplayerProductId: "8735382",
  tcgplayerListingKey: "8735382|near mint",
  quantity: 2,
  listPrice: 5,
};
const reimportPreview = buildTcgplayerImportPreview(SAMPLE_CSV, [
  existingWithMarketplacePrice,
]);
assert(
  reimportPreview.rows.some(
    (r) =>
      r.tcgplayerProductId === "8735382" &&
      r.action === "update" &&
      r.listPrice === 4.86,
  ),
  "re-import detects My Store Price cent change",
);

console.log("\nPreview first import");
const preview1 = buildTcgplayerImportPreview(SAMPLE_CSV, []);
assert(preview1.creates === 3, "creates all three rows including 0-qty catalog");
assert(preview1.createsInStock === 2, "two in-stock creates");
assert(preview1.createsCatalog === 1, "zero-qty row kept as catalog placeholder");
assert(preview1.unchanged === 0, "no unchanged on first import");
assert(preview1.rows.some((r) => r.action === "create"), "has create actions");

console.log("\nApply first import");
const apply1 = applyTcgplayerInventoryImport({
  csvText: SAMPLE_CSV,
  storeId: "store-1",
  existingInventory: [],
});
assert(apply1.created === 3, "applied all three items including catalog slot");
assert(
  apply1.items.every((i) => i.source === "tcgplayer_import"),
  "items marked tcgplayer_import",
);

const existing = apply1.items;

console.log("\nPreview re-import with price/qty change");
const UPDATED_CSV = SAMPLE_CSV.replace(
  "8735381,Flesh & Blood TCG,Arcane Rising,Spark of Genius,Spark of Genius,ARC009,Super Rare,Near Mint 1st Edition,22.2,,20,1,0,20.01,1,20",
  "8735381,Flesh & Blood TCG,Arcane Rising,Spark of Genius,Spark of Genius,ARC009,Super Rare,Near Mint 1st Edition,22.2,,20,2,0,20.01,1,24.99",
);
const preview2 = buildTcgplayerImportPreview(UPDATED_CSV, existing);
assert(preview2.updates === 1, "detects price/qty update");
assert(
  preview2.rows.some(
    (r) => r.action === "update" && r.listPrice === 24.99 && r.quantity === 2,
  ),
  "update row has new price and qty",
);

console.log("\nApply re-import");
const apply2 = applyTcgplayerInventoryImport({
  csvText: UPDATED_CSV,
  storeId: "store-1",
  existingInventory: existing,
});
assert(apply2.updated === 1, "re-import updates one row");
const updated = apply2.items[0]!;
assert(updated.listPrice === 24.99, "list price updated");
assert(updated.quantity === 2, "quantity updated");

console.log("\nRestock catalog placeholder");
const RESTOCK_CSV = SAMPLE_CSV.replace(
  "8735383,Flesh & Blood TCG,Bright Lights,Skyzyk,Skyzyk,AST003,Majestic,Near Mint Rainbow Foil,104.59,,105,0,0,104.59,0,104.59",
  "8735383,Flesh & Blood TCG,Bright Lights,Skyzyk,Skyzyk,AST003,Majestic,Near Mint Rainbow Foil,104.59,,105,2,0,104.59,2,104.59",
);
const previewRestock = buildTcgplayerImportPreview(RESTOCK_CSV, apply1.items);
assert(
  previewRestock.rows.some(
    (r) => r.action === "update" && r.tcgplayerProductId === "8735383" && r.quantity === 2,
  ),
  "restock updates catalog row from 0 to 2 qty",
);

console.log("\nSold conflict");
const soldItem: InventoryItem = {
  ...existing.find((i) => i.tcgplayerProductId === "8735381")!,
  status: "sold",
  quantity: 0,
};
const preview3 = buildTcgplayerImportPreview(SAMPLE_CSV, [soldItem, ...apply1.items.filter((i) => i.id !== soldItem.id)]);
assert(
  preview3.rows.some((r) => r.action === "conflict"),
  "flags conflict when sold item reappears with qty in CSV",
);

assert(
  apply1.items.every((i) => i.frontImageUrl?.includes("tcgplayer-cdn")),
  "import assigns TCGplayer CDN image URL",
);
assert(apply1.items[0]!.tcgLowPrice === 20, "import stores CSV tcg low price");
assert(apply1.items[0]!.tcgMarketPrice === 22.2, "import stores CSV market price");

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);

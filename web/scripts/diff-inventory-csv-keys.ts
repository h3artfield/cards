/** List Firestore magic keys not present in a TCGplayer CSV export. */
import { readFileSync } from "node:fs";
import { loadEnvLocal } from "./lib/script-env";
import { parseTcgplayerInventoryExportCsv } from "../src/lib/tcgplayer-inventory/parse-export-csv";
import { isMagicInventoryItem } from "../src/lib/inventory/magic-items";
import { isTcgplayerImportItem } from "../src/lib/inventory/status";

loadEnvLocal();

async function main() {
const csvPath = process.argv[2];
if (!csvPath) {
  console.error("Usage: npx tsx scripts/diff-inventory-csv-keys.ts <csv-path>");
  process.exit(1);
}

const csv = readFileSync(csvPath, "utf8");
const lines = csv.split(/\r?\n/).filter(Boolean);
const { rows } = parseTcgplayerInventoryExportCsv(csv);
const csvKeys = new Set(rows.map((r) => r.listingKey));

const { dataStore } = await import("../src/lib/storage/data-store");
const all = await dataStore.getInventory("the-game-lodge");
const magic = all.filter((i) => isMagicInventoryItem(i) && isTcgplayerImportItem(i));
const nonMagic = all.filter((i) => isTcgplayerImportItem(i) && !isMagicInventoryItem(i));

const notInCsv = magic.filter(
  (i) => i.tcgplayerListingKey && !csvKeys.has(i.tcgplayerListingKey),
);

console.log(`CSV raw lines (non-empty): ${lines.length} (${lines.length - 1} data rows)`);
console.log(`CSV parsed unique keys: ${csvKeys.size}`);
console.log(`Firestore magic listings: ${magic.length}`);
console.log(`Firestore keys not in CSV: ${notInCsv.length}\n`);

for (const i of notInCsv) {
  console.log(
    `${i.tcgplayerListingKey} | qty=${i.quantityOnHand ?? i.quantity ?? 0} | status=${i.status ?? "on_hand"} | ${i.displayName}`,
  );
}

console.log(`\nNon-magic TCGplayer docs in Firestore: ${nonMagic.length}`);
const pl = new Map<string, number>();
for (const i of nonMagic) {
  const k = i.productLine ?? "?";
  pl.set(k, (pl.get(k) ?? 0) + 1);
}
for (const [k, n] of [...pl.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
  console.log(`  ${k}: ${n}`);
}
}

main().catch((e) => { console.error(e); process.exit(1); });

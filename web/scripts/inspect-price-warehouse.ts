/**
 * Check PriceCharting warehouse import status in Firestore.
 * Run: npx tsx scripts/inspect-price-warehouse.ts
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { COLLECTIONS } from "../src/lib/firebase/collections";
import { requireFirestore } from "../src/lib/firebase/admin";

function loadEnvLocal() {
  try {
    const p = resolve(__dirname, "../.env.local");
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] == null) process.env[key] = val;
    }
  } catch {
    /* optional */
  }
}

async function main() {
  loadEnvLocal();
  const db = requireFirestore();

  const runsSnap = await db
    .collection(COLLECTIONS.pricechartingImportRuns)
    .orderBy("startedAt", "desc")
    .limit(5)
    .get();

  console.log("Import runs:", runsSnap.size);
  for (const doc of runsSnap.docs) {
    console.log(JSON.stringify(doc.data(), null, 2));
  }

  const productsCount = (
    await db.collection(COLLECTIONS.pricechartingProductsCurrent).count().get()
  ).data().count;
  const snapshotsCount = (
    await db.collection(COLLECTIONS.cardPriceSnapshots).count().get()
  ).data().count;

  console.log("\nCollection counts:");
  console.log("  pricecharting_products_current:", productsCount);
  console.log("  card_price_snapshots:", snapshotsCount);
  console.log("  pricecharting_import_runs:", runsSnap.size);

  const marSnap = await db
    .collection(COLLECTIONS.cardPriceSnapshots)
    .where("identityKey", "==", "mtg|MAR|93|nonfoil|normal|en")
    .limit(5)
    .get();
  console.log("\nMAR #93 snapshots:", marSnap.size);
  for (const d of marSnap.docs) {
    const s = d.data();
    console.log(
      `  ${s.capturedDate} raw=$${s.rawUngraded} product=${s.priceChartingProductId}`,
    );
  }

  const rexSnap = await db
    .collection(COLLECTIONS.cardPriceSnapshots)
    .where("identityKey", "==", "mtg|REX|18|nonfoil|normal|en")
    .limit(3)
    .get();
  console.log("REX #18 snapshots:", rexSnap.size);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

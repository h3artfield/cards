/**
 * Directive 006R import verification report.
 * Run: npx tsx scripts/verify-006r-import.ts
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { COLLECTIONS } from "../src/lib/firebase/collections";
import { requireFirestore } from "../src/lib/firebase/admin";
import { buildCardPriceHistoryResponse } from "../src/lib/prices/price-history";

function loadEnvLocal() {
  for (const line of readFileSync(resolve(__dirname, "../.env.local"), "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!process.env[key]) process.env[key] = trimmed.slice(eq + 1).trim();
  }
}

const RAVENOUS_CARD_ID = "579ba1f4-6106-4716-9c94-a0130be39ea3";

async function main() {
  loadEnvLocal();
  const db = requireFirestore();

  console.log("=== 006R Import Verification ===\n");

  const runs = await db
    .collection(COLLECTIONS.pricechartingImportRuns)
    .orderBy("startedAt", "desc")
    .limit(3)
    .get();

  console.log("Import runs:", runs.size);
  for (const doc of runs.docs) {
    const r = doc.data();
    console.log(JSON.stringify(r, null, 2));
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

  const keys = [
    { label: "MAR #93", key: "mtg|MAR|93|nonfoil|normal|en" },
    { label: "REX #18", key: "mtg|REX|18|nonfoil|normal|en" },
    { label: "REX #43", key: "mtg|REX|43|nonfoil|normal|en" },
    { label: "Grusha", key: "pokemon|paldea-evolved|184|reverse_holo|en" },
  ];

  for (const { label, key } of keys) {
    const snap = await db
      .collection(COLLECTIONS.cardPriceSnapshots)
      .where("identityKey", "==", key)
      .get();
    console.log(`\n${label} (${key}): ${snap.size} snapshot(s)`);
    for (const d of snap.docs) {
      const s = d.data();
      console.log(
        `  ${s.capturedDate} raw=$${s.rawUngraded} pcId=${s.priceChartingProductId} name=${s.productName}`,
      );
    }
  }

  const marSnap = await db
    .collection(COLLECTIONS.cardPriceSnapshots)
    .where("identityKey", "==", "mtg|MAR|93|nonfoil|normal|en")
    .get();
  const rex18InMar = marSnap.docs.some((d) =>
    String(d.data().productName ?? "").includes("#18"),
  );
  console.log(
    `\nMAR #93 contaminated with REX #18 pricing: ${rex18InMar ? "YES (FAIL)" : "NO (PASS)"}`,
  );

  const card = await db.collection(COLLECTIONS.cards).doc(RAVENOUS_CARD_ID).get();
  if (card.exists) {
    const c = card.data()!;
    console.log("\nRavenous production fields (unchanged check):");
    console.log(`  marketPrice: ${c.marketPrice}`);
    console.log(`  cashOffer: ${c.cashOffer}`);
    console.log(`  tradeOffer: ${c.tradeOffer}`);
  } else {
    console.log("\nRavenous card doc not in Firestore (check staging separately)");
  }

  const rex18History = buildCardPriceHistoryResponse({
    identityKey: "mtg|REX|18|nonfoil|normal|en",
    snapshots: (
      await db
        .collection(COLLECTIONS.cardPriceSnapshots)
        .where("identityKey", "==", "mtg|REX|18|nonfoil|normal|en")
        .get()
    ).docs.map((d) => d.data() as import("../src/lib/prices/types").CardPriceSnapshot),
  });
  console.log("\nREX #18 price history points:", rex18History.series[0]?.points.length ?? 0);
  if (rex18History.series[0]?.points[0]) {
    console.log("  sample:", rex18History.series[0].points[0]);
  }

  const rawDir = resolve(__dirname, "../../data/pricecharting/raw");
  console.log("\nRaw archive dir:", rawDir);
  try {
    const files = readFileSync(resolve(rawDir, "pricecharting-api-bootstrap-2026-07-05.csv"), "utf8");
    console.log("  pricecharting-api-bootstrap-2026-07-05.csv lines:", files.split("\n").length);
  } catch {
    console.log("  (no archived csv found)");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

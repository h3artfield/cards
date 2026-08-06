/**
 * One-off: Charizard V SWSH260 in price warehouse + sample order card fields.
 * Run: npx tsx scripts/lookup-charizard-warehouse.ts
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

  const productsCount = (
    await db.collection(COLLECTIONS.pricechartingProductsCurrent).count().get()
  ).data().count;
  const snapshotsCount = (
    await db.collection(COLLECTIONS.cardPriceSnapshots).count().get()
  ).data().count;
  console.log("Warehouse counts:", { productsCount, snapshotsCount });

  const runsSnap = await db
    .collection(COLLECTIONS.pricechartingImportRuns)
    .orderBy("startedAt", "desc")
    .limit(2)
    .get();
  for (const doc of runsSnap.docs) {
    const r = doc.data();
    console.log(
      "Import:",
      r.capturedDate,
      r.fileName,
      r.status,
      "written=",
      r.productsWritten ?? r.snapshotsWritten,
    );
  }

  const nameSnap = await db
    .collection(COLLECTIONS.pricechartingProductsCurrent)
    .where("productName", ">=", "Charizard V")
    .where("productName", "<=", "Charizard V\uf8ff")
    .limit(40)
    .get();

  console.log("\nCharizard V products (SWSH / promo filter):");
  for (const d of nameSnap.docs) {
    const p = d.data();
    const blob = JSON.stringify(p).toLowerCase();
    if (
      !blob.includes("swsh260") &&
      !blob.includes("black star") &&
      !blob.includes("swsh black")
    ) {
      continue;
    }
    console.log({
      id: p.priceChartingProductId,
      productName: p.productName,
      loosePrice: p.loosePrice,
      identityKey: p.identityKey,
      collectorNumber: p.collectorNumber,
      setName: p.setName,
    });
  }

  const identityKeys = [
    "pokemon|swshp|260|nonfoil|en",
    "pokemon|swsh-black-star-promos|260|nonfoil|en",
    "pokemon|swsh260|260|nonfoil|en",
  ];
  for (const key of identityKeys) {
    const snap = await db
      .collection(COLLECTIONS.cardPriceSnapshots)
      .where("identityKey", "==", key)
      .limit(5)
      .get();
    if (!snap.size) continue;
    console.log("\nSnapshots for", key);
    const rows = snap.docs
      .map((d) => d.data())
      .sort((a, b) => String(b.capturedDate).localeCompare(String(a.capturedDate)));
    for (const s of rows.slice(0, 3)) {
      console.log({
        date: s.capturedDate,
        rawUngraded: s.rawUngraded,
        productName: s.productName,
      });
    }
  }

  const ordersSnap = await db
    .collection(COLLECTIONS.orders)
    .orderBy("updatedAt", "desc")
    .limit(8)
    .get();
  console.log("\nRecent orders with Charizard V card fields:");
  for (const orderDoc of ordersSnap.docs) {
    const cardsSnap = await orderDoc.ref.collection("cards").get();
    for (const cardDoc of cardsSnap.docs) {
      const c = cardDoc.data();
      const name = String(c.detectedName ?? c.name ?? "").toLowerCase();
      if (!name.includes("charizard")) continue;
      console.log({
        orderId: orderDoc.id,
        cardId: cardDoc.id,
        name: c.detectedName ?? c.name,
        setName: c.setName,
        cardNumber: c.cardNumber,
        marketPrice: c.marketPrice,
        cashOffer: c.cashOffer,
        status: c.status,
        staffDecision: c.staffDecision,
        v2PreviewMarket:
          c.cardFlowV2OfferPreview?.previewMarketValue ??
          c.cardFlowV2OfferPreview?.marketDecision?.marketValue,
        v2PreviewCash: c.cardFlowV2OfferPreview?.previewCashOffer,
        staffConfirmed: Boolean(c.cardFlowV2Identity?.staffSelection?.suspectId),
        buybackRec: c.resaleAnalysis?.recommendation,
      });
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * Inspect order card pricing. Run: npx tsx scripts/inspect-order-pricing.ts BB-000016
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { COLLECTIONS } from "../src/lib/firebase/collections";
import { requireFirestore } from "../src/lib/firebase/admin";
import type { BuybackOrder, ScannedCard } from "../src/lib/types";

function loadEnvLocal() {
  const p = resolve(__dirname, "../.env.local");
  if (!readFileSync(p, "utf8")) return;
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const k = t.slice(0, eq).trim();
    if (process.env[k] == null) process.env[k] = t.slice(eq + 1).trim();
  }
}

async function main() {
  const orderNumber = process.argv[2];
  if (!orderNumber) {
    console.error("Usage: npx tsx scripts/inspect-order-pricing.ts BB-000016");
    process.exit(1);
  }
  loadEnvLocal();
  process.env.REQUIRE_FIRESTORE = "true";
  const db = requireFirestore();
  const snap = await db
    .collection(COLLECTIONS.orders)
    .where("orderNumber", "==", orderNumber)
    .limit(1)
    .get();
  if (snap.empty) {
    console.log("Order not found");
    process.exit(1);
  }
  const doc = snap.docs[0]!;
  const order = { id: doc.id, ...doc.data() } as BuybackOrder;
  console.log("ORDER", {
    id: order.id,
    status: order.status,
    totalMarketEstimate: order.totalMarketEstimate,
    totalCashOffer: order.totalCashOffer,
    totalTradeOffer: order.totalTradeOffer,
  });
  const cardsSnap = await db
    .collection(COLLECTIONS.cards)
    .where("orderId", "==", order.id)
    .get();
  for (const d of cardsSnap.docs) {
    const c = { id: d.id, ...d.data() } as ScannedCard;
    const p = c.cardFlowV2OfferPreview;
    console.log("CARD", {
      id: c.id.slice(0, 8),
      name: c.detectedName ?? (c.visionJson as { cardName?: string })?.cardName,
      status: c.status,
      staffDecision: c.staffDecision,
      marketPrice: c.marketPrice,
      cashOffer: c.cashOffer,
      tradeOffer: c.tradeOffer,
      pricingSource: (c.pricingJson as { source?: string })?.source,
      ruleMatches: c.ruleMatches,
      v2PreviewMarket: p?.previewMarketValue,
      v2PreviewCash: p?.previewCashOffer,
      v2PreviewTrade: p?.previewTradeOffer,
      v2Action: p?.recommendedAction,
      identityLocked: Boolean(c.cardFlowV2Identity?.staffSelection?.suspectId),
    });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

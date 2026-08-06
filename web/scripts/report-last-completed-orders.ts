/**
 * Summarize last N completed orders for processing report.
 * Run: npx tsx scripts/report-last-completed-orders.ts 5
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { COLLECTIONS } from "../src/lib/firebase/collections";
import { requireFirestore } from "../src/lib/firebase/admin";
import type { BuybackOrder, ScannedCard } from "../src/lib/types";

function loadEnvLocal() {
  const p = resolve(__dirname, "../.env.local");
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim();
    if (process.env[k] == null) process.env[k] = v;
  }
}

function isCompleted(order: BuybackOrder): boolean {
  return ["under_review", "offer_ready", "accepted", "paid"].includes(order.status);
}

function cardLabel(c: ScannedCard): string {
  return c.detectedName ?? (c.visionJson as { cardName?: string })?.cardName ?? c.id.slice(0, 8);
}

async function main() {
  loadEnvLocal();
  const limit = parseInt(process.argv[2] ?? "5", 10);
  const db = requireFirestore();

  const ordersSnap = await db.collection(COLLECTIONS.orders).get();
  const orders = ordersSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as Omit<BuybackOrder, "id">) }))
    .filter(isCompleted)
    .sort((a, b) => {
      const ta = new Date(a.reviewedAt ?? a.submittedAt ?? a.createdAt).getTime();
      const tb = new Date(b.reviewedAt ?? b.submittedAt ?? b.createdAt).getTime();
      return tb - ta;
    })
    .slice(0, limit);

  console.log(JSON.stringify({ note: "No per-phase timing stored in Firestore today", orders: [] }, null, 2));

  for (const order of orders) {
    const cardsSnap = await db
      .collection(COLLECTIONS.cards)
      .where("orderId", "==", order.id)
      .get();
    const cards = cardsSnap.docs.map(
      (d) => ({ id: d.id, ...d.data() }) as ScannedCard,
    );

    const summary = {
      orderNumber: order.orderNumber,
      status: order.status,
      submittedAt: order.submittedAt,
      reviewedAt: order.reviewedAt,
      cardCount: cards.length,
      v2InfluenceCount: cards.filter(
        (c) =>
          (c.pricingJson as { source?: string })?.source === "v2_offer_influence",
      ).length,
      hasResaleAnalysis: cards.filter((c) => c.resaleAnalysis).length,
      hasV2Market: cards.filter((c) => c.cardFlowV2Market).length,
      hasV2Preview: cards.filter((c) => c.cardFlowV2OfferPreview).length,
      cards: cards.map((c) => ({
        name: cardLabel(c),
        status: c.status,
        marketPrice: c.marketPrice,
        pricingSource: (c.pricingJson as { source?: string })?.source,
        v2PreviewEligible: c.cardFlowV2OfferPreview?.eligible,
        v2InfluenceApplied:
          (c.pricingJson as { source?: string })?.source === "v2_offer_influence",
        hasResaleAnalysis: Boolean(c.resaleAnalysis),
        hasIdentityVerification: Boolean(c.identityVerification),
        hasConditionReport: Boolean(c.conditionReport),
        hasSalesComps: Boolean(c.salesComps),
      })),
    };
    console.log(JSON.stringify(summary, null, 2));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

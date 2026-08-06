/**
 * Cancel an order by order number.
 * Run: npx tsx scripts/cancel-order.ts BB-000013
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { COLLECTIONS } from "../src/lib/firebase/collections";
import { requireFirestore } from "../src/lib/firebase/admin";
import { cancelBuybackSale } from "../src/lib/processing/complete-buyback";
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

async function main() {
  const orderNumber = process.argv[2];
  if (!orderNumber) {
    console.error("Usage: npx tsx scripts/cancel-order.ts BB-000013");
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
    console.error(`Order ${orderNumber} not found`);
    process.exit(1);
  }

  const doc = snap.docs[0]!;
  const orderId = doc.id;
  const order = { id: orderId, ...doc.data() } as BuybackOrder;

  const cardsSnap = await db
    .collection(COLLECTIONS.cards)
    .where("orderId", "==", orderId)
    .get();
  const cards = cardsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) as ScannedCard[];

  console.log("Before:", {
    id: orderId,
    orderNumber: order.orderNumber,
    status: order.status,
    submittedAt: order.submittedAt,
    cardCount: cards.length,
    cardStatuses: cards.map((c) => ({
      name: c.detectedName ?? (c.visionJson as { cardName?: string })?.cardName,
      status: c.status,
    })),
  });

  if (order.status === "cancelled") {
    console.log("Already cancelled.");
    return;
  }

  const storeId = order.storeId?.trim() || "default";
  const result = await cancelBuybackSale(order, storeId);
  console.log("Cancelled:", {
    orderNumber: result.order.orderNumber,
    status: result.order.status,
    completedAt: result.order.completedAt,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Directive 008 — stuck order diagnostics + cleanup snapshot.
 * Run: npx tsx scripts/directive-008-stuck-diagnostics.ts [--cleanup]
 */
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { COLLECTIONS } from "../src/lib/firebase/collections";
import { requireFirestore } from "../src/lib/firebase/admin";
import { cancelBuybackSale } from "../src/lib/processing/complete-buyback";
import { DEFAULT_STORE_ID } from "../src/lib/firebase/collections";
import type { BuybackOrder, ScannedCard } from "../src/lib/types";

function loadEnvLocal() {
  const p = resolve(__dirname, "../.env.local");
  if (!existsSync(p)) return;
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

const STUCK_STATUSES = new Set(["processing", "submitted"]);

async function main() {
  loadEnvLocal();
  process.env.REQUIRE_FIRESTORE = "true";
  const cleanup = process.argv.includes("--cleanup");

  const db = requireFirestore();
  const snap = await db.collection(COLLECTIONS.orders).get();
  const orders = snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as BuybackOrder)
    .sort(
      (a, b) =>
        Date.parse(b.createdAt ?? "") - Date.parse(a.createdAt ?? ""),
    );

  const stuck: Array<{
    order: BuybackOrder;
    cards: ScannedCard[];
    processedCount: number;
  }> = [];

  for (const order of orders) {
    if (!STUCK_STATUSES.has(order.status)) continue;
    const cardsSnap = await db
      .collection(COLLECTIONS.cards)
      .where("orderId", "==", order.id)
      .get();
    const cards = cardsSnap.docs.map(
      (d) => ({ id: d.id, ...d.data() }) as ScannedCard,
    );
    const processedCount = cards.filter(
      (c) =>
        c.status === "processed" ||
        c.status === "manual_review" ||
        c.status === "do_not_buy" ||
        c.status === "approved" ||
        c.status === "rejected",
    ).length;
    stuck.push({ order, cards, processedCount });
  }

  const latest = orders.find((o) => STUCK_STATUSES.has(o.status));
  const focus =
    stuck.find((s) => s.cards.length === 3 && s.processedCount === 0) ??
    stuck[0];

  if (focus) {
    const { order, cards, processedCount } = focus;
    console.log("\n=== FOCUS ORDER (diagnostics) ===");
    console.log(
      JSON.stringify(
        {
          orderId: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
          processingJobId: order.processingJobId ?? null,
          processingAttemptId: order.processingAttemptId ?? null,
          processingStartedAt: order.processingStartedAt ?? null,
          processingHeartbeatAt: order.processingHeartbeatAt ?? null,
          lastCompletedStep: order.lastCompletedStep ?? null,
          orderProcessingTimings: order.orderProcessingTimings ?? null,
          submittedAt: order.submittedAt ?? null,
          createdAt: order.createdAt,
          cardCount: cards.length,
          cardsProcessedCount: processedCount,
          cards: cards.map((c) => ({
            id: c.id,
            status: c.status,
            lastCompletedStep: c.lastCompletedStep ?? null,
            processingAttemptId: c.processingAttemptId ?? null,
            processingTimings: c.processingTimings ?? null,
          })),
        },
        null,
        2,
      ),
    );
  }

  console.log("\n=== ALL STUCK ORDERS (processing/submitted) ===");
  console.log(
    JSON.stringify(
      stuck.map(({ order, cards, processedCount }) => ({
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        createdAt: order.createdAt,
        submittedAt: order.submittedAt ?? null,
        processingJobId: order.processingJobId ?? null,
        processingAttemptId: order.processingAttemptId ?? null,
        processingStartedAt: order.processingStartedAt ?? null,
        processingHeartbeatAt: order.processingHeartbeatAt ?? null,
        cardCount: cards.length,
        cardsProcessedCount: processedCount,
        cardStatuses: cards.map((c) => c.status),
      })),
      null,
      2,
    ),
  );

  if (cleanup) {
    console.log("\n=== CLEANUP ===");
    const cancelled: string[] = [];
    for (const { order } of stuck) {
      if (order.status === "cancelled") continue;
      const storeId = order.storeId?.trim() || DEFAULT_STORE_ID;
      const result = await cancelBuybackSale(order, storeId);
      cancelled.push(result.order.orderNumber ?? order.id);
      console.log(`Cancelled: ${result.order.orderNumber}`);
    }
    console.log(JSON.stringify({ cancelledCount: cancelled.length, cancelled }));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

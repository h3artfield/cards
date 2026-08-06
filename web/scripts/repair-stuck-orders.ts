/**
 * Directive 008 — re-enqueue stuck processing orders.
 * Run: npx tsx scripts/repair-stuck-orders.ts [--dry-run]
 */
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { COLLECTIONS } from "../src/lib/firebase/collections";
import { requireFirestore } from "../src/lib/firebase/admin";
import { getStuckOrderThresholdMs } from "../src/lib/processing/processing-config";
import {
  invokeOrderProcessingJob,
  newProcessingAttemptId,
} from "../src/lib/processing/invoke-order-processing-job";
import { repairStuckProcessingOrder } from "../src/lib/processing/repair-stuck-order";
import { dataStore } from "../src/lib/storage/data-store";
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

async function main() {
  loadEnvLocal();
  process.env.REQUIRE_FIRESTORE = "true";
  const dryRun = process.argv.includes("--dry-run");
  const threshold = getStuckOrderThresholdMs();
  const now = Date.now();

  const db = requireFirestore();
  const snap = await db.collection(COLLECTIONS.orders).get();
  let requeued = 0;
  let repaired = 0;

  for (const doc of snap.docs) {
    const order = { id: doc.id, ...doc.data() } as BuybackOrder;
    if (order.status !== "processing" && order.status !== "submitted") continue;

    const cardsSnap = await db
      .collection(COLLECTIONS.cards)
      .where("orderId", "==", order.id)
      .get();
    const cards = cardsSnap.docs.map(
      (d) => ({ id: d.id, ...d.data() }) as ScannedCard,
    );

    const repairedOrder = await repairStuckProcessingOrder(
      order,
      cards,
      (o) => dataStore.saveOrder(o),
    );
    if (repairedOrder.status !== order.status) {
      repaired++;
      console.log(`Repaired finalized: ${order.orderNumber}`);
      continue;
    }

    const heartbeat = order.processingHeartbeatAt ?? order.processingStartedAt ?? order.submittedAt;
    const age = heartbeat ? now - Date.parse(heartbeat) : threshold + 1;
    if (age < threshold) continue;

    const attemptId = newProcessingAttemptId();
    console.log(`Stuck: ${order.orderNumber} (${Math.round(age / 1000)}s)`);
    if (!dryRun) {
      await dataStore.saveOrder({
        ...order,
        processingAttemptId: attemptId,
        lastCompletedStep: "stuck_repair_requeued",
      });
      await invokeOrderProcessingJob({ orderId: order.id, attemptId });
      requeued++;
    }
  }

  console.log(JSON.stringify({ dryRun, repaired, requeued, thresholdMs: threshold }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

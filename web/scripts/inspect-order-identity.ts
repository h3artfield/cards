/**
 * Inspect V2 identity bundles. Run: npx tsx scripts/inspect-order-identity.ts BB-000017
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { COLLECTIONS } from "../src/lib/firebase/collections";
import { requireFirestore } from "../src/lib/firebase/admin";
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
    if (process.env[k] == null) process.env[k] = t.slice(eq + 1).trim();
  }
}

async function main() {
  const orderNumber = process.argv[2];
  if (!orderNumber) {
    console.error("Usage: npx tsx scripts/inspect-order-identity.ts BB-000017");
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
    lastCompletedStep: order.lastCompletedStep,
    timings: order.orderProcessingTimings,
  });
  const cardsSnap = await db
    .collection(COLLECTIONS.cards)
    .where("orderId", "==", order.id)
    .get();
  for (const d of cardsSnap.docs) {
    const c = { id: d.id, ...d.data() } as ScannedCard;
    const id = c.cardFlowV2Identity;
    const ev = c.cardFlowV2Evidence;
    console.log("\nCARD", c.detectedName, c.cardNumber);
    console.log("  status", c.status, "step", c.lastCompletedStep);
    console.log("  timings", c.processingTimings);
    console.log("  evidence", ev ? "yes" : "no", ev?.categoryClassification?.category);
    console.log("  identity suspects", id?.suspects?.length ?? 0);
    console.log("  locked", id?.lockedIdentity);
    console.log("  staffSelection", id?.staffSelection);
    if (id?.suspects?.length) {
      for (const s of id.suspects.slice(0, 5)) {
        console.log("   -", s.suspectId, s.label, s.setName, s.collectorNumber);
      }
    }
    console.log("  identity notes", id?.candidateGenerationNotes?.slice(0, 3));
    console.log("  card warnings", c.warnings?.slice(0, 3));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/** Dump V2 evidence + identity for debugging. */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { COLLECTIONS } from "../src/lib/firebase/collections";
import { requireFirestore } from "../src/lib/firebase/admin";

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
  const orderNumber = process.argv[2] ?? "BB-000023";
  loadEnvLocal();
  process.env.REQUIRE_FIRESTORE = "true";
  const db = requireFirestore();
  const snap = await db
    .collection(COLLECTIONS.orders)
    .where("orderNumber", "==", orderNumber)
    .limit(1)
    .get();
  if (snap.empty) throw new Error("Order not found");
  const orderId = snap.docs[0]!.id;
  const cardsSnap = await db
    .collection(COLLECTIONS.cards)
    .where("orderId", "==", orderId)
    .get();
  for (const d of cardsSnap.docs) {
    const c = d.data();
    console.log("detectedName", c.detectedName, "setName", c.setName, "cardNumber", c.cardNumber);
    console.log("evidence slots:");
    for (const s of c.cardFlowV2Evidence?.imageEvidence?.evidenceSlots ?? []) {
      console.log(" ", s.field, s.value, s.status, s.confidence);
    }
    console.log("identity notes", c.cardFlowV2Identity?.candidateGenerationNotes);
    console.log("list inspection", c.cardFlowV2Identity?.mtgListMarkInspection);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

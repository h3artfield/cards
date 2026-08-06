import { readFileSync } from "fs";
import { resolve } from "path";
import { dataStore } from "../src/lib/storage/data-store";
import { processOrderCards } from "../src/lib/processing/process-order";
import { DEFAULT_STORE_ID } from "../src/lib/firebase/collections";

function loadEnvLocal() {
  const p = resolve(__dirname, "../.env.local");
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (process.env[key] == null) {
      process.env[key] = trimmed.slice(eq + 1).trim();
    }
  }
}

async function main() {
  loadEnvLocal();
  process.env.CARD_FLOW_V2_EVIDENCE_ENABLED = "true";
  process.env.CARD_FLOW_V2_IDENTITY_ENABLED = "true";
  process.env.CARD_FLOW_V2_MARKET_ENABLED = "true";
  process.env.CARD_FLOW_V2_AUDIT_ENABLED = "true";

  const orderId = process.argv[2];
  if (!orderId) {
    console.error("Usage: npx tsx scripts/reprocess-order-v2.ts <orderId>");
    process.exit(1);
  }

  const order = await dataStore.getOrder(orderId);
  if (!order) throw new Error(`Order not found: ${orderId}`);

  const storeId = order.storeId?.trim() || DEFAULT_STORE_ID;
  const [settings, rules] = await Promise.all([
    dataStore.getSettings(storeId),
    dataStore.getActiveRules(storeId),
  ]);

  const cards = (await dataStore.getCardsByOrder(orderId)).map((c) => ({
    ...c,
    staffDecision: undefined,
    status: "processing" as const,
  }));

  console.log(`Reprocessing ${cards.length} cards on ${order.orderNumber} (${orderId})…`);

  const { cards: processed, orderTotals } = await processOrderCards(
    cards,
    settings,
    rules,
  );

  for (const card of processed) {
    await dataStore.saveCard(card);
    const v2 =
      card.cardFlowV2Audit?.riskLevel ??
      (card.cardFlowV2Market ? "partial" : "none");
    console.log(
      `  ${card.id.slice(0, 8)}… ${card.detectedName ?? "?"} — audit: ${v2}, market: $${card.marketPrice?.toFixed(2) ?? "?"}`,
    );
  }

  await dataStore.saveOrder({ ...order, ...orderTotals });
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

import { readFileSync } from "fs";
import { resolve } from "path";
import { dataStore } from "../src/lib/storage/data-store";

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
  const orders = await dataStore.getOrders();
  const order = orders.find((o) => o.orderNumber === "BB-000005");
  if (!order) {
    console.log(JSON.stringify({ found: false, orderNumbers: orders.map((o) => o.orderNumber) }));
    return;
  }

  const cards = await dataStore.getCardsByOrder(order.id);
  console.log(
    JSON.stringify(
      {
        found: true,
        order: {
          id: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
          storeId: order.storeId,
          createdAt: order.createdAt,
          submittedAt: order.submittedAt,
        },
        cardCount: cards.length,
        cards: cards.map((c) => ({
          id: c.id,
          name: c.detectedName,
          status: c.status,
          marketPrice: c.marketPrice,
          hasV2Evidence: Boolean(c.cardFlowV2Evidence),
          hasV2Identity: Boolean(c.cardFlowV2Identity),
          hasV2Market: Boolean(c.cardFlowV2Market),
          hasV2Audit: Boolean(c.cardFlowV2Audit),
          v2Locked: c.cardFlowV2Identity?.lockedIdentity?.locked,
          auditRisk: c.cardFlowV2Audit?.riskLevel,
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

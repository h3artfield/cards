/**
 * Seed Morgan + CJ Stroud live regression cards to Firestore.
 * Run: npm run card-flow-v2:seed-regression-cards
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { v4 as uuidv4 } from "uuid";
import { dataStore } from "../src/lib/storage/data-store";
import {
  LIVE_REGRESSION_ORDER_NUMBER,
  LIVE_REGRESSION_CARD_IDS,
  buildMorganRegressionCard,
  buildCjStroudRegressionCard,
} from "../src/lib/card-flow-v2/regression/live-audit-fixtures";
import { DEFAULT_STORE_ID } from "../src/lib/firebase/collections";

function loadEnvLocal() {
  const p = resolve(__dirname, "../.env.local");
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const k = t.slice(0, eq).trim();
    if (process.env[k] == null) process.env[k] = t.slice(eq + 1).trim();
  }
}

async function ensureRegressionOrder(storeId: string): Promise<string> {
  const orders = await dataStore.getOrders();
  const existing = orders.find((o) => o.orderNumber === LIVE_REGRESSION_ORDER_NUMBER);
  if (existing) return existing.id;

  const order = {
    id: uuidv4(),
    orderNumber: LIVE_REGRESSION_ORDER_NUMBER,
    storeId,
    customerId: "regression-internal",
    status: "under_review" as const,
    createdAt: new Date().toISOString(),
    customerName: "V2 Regression",
    customerEmail: "regression@internal.local",
  };
  await dataStore.saveOrder(order);
  console.log(`Created order ${LIVE_REGRESSION_ORDER_NUMBER} (${order.id})`);
  return order.id;
}

async function main() {
  loadEnvLocal();
  const storeId = DEFAULT_STORE_ID;
  const orderId = await ensureRegressionOrder(storeId);

  const fixtures = [buildMorganRegressionCard(), buildCjStroudRegressionCard()];
  for (const fixture of fixtures) {
    const toSave = { ...fixture, orderId };
    await dataStore.saveCard(toSave);
    const preview = toSave.cardFlowV2OfferPreview;
    console.log(
      `Saved ${fixture.detectedName} (${fixture.id}) — preview eligible: ${preview?.eligible}, blockers: ${preview?.marketDecision.blockers.join(", ") || "none"}`,
    );
  }

  console.log("\nLive regression card IDs:");
  for (const id of LIVE_REGRESSION_CARD_IDS) console.log(`  ${id}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

import { readFileSync } from "fs";
import { resolve } from "path";
import { dataStore } from "../src/lib/storage/data-store";

function loadEnvLocal() {
  try {
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
  } catch {
    /* optional */
  }
}

async function main() {
  loadEnvLocal();
  const orders = await dataStore.getOrders();
  let totalCards = 0;
  let withV2 = 0;
  let withPrice = 0;

  for (const order of orders) {
    const cards = await dataStore.getCardsByOrder(order.id);
    totalCards += cards.length;
    for (const card of cards) {
      if (
        card.cardFlowV2Evidence ||
        card.cardFlowV2Identity ||
        card.cardFlowV2Market
      ) {
        withV2++;
      }
      if (card.marketPrice != null && card.marketPrice > 0) withPrice++;
    }
  }

  console.log(
    JSON.stringify(
      {
        orders: orders.length,
        totalCards,
        withV2,
        withMarketPrice: withPrice,
        orderCardCounts: await Promise.all(
          orders
            .sort(
              (a, b) =>
                new Date(b.createdAt).getTime() -
                new Date(a.createdAt).getTime(),
            )
            .slice(0, 8)
            .map(async (o) => ({
              id: o.id,
              orderNumber: o.orderNumber,
              status: o.status,
              cardCount: (await dataStore.getCardsByOrder(o.id)).length,
            })),
        ),
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

import { readFileSync } from "fs";
import { resolve } from "path";
import { dataStore } from "../src/lib/storage/data-store";
import { repairStuckProcessingOrder } from "../src/lib/processing/repair-stuck-order";

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
  const target = process.argv[2] ?? "BB-000005";
  const orders = await dataStore.getOrders();
  const matches = orders.filter((o) =>
    target.length > 10 ? o.id === target : o.orderNumber === target,
  );

  for (const order of matches) {
    const cards = await dataStore.getCardsByOrder(order.id);
    const repaired = await repairStuckProcessingOrder(order, cards, (o) =>
      dataStore.saveOrder(o),
    );
    console.log(
      `${order.orderNumber}: ${order.status} → ${repaired.status} (${cards.length} cards)`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

#!/usr/bin/env node
/** Smoke test: Firestore health + customer → order → card flow. */
const base = process.env.APP_URL ?? "http://localhost:3000";

async function main() {
  console.log(`Checking ${base}/api/health/firestore ...`);
  const healthRes = await fetch(`${base}/api/health/firestore`);
  const health = await healthRes.json();
  console.log(JSON.stringify(health, null, 2));

  if (health.storageMode !== "firestore") {
    console.error("\nFirestore is not active. Fix FIREBASE_SERVICE_ACCOUNT_KEY in web/.env.local and restart npm run dev.");
    process.exit(1);
  }

  console.log("\nCreating test customer...");
  const customerRes = await fetch(`${base}/api/customers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      firstName: "Test",
      lastName: "User",
      email: `test-${Date.now()}@example.com`,
      phone: "555-0100",
    }),
  });
  const { customer } = await customerRes.json();
  if (!customer?.id) throw new Error("Customer create failed");
  console.log("Customer:", customer.id);

  console.log("Creating order...");
  const orderRes = await fetch(`${base}/api/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ customerId: customer.id }),
  });
  const { order } = await orderRes.json();
  if (!order?.id) throw new Error("Order create failed");
  console.log("Order:", order.orderNumber, order.id);

  console.log("Adding card...");
  const cardRes = await fetch(`${base}/api/cards`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      orderId: order.id,
      itemType: "raw",
      frontImageUrl: "data:image/jpeg;base64,/9j/4AAQ",
      backImageUrl: "data:image/jpeg;base64,/9j/4AAQ",
    }),
  });
  const { card } = await cardRes.json();
  if (!card?.id) throw new Error("Card create failed");
  console.log("Card:", card.id);

  console.log("\nDone. Check Firestore collections: customers, orders, cards");
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});

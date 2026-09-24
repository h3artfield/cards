#!/usr/bin/env node
/** Smoke test: Firestore health + customer → order → card flow. */
const base = process.env.APP_URL ?? "http://localhost:3000";
const storeSlug = process.env.STORE_SLUG ?? "the-game-lodge";

/** Customer endpoints require a signed-in session cookie. */
let sessionCookie = null;

function captureSession(res) {
  const header = res.headers.get("set-cookie");
  if (header) sessionCookie = header.split(";")[0];
}

async function post(path, body) {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(sessionCookie ? { Cookie: sessionCookie } : {}),
    },
    body: JSON.stringify(body),
  });
  captureSession(res);

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      `POST ${path} failed (${res.status}): ${data.error ?? "unknown error"}`,
    );
  }
  return data;
}

async function main() {
  console.log(`Checking ${base}/api/health/firestore ...`);
  const healthRes = await fetch(`${base}/api/health/firestore`);
  const health = await healthRes.json();
  console.log(JSON.stringify(health, null, 2));

  if (health.storageMode !== "firestore") {
    console.error("\nFirestore is not active. Fix FIREBASE_SERVICE_ACCOUNT_KEY in web/.env.local and restart npm run dev.");
    process.exit(1);
  }

  console.log(`\nCreating test customer at store "${storeSlug}"...`);
  const signup = await post("/api/customers", {
    firstName: "Test",
    lastName: "User",
    email: `test-${Date.now()}@example.com`,
    phone: "555-0100",
    password: "smoke-test-password",
    storeSlug,
  });
  if (!signup.customer?.id) throw new Error("Customer create failed");
  console.log("Customer:", signup.customer.id);

  if (signup.requiresVerification || !sessionCookie) {
    console.error(
      "\nSignup did not return a session (email verification is enabled).",
    );
    console.error(
      "Set CUSTOMER_EMAIL_VERIFICATION off for this store, or run this smoke test against a store that does not require verification.",
    );
    process.exit(1);
  }

  console.log("\nCreating order...");
  const { order } = await post("/api/orders", { storeSlug });
  if (!order?.id) throw new Error("Order create failed");
  console.log("Order:", order.orderNumber, order.id);

  console.log("\nAdding card...");
  const { card } = await post("/api/cards", {
    orderId: order.id,
    itemType: "raw",
    frontImageUrl: "data:image/jpeg;base64,/9j/4AAQ",
    backImageUrl: "data:image/jpeg;base64,/9j/4AAQ",
  });
  if (!card?.id) throw new Error("Card create failed");
  console.log("Card:", card.id);

  console.log("\nDone. Check Firestore collections: customers, orders, cards");
}

main().catch((err) => {
  console.error(`\n${err.message}`);
  process.exit(1);
});

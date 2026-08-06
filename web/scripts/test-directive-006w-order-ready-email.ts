/**
 * Directive 006W — customer email when order is ready for review.
 * Run: npm run test:directive-006w-order-ready-email
 */
import {
  buildReadyForReviewEmailHtml,
  getReadyForReviewEmailStartAt,
  handleOrderReadyForReviewTransition,
  isOrderEligibleForReadyEmail,
  isReadyForReviewCustomerEmailEnabled,
  orderReadyEmailStatusLabel,
  sendReadyForReviewEmailViaResend,
  shouldTransitionTriggerReadyEmail,
} from "../src/lib/processing/order-ready-customer-email";
import type { BuybackOrder, Customer } from "../src/lib/types";

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

const baseOrder = (): BuybackOrder => ({
  id: "ord-1",
  orderNumber: "BB-000123",
  customerId: "cust-1",
  storeId: "store-1",
  status: "processing",
  createdAt: "2026-07-06T12:00:00.000Z",
});

const customer = (): Customer => ({
  id: "cust-1",
  firstName: "Test",
  lastName: "User",
  email: "customer@example.com",
  phone: "555-0100",
  createdAt: "2026-07-06T12:00:00.000Z",
  updatedAt: "2026-07-06T12:00:00.000Z",
});

function saveEnv(keys: string[]) {
  const saved: Record<string, string | undefined> = {};
  for (const key of keys) {
    saved[key] = process.env[key];
  }
  return saved;
}

function restoreEnv(saved: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

async function runSendOnTransition() {
  console.log("\n1. Sends when status changes Building → Ready for review");
  const saved = saveEnv([
    "ORDER_READY_CUSTOMER_EMAIL_ENABLED",
    "ORDER_READY_CUSTOMER_EMAIL_START_AT",
    "RESEND_API_KEY",
  ]);
  process.env.ORDER_READY_CUSTOMER_EMAIL_ENABLED = "true";
  process.env.ORDER_READY_CUSTOMER_EMAIL_START_AT = "2026-07-05T00:00:00.000Z";
  process.env.RESEND_API_KEY = "re_test";

  let fetchCalls = 0;
  const fetchImpl = async () => {
    fetchCalls++;
    return new Response(JSON.stringify({ id: "msg-abc123" }), { status: 200 });
  };

  const order = { ...baseOrder(), status: "under_review" as const };
  const result = await handleOrderReadyForReviewTransition({
    previousStatus: "processing",
    order,
    customer: customer(),
    storeName: "The Game Lodge",
    cardCount: 3,
    fetchImpl: fetchImpl as typeof fetch,
  });

  assert(fetchCalls === 1, "Resend called once");
  assert(
    result.orderNotifications?.readyForReviewEmail?.status === "sent",
    "notification status is sent",
  );
  assert(
    result.orderNotifications?.readyForReviewEmail?.messageId === "msg-abc123",
    "stores messageId on success",
  );
  assert(
    result.orderNotifications?.readyForReviewEmail?.to === "customer@example.com",
    "stores recipient",
  );

  const html = buildReadyForReviewEmailHtml({
    orderNumber: "BB-000123",
    storeName: "The Game Lodge",
    cardCount: 3,
  });
  assert(html.includes("The Game Lodge"), "email mentions store name");
  assert(html.includes("BB-000123"), "email includes order number");
  assert(html.includes("store associate"), "email says see associate");
  assert(!html.includes("$"), "email does not include dollar amounts");

  restoreEnv(saved);
}

async function runMissingEmail() {
  console.log("\n2. Does not send if customer email missing");
  const saved = saveEnv([
    "ORDER_READY_CUSTOMER_EMAIL_ENABLED",
    "ORDER_READY_CUSTOMER_EMAIL_START_AT",
    "RESEND_API_KEY",
  ]);
  process.env.ORDER_READY_CUSTOMER_EMAIL_ENABLED = "true";
  process.env.ORDER_READY_CUSTOMER_EMAIL_START_AT = "2026-07-05T00:00:00.000Z";
  process.env.RESEND_API_KEY = "re_test";

  let fetchCalls = 0;
  const fetchImpl = async () => {
    fetchCalls++;
    return new Response(JSON.stringify({ id: "x" }), { status: 200 });
  };

  const order = { ...baseOrder(), status: "under_review" as const };
  const result = await handleOrderReadyForReviewTransition({
    previousStatus: "processing",
    order,
    customer: { ...customer(), email: "" },
    fetchImpl: fetchImpl as typeof fetch,
  });

  assert(fetchCalls === 0, "Resend not called without customer email");
  assert(
    result.orderNotifications?.readyForReviewEmail?.status === "skipped",
    "notification marked skipped",
  );
  assert(
    orderReadyEmailStatusLabel(result, false).includes("no customer email"),
    "UI label for skipped no email",
  );

  restoreEnv(saved);
}

async function runOldOrders() {
  console.log("\n3. Does not send for old orders before START_AT");
  const saved = saveEnv([
    "ORDER_READY_CUSTOMER_EMAIL_ENABLED",
    "ORDER_READY_CUSTOMER_EMAIL_START_AT",
    "RESEND_API_KEY",
  ]);
  process.env.ORDER_READY_CUSTOMER_EMAIL_ENABLED = "true";
  process.env.ORDER_READY_CUSTOMER_EMAIL_START_AT = "2026-07-05T00:00:00.000Z";
  process.env.RESEND_API_KEY = "re_test";

  const oldOrder = {
    ...baseOrder(),
    createdAt: "2026-06-01T00:00:00.000Z",
    status: "under_review" as const,
  };
  assert(!isOrderEligibleForReadyEmail(oldOrder), "old order not eligible");

  let fetchCalls = 0;
  const result = await handleOrderReadyForReviewTransition({
    previousStatus: "processing",
    order: oldOrder,
    customer: customer(),
    fetchImpl: (async () => {
      fetchCalls++;
      return new Response(JSON.stringify({ id: "x" }), { status: 200 });
    }) as typeof fetch,
  });

  assert(fetchCalls === 0, "no send for old order");
  assert(!result.orderNotifications?.readyForReviewEmail, "no notification recorded");

  restoreEnv(saved);
}

async function runNoDuplicate() {
  console.log("\n4. Does not send twice");
  const saved = saveEnv([
    "ORDER_READY_CUSTOMER_EMAIL_ENABLED",
    "ORDER_READY_CUSTOMER_EMAIL_START_AT",
    "RESEND_API_KEY",
  ]);
  process.env.ORDER_READY_CUSTOMER_EMAIL_ENABLED = "true";
  process.env.ORDER_READY_CUSTOMER_EMAIL_START_AT = "2026-07-05T00:00:00.000Z";
  process.env.RESEND_API_KEY = "re_test";

  let fetchCalls = 0;
  const fetchImpl = (async () => {
    fetchCalls++;
    return new Response(JSON.stringify({ id: "msg-dup" }), { status: 200 });
  }) as typeof fetch;

  const alreadySent: BuybackOrder = {
    ...baseOrder(),
    status: "under_review",
    orderNotifications: {
      readyForReviewEmail: {
        attemptedAt: "2026-07-06T12:01:00.000Z",
        sentAt: "2026-07-06T12:01:00.000Z",
        status: "sent",
        provider: "resend",
        to: "customer@example.com",
        messageId: "msg-first",
      },
    },
  };

  const result = await handleOrderReadyForReviewTransition({
    previousStatus: "processing",
    order: alreadySent,
    customer: customer(),
    fetchImpl,
  });

  assert(fetchCalls === 0, "no second send when already sent");
  assert(
    result.orderNotifications?.readyForReviewEmail?.messageId === "msg-first",
    "existing notification preserved",
  );

  restoreEnv(saved);
}

async function runFailureDoesNotThrow() {
  console.log("\n5. Does not block status transition if Resend fails");
  const saved = saveEnv([
    "ORDER_READY_CUSTOMER_EMAIL_ENABLED",
    "ORDER_READY_CUSTOMER_EMAIL_START_AT",
    "RESEND_API_KEY",
  ]);
  process.env.ORDER_READY_CUSTOMER_EMAIL_ENABLED = "true";
  process.env.ORDER_READY_CUSTOMER_EMAIL_START_AT = "2026-07-05T00:00:00.000Z";
  process.env.RESEND_API_KEY = "re_test";

  const fetchImpl = (async () =>
    new Response(JSON.stringify({ message: "rate limited" }), {
      status: 429,
    })) as typeof fetch;

  const order = { ...baseOrder(), status: "offer_ready" as const };
  let threw = false;
  let result: BuybackOrder = order;
  try {
    result = await handleOrderReadyForReviewTransition({
      previousStatus: "processing",
      order,
      customer: customer(),
      fetchImpl,
    });
  } catch {
    threw = true;
  }

  assert(!threw, "handler does not throw on Resend failure");
  assert(result.status === "offer_ready", "order status unchanged");
  assert(
    result.orderNotifications?.readyForReviewEmail?.status === "failed",
    "failure recorded on order",
  );

  restoreEnv(saved);
}

async function runSuccessStoresMessageId() {
  console.log("\n6. Stores messageId/status on success");
  const saved = saveEnv(["RESEND_API_KEY"]);
  process.env.RESEND_API_KEY = "re_test";

  const result = await sendReadyForReviewEmailViaResend({
    to: "a@b.com",
    subject: "test",
    html: "<p>hi</p>",
    fetchImpl: (async () =>
      new Response(JSON.stringify({ id: "resend-id-99" }), {
        status: 200,
      })) as typeof fetch,
  });

  assert(result.ok === true, "send succeeds");
  if (result.ok) assert(result.messageId === "resend-id-99", "messageId parsed");

  restoreEnv(saved);
}

async function runFailureStoresError() {
  console.log("\n7. Stores error/status on failure");
  const saved = saveEnv([
    "ORDER_READY_CUSTOMER_EMAIL_ENABLED",
    "ORDER_READY_CUSTOMER_EMAIL_START_AT",
    "RESEND_API_KEY",
  ]);
  process.env.ORDER_READY_CUSTOMER_EMAIL_ENABLED = "true";
  process.env.ORDER_READY_CUSTOMER_EMAIL_START_AT = "2026-07-05T00:00:00.000Z";
  process.env.RESEND_API_KEY = "re_test";

  const result = await handleOrderReadyForReviewTransition({
    previousStatus: "processing",
    order: { ...baseOrder(), status: "under_review" },
    customer: customer(),
    fetchImpl: (async () =>
      new Response(JSON.stringify({ message: "invalid api key" }), {
        status: 401,
      })) as typeof fetch,
  });

  assert(
    result.orderNotifications?.readyForReviewEmail?.status === "failed",
    "failed status stored",
  );
  assert(
    Boolean(result.orderNotifications?.readyForReviewEmail?.error),
    "error message stored",
  );
  assert(
    orderReadyEmailStatusLabel(result, true) === "Customer email: Failed",
    "UI shows failed",
  );

  restoreEnv(saved);
}

function runTransitionGuard() {
  console.log("\n8. Transition guard only fires Building → Ready for review");
  assert(
    shouldTransitionTriggerReadyEmail("processing", "under_review"),
    "processing → under_review triggers",
  );
  assert(
    !shouldTransitionTriggerReadyEmail("under_review", "offer_ready"),
    "under_review → offer_ready does not re-trigger",
  );
  assert(
    !shouldTransitionTriggerReadyEmail("processing", "processing"),
    "same phase does not trigger",
  );
}

function runFeatureFlag() {
  console.log("\n9. Feature flag and start-at parsing");
  const saved = saveEnv(["ORDER_READY_CUSTOMER_EMAIL_ENABLED"]);
  delete process.env.ORDER_READY_CUSTOMER_EMAIL_ENABLED;
  assert(!isReadyForReviewCustomerEmailEnabled(), "disabled by default env");
  process.env.ORDER_READY_CUSTOMER_EMAIL_ENABLED = "true";
  assert(isReadyForReviewCustomerEmailEnabled(), "enabled when true");
  process.env.ORDER_READY_CUSTOMER_EMAIL_START_AT = "2026-07-05T00:00:00.000Z";
  assert(
    getReadyForReviewEmailStartAt()?.toISOString() === "2026-07-05T00:00:00.000Z",
    "start-at parsed",
  );
  restoreEnv(saved);
}

async function main() {
  console.log("Directive 006W — order ready for review customer email\n");
  runTransitionGuard();
  runFeatureFlag();
  await runSendOnTransition();
  await runMissingEmail();
  await runOldOrders();
  await runNoDuplicate();
  await runFailureDoesNotThrow();
  await runSuccessStoresMessageId();
  await runFailureStoresError();

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

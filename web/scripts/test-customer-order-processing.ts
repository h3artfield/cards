/**
 * Order processing progress (card-based, admin UI).
 * Run: npm run test:customer-order-processing
 */
import {
  computeOrderProcessingProgress,
  countOrderCardsProcessed,
  formatOrderProcessingDetail,
  isOrderProcessingWorkerStuck,
  ORDER_PROCESSING_WORKER_STUCK_MESSAGE,
} from "../src/lib/order-processing-progress";
import type { BuybackOrder, ScannedCard } from "../src/lib/types";

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
  submittedAt: "2026-07-06T12:00:00.000Z",
});

function card(status: ScannedCard["status"]): ScannedCard {
  return {
    id: `c-${status}`,
    orderId: "ord-1",
    frontImageUrl: "",
    backImageUrl: "",
    status,
    itemType: "raw",
    createdAt: "2026-07-06T12:00:00.000Z",
  };
}

function runProgress() {
  console.log("\n1. Card-based progress");
  const order = baseOrder();
  const cards = [card("processed"), card("processing"), card("pending")];

  assert(countOrderCardsProcessed(cards) === 1, "counts finished cards only");
  assert(
    computeOrderProcessingProgress({ order, cards }) === 33,
    "progress from card completion",
  );
  assert(
    formatOrderProcessingDetail({ order, cards }) === "1 of 3 cards processed",
    "detail label",
  );

  const done = computeOrderProcessingProgress({
    order: { ...order, status: "under_review" },
    cards: [card("processed"), card("processed"), card("processed")],
  });
  assert(done === 100, "completed order is 100%");
}

function runWorkerStuck() {
  console.log("\n2. Worker stuck guard");
  const order = {
    ...baseOrder(),
    processingStartedAt: "2026-07-06T12:00:00.000Z",
    processingHeartbeatAt: "2026-07-06T12:00:00.000Z",
  };
  const now = Date.parse("2026-07-06T12:06:01.000Z");
  assert(
    isOrderProcessingWorkerStuck({
      order,
      cardsProcessedCount: 0,
      cardCount: 3,
      nowMs: now,
    }),
    "stuck after 6 min with 0 cards",
  );
  assert(
    !isOrderProcessingWorkerStuck({
      order,
      cardsProcessedCount: 1,
      cardCount: 3,
      nowMs: now,
    }),
    "not stuck when a card finished",
  );
  assert(
    ORDER_PROCESSING_WORKER_STUCK_MESSAGE.includes("stuck"),
    "stuck message present",
  );
}

function main() {
  console.log("Order processing progress\n");
  runProgress();
  runWorkerStuck();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();

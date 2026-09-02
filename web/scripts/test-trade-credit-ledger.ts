import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { BuybackOrder, BuybackTransaction } from "../src/lib/types";

const STORE_ID = "test-store";
const CUSTOMER_ID = "test-customer";

function order(id: string): BuybackOrder {
  return {
    id,
    orderNumber: `BB-${id}`,
    customerId: CUSTOMER_ID,
    storeId: STORE_ID,
    status: "paid",
    createdAt: new Date().toISOString(),
    manualReviewCount: 0,
  };
}

function transaction(
  id: string,
  orderId: string,
  type: "cash" | "trade",
  amount: number,
): BuybackTransaction {
  return {
    id,
    storeId: STORE_ID,
    orderId,
    orderNumber: `BB-${orderId}`,
    customerId: CUSTOMER_ID,
    type,
    amount,
    cardCount: 1,
    createdAt: new Date().toISOString(),
  };
}

async function main() {
  // The dev-file store writes to <cwd>/.data — run from a temp dir so local
  // dev data is untouched, and import only after the chdir.
  const tmp = await mkdtemp(path.join(os.tmpdir(), "trade-credit-"));
  process.chdir(tmp);

  const { getStorageMode, dataStore } = await import(
    "../src/lib/storage/data-store"
  );
  assert.equal(
    getStorageMode(),
    "memory",
    "this test requires the in-memory dev store (unset Firebase admin env vars)",
  );

  const {
    computeTradeCreditBalance,
    getTradeCreditBalance,
    issueTradeCreditForBuyback,
    reverseTradeCreditForOrder,
  } = await import("../src/lib/trade-credit/trade-credit-ledger");

  const now = new Date().toISOString();
  const pure = computeTradeCreditBalance(STORE_ID, CUSTOMER_ID, [
    {
      id: "a",
      storeId: STORE_ID,
      customerId: CUSTOMER_ID,
      type: "issued",
      amount: 100.005,
      createdAt: now,
    },
    {
      id: "b",
      storeId: STORE_ID,
      customerId: CUSTOMER_ID,
      type: "spent",
      amount: -40.1,
      createdAt: now,
    },
  ]);
  assert.equal(pure.balance, 59.91);
  assert.equal(pure.issued, 100.01);
  assert.equal(pure.spent, 40.1);
  assert.equal(pure.entryCount, 2);

  const cashOnly = await issueTradeCreditForBuyback({
    order: order("cash-1"),
    transaction: transaction("tx-cash-1", "cash-1", "cash", 25),
    storeId: STORE_ID,
  });
  assert.equal(cashOnly, null, "cash payouts must not create credit");

  const tradeOrder = order("trade-1");
  const tradeTx = transaction("tx-trade-1", "trade-1", "trade", 60.5);
  const issued = await issueTradeCreditForBuyback({
    order: tradeOrder,
    transaction: tradeTx,
    storeId: STORE_ID,
  });
  assert.ok(issued);
  assert.equal(issued!.amount, 60.5);
  assert.equal(issued!.type, "issued");

  // Completing the same transaction twice must not double-issue.
  await issueTradeCreditForBuyback({
    order: tradeOrder,
    transaction: tradeTx,
    storeId: STORE_ID,
  });
  let balance = await getTradeCreditBalance(STORE_ID, CUSTOMER_ID);
  assert.equal(balance.balance, 60.5);
  assert.equal(balance.entryCount, 1);

  await dataStore.saveTradeCreditEntry({
    id: "spend-1",
    storeId: STORE_ID,
    customerId: CUSTOMER_ID,
    type: "spent",
    amount: -20.5,
    ticketId: "ticket-1",
    createdAt: new Date().toISOString(),
  });
  balance = await getTradeCreditBalance(STORE_ID, CUSTOMER_ID);
  assert.equal(balance.balance, 40);
  assert.equal(balance.spent, 20.5);

  const reversals = await reverseTradeCreditForOrder({
    orderId: "trade-1",
    storeId: STORE_ID,
  });
  assert.equal(reversals.length, 1);
  assert.equal(reversals[0]!.amount, -60.5);

  // Reopening twice must not reverse twice.
  const again = await reverseTradeCreditForOrder({
    orderId: "trade-1",
    storeId: STORE_ID,
  });
  assert.equal(again.length, 0);

  // Credit already spent, then the order was reopened: the customer now owes.
  balance = await getTradeCreditBalance(STORE_ID, CUSTOMER_ID);
  assert.equal(balance.balance, -20.5);

  // Ledger is scoped per store and per customer.
  const otherStore = await getTradeCreditBalance("other-store", CUSTOMER_ID);
  assert.equal(otherStore.balance, 0);
  const otherCustomer = await getTradeCreditBalance(STORE_ID, "someone-else");
  assert.equal(otherCustomer.balance, 0);

  console.log("trade credit ledger: all assertions passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

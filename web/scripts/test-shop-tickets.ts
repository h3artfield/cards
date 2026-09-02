import assert from "node:assert/strict";
import { findTicketLineProblems } from "../src/lib/shop-tickets/complete-ticket";
import {
  computeTicketTotals,
  normalizeTicketLines,
  ticketSubtotal,
} from "../src/lib/shop-tickets/ticket-math";
import type { InventoryItem, ShopTicketLine } from "../src/lib/types";

function line(overrides: Partial<ShopTicketLine> = {}): ShopTicketLine {
  return {
    inventoryItemId: "item-1",
    displayName: "Lightning Bolt",
    quantity: 1,
    unitPrice: 10,
    ...overrides,
  };
}

function item(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: "item-1",
    storeId: "store-1",
    source: "tcgplayer_import",
    displayName: "Lightning Bolt",
    tcgplayerListingKey: "12345:Near Mint",
    quantity: 3,
    quantityOnHand: 3,
    quantityAvailable: 3,
    listPrice: 10,
    acquiredAt: "2026-01-01T00:00:00.000Z",
    status: "listed",
    ...overrides,
  };
}

function main() {
  assert.equal(ticketSubtotal([line({ quantity: 2 })]), 20);
  assert.equal(
    ticketSubtotal([line(), line({ inventoryItemId: "b", unitPrice: 3.33 })]),
    13.33,
  );

  // Credit is capped by both the balance and the ticket.
  assert.deepEqual(
    computeTicketTotals({
      lines: [line({ quantity: 2 })],
      creditRequested: 5,
      creditBalance: 50,
    }),
    { subtotal: 20, tradeCreditApplied: 5, cashDue: 15 },
  );
  assert.deepEqual(
    computeTicketTotals({
      lines: [line({ quantity: 2 })],
      creditRequested: 100,
      creditBalance: 12,
    }),
    { subtotal: 20, tradeCreditApplied: 12, cashDue: 8 },
    "cannot spend more credit than the account holds",
  );
  assert.deepEqual(
    computeTicketTotals({
      lines: [line()],
      creditRequested: 100,
      creditBalance: 500,
    }),
    { subtotal: 10, tradeCreditApplied: 10, cashDue: 0 },
    "leftover credit stays on the account instead of paying out cash",
  );
  assert.deepEqual(
    computeTicketTotals({
      lines: [line()],
      creditRequested: -5,
      creditBalance: 50,
    }),
    { subtotal: 10, tradeCreditApplied: 0, cashDue: 10 },
  );

  // Line normalization.
  const normalized = normalizeTicketLines([
    { inventoryItemId: "a", displayName: "A", quantity: 1, unitPrice: 2 },
    { inventoryItemId: "a", displayName: "A", quantity: 2, unitPrice: 2 },
    { inventoryItemId: "", displayName: "junk" },
    { inventoryItemId: "b", quantity: -3, unitPrice: -1 },
  ]);
  assert.equal(normalized.length, 2);
  assert.equal(normalized[0]!.quantity, 3, "repeated rows merge");
  assert.equal(normalized[1]!.quantity, 1, "negative quantity floors at one");
  assert.equal(normalized[1]!.unitPrice, 0);
  assert.equal(normalized[1]!.displayName, "Card");

  // Availability guards.
  const inventory = new Map([["item-1", item()]]);
  assert.deepEqual(
    findTicketLineProblems([line({ quantity: 3 })], inventory, "ticket-1"),
    [],
  );

  const short = findTicketLineProblems(
    [line({ quantity: 4 })],
    inventory,
    "ticket-1",
  );
  assert.equal(short[0]!.reason, "short_stock");
  assert.equal(short[0]!.available, 3);

  assert.equal(
    findTicketLineProblems([line()], new Map(), "ticket-1")[0]!.reason,
    "not_found",
  );

  assert.equal(
    findTicketLineProblems(
      [line()],
      new Map([["item-1", item({ status: "sold" })]]),
      "ticket-1",
    )[0]!.reason,
    "sold",
  );

  assert.deepEqual(
    findTicketLineProblems(
      [line({ quantity: 9 })],
      new Map([
        [
          "item-1",
          item({
            quantity: 0,
            quantityOnHand: 0,
            quantityAvailable: 0,
            ticketSaleRefs: ["ticket:ticket-1"],
          }),
        ],
      ]),
      "ticket-1",
    ),
    [],
    "a retried completion skips lines this ticket already rang up",
  );

  console.log("shop tickets: all assertions passed");
}

main();

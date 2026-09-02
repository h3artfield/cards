import assert from "node:assert/strict";
import {
  buybackCompletionReceipt,
  escapeHtml,
  shopTicketReceipt,
} from "../src/lib/receipts/receipt-templates";
import type { ShopTicket } from "../src/lib/types";

function ticket(overrides: Partial<ShopTicket> = {}): ShopTicket {
  return {
    id: "t1",
    storeId: "store-1",
    ticketNumber: "T-00007",
    status: "completed",
    customerId: "cust-1",
    customerName: "Ada Lovelace",
    lines: [
      {
        inventoryItemId: "i1",
        displayName: "Lightning Bolt",
        setName: "Modern Horizons 2",
        quantity: 2,
        unitPrice: 3.5,
      },
      {
        inventoryItemId: "i2",
        displayName: "Sol Ring",
        quantity: 1,
        unitPrice: 2,
      },
    ],
    subtotal: 9,
    tradeCreditApplied: 4,
    cashDue: 5,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function main() {
  assert.equal(
    escapeHtml('<script>"x" & y</script>'),
    "&lt;script&gt;&quot;x&quot; &amp; y&lt;/script&gt;",
  );

  const receipt = shopTicketReceipt({
    storeName: "The Game Lodge",
    ticket: ticket(),
    creditRemaining: 11.25,
    customerFirstName: "Ada",
  });

  assert.equal(receipt.subject, "Receipt T-00007 — The Game Lodge");
  assert.match(receipt.html, /Hi Ada,/);
  assert.match(receipt.html, /2× Lightning Bolt/);
  assert.match(receipt.html, /Modern Horizons 2/);
  assert.match(receipt.html, /\$7\.00/, "line total is quantity × unit price");
  assert.match(receipt.html, /Subtotal/);
  assert.match(receipt.html, /−\$4\.00/, "credit shows as a deduction");
  assert.match(receipt.html, /\$5\.00/, "amount actually paid");
  assert.match(receipt.html, /\$11\.25/, "leftover credit is stated");

  const cashOnly = shopTicketReceipt({
    storeName: "The Game Lodge",
    ticket: ticket({ tradeCreditApplied: 0, cashDue: 9 }),
    creditRemaining: 0,
  });
  assert.match(cashOnly.html, /Hi,/, "walk-ins get a receipt without a name");
  assert.equal(
    /Trade credit/.test(cashOnly.html),
    false,
    "no credit line when none was used",
  );

  const injected = shopTicketReceipt({
    storeName: "Bob's <Cards> & Games",
    ticket: ticket({
      lines: [
        {
          inventoryItemId: "i1",
          displayName: '<img src=x onerror="alert(1)">',
          quantity: 1,
          unitPrice: 1,
        },
      ],
    }),
    creditRemaining: 0,
    customerFirstName: "<b>Ada</b>",
  });
  assert.equal(
    injected.html.includes("<img src=x"),
    false,
    "card names are escaped",
  );
  assert.match(injected.html, /&lt;img src=x/);
  assert.match(injected.html, /Bob&#039;s|Bob's &lt;Cards&gt; &amp; Games/);
  assert.equal(injected.html.includes("<b>Ada</b>"), false);

  const trade = buybackCompletionReceipt({
    storeName: "The Game Lodge",
    orderNumber: "BB-000123",
    orderId: "order-1",
    offerType: "trade",
    amount: 42.5,
    cardCount: 12,
    creditBalance: 60,
    customerFirstName: "Ada",
    appUrl: "https://cards.example",
  });
  assert.equal(trade.subject, "Order BB-000123 complete — The Game Lodge");
  assert.match(trade.html, /12 cards purchased/);
  assert.match(trade.html, /\$42\.50<\/strong> in trade credit/);
  assert.match(trade.html, /balance is now <strong>\$60\.00/);
  assert.match(trade.html, /https:\/\/cards\.example\/order\/order-1/);

  const cash = buybackCompletionReceipt({
    storeName: "The Game Lodge",
    orderNumber: "BB-000124",
    orderId: "order-2",
    offerType: "cash",
    amount: 20,
    cardCount: 1,
  });
  assert.match(cash.html, /1 card purchased/, "singular card wording");
  assert.match(cash.html, /\$20\.00<\/strong> in cash/);
  assert.equal(
    /balance is now/.test(cash.html),
    false,
    "cash payouts do not mention a credit balance",
  );
  assert.equal(/<a href/.test(cash.html), false, "no link without an app url");

  console.log("receipts: all assertions passed");
}

main();

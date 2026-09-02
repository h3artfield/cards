import { getConfiguredAppUrl } from "../app-url";
import { sendEmail } from "../processing/notifications";
import { dataStore } from "../storage/data-store";
import { getTradeCreditBalance } from "../trade-credit/trade-credit-ledger";
import type { ShopTicket, StoreSettings } from "../types";
import {
  buybackCompletionReceipt,
  shopTicketReceipt,
} from "./receipt-templates";

/**
 * Receipts are courtesy mail: a mail outage must never fail the sale or the
 * payout that already happened.
 */
async function sendQuietly(
  label: string,
  send: () => Promise<boolean>,
): Promise<boolean> {
  try {
    return await send();
  } catch (err) {
    console.error(`[receipt] ${label} failed:`, err);
    return false;
  }
}

export async function sendShopTicketReceipt(input: {
  store: StoreSettings;
  ticket: ShopTicket;
  creditRemaining: number;
}): Promise<boolean> {
  const { ticket } = input;
  if (!ticket.customerId) return false;

  return sendQuietly(`ticket ${ticket.ticketNumber}`, async () => {
    const customer = await dataStore.getCustomer(ticket.customerId!);
    if (!customer?.email) return false;

    const email = shopTicketReceipt({
      storeName: input.store.storeName,
      ticket,
      creditRemaining: input.creditRemaining,
      customerFirstName: customer.firstName,
    });

    return sendEmail({ to: customer.email, ...email });
  });
}

export async function sendBuybackCompletionReceipt(input: {
  storeId: string;
  storeName: string;
  customerId: string;
  orderId: string;
  orderNumber: string;
  offerType: "cash" | "trade";
  amount: number;
  cardCount: number;
}): Promise<boolean> {
  return sendQuietly(`order ${input.orderNumber}`, async () => {
    const customer = await dataStore.getCustomer(input.customerId);
    if (!customer?.email) return false;

    const creditBalance =
      input.offerType === "trade"
        ? (await getTradeCreditBalance(input.storeId, input.customerId)).balance
        : undefined;

    const email = buybackCompletionReceipt({
      storeName: input.storeName,
      orderNumber: input.orderNumber,
      orderId: input.orderId,
      offerType: input.offerType,
      amount: input.amount,
      cardCount: input.cardCount,
      creditBalance,
      customerFirstName: customer.firstName,
      appUrl: getConfiguredAppUrl(),
    });

    return sendEmail({ to: customer.email, ...email });
  });
}

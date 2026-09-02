import { NextRequest } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { requireAdminSession, requireStoreScope } from "@/lib/admin-auth";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import {
  computeTicketTotals,
  normalizeTicketLines,
} from "@/lib/shop-tickets/ticket-math";
import { dataStore } from "@/lib/storage/data-store";
import { getTradeCreditBalance } from "@/lib/trade-credit/trade-credit-ledger";
import type { ShopTicket } from "@/lib/types";

const MAX_RECENT_TICKETS = 25;

export async function GET(req: NextRequest) {
  try {
    const auth = requireAdminSession(req);
    if (auth instanceof Response) return auth;
    const scope = requireStoreScope(auth, req);
    if (scope instanceof Response) return scope;

    const tickets = await dataStore.getShopTickets(scope.storeId);
    return jsonOk({ tickets: tickets.slice(0, MAX_RECENT_TICKETS) });
  } catch (err) {
    return handleRouteError(err);
  }
}

/** Open a ticket for an in-store sale. Lines are priced when they are added. */
export async function POST(req: NextRequest) {
  try {
    const auth = requireAdminSession(req);
    if (auth instanceof Response) return auth;
    const scope = requireStoreScope(auth, req);
    if (scope instanceof Response) return scope;

    const body = (await req.json()) as {
      customerId?: string;
      note?: string;
      items?: Array<{ inventoryItemId?: string; quantity?: number }>;
    };

    const requested = Array.isArray(body.items) ? body.items : [];
    if (!requested.length) {
      return jsonError("Add at least one card to the ticket.");
    }

    const inventory = new Map(
      (await dataStore.getInventory(scope.storeId)).map((i) => [i.id, i]),
    );

    const lines = normalizeTicketLines(
      requested.map((item) => {
        const found = item.inventoryItemId
          ? inventory.get(item.inventoryItemId)
          : undefined;
        return {
          inventoryItemId: item.inventoryItemId,
          displayName: found?.displayName,
          setName: found?.setName,
          quantity: item.quantity,
          unitPrice:
            found?.listPrice ??
            found?.shopifyListing?.exportPrice ??
            found?.tcgMarketPrice ??
            found?.marketPrice ??
            0,
        };
      }),
    );

    const unknown = lines.filter((l) => !inventory.has(l.inventoryItemId));
    if (unknown.length) {
      return jsonError(
        `Not in this store's inventory: ${unknown
          .map((l) => l.inventoryItemId)
          .join(", ")}`,
      );
    }
    if (!lines.length) return jsonError("Add at least one card to the ticket.");

    let customerId: string | undefined;
    let customerName: string | undefined;
    if (body.customerId) {
      const customer = await dataStore.getCustomer(body.customerId);
      if (!customer || customer.storeId !== scope.storeId) {
        return jsonError("Customer not found at this store", 404);
      }
      customerId = customer.id;
      customerName =
        `${customer.firstName} ${customer.lastName}`.trim() || customer.email;
    }

    const totals = computeTicketTotals({ lines });
    const now = new Date().toISOString();
    const ticket: ShopTicket = {
      id: uuidv4(),
      storeId: scope.storeId,
      ticketNumber: await dataStore.nextShopTicketNumber(scope.storeId),
      status: "open",
      customerId,
      customerName,
      lines,
      subtotal: totals.subtotal,
      tradeCreditApplied: 0,
      cashDue: totals.subtotal,
      note: body.note?.trim() || undefined,
      createdByAdminId: auth.userId,
      createdByName: auth.email,
      createdAt: now,
      updatedAt: now,
    };

    await dataStore.saveShopTicket(ticket);

    const creditBalance = customerId
      ? (await getTradeCreditBalance(scope.storeId, customerId)).balance
      : 0;

    return jsonOk({ ticket, creditBalance });
  } catch (err) {
    return handleRouteError(err);
  }
}

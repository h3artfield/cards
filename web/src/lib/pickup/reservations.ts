import { randomUUID } from "node:crypto";
import { dataStore } from "../storage/data-store";
import { resolveShopifyAccessTokenForStore } from "../shopify/resolve-access-token";
import {
  createPickupDraftOrder,
  deleteDraftOrder,
  findOrCreateShopifyCustomer,
  getDraftOrderState,
  type PickupCustomerContact,
} from "../shopify/draft-orders";
import {
  normalizeShopifyResourceId,
  processShopifyOrderPaid,
} from "../shopify/sold-detection";
import { pushShopifyLevelsAfterImport } from "../shopify/sync-inventory-levels";
import type { ValidatedCheckoutLine } from "../store-inventory/validate-cart";
import type { PickupReservation, StoreSettings } from "../types";

export const PICKUP_HOLD_DAYS = 7;
const SYNC_INTERVAL_MS = 10 * 60_000;
const lastSyncByStore = new Map<string, number>();

/** Units held by open pickup drafts, per inventory row. */
export function reservedQuantities(
  reservations: PickupReservation[],
): Map<string, number> {
  const held = new Map<string, number>();
  for (const r of reservations) {
    if (r.status !== "active") continue;
    for (const line of r.lines) {
      held.set(
        line.inventoryItemId,
        (held.get(line.inventoryItemId) ?? 0) + line.quantity,
      );
    }
  }
  return held;
}

function shopifyConn(settings: StoreSettings, accessToken: string) {
  return { shopDomain: settings.shopifyIntegration!.shopDomain!, accessToken };
}

/** An unpaid pay-online pickup only holds the cards while the customer is at checkout. */
const PAY_ONLINE_HOLD_HOURS = 24;

function pickupNote(contact: PickupCustomerContact, reserveUntil: string, payOnline: boolean): string {
  const name = `${contact.firstName} ${contact.lastName}`.trim();
  const reach = [contact.email, contact.phone].filter(Boolean).join(" · ");
  const who = name || reach ? ` ${name}${reach ? ` (${reach})` : ""}.` : "";
  if (payOnline) {
    return `In-store pickup — paid online (includes in-store-only cards, no shipping).${who}`;
  }
  const until = new Date(reserveUntil).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  return `In-store pickup — pay at the counter.${who} Held until ${until}.`;
}

export async function createPickupReservation(input: {
  store: StoreSettings;
  contact: PickupCustomerContact;
  customerId?: string;
  lines: ValidatedCheckoutLine[];
  /** Customer pays now through Shopify; shipping is fixed to in-store pickup. */
  payOnline?: boolean;
}): Promise<PickupReservation> {
  const { store, contact } = input;
  const { accessToken, settings } = await resolveShopifyAccessTokenForStore(
    store.id,
    store,
  );
  const conn = shopifyConn(settings, accessToken);

  // Pickup still works without a customer record (e.g. before Shopify approves
  // protected customer data): staff find it by the name in the note.
  let shopifyCustomerId: string | undefined;
  if (contact.email || contact.phone) {
    try {
      shopifyCustomerId = await findOrCreateShopifyCustomer(conn, contact);
    } catch (err) {
      console.warn("[pickup] could not attach Shopify customer:", err);
    }
  }

  const payOnline = input.payOnline === true;
  const now = new Date();
  const holdMs = payOnline
    ? PAY_ONLINE_HOLD_HOURS * 60 * 60_000
    : PICKUP_HOLD_DAYS * 24 * 60 * 60_000;
  const reserveUntil = new Date(now.getTime() + holdMs).toISOString();

  const draft = await createPickupDraftOrder(conn, {
    customerId: shopifyCustomerId,
    email: contact.email,
    lines: input.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
    reserveUntil,
    note: pickupNote(contact, reserveUntil, payOnline),
    tags: payOnline ? ["pickup", "paid-online", "cardscanner9000"] : ["pickup", "cardscanner9000"],
    pickupShippingTitle: payOnline ? "In-store pickup" : undefined,
  });
  if (payOnline && !draft.invoiceUrl) {
    throw new Error("Shopify did not return a checkout link");
  }

  const subtotal = input.lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  const reservation: PickupReservation = {
    id: randomUUID(),
    storeId: store.id,
    status: "active",
    customerId: input.customerId,
    customerName: `${contact.firstName} ${contact.lastName}`.trim(),
    customerEmail: contact.email,
    customerPhone: contact.phone,
    shopifyCustomerId,
    draftOrderId: draft.id,
    draftOrderName: draft.name,
    ...(payOnline ? { payOnline: true, invoiceUrl: draft.invoiceUrl } : {}),
    lines: input.lines.map((l) => ({
      inventoryItemId: l.inventoryItemId,
      displayName: l.displayName,
      variantId: l.variantId,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
    })),
    subtotal: Math.round(subtotal * 100) / 100,
    reserveUntil,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  return dataStore.savePickupReservation(reservation);
}

async function recordReservationSale(
  reservation: PickupReservation,
  order: NonNullable<Awaited<ReturnType<typeof getDraftOrderState>>["order"]>,
): Promise<void> {
  await processShopifyOrderPaid({
    storeId: reservation.storeId,
    order: {
      id: normalizeShopifyResourceId(order.id),
      line_items: order.lineItems.map((li) => ({
        id: normalizeShopifyResourceId(li.id),
        sku: li.sku,
        variant_id: li.variantId ? normalizeShopifyResourceId(li.variantId) : null,
        price: li.price,
        quantity: li.quantity,
      })),
    },
  });
}

/** Runs after the reservation is closed, so the held-row guard no longer applies. */
async function withdrawSoldListings(storeId: string, soldIds: string[]) {
  if (!soldIds.length) return;
  try {
    const wanted = new Set(soldIds);
    const inventory = await dataStore.getInventory(storeId);
    await pushShopifyLevelsAfterImport(
      storeId,
      inventory.filter((i) => wanted.has(i.id)),
    );
  } catch (err) {
    console.error("[pickup] could not withdraw sold listings:", err);
  }
}

/**
 * Settles open reservations against Shopify: paid drafts mark their singles
 * sold, drafts staff deleted are dropped, and holds past their date are
 * released so the cards go back on sale.
 */
export async function syncPickupReservations(
  storeId: string,
): Promise<{ checked: number; completed: number; expired: number; cancelled: number }> {
  lastSyncByStore.set(storeId, Date.now());
  const counts = { checked: 0, completed: 0, expired: 0, cancelled: 0 };

  const active = (await dataStore.getPickupReservations(storeId)).filter(
    (r) => r.status === "active",
  );
  if (!active.length) return counts;

  const store = await dataStore.getSettings(storeId);
  if (!store.shopifyIntegration?.enabled || !store.shopifyIntegration.shopDomain) {
    return counts;
  }
  const { accessToken, settings } = await resolveShopifyAccessTokenForStore(
    storeId,
    store,
  );
  const conn = shopifyConn(settings, accessToken);

  for (const reservation of active) {
    counts.checked += 1;
    const now = new Date().toISOString();
    try {
      const state = await getDraftOrderState(conn, reservation.draftOrderId);

      if (state.status === "COMPLETED" && state.order) {
        await recordReservationSale(reservation, state.order);
        await dataStore.savePickupReservation({
          ...reservation,
          status: "completed",
          shopifyOrderId: state.order.id,
          completedAt: now,
          updatedAt: now,
          lastError: undefined,
        });
        // Every held row, not just ones sold here: the orders/paid webhook may
        // have recorded the sale first, while the guard still blocked the push.
        await withdrawSoldListings(
          reservation.storeId,
          reservation.lines.map((l) => l.inventoryItemId),
        );
        counts.completed += 1;
        continue;
      }

      if (state.status === "MISSING") {
        await dataStore.savePickupReservation({
          ...reservation,
          status: "cancelled",
          releasedAt: now,
          updatedAt: now,
          lastError: undefined,
        });
        counts.cancelled += 1;
        continue;
      }

      if (new Date(reservation.reserveUntil).getTime() <= Date.now()) {
        await deleteDraftOrder(conn, reservation.draftOrderId);
        await dataStore.savePickupReservation({
          ...reservation,
          status: "expired",
          releasedAt: now,
          updatedAt: now,
          lastError: undefined,
        });
        counts.expired += 1;
      }
    } catch (err) {
      await dataStore.savePickupReservation({
        ...reservation,
        lastError: err instanceof Error ? err.message : String(err),
        updatedAt: now,
      });
    }
  }
  return counts;
}

/** Cheap enough to call on page loads; runs at most every 10 minutes per store. */
export async function syncPickupReservationsIfStale(storeId: string): Promise<void> {
  const last = lastSyncByStore.get(storeId) ?? 0;
  if (Date.now() - last < SYNC_INTERVAL_MS) return;
  try {
    await syncPickupReservations(storeId);
  } catch (err) {
    console.error("[pickup] sync failed:", err);
  }
}

export async function cancelPickupReservation(
  reservation: PickupReservation,
): Promise<PickupReservation> {
  if (reservation.status !== "active") return reservation;
  const store = await dataStore.getSettings(reservation.storeId);
  const { accessToken, settings } = await resolveShopifyAccessTokenForStore(
    reservation.storeId,
    store,
  );
  const conn = shopifyConn(settings, accessToken);
  const state = await getDraftOrderState(conn, reservation.draftOrderId);
  if (state.status === "COMPLETED") {
    throw new Error("This pickup order was already paid in Shopify.");
  }
  if (state.status !== "MISSING") {
    await deleteDraftOrder(conn, reservation.draftOrderId);
  }
  const now = new Date().toISOString();
  return dataStore.savePickupReservation({
    ...reservation,
    status: "cancelled",
    releasedAt: now,
    updatedAt: now,
  });
}

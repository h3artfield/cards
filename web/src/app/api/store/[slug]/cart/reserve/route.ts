import { NextRequest } from "next/server";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import {
  getCustomerSession,
  loadCustomer,
  resolveStoreForSlug,
} from "@/lib/auth/customer-auth";
import {
  createPickupReservation,
  reservedQuantities,
  syncPickupReservationsIfStale,
} from "@/lib/pickup/reservations";
import { formatShopifyApiErrorMessage } from "@/lib/shopify/client";
import { dataStore } from "@/lib/storage/data-store";
import {
  validateCartForCheckout,
  type CartCheckoutRequestLine,
} from "@/lib/store-inventory/validate-cart";

const MAX_CART_LINES = 50;
const MAX_ACTIVE_PER_CUSTOMER = 3;

/** Holds a cart as an unpaid Shopify draft order the customer pays for in store. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const store = await resolveStoreForSlug(slug);
    if (!store) return jsonError("Store not found", 404);

    const session = getCustomerSession(req);
    const customer = session ? await loadCustomer(session.customerId) : null;
    if (!customer) {
      return jsonError("Sign in to reserve cards for pickup.", 401);
    }

    const integration = store.shopifyIntegration;
    if (!integration?.enabled || !integration.shopDomain) {
      return jsonError(
        "This store has not connected Shopify yet — ask staff to hold these cards.",
        400,
      );
    }

    const body = (await req.json()) as { items?: unknown };
    const requested: CartCheckoutRequestLine[] = Array.isArray(body.items)
      ? body.items
          .filter(
            (item): item is { inventoryItemId: string; quantity?: number } =>
              Boolean(item) &&
              typeof (item as { inventoryItemId?: unknown }).inventoryItemId ===
                "string",
          )
          .slice(0, MAX_CART_LINES)
          .map((item) => ({
            inventoryItemId: item.inventoryItemId,
            quantity: Number(item.quantity ?? 1),
          }))
      : [];
    if (!requested.length) return jsonError("Your cart is empty");
    if (requested.some((item) => item.inventoryItemId.startsWith("token:"))) {
      return jsonError(
        "Custom printed tokens are paid online so the store can print them. Use Pay now, or remove the tokens to reserve the rest.",
        400,
      );
    }

    await syncPickupReservationsIfStale(store.id);
    const reservations = await dataStore.getPickupReservations(store.id);
    const mine = reservations.filter(
      (r) => r.status === "active" && r.customerId === customer.id,
    );
    if (mine.length >= MAX_ACTIVE_PER_CUSTOMER) {
      return jsonError(
        `You already have ${mine.length} pickup orders waiting — pick those up or ask staff to combine them.`,
        409,
      );
    }

    const inventory = await dataStore.getInventory(store.id);
    const validation = validateCartForCheckout(
      requested,
      inventory,
      reservedQuantities(reservations),
    );
    if (!validation.lines.length) {
      return jsonOk({
        reservation: null,
        rejected: validation.rejected,
        error: "None of these cards can be reserved right now.",
      });
    }

    let reservation;
    try {
      reservation = await createPickupReservation({
        store,
        customerId: customer.id,
        contact: {
          firstName: customer.firstName,
          lastName: customer.lastName,
          email: customer.email || undefined,
          phone: customer.phone || undefined,
        },
        lines: validation.lines,
      });
    } catch (err) {
      return jsonError(formatShopifyApiErrorMessage(err), 502);
    }

    return jsonOk({
      reservation: {
        id: reservation.id,
        draftOrderName: reservation.draftOrderName,
        reserveUntil: reservation.reserveUntil,
        subtotal: reservation.subtotal,
        lines: reservation.lines.map((l) => ({
          inventoryItemId: l.inventoryItemId,
          displayName: l.displayName,
          quantity: l.quantity,
        })),
      },
      rejected: validation.rejected,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

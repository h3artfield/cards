import { NextRequest } from "next/server";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import { getCustomerSession, loadCustomer, resolveStoreForSlug } from "@/lib/auth/customer-auth";
import { formatShopifyApiErrorMessage } from "@/lib/shopify/client";
import {
  splitTokenCartLinesV1,
  startTokenCheckoutV1,
  TOKEN_CART_PREFIX,
} from "@/lib/token-creator/orders-v1";
import { inventoryOnlineQuantity } from "@/lib/inventory/status";
import {
  createPickupReservation,
  reservedQuantities,
  syncPickupReservationsIfStale,
} from "@/lib/pickup/reservations";
import { buildShopifyCheckoutUrl } from "@/lib/shopify/checkout-permalink";
import { dataStore } from "@/lib/storage/data-store";
import {
  validateCartForCheckout,
  type CartCheckoutRequestLine,
} from "@/lib/store-inventory/validate-cart";

const MAX_CART_LINES = 50;

/**
 * Hands a cart off to Shopify checkout. Open to guests: buying inventory
 * needs no account, only scanning and trade credit do.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const store = await resolveStoreForSlug(slug);
    if (!store) return jsonError("Store not found", 404);

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

    if (!requested.length) {
      return jsonError("Your cart is empty");
    }

    const integration = store.shopifyIntegration;
    if (!integration?.enabled || !integration.shopDomain) {
      return jsonError(
        "This store has not connected online checkout yet — ask staff to ring these up in store.",
        400,
      );
    }

    const split = splitTokenCartLinesV1(requested);

    await syncPickupReservationsIfStale(store.id);
    const [inventory, reservations] = await Promise.all([
      dataStore.getInventory(store.id),
      dataStore.getPickupReservations(store.id),
    ]);
    const validation = validateCartForCheckout(
      split.inventory,
      inventory,
      reservedQuantities(reservations),
    );

    // Custom tokens carry a design reference on their line, which a cart link
    // cannot hold, so a cart with tokens checks out through a draft order.
    if (split.tokens.length) {
      const session = getCustomerSession(req);
      const customer = session ? await loadCustomer(session.customerId) : null;
      if (!customer) return jsonError("Sign in to buy custom tokens.", 401);
      let result;
      try {
        result = await startTokenCheckoutV1({
          store,
          customer,
          tokens: split.tokens,
          inventoryLines: validation.lines,
        });
      } catch (err) {
        return jsonError(formatShopifyApiErrorMessage(err), 502);
      }
      if (!result.ok) {
        return jsonOk({
          checkoutUrl: null,
          lines: validation.lines,
          rejected: [
            ...validation.rejected,
            ...(result.rejectedSnapshotIds ?? []).map((id) => ({
              inventoryItemId: `${TOKEN_CART_PREFIX}${id}`,
              reason: "not_found" as const,
              message: "This custom token could not be found.",
            })),
          ],
          subtotal: validation.subtotal,
          error: result.message,
        });
      }
      return jsonOk({
        checkoutUrl: result.checkoutUrl,
        lines: validation.lines,
        rejected: validation.rejected,
        subtotal: validation.subtotal + result.order.subtotalCents / 100,
      });
    }

    const byId = new Map(inventory.map((i) => [i.id, i]));
    const pickupOnly = validation.lines.some((l) => {
      const item = byId.get(l.inventoryItemId);
      return item != null && l.quantity > inventoryOnlineQuantity(item);
    });
    if (pickupOnly && validation.lines.length) {
      const session = getCustomerSession(req);
      const customer = session ? await loadCustomer(session.customerId) : null;
      let reservation;
      try {
        reservation = await createPickupReservation({
          store,
          customerId: customer?.id,
          contact: {
            firstName: customer?.firstName ?? "",
            lastName: customer?.lastName ?? "",
            email: customer?.email || undefined,
            phone: customer?.phone || undefined,
          },
          lines: validation.lines,
          payOnline: true,
        });
      } catch (err) {
        return jsonError(formatShopifyApiErrorMessage(err), 502);
      }
      return jsonOk({
        checkoutUrl: reservation.invoiceUrl ?? null,
        pickupOnly: true,
        lines: validation.lines,
        rejected: validation.rejected,
        subtotal: validation.subtotal,
      });
    }

    const checkoutUrl = buildShopifyCheckoutUrl({
      shopDomain: integration.shopDomain,
      lines: validation.lines.map((l) => ({
        variantId: l.variantId,
        quantity: l.quantity,
      })),
    });

    if (!checkoutUrl) {
      return jsonOk({
        checkoutUrl: null,
        lines: validation.lines,
        rejected: validation.rejected,
        subtotal: validation.subtotal,
        error: "None of these cards can be bought online right now.",
      });
    }

    return jsonOk({
      checkoutUrl,
      lines: validation.lines,
      rejected: validation.rejected,
      subtotal: validation.subtotal,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

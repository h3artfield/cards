import { NextRequest } from "next/server";
import { jsonOk, jsonError, handleRouteError } from "@/lib/api-utils";
import { resolveStoreForSlug } from "@/lib/auth/customer-auth";
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

    const inventory = await dataStore.getInventory(store.id);
    const validation = validateCartForCheckout(requested, inventory);

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

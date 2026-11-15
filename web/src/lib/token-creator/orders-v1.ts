import { randomUUID } from "node:crypto";
import type { Customer, StoreSettings } from "../types";
import type { ValidatedCheckoutLine } from "../store-inventory/validate-cart";
import { tokenCreatorConfigV1 } from "./config-v1";
import {
  checkTokenDraftV1,
  createTokenCheckoutDraftV1,
  ensureTokenProductVariantV1,
  markTokenOrderPaidV1,
  TOKEN_ORDER_PROPERTY,
  tokenOrderShippingSummaryV1,
  tokenShopifyConnV1,
} from "./shopify-v1";
import {
  createTokenOrderV1,
  getTokenOrderV1,
  getTokenSnapshotsV1,
  listTokenOrdersForStoreV1,
  updateTokenOrderV1,
} from "./store-v1";
import type { TokenPrintOrderV1 } from "./types-v1";

export const TOKEN_CART_PREFIX = "token:";

export type TokenCartRequestV1 = { snapshotId: string; quantity: number };

export function splitTokenCartLinesV1<T extends { inventoryItemId: string; quantity: number }>(
  items: T[],
): { inventory: T[]; tokens: TokenCartRequestV1[] } {
  const inventory: T[] = [];
  const tokens = new Map<string, number>();
  for (const item of items) {
    if (item.inventoryItemId.startsWith(TOKEN_CART_PREFIX)) {
      const snapshotId = item.inventoryItemId.slice(TOKEN_CART_PREFIX.length);
      tokens.set(snapshotId, (tokens.get(snapshotId) ?? 0) + item.quantity);
    } else {
      inventory.push(item);
    }
  }
  return { inventory, tokens: [...tokens].map(([snapshotId, quantity]) => ({ snapshotId, quantity })) };
}

export type TokenCheckoutResultV1 =
  | { ok: true; checkoutUrl: string; order: TokenPrintOrderV1 }
  | { ok: false; status: number; message: string; rejectedSnapshotIds?: string[] };

/**
 * Turns the token lines of a cart into a print order and a Shopify checkout.
 *
 * Prices and ownership are checked here, never taken from the browser: each
 * snapshot must belong to this customer at this store, quantities are clamped,
 * and the unit price is whatever the Shopify variant charges.
 */
export async function startTokenCheckoutV1(input: {
  store: StoreSettings;
  customer: Customer;
  tokens: TokenCartRequestV1[];
  inventoryLines: ValidatedCheckoutLine[];
}): Promise<TokenCheckoutResultV1> {
  const config = tokenCreatorConfigV1();
  const snapshots = await getTokenSnapshotsV1(input.tokens.map((t) => t.snapshotId));
  const byId = new Map(snapshots.map((s) => [s.snapshotId, s]));
  const rejected = input.tokens
    .filter((t) => {
      const s = byId.get(t.snapshotId);
      return !s || s.customerId !== input.customer.id || s.storeId !== input.store.id;
    })
    .map((t) => t.snapshotId);
  if (rejected.length) {
    return {
      ok: false,
      status: 400,
      message: "Some custom tokens in your cart could not be found. Remove them and add them again from Token Creator.",
      rejectedSnapshotIds: rejected,
    };
  }

  const conn = await tokenShopifyConnV1(input.store);
  const variant = await ensureTokenProductVariantV1(input.store, conn);

  const orderId = randomUUID();
  const now = new Date().toISOString();
  const lines = input.tokens.map((t) => {
    const s = byId.get(t.snapshotId)!;
    return {
      snapshotId: s.snapshotId,
      versionId: s.versionId,
      name: s.card.name || "Custom token",
      styleName: s.styleName,
      quantity: Math.min(config.maxQuantityPerDesign, Math.max(1, Math.trunc(t.quantity) || 1)),
      unitPriceCents: variant.priceCents,
      frontPath: s.frontPath,
      backPath: s.backPath,
    };
  });
  const cardCount = lines.reduce((n, l) => n + l.quantity, 0);
  const order: TokenPrintOrderV1 = {
    orderId,
    customerId: input.customer.id,
    customerName: `${input.customer.firstName ?? ""} ${input.customer.lastName ?? ""}`.trim(),
    customerEmail: input.customer.email ?? "",
    storeId: input.store.id,
    lines,
    cardCount,
    subtotalCents: lines.reduce((n, l) => n + l.quantity * l.unitPriceCents, 0),
    draftOrderId: "",
    draftOrderName: "",
    invoiceUrl: null,
    shopifyOrderId: null,
    shopifyOrderName: null,
    paymentState: "awaiting_payment",
    productionState: "not_released",
    processedEvents: [],
    statusHistory: [{ at: now, state: "checkout_started", by: "customer" }],
    shippingSummary: null,
    lastError: null,
    createdAt: now,
    updatedAt: now,
    paidAt: null,
  };
  await createTokenOrderV1(order);

  try {
    const draft = await createTokenCheckoutDraftV1(conn, {
      orderId,
      contact: {
        firstName: input.customer.firstName ?? "",
        lastName: input.customer.lastName ?? "",
        email: input.customer.email || undefined,
        phone: input.customer.phone || undefined,
      },
      inventoryLines: input.inventoryLines,
      tokenLines: lines.map((l) => ({
        variantId: variant.variantId,
        quantity: l.quantity,
        name: l.name,
        styleName: l.styleName,
        versionId: l.versionId,
        snapshotId: l.snapshotId,
      })),
    });
    if (!draft.invoiceUrl) throw new Error("Shopify did not return a checkout link");
    const saved = await updateTokenOrderV1(orderId, (current) => ({
      ...current,
      draftOrderId: draft.id,
      draftOrderName: draft.name,
      invoiceUrl: draft.invoiceUrl,
    }));
    return { ok: true, checkoutUrl: draft.invoiceUrl, order: saved ?? order };
  } catch (err) {
    await updateTokenOrderV1(orderId, (current) => ({
      ...current,
      paymentState: "cancelled",
      productionState: "cancelled",
      lastError: err instanceof Error ? err.message : String(err),
    }));
    throw err;
  }
}

type WebhookLine = { properties?: Array<{ name?: string; value?: unknown }> | null };

/**
 * Marks print orders paid from an `orders/paid` webhook. The order is found
 * through the line property we set on the draft, and the event id is recorded
 * so a redelivered webhook changes nothing.
 */
export async function applyTokenOrderPaidV1(input: {
  storeId: string;
  order: { id: number | string; name?: string; financial_status?: string; line_items?: WebhookLine[] };
}): Promise<string[]> {
  if (input.order.financial_status && input.order.financial_status !== "paid") return [];
  const orderIds = new Set<string>();
  for (const line of input.order.line_items ?? []) {
    for (const prop of line.properties ?? []) {
      if (prop.name === TOKEN_ORDER_PROPERTY && typeof prop.value === "string") orderIds.add(prop.value);
    }
  }
  const shopifyOrderId = String(input.order.id).startsWith("gid://")
    ? String(input.order.id)
    : `gid://shopify/Order/${input.order.id}`;
  const updated: string[] = [];
  for (const orderId of orderIds) {
    const existing = await getTokenOrderV1(orderId);
    if (!existing || existing.storeId !== input.storeId) continue;
    const result = await updateTokenOrderV1(orderId, (current) =>
      markTokenOrderPaidV1(current, {
        shopifyOrderId,
        shopifyOrderName: input.order.name ?? null,
        eventId: `orders/paid:${input.order.id}`,
        by: "shopify webhook",
      }),
    );
    if (result) updated.push(orderId);
  }
  return updated;
}

const ABANDON_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Checks every unpaid print order against Shopify. This is how payment is
 * picked up when the `orders/paid` webhook is not registered, and how
 * abandoned checkouts are recognised.
 */
export async function syncTokenOrdersV1(store: StoreSettings): Promise<{ checked: number; paid: number; errors: number }> {
  const counts = { checked: 0, paid: 0, errors: 0 };
  if (!store.shopifyIntegration?.enabled || !store.shopifyIntegration.shopDomain) return counts;
  const orders = (await listTokenOrdersForStoreV1(store.id)).filter(
    (o) => (o.paymentState === "awaiting_payment" || o.paymentState === "abandoned") && o.draftOrderId,
  );
  if (!orders.length) return counts;
  const conn = await tokenShopifyConnV1(store);
  for (const order of orders) {
    counts.checked += 1;
    try {
      const state = await checkTokenDraftV1(conn, order.draftOrderId);
      if (state.status === "COMPLETED" && state.order) {
        const financial = (state.order.financialStatus ?? "").toUpperCase();
        if (financial === "PAID" || financial === "PARTIALLY_REFUNDED") {
          const shipping = await tokenOrderShippingSummaryV1(conn, state.order.id);
          await updateTokenOrderV1(order.orderId, (current) =>
            markTokenOrderPaidV1(current, {
              shopifyOrderId: state.order!.id,
              shopifyOrderName: state.order!.name,
              eventId: `sync:${state.order!.id}`,
              shippingSummary: shipping,
              by: "shopify sync",
            }),
          );
          counts.paid += 1;
        } else if (financial === "REFUNDED" || state.order.cancelled) {
          await updateTokenOrderV1(order.orderId, (current) => ({ ...current, paymentState: "refunded", productionState: "cancelled" }));
        }
      } else if (state.status === "MISSING") {
        await updateTokenOrderV1(order.orderId, (current) => ({ ...current, paymentState: "cancelled", productionState: "cancelled" }));
      } else if (order.paymentState === "awaiting_payment" && Date.now() - Date.parse(order.createdAt) > ABANDON_AFTER_MS) {
        await updateTokenOrderV1(order.orderId, (current) => ({ ...current, paymentState: "abandoned" }));
      }
    } catch (err) {
      counts.errors += 1;
      await updateTokenOrderV1(order.orderId, (current) => ({
        ...current,
        lastError: err instanceof Error ? err.message : String(err),
      })).catch(() => {});
    }
  }
  return counts;
}

/** Paid orders also get their shipping details and a refund check. */
export async function refreshPaidTokenOrdersV1(store: StoreSettings): Promise<void> {
  if (!store.shopifyIntegration?.enabled) return;
  const orders = (await listTokenOrdersForStoreV1(store.id)).filter(
    (o) => o.paymentState === "paid" && o.shopifyOrderId && !o.shippingSummary,
  );
  if (!orders.length) return;
  const conn = await tokenShopifyConnV1(store);
  for (const order of orders.slice(0, 20)) {
    const shipping = await tokenOrderShippingSummaryV1(conn, order.shopifyOrderId!);
    if (shipping) await updateTokenOrderV1(order.orderId, (current) => ({ ...current, shippingSummary: shipping }));
  }
}

export const TOKEN_PRODUCTION_FLOW_V1: TokenPrintOrderV1["productionState"][] = ["paid", "ready", "printing", "printed", "fulfilled"];

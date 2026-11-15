import { getAdminFirestore } from "../firebase/admin";
import {
  collectUserErrors,
  SHOPIFY_CURRENT_API_VERSION,
  ShopifyApiError,
  shopifyGraphql,
  type ShopifyGraphqlError,
} from "../shopify/client";
import { findOrCreateShopifyCustomer } from "../shopify/draft-orders";
import { resolveShopifyAccessTokenForStore } from "../shopify/resolve-access-token";
import type { StoreSettings } from "../types";
import type { ValidatedCheckoutLine } from "../store-inventory/validate-cart";
import { tokenCreatorConfigV1 } from "./config-v1";
import type { TokenPrintOrderV1 } from "./types-v1";

type Conn = { shopDomain: string; accessToken: string };

const STORE_CONFIG_COLLECTION = "tokenCreatorStoreConfig";

/** Line-item property that ties a Shopify order back to our print order. */
export const TOKEN_ORDER_PROPERTY = "_cs9k_token_order";
export const TOKEN_VERSION_PROPERTY = "_cs9k_token_version";

function gql<T>(conn: Conn, query: string, variables?: Record<string, unknown>) {
  return shopifyGraphql<T>(conn.shopDomain, conn.accessToken, query, variables, SHOPIFY_CURRENT_API_VERSION);
}

function throwOnUserErrors(payload: Record<string, unknown> | undefined) {
  const errors = collectUserErrors(payload);
  if (errors.length) throw new ShopifyApiError(errors.map((e) => e.message).join("; "), errors);
}

export async function tokenShopifyConnV1(store: StoreSettings): Promise<Conn> {
  const { accessToken, settings } = await resolveShopifyAccessTokenForStore(store.id, store);
  return { shopDomain: settings.shopifyIntegration!.shopDomain!, accessToken };
}

type ProductNode = {
  id: string;
  title: string;
  variants: { nodes: Array<{ id: string; price: string }> };
};

/**
 * The one Shopify product every printed token sells as. Found by title, or
 * created once: $5 (configurable), shipped, not inventory-tracked, and never
 * published to the storefront, since it is only bought through Token Creator.
 * The variant id is cached per store.
 */
export async function ensureTokenProductVariantV1(store: StoreSettings, conn: Conn): Promise<{ variantId: string; priceCents: number }> {
  const config = tokenCreatorConfigV1();
  const db = getAdminFirestore();
  const ref = db?.collection(STORE_CONFIG_COLLECTION).doc(store.id);
  const cached = ref ? (await ref.get()).data() as { variantId?: string; shopDomain?: string } | undefined : undefined;

  const priceOf = (price: string) => Math.round(Number(price) * 100);

  if (cached?.variantId && cached.shopDomain === conn.shopDomain) {
    const data = await gql<{ productVariant: { id: string; price: string } | null }>(
      conn,
      `query TokenVariant($id: ID!) { productVariant(id: $id) { id price } }`,
      { id: cached.variantId },
    );
    if (data.productVariant) return { variantId: data.productVariant.id, priceCents: priceOf(data.productVariant.price) };
  }

  const title = config.shopifyProductTitle;
  const found = await gql<{ products: { nodes: ProductNode[] } }>(
    conn,
    `query FindTokenProduct($query: String!) {
      products(first: 5, query: $query) { nodes { id title variants(first: 1) { nodes { id price } } } }
    }`,
    { query: `title:"${title.replace(/"/g, "")}"` },
  );
  let product = found.products.nodes.find((p) => p.title === title);

  if (!product) {
    const created = await gql<{
      productCreate: { product: ProductNode | null; userErrors: ShopifyGraphqlError[] };
    }>(
      conn,
      `mutation CreateTokenProduct($product: ProductCreateInput!) {
        productCreate(product: $product) {
          product { id title variants(first: 1) { nodes { id price } } }
          userErrors { field message }
        }
      }`,
      {
        product: {
          title,
          productType: "Custom Printed Token",
          vendor: store.storeName || "The Game Lodge",
          status: "ACTIVE",
          tags: ["cardscanner9000", "token-creator"],
          descriptionHtml:
            "<p>A custom token card designed in CardScanner9000's Token Creator and printed by the store. Each print is personalised by the design attached to the order line.</p>",
        },
      },
    );
    throwOnUserErrors(created.productCreate);
    product = created.productCreate.product ?? undefined;
    if (!product) throw new ShopifyApiError("Shopify did not return the token product");
  }

  const variant = product.variants.nodes[0];
  if (!variant) throw new ShopifyApiError("The token product has no variant");

  const wanted = (config.unitPriceCents / 100).toFixed(2);
  if (priceOf(variant.price) !== config.unitPriceCents) {
    const updated = await gql<{
      productVariantsBulkUpdate: { productVariants: Array<{ id: string; price: string }> | null; userErrors: ShopifyGraphqlError[] };
    }>(
      conn,
      `mutation PriceTokenVariant($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) {
          productVariants { id price }
          userErrors { field message }
        }
      }`,
      {
        productId: product.id,
        variants: [
          {
            id: variant.id,
            price: wanted,
            inventoryPolicy: "CONTINUE",
            inventoryItem: { tracked: false, requiresShipping: true, sku: "CS9K-TOKEN-PRINT" },
          },
        ],
      },
    );
    throwOnUserErrors(updated.productVariantsBulkUpdate);
  }

  await ref?.set({ variantId: variant.id, productId: product.id, shopDomain: conn.shopDomain, updatedAt: new Date().toISOString() }, { merge: true });
  return { variantId: variant.id, priceCents: config.unitPriceCents };
}

export type TokenDraftLineV1 = {
  variantId: string;
  quantity: number;
  name: string;
  styleName: string | null;
  versionId: string;
  snapshotId: string;
};

/**
 * One unpaid draft order holding the shelf cards and the custom tokens. Its
 * invoice URL is Shopify's hosted checkout; Shopify creates the real order
 * only when the customer pays.
 */
export async function createTokenCheckoutDraftV1(
  conn: Conn,
  input: {
    orderId: string;
    contact: { firstName: string; lastName: string; email?: string; phone?: string };
    inventoryLines: ValidatedCheckoutLine[];
    tokenLines: TokenDraftLineV1[];
  },
): Promise<{ id: string; name: string; invoiceUrl: string | null }> {
  let customerId: string | undefined;
  try {
    customerId = await findOrCreateShopifyCustomer(conn, input.contact);
  } catch (err) {
    console.warn("[token-creator] could not attach Shopify customer:", err);
  }

  const gid = (id: string) => (id.startsWith("gid://") ? id : `gid://shopify/ProductVariant/${id}`);
  const data = await gql<{
    draftOrderCreate: {
      draftOrder: { id: string; name: string; invoiceUrl: string | null } | null;
      userErrors: ShopifyGraphqlError[];
    };
  }>(
    conn,
    `mutation CreateTokenCheckout($input: DraftOrderInput!) {
      draftOrderCreate(input: $input) {
        draftOrder { id name invoiceUrl }
        userErrors { field message }
      }
    }`,
    {
      input: {
        purchasingEntity: customerId ? { customerId } : undefined,
        email: input.contact.email || undefined,
        lineItems: [
          ...input.inventoryLines.map((l) => ({ variantId: gid(l.variantId), quantity: l.quantity })),
          ...input.tokenLines.map((l) => ({
            variantId: gid(l.variantId),
            quantity: l.quantity,
            customAttributes: [
              { key: "Token", value: l.name || "Custom token" },
              ...(l.styleName ? [{ key: "Art style", value: l.styleName }] : []),
              { key: "Design ref", value: l.versionId.slice(0, 8) },
              { key: TOKEN_ORDER_PROPERTY, value: input.orderId },
              { key: TOKEN_VERSION_PROPERTY, value: l.versionId },
            ],
          })),
        ],
        note: `CardScanner9000 Token Creator order ${input.orderId}. Print files are in the CardScanner9000 admin under Tokens.`,
        tags: ["cardscanner9000", "token-print"],
      },
    },
  );
  throwOnUserErrors(data.draftOrderCreate);
  const draft = data.draftOrderCreate.draftOrder;
  if (!draft) throw new ShopifyApiError("Shopify did not return the checkout");
  return draft;
}

export type TokenDraftCheckV1 = {
  status: "OPEN" | "INVOICE_SENT" | "COMPLETED" | "MISSING";
  order: { id: string; name: string; financialStatus: string | null; cancelled: boolean } | null;
};

export async function checkTokenDraftV1(conn: Conn, draftOrderId: string): Promise<TokenDraftCheckV1> {
  const data = await gql<{
    draftOrder: {
      status: "OPEN" | "INVOICE_SENT" | "COMPLETED";
      order: { id: string; name: string; displayFinancialStatus: string | null; cancelledAt: string | null } | null;
    } | null;
  }>(
    conn,
    `query TokenDraft($id: ID!) {
      draftOrder(id: $id) { status order { id name displayFinancialStatus cancelledAt } }
    }`,
    { id: draftOrderId },
  );
  if (!data.draftOrder) return { status: "MISSING", order: null };
  const order = data.draftOrder.order;
  return {
    status: data.draftOrder.status,
    order: order
      ? { id: order.id, name: order.name, financialStatus: order.displayFinancialStatus, cancelled: Boolean(order.cancelledAt) }
      : null,
  };
}

/** Shipping details for staff, best effort: reading addresses needs Shopify's protected-data approval. */
export async function tokenOrderShippingSummaryV1(conn: Conn, orderId: string): Promise<string | null> {
  try {
    const data = await gql<{
      order: {
        shippingAddress: { name: string | null; address1: string | null; city: string | null; provinceCode: string | null; zip: string | null } | null;
        shippingLine: { title: string | null } | null;
      } | null;
    }>(
      conn,
      `query TokenOrderShip($id: ID!) {
        order(id: $id) { shippingAddress { name address1 city provinceCode zip } shippingLine { title } }
      }`,
      { id: orderId },
    );
    const o = data.order;
    if (!o) return null;
    const method = o.shippingLine?.title ?? null;
    const a = o.shippingAddress;
    const address = a ? [a.name, a.address1, [a.city, a.provinceCode, a.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ") : null;
    return [method, address].filter(Boolean).join(" · ") || null;
  } catch {
    return null;
  }
}

export function markTokenOrderPaidV1(
  order: TokenPrintOrderV1,
  paid: { shopifyOrderId: string; shopifyOrderName: string | null; eventId: string; shippingSummary?: string | null; by: string },
): TokenPrintOrderV1 | null {
  if (order.processedEvents.includes(paid.eventId)) return null;
  const at = new Date().toISOString();
  const alreadyPaid = order.paymentState === "paid";
  return {
    ...order,
    shopifyOrderId: paid.shopifyOrderId,
    shopifyOrderName: paid.shopifyOrderName ?? order.shopifyOrderName,
    shippingSummary: paid.shippingSummary ?? order.shippingSummary,
    paymentState: "paid",
    productionState: alreadyPaid ? order.productionState : order.productionState === "not_released" ? "paid" : order.productionState,
    paidAt: order.paidAt ?? at,
    processedEvents: [...order.processedEvents, paid.eventId].slice(-50),
    statusHistory: alreadyPaid ? order.statusHistory : [...order.statusHistory, { at, state: "paid", by: paid.by }],
  };
}

import {
  collectUserErrors,
  SHOPIFY_CURRENT_API_VERSION,
  ShopifyApiError,
  shopifyGraphql,
  type ShopifyGraphqlError,
} from "./client";

type Conn = { shopDomain: string; accessToken: string };

function gql<T>(conn: Conn, query: string, variables?: Record<string, unknown>) {
  return shopifyGraphql<T>(
    conn.shopDomain,
    conn.accessToken,
    query,
    variables,
    SHOPIFY_CURRENT_API_VERSION,
  );
}

function throwOnUserErrors(payload: Record<string, unknown> | undefined) {
  const errors = collectUserErrors(payload);
  if (errors.length) {
    throw new ShopifyApiError(errors.map((e) => e.message).join("; "), errors);
  }
}

function searchValue(value: string): string {
  return `"${value.replace(/["\\]/g, "")}"`;
}

/** Shopify only accepts E.164; anything we cannot normalise stays off the customer. */
export function toE164Phone(raw: string | undefined): string | undefined {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if ((raw ?? "").trim().startsWith("+") && digits.length >= 8) return `+${digits}`;
  return undefined;
}

export type PickupCustomerContact = {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
};

async function findCustomerId(conn: Conn, query: string): Promise<string | null> {
  const data = await gql<{ customers: { nodes: Array<{ id: string }> } }>(
    conn,
    `query FindCustomer($query: String!) {
      customers(first: 1, query: $query) { nodes { id } }
    }`,
    { query },
  );
  return data.customers.nodes[0]?.id ?? null;
}

/** Match by email, then phone; create the customer when Shopify has neither. */
export async function findOrCreateShopifyCustomer(
  conn: Conn,
  contact: PickupCustomerContact,
): Promise<string> {
  const email = contact.email?.trim().toLowerCase();
  const phone = toE164Phone(contact.phone);

  if (email) {
    const id = await findCustomerId(conn, `email:${searchValue(email)}`);
    if (id) return id;
  }
  if (phone) {
    const id = await findCustomerId(conn, `phone:${searchValue(phone)}`);
    if (id) return id;
  }

  const data = await gql<{
    customerCreate: {
      customer: { id: string } | null;
      userErrors: ShopifyGraphqlError[];
    };
  }>(
    conn,
    `mutation CreateCustomer($input: CustomerInput!) {
      customerCreate(input: $input) {
        customer { id }
        userErrors { field message }
      }
    }`,
    {
      input: {
        firstName: contact.firstName,
        lastName: contact.lastName,
        email: email || undefined,
        phone,
        tags: ["cardscanner9000"],
      },
    },
  );
  throwOnUserErrors(data.customerCreate);
  const id = data.customerCreate.customer?.id;
  if (!id) throw new ShopifyApiError("Shopify did not return the new customer");
  return id;
}

export type CreatedDraftOrder = {
  id: string;
  name: string;
  invoiceUrl?: string;
};

export async function createPickupDraftOrder(
  conn: Conn,
  input: {
    customerId?: string;
    email?: string;
    lines: Array<{ variantId: string; quantity: number }>;
    reserveUntil: string;
    note: string;
    tags: string[];
    /** A free fixed shipping line; the invoice checkout cannot swap it for shipping. */
    pickupShippingTitle?: string;
  },
): Promise<CreatedDraftOrder> {
  let shippingLine: Record<string, unknown> | undefined;
  if (input.pickupShippingTitle) {
    const shop = await gql<{ shop: { currencyCode: string } }>(conn, `query { shop { currencyCode } }`);
    shippingLine = {
      title: input.pickupShippingTitle,
      priceWithCurrency: { amount: "0.00", currencyCode: shop.shop.currencyCode },
    };
  }
  const data = await gql<{
    draftOrderCreate: {
      draftOrder: { id: string; name: string; invoiceUrl?: string } | null;
      userErrors: ShopifyGraphqlError[];
    };
  }>(
    conn,
    `mutation CreatePickupDraft($input: DraftOrderInput!) {
      draftOrderCreate(input: $input) {
        draftOrder { id name invoiceUrl }
        userErrors { field message }
      }
    }`,
    {
      input: {
        purchasingEntity: input.customerId
          ? { customerId: input.customerId }
          : undefined,
        email: input.customerId ? undefined : input.email,
        lineItems: input.lines.map((l) => ({
          variantId: l.variantId.startsWith("gid://")
            ? l.variantId
            : `gid://shopify/ProductVariant/${l.variantId}`,
          quantity: l.quantity,
        })),
        reserveInventoryUntil: input.reserveUntil,
        note: input.note,
        tags: input.tags,
        shippingLine,
      },
    },
  );
  throwOnUserErrors(data.draftOrderCreate);
  const draft = data.draftOrderCreate.draftOrder;
  if (!draft) throw new ShopifyApiError("Shopify did not return the draft order");
  return draft;
}

export type DraftOrderState = {
  status: "OPEN" | "INVOICE_SENT" | "COMPLETED" | "MISSING";
  order?: {
    id: string;
    lineItems: Array<{
      id: string;
      quantity: number;
      sku?: string | null;
      variantId?: string | null;
      price?: string | null;
    }>;
  };
};

export async function getDraftOrderState(
  conn: Conn,
  draftOrderId: string,
): Promise<DraftOrderState> {
  const data = await gql<{
    draftOrder: {
      status: "OPEN" | "INVOICE_SENT" | "COMPLETED";
      order: {
        id: string;
        lineItems: {
          nodes: Array<{
            id: string;
            quantity: number;
            sku: string | null;
            variant: { id: string } | null;
            originalUnitPriceSet: { shopMoney: { amount: string } } | null;
          }>;
        };
      } | null;
    } | null;
  }>(
    conn,
    `query PickupDraftState($id: ID!) {
      draftOrder(id: $id) {
        status
        order {
          id
          lineItems(first: 100) {
            nodes {
              id
              quantity
              sku
              variant { id }
              originalUnitPriceSet { shopMoney { amount } }
            }
          }
        }
      }
    }`,
    { id: draftOrderId },
  );

  const draft = data.draftOrder;
  if (!draft) return { status: "MISSING" };
  return {
    status: draft.status,
    order: draft.order
      ? {
          id: draft.order.id,
          lineItems: draft.order.lineItems.nodes.map((n) => ({
            id: n.id,
            quantity: n.quantity,
            sku: n.sku,
            variantId: n.variant?.id ?? null,
            price: n.originalUnitPriceSet?.shopMoney.amount ?? null,
          })),
        }
      : undefined,
  };
}

/** Deleting an open draft releases its inventory reservation. */
export async function deleteDraftOrder(conn: Conn, draftOrderId: string): Promise<void> {
  const data = await gql<{
    draftOrderDelete: {
      deletedId: string | null;
      userErrors: ShopifyGraphqlError[];
    };
  }>(
    conn,
    `mutation DeletePickupDraft($input: DraftOrderDeleteInput!) {
      draftOrderDelete(input: $input) {
        deletedId
        userErrors { field message }
      }
    }`,
    { input: { id: draftOrderId } },
  );
  throwOnUserErrors(data.draftOrderDelete);
}

import { shopifyGraphql } from "./client";

export const SHOPIFY_SOLD_DETECTION_WEBHOOK_TOPICS = {
  /** Primary — no protected customer data approval required. */
  inventoryLevelsUpdate: "INVENTORY_LEVELS_UPDATE",
  /** Optional — includes order price; requires protected customer data approval. */
  ordersPaid: "ORDERS_PAID",
} as const;

export type ShopifySoldDetectionWebhookTopic =
  (typeof SHOPIFY_SOLD_DETECTION_WEBHOOK_TOPICS)[keyof typeof SHOPIFY_SOLD_DETECTION_WEBHOOK_TOPICS];

export function shopifySoldDetectionWebhookUrl(appBaseUrl: string): string {
  const base = appBaseUrl.replace(/\/$/, "");
  return `${base}/api/shopify/webhooks/orders`;
}

/** @deprecated Use shopifySoldDetectionWebhookUrl */
export function shopifyOrdersWebhookUrl(appBaseUrl: string): string {
  return shopifySoldDetectionWebhookUrl(appBaseUrl);
}

function normalizeWebhookUrl(url: string): string {
  return url.trim().replace(/\/$/, "").toLowerCase();
}

type WebhookSubscriptionsQuery = {
  webhookSubscriptions: {
    edges: Array<{
      node: {
        id: string;
        topic: string;
        uri: string;
      };
    }>;
  };
};

type WebhookSubscriptionCreateResult = {
  webhookSubscriptionCreate: {
    webhookSubscription?: { id: string; uri?: string };
    userErrors: Array<{ field?: string[]; message: string }>;
  };
};

export type ShopifyWebhookEnsureResult = {
  webhookId: string;
  created: boolean;
  uri: string;
  topic: ShopifySoldDetectionWebhookTopic;
};

export async function listShopifyWebhooksForTopic(input: {
  shopDomain: string;
  accessToken: string;
  topic: ShopifySoldDetectionWebhookTopic;
}): Promise<Array<{ id: string; topic: string; uri: string }>> {
  const data = await shopifyGraphql<WebhookSubscriptionsQuery>(
    input.shopDomain,
    input.accessToken,
    `
      query webhookSubscriptions($topic: WebhookSubscriptionTopic!) {
        webhookSubscriptions(first: 25, topics: [$topic]) {
          edges {
            node {
              id
              topic
              uri
            }
          }
        }
      }
    `,
    { topic: input.topic },
  );

  return data.webhookSubscriptions.edges.map((edge) => edge.node);
}

export async function ensureShopifyWebhookSubscription(input: {
  shopDomain: string;
  accessToken: string;
  callbackUrl: string;
  topic: ShopifySoldDetectionWebhookTopic;
  existingWebhookId?: string;
}): Promise<ShopifyWebhookEnsureResult> {
  const targetUrl = normalizeWebhookUrl(input.callbackUrl);
  const existing = await listShopifyWebhooksForTopic({
    shopDomain: input.shopDomain,
    accessToken: input.accessToken,
    topic: input.topic,
  });

  const matched = existing.find(
    (hook) => normalizeWebhookUrl(hook.uri) === targetUrl,
  );
  if (matched) {
    return {
      webhookId: matched.id,
      created: false,
      uri: matched.uri,
      topic: input.topic,
    };
  }

  if (input.existingWebhookId) {
    const byId = existing.find((hook) => hook.id === input.existingWebhookId);
    if (byId) {
      return {
        webhookId: byId.id,
        created: false,
        uri: byId.uri,
        topic: input.topic,
      };
    }
  }

  const data = await shopifyGraphql<WebhookSubscriptionCreateResult>(
    input.shopDomain,
    input.accessToken,
    `
      mutation webhookSubscriptionCreate(
        $topic: WebhookSubscriptionTopic!
        $webhookSubscription: WebhookSubscriptionInput!
      ) {
        webhookSubscriptionCreate(
          topic: $topic
          webhookSubscription: $webhookSubscription
        ) {
          webhookSubscription { id uri }
          userErrors { field message }
        }
      }
    `,
    {
      topic: input.topic,
      webhookSubscription: {
        uri: input.callbackUrl,
        format: "JSON",
      },
    },
  );

  const result = data.webhookSubscriptionCreate;
  if (result.userErrors?.length) {
    const msg = result.userErrors.map((e) => e.message).join("; ");
    throw new Error(msg || "Failed to register Shopify webhook");
  }

  const webhookId = result.webhookSubscription?.id;
  if (!webhookId) {
    throw new Error("Shopify webhook registration returned no subscription id");
  }

  return {
    webhookId,
    created: true,
    uri: result.webhookSubscription?.uri ?? input.callbackUrl,
    topic: input.topic,
  };
}

export type ShopifySoldDetectionWebhookRegistration = {
  inventoryLevels: ShopifyWebhookEnsureResult;
  ordersPaid?: ShopifyWebhookEnsureResult;
  ordersPaidSkippedReason?: string;
};

/** Register sold-detection webhooks (inventory primary, orders optional). */
export async function ensureShopifySoldDetectionWebhooks(input: {
  shopDomain: string;
  accessToken: string;
  callbackUrl: string;
  existingInventoryLevelsWebhookId?: string;
  existingOrdersPaidWebhookId?: string;
  tryOrdersPaid?: boolean;
}): Promise<ShopifySoldDetectionWebhookRegistration> {
  const inventoryLevels = await ensureShopifyWebhookSubscription({
    shopDomain: input.shopDomain,
    accessToken: input.accessToken,
    callbackUrl: input.callbackUrl,
    topic: SHOPIFY_SOLD_DETECTION_WEBHOOK_TOPICS.inventoryLevelsUpdate,
    existingWebhookId: input.existingInventoryLevelsWebhookId,
  });

  let ordersPaid: ShopifyWebhookEnsureResult | undefined;
  let ordersPaidSkippedReason: string | undefined;

  if (input.tryOrdersPaid) {
    try {
      ordersPaid = await ensureShopifyWebhookSubscription({
        shopDomain: input.shopDomain,
        accessToken: input.accessToken,
        callbackUrl: input.callbackUrl,
        topic: SHOPIFY_SOLD_DETECTION_WEBHOOK_TOPICS.ordersPaid,
        existingWebhookId: input.existingOrdersPaidWebhookId,
      });
    } catch (err) {
      ordersPaidSkippedReason =
        err instanceof Error ? err.message : "orders/paid registration failed";
    }
  }

  return { inventoryLevels, ordersPaid, ordersPaidSkippedReason };
}

/** @deprecated Use ensureShopifySoldDetectionWebhooks */
export async function ensureShopifyOrdersPaidWebhook(input: {
  shopDomain: string;
  accessToken: string;
  callbackUrl: string;
  existingWebhookId?: string;
}): Promise<ShopifyWebhookEnsureResult> {
  return ensureShopifyWebhookSubscription({
    ...input,
    topic: SHOPIFY_SOLD_DETECTION_WEBHOOK_TOPICS.ordersPaid,
    existingWebhookId: input.existingWebhookId,
  });
}

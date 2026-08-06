import type { ShopifyLocation } from "./types";
import { normalizeShopDomain } from "./mask-token";
import { evaluateShopifyExportScopes } from "./shop-domain";

const API_VERSION = "2024-10";

export type ShopifyGraphqlError = {
  message: string;
  field?: string[];
};

export class ShopifyApiError extends Error {
  constructor(
    message: string,
    readonly userErrors: ShopifyGraphqlError[] = [],
  ) {
    super(message);
    this.name = "ShopifyApiError";
  }
}

export function formatShopifyApiErrorMessage(err: unknown): string {
  if (err instanceof ShopifyApiError) {
    if (err.userErrors.length) {
      const details = err.userErrors
        .map((e) =>
          e.field?.length
            ? `${e.field.join(".")}: ${e.message}`
            : e.message,
        )
        .join("; ");
      if (details) return details;
    }
    return err.message;
  }
  if (err instanceof Error) return err.message;
  return "Shopify export failed";
}

export async function shopifyGraphql<T>(
  shopDomain: string,
  accessToken: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const domain = normalizeShopDomain(shopDomain);
  const url = `https://${domain}/admin/api/${API_VERSION}/graphql.json`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ShopifyApiError(
      `Shopify API HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`,
    );
  }

  const json = (await res.json()) as {
    data?: T;
    errors?: Array<{ message: string }>;
  };

  if (json.errors?.length) {
    throw new ShopifyApiError(
      json.errors.map((e) => e.message).join("; "),
    );
  }

  if (!json.data) {
    throw new ShopifyApiError("Shopify API returned no data");
  }

  return json.data;
}

function collectUserErrors(
  payload: Record<string, unknown> | undefined,
): ShopifyGraphqlError[] {
  const errors = payload?.userErrors as ShopifyGraphqlError[] | undefined;
  return Array.isArray(errors) ? errors : [];
}

export async function testShopifyConnection(
  shopDomain: string,
  accessToken: string,
  oauthScope?: string,
): Promise<{
  shopName: string;
  domain: string;
  locations: ShopifyLocation[];
  canReadPublications: boolean;
  grantedScopes: string[];
  canWriteProducts: boolean;
  canReadLocations: boolean;
  canReadInventory: boolean;
  canReadOrders: boolean;
  missingScopes: string[];
  missingSoldDetectionScopes: string[];
}> {
  const data = await shopifyGraphql<{
    shop: { name: string; myshopifyDomain: string };
    locations: { nodes: Array<{ id: string; name: string; isActive: boolean }> };
    publications?: { nodes: Array<{ id: string; name: string }> };
    currentAppInstallation?: {
      accessScopes: Array<{ handle: string; description?: string }>;
    };
  }>(
    shopDomain,
    accessToken,
    `query TestConnection {
      shop { name myshopifyDomain }
      locations(first: 20) { nodes { id name isActive } }
      publications(first: 10) { nodes { id name } }
      currentAppInstallation {
        accessScopes { handle description }
      }
    }`,
  );

  const installationScopes =
    data.currentAppInstallation?.accessScopes?.map((s) => s.handle) ?? [];
  const oauthScopes = (oauthScope ?? "")
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const mergedScopes = [...new Set([...installationScopes, ...oauthScopes])];
  const scopeString = mergedScopes.length ? mergedScopes.join(",") : undefined;

  const scopeEval = evaluateShopifyExportScopes(scopeString);

  const grantedScopes = mergedScopes.length > 0 ? mergedScopes : scopeEval.grantedScopes;

  return {
    shopName: data.shop.name,
    domain: data.shop.myshopifyDomain,
    locations: data.locations.nodes.map((n) => ({
      id: n.id,
      name: n.name,
      isActive: n.isActive,
    })),
    canReadPublications: Boolean(data.publications?.nodes?.length),
    grantedScopes,
    canWriteProducts: scopeEval.canWriteProducts,
    canReadLocations:
      scopeEval.canReadLocations || data.locations.nodes.length > 0,
    canReadInventory: scopeEval.canReadInventory,
    canReadOrders: scopeEval.canReadOrders,
    missingScopes: scopeEval.missingScopes,
    missingSoldDetectionScopes: scopeEval.missingSoldDetectionScopes,
  };
}

export type CreatedShopifyProduct = {
  productId: string;
  variantId: string;
  inventoryItemId?: string;
  handle: string;
  adminUrl: string;
};

export async function createShopifyDraftProduct(input: {
  shopDomain: string;
  accessToken: string;
  title: string;
  descriptionHtml: string;
  vendor: string;
  productType: string;
  tags: string[];
  status: "DRAFT" | "ACTIVE";
  sku: string;
  price: string;
  quantity: number;
  locationId?: string;
  imageUrls: string[];
}): Promise<CreatedShopifyProduct> {
  const media = input.imageUrls.map((url) => ({
    originalSource: url,
    mediaContentType: "IMAGE" as const,
  }));

  // Shopify 2024-07+ removed `variants` from ProductCreateInput. Create the
  // product shell first, then update the auto-created default variant.
  const createData = await shopifyGraphql<{
    productCreate: {
      product?: {
        id: string;
        handle: string;
        variants: { nodes: Array<{ id: string; inventoryItem?: { id: string } }> };
      };
      userErrors: ShopifyGraphqlError[];
    };
  }>(
    input.shopDomain,
    input.accessToken,
    `mutation CreateProduct($product: ProductCreateInput!, $media: [CreateMediaInput!]) {
      productCreate(product: $product, media: $media) {
        product {
          id
          handle
          variants(first: 1) {
            nodes { id inventoryItem { id } }
          }
        }
        userErrors { field message }
      }
    }`,
    {
      product: {
        title: input.title,
        descriptionHtml: input.descriptionHtml,
        vendor: input.vendor,
        productType: input.productType,
        tags: input.tags,
        status: input.status,
      },
      media,
    },
  );

  const createResult = createData.productCreate;
  const createErrors = collectUserErrors(createResult);
  if (createErrors.length) {
    throw new ShopifyApiError(
      createErrors.map((e) => e.message).join("; "),
      createErrors,
    );
  }

  const product = createResult.product;
  const defaultVariant = product?.variants.nodes[0];
  if (!product?.id || !defaultVariant?.id) {
    throw new ShopifyApiError("Product created but missing IDs");
  }

  const updateData = await shopifyGraphql<{
    productVariantsBulkUpdate: {
      productVariants?: Array<{ id: string; inventoryItem?: { id: string } }>;
      userErrors: ShopifyGraphqlError[];
    };
  }>(
    input.shopDomain,
    input.accessToken,
    `mutation UpdateDefaultVariant($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        productVariants { id inventoryItem { id } }
        userErrors { field message }
      }
    }`,
    {
      productId: product.id,
      variants: [
        {
          id: defaultVariant.id,
          price: input.price,
          inventoryPolicy: "DENY",
          inventoryItem: { sku: input.sku, tracked: true },
        },
      ],
    },
  );

  const updateResult = updateData.productVariantsBulkUpdate;
  const updateErrors = collectUserErrors(updateResult);
  if (updateErrors.length) {
    throw new ShopifyApiError(
      updateErrors.map((e) => e.message).join("; "),
      updateErrors,
    );
  }

  const variant = updateResult.productVariants?.[0] ?? defaultVariant;
  const inventoryItemId =
    variant.inventoryItem?.id ?? defaultVariant.inventoryItem?.id;

  if (input.locationId && input.quantity > 0 && inventoryItemId) {
    const inventoryData = await shopifyGraphql<{
      inventorySetQuantities: {
        userErrors: ShopifyGraphqlError[];
      };
    }>(
      input.shopDomain,
      input.accessToken,
      `mutation SetInventory($input: InventorySetQuantitiesInput!) {
        inventorySetQuantities(input: $input) {
          userErrors { field message }
        }
      }`,
      {
        input: {
          name: "available",
          reason: "correction",
          referenceDocumentUri: `gid://cardscanner9000/InventoryExport/${product.id}`,
          ignoreCompareQuantity: true,
          quantities: [
            {
              inventoryItemId,
              locationId: input.locationId,
              quantity: input.quantity,
            },
          ],
        },
      },
    );

    const inventoryErrors = collectUserErrors(inventoryData.inventorySetQuantities);
    if (inventoryErrors.length) {
      throw new ShopifyApiError(
        inventoryErrors.map((e) => e.message).join("; "),
        inventoryErrors,
      );
    }
  }

  const domain = normalizeShopDomain(input.shopDomain);
  return {
    productId: product.id,
    variantId: variant.id,
    inventoryItemId,
    handle: product.handle,
    adminUrl: `https://${domain}/admin/products/${productIdNumeric(product.id)}`,
  };
}

function productIdNumeric(gid: string): string {
  const m = gid.match(/\/(\d+)$/);
  return m?.[1] ?? gid;
}

export async function publishShopifyProduct(input: {
  shopDomain: string;
  accessToken: string;
  productId: string;
  publicationIds: string[];
}): Promise<string[]> {
  if (!input.publicationIds.length) return [];

  const warnings: string[] = [];
  for (const publicationId of input.publicationIds) {
    try {
      const data = await shopifyGraphql<{
        publishablePublish: {
          userErrors: ShopifyGraphqlError[];
        };
      }>(
        input.shopDomain,
        input.accessToken,
        `mutation Publish($id: ID!, $input: [PublicationInput!]!) {
          publishablePublish(id: $id, input: $input) {
            userErrors { field message }
          }
        }`,
        {
          id: input.productId,
          input: [{ publicationId }],
        },
      );
      const errors = collectUserErrors(data.publishablePublish);
      if (errors.length) {
        warnings.push(errors.map((e) => e.message).join("; "));
      }
    } catch (err) {
      warnings.push(err instanceof Error ? err.message : "Publish failed");
    }
  }
  return warnings;
}

export async function listShopifyPublications(
  shopDomain: string,
  accessToken: string,
): Promise<Array<{ id: string; name: string }>> {
  const data = await shopifyGraphql<{
    publications: { nodes: Array<{ id: string; name: string }> };
  }>(
    shopDomain,
    accessToken,
    `query { publications(first: 20) { nodes { id name } } }`,
  );
  return data.publications.nodes;
}

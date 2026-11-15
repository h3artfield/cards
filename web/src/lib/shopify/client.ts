import type { ShopifyLocation } from "./types";
import { normalizeShopDomain } from "./mask-token";
import { evaluateShopifyExportScopes } from "./shop-domain";

const API_VERSION = "2024-10";
/**
 * For calls written against the current API. inventorySetQuantities needs
 * 2026-04+ (per-quantity `changeFromQuantity` and an `@idempotent` key).
 */
export const SHOPIFY_CURRENT_API_VERSION = "2026-10";

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
  apiVersion: string = API_VERSION,
): Promise<T> {
  const domain = normalizeShopDomain(shopDomain);
  const url = `https://${domain}/admin/api/${apiVersion}/graphql.json`;
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

export function collectUserErrors(
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

type CreateShopifyProductInput = {
  shopDomain: string;
  accessToken: string;
  title: string;
  descriptionHtml: string;
  vendor: string;
  productType: string;
  tags: string[];
  status: "DRAFT" | "ACTIVE";
  sku: string;
  /** What POS matches a scanned label against: the card's QR link. */
  barcode?: string;
  price: string;
  quantity: number;
  locationId?: string;
  imageUrls: string[];
};

type CreatedProductShell = { id: string; handle: string };
type CreatedVariantShell = { id: string; inventoryItem?: { id: string } };

/** Remove a product created by an export that could not be completed. */
export async function deleteShopifyProduct(input: {
  shopDomain: string;
  accessToken: string;
  productId: string;
}): Promise<void> {
  const data = await shopifyGraphql<{
    productDelete: { userErrors: ShopifyGraphqlError[] };
  }>(
    input.shopDomain,
    input.accessToken,
    `mutation DeleteProduct($input: ProductDeleteInput!) {
      productDelete(input: $input) {
        userErrors { field message }
      }
    }`,
    { input: { id: input.productId } },
  );

  const errors = collectUserErrors(data.productDelete);
  if (errors.length) {
    throw new ShopifyApiError(errors.map((e) => e.message).join("; "), errors);
  }
}

export async function createShopifyDraftProduct(
  input: CreateShopifyProductInput,
): Promise<CreatedShopifyProduct> {
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
    if (product?.id) await rollbackCreatedProduct(input, product.id);
    throw new ShopifyApiError("Product created but missing IDs");
  }

  try {
    return await configureCreatedProduct(input, product, defaultVariant);
  } catch (err) {
    // A half-configured product is unsellable, and since the inventory row stays
    // unlisted, a retry would create a duplicate rather than repair it.
    await rollbackCreatedProduct(input, product.id);
    throw err;
  }
}

async function rollbackCreatedProduct(
  input: CreateShopifyProductInput,
  productId: string,
): Promise<void> {
  await deleteShopifyProduct({
    shopDomain: input.shopDomain,
    accessToken: input.accessToken,
    productId,
  }).catch(() => undefined);
}

async function configureCreatedProduct(
  input: CreateShopifyProductInput,
  product: CreatedProductShell,
  defaultVariant: CreatedVariantShell,
): Promise<CreatedShopifyProduct> {
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
          ...(input.barcode ? { barcode: input.barcode } : {}),
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
    await setAvailableQuantity({
      shopDomain: input.shopDomain,
      accessToken: input.accessToken,
      inventoryItemId,
      locationId: input.locationId,
      quantity: input.quantity,
      reason: "correction",
      referenceDocumentUri: `gid://cardscanner9000/InventoryExport/${product.id}`,
    });
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

/** Set absolute available units for an existing Shopify inventory item. */
export async function setShopifyInventoryQuantity(input: {
  shopDomain: string;
  accessToken: string;
  inventoryItemId: string;
  locationId: string;
  quantity: number;
  reason?: string;
}): Promise<void> {
  await setAvailableQuantity({
    ...input,
    reason: input.reason ?? "correction",
    referenceDocumentUri: `gid://cardscanner9000/InventorySync/${input.inventoryItemId}`,
  });
}

/**
 * Absolute "available" write. `changeFromQuantity: null` opts out of Shopify's
 * compare-and-swap: our inventory is the source of truth for these units.
 */
async function setAvailableQuantity(input: {
  shopDomain: string;
  accessToken: string;
  inventoryItemId: string;
  locationId: string;
  quantity: number;
  reason: string;
  referenceDocumentUri: string;
}): Promise<void> {
  const data = await shopifyGraphql<{
    inventorySetQuantities: { userErrors: ShopifyGraphqlError[] };
  }>(
    input.shopDomain,
    input.accessToken,
    `mutation SetInventory($input: InventorySetQuantitiesInput!, $idempotencyKey: String!) {
      inventorySetQuantities(input: $input) @idempotent(key: $idempotencyKey) {
        userErrors { field message }
      }
    }`,
    {
      input: {
        name: "available",
        reason: input.reason,
        referenceDocumentUri: input.referenceDocumentUri,
        quantities: [
          {
            inventoryItemId: input.inventoryItemId,
            locationId: input.locationId,
            quantity: Math.max(0, Math.trunc(input.quantity)),
            changeFromQuantity: null,
          },
        ],
      },
      idempotencyKey: crypto.randomUUID(),
    },
    SHOPIFY_CURRENT_API_VERSION,
  );

  const errors = collectUserErrors(data.inventorySetQuantities);
  if (errors.length) {
    throw new ShopifyApiError(
      errors.map((e) => e.message).join("; "),
      errors,
    );
  }
}

export async function updateShopifyVariantPrice(input: {
  shopDomain: string;
  accessToken: string;
  productId: string;
  variantId: string;
  price: string;
  barcode?: string;
}): Promise<void> {
  const data = await shopifyGraphql<{
    productVariantsBulkUpdate: { userErrors: ShopifyGraphqlError[] };
  }>(
    input.shopDomain,
    input.accessToken,
    `mutation UpdateVariantPrice($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        userErrors { field message }
      }
    }`,
    {
      productId: input.productId,
      variants: [
        {
          id: input.variantId,
          price: input.price,
          ...(input.barcode ? { barcode: input.barcode } : {}),
        },
      ],
    },
  );

  const errors = collectUserErrors(data.productVariantsBulkUpdate);
  if (errors.length) {
    throw new ShopifyApiError(
      errors.map((e) => e.message).join("; "),
      errors,
    );
  }
}

/** Current barcode per variant id; ids Shopify no longer knows are absent. */
export async function getShopifyVariantBarcodes(input: {
  shopDomain: string;
  accessToken: string;
  variantIds: string[];
}): Promise<Map<string, string>> {
  const data = await shopifyGraphql<{
    nodes: Array<{ id?: string; barcode?: string | null } | null>;
  }>(
    input.shopDomain,
    input.accessToken,
    `query VariantBarcodes($ids: [ID!]!) {
      nodes(ids: $ids) {
        ... on ProductVariant { id barcode }
      }
    }`,
    { ids: input.variantIds },
  );
  const out = new Map<string, string>();
  for (const node of data.nodes) {
    if (node?.id) out.set(node.id, node.barcode ?? "");
  }
  return out;
}

export async function updateShopifyVariantBarcode(input: {
  shopDomain: string;
  accessToken: string;
  productId: string;
  variantId: string;
  barcode: string;
}): Promise<void> {
  const data = await shopifyGraphql<{
    productVariantsBulkUpdate: { userErrors: ShopifyGraphqlError[] };
  }>(
    input.shopDomain,
    input.accessToken,
    `mutation UpdateVariantBarcode($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        userErrors { field message }
      }
    }`,
    {
      productId: input.productId,
      variants: [{ id: input.variantId, barcode: input.barcode }],
    },
  );

  const errors = collectUserErrors(data.productVariantsBulkUpdate);
  if (errors.length) {
    throw new ShopifyApiError(
      errors.map((e) => e.message).join("; "),
      errors,
    );
  }
}

/**
 * Flip a listing in or out of the storefront. Sold-out rows go to DRAFT rather
 * than being archived or deleted, so a later restock only needs ACTIVE again
 * and keeps its product URL, images, and publication channels.
 */
export async function setShopifyProductStatus(input: {
  shopDomain: string;
  accessToken: string;
  productId: string;
  status: "ACTIVE" | "DRAFT";
}): Promise<void> {
  const data = await shopifyGraphql<{
    productUpdate: { userErrors: ShopifyGraphqlError[] };
  }>(
    input.shopDomain,
    input.accessToken,
    `mutation SetProductStatus($input: ProductInput!) {
      productUpdate(input: $input) {
        userErrors { field message }
      }
    }`,
    { input: { id: input.productId, status: input.status } },
  );

  const errors = collectUserErrors(data.productUpdate);
  if (errors.length) {
    throw new ShopifyApiError(errors.map((e) => e.message).join("; "), errors);
  }
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

/** Shopify POS only finds products published to this channel. */
export function isPointOfSalePublication(name: string): boolean {
  return /point of sale/i.test(name);
}

/** Status and POS availability per product; ids Shopify no longer knows are absent. */
export async function getShopifyProductSaleStates(input: {
  shopDomain: string;
  accessToken: string;
  productIds: string[];
  publicationId: string;
}): Promise<Map<string, { status: string; onPublication: boolean }>> {
  const data = await shopifyGraphql<{
    nodes: Array<{
      id?: string;
      status?: string;
      publishedOnPublication?: boolean;
    } | null>;
  }>(
    input.shopDomain,
    input.accessToken,
    `query ProductSaleStates($ids: [ID!]!, $pub: ID!) {
      nodes(ids: $ids) {
        ... on Product { id status publishedOnPublication(publicationId: $pub) }
      }
    }`,
    { ids: input.productIds, pub: input.publicationId },
  );
  const out = new Map<string, { status: string; onPublication: boolean }>();
  for (const node of data.nodes) {
    if (node?.id) {
      out.set(node.id, {
        status: node.status ?? "",
        onPublication: Boolean(node.publishedOnPublication),
      });
    }
  }
  return out;
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

import { shopifyGraphql } from "../shopify/client";
import type { ShopifyCatalogVariant } from "./types";

const PRODUCTS_QUERY = `query ShopifyImportProducts($cursor: String) {
  products(first: 50, after: $cursor, sortKey: UPDATED_AT, reverse: true) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id
      title
      handle
      vendor
      productType
      status
      featuredMedia {
        preview {
          image { url }
        }
      }
      variants(first: 100) {
        nodes {
          id
          title
          sku
          price
          inventoryQuantity
          inventoryItem { id }
          image { url }
        }
      }
    }
  }
}`;

type ProductsResponse = {
  products: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    nodes: Array<{
      id: string;
      title: string;
      handle: string;
      vendor?: string;
      productType?: string;
      status: string;
      featuredMedia?: { preview?: { image?: { url?: string } } };
      variants: {
        nodes: Array<{
          id: string;
          title: string;
          sku?: string;
          price: string;
          inventoryQuantity?: number;
          inventoryItem?: { id?: string };
          image?: { url?: string };
        }>;
      };
    }>;
  };
};

function variantDisplayName(productTitle: string, variantTitle: string): string {
  if (!variantTitle || variantTitle === "Default Title") return productTitle;
  return `${productTitle} — ${variantTitle}`;
}

export async function fetchShopifyCatalogVariants(input: {
  shopDomain: string;
  accessToken: string;
}): Promise<ShopifyCatalogVariant[]> {
  const variants: ShopifyCatalogVariant[] = [];
  let cursor: string | null = null;
  let pages = 0;

  while (pages < 40) {
    pages += 1;
    const data: ProductsResponse = await shopifyGraphql<ProductsResponse>(
      input.shopDomain,
      input.accessToken,
      PRODUCTS_QUERY,
      { cursor },
    );

    for (const product of data.products.nodes) {
      const productImage = product.featuredMedia?.preview?.image?.url;
      for (const variant of product.variants.nodes) {
        const price = Number.parseFloat(variant.price);
        variants.push({
          productId: product.id,
          productTitle: product.title,
          productHandle: product.handle,
          productVendor: product.vendor,
          productType: product.productType,
          productStatus: product.status,
          variantId: variant.id,
          variantTitle: variant.title,
          sku: variant.sku ?? undefined,
          price: Number.isFinite(price) ? price : 0,
          quantity: Math.max(0, variant.inventoryQuantity ?? 0),
          inventoryItemId: variant.inventoryItem?.id,
          imageUrl: variant.image?.url ?? productImage,
          shopifyVariantKey: variant.id,
        });
      }
    }

    if (!data.products.pageInfo.hasNextPage) break;
    cursor = data.products.pageInfo.endCursor;
    if (!cursor) break;
  }

  return variants;
}

export function shopifyVariantLabel(variant: ShopifyCatalogVariant): string {
  return variantDisplayName(variant.productTitle, variant.variantTitle);
}

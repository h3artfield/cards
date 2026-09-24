import type { InventoryItem, StoreSettings } from "../types";
import {
  createShopifyDraftProduct,
  formatShopifyApiErrorMessage,
  listShopifyPublications,
  publishShopifyProduct,
} from "./client";
import {
  buildCatalogDescriptionHtml,
  buildCatalogProductTitle,
  buildCatalogTags,
  catalogExportEligibility,
  catalogExportQuantity,
  catalogListingSku,
  catalogProductImageUrls,
  resolveCatalogExportPrice,
} from "./inventory-listing";
import { getAppBaseUrl } from "../stripe/config";
import { buildShopifyVendor } from "./product-builder";
import type { ShopifyIntegration, ShopifyProductStatus } from "./types";

export type CatalogExportResult = {
  inventoryItemId: string;
  displayName: string;
  ok: boolean;
  skippedReason?: string;
  error?: string;
  productId?: string;
  productAdminUrl?: string;
  quantity?: number;
  exportPrice?: number;
};

export async function exportInventoryItemToShopify(input: {
  item: InventoryItem;
  settings: StoreSettings;
  integration: ShopifyIntegration;
  accessToken: string;
  productStatus?: ShopifyProductStatus;
  /** Overrides the CSV-derived shelf price. */
  exportPrice?: number;
  exportedBy?: string;
  reexport?: boolean;
}): Promise<{ item?: InventoryItem; result: CatalogExportResult }> {
  const { item, integration } = input;
  const base: CatalogExportResult = {
    inventoryItemId: item.id,
    displayName: item.displayName,
    ok: false,
  };

  const eligibility = catalogExportEligibility(item, integration, {
    allowReexport: input.reexport,
  });
  if (!eligibility.eligible) {
    return {
      result: {
        ...base,
        skippedReason: eligibility.reason,
        error: eligibility.message,
      },
    };
  }

  const price =
    input.exportPrice != null && input.exportPrice > 0
      ? Math.round(input.exportPrice * 100) / 100
      : resolveCatalogExportPrice(item, integration);
  if (price == null || price <= 0) {
    return {
      result: {
        ...base,
        skippedReason: "missing_price",
        error: "No store price or market price on this row.",
      },
    };
  }

  const domain = integration.shopDomain;
  if (!input.accessToken || !domain) {
    return {
      result: {
        ...base,
        error: "Shopify credentials not configured",
      },
    };
  }

  const quantity = catalogExportQuantity(item);
  const status = input.productStatus ?? integration.defaultProductStatus;
  const sku = catalogListingSku(item);
  const now = new Date().toISOString();

  try {
    const created = await createShopifyDraftProduct({
      shopDomain: domain,
      accessToken: input.accessToken,
      title: buildCatalogProductTitle(item),
      descriptionHtml: buildCatalogDescriptionHtml(item),
      vendor: buildShopifyVendor(integration, input.settings.storeName),
      productType: integration.defaultProductType ?? "Trading Card",
      tags: buildCatalogTags(item, integration),
      status,
      sku,
      price: price.toFixed(2),
      quantity,
      locationId: integration.defaultLocationId,
      imageUrls: catalogProductImageUrls(item, {
        storeSlug: input.settings.storeSlug,
        appBaseUrl: getAppBaseUrl(),
      }),
    });

    let publishWarning: string | undefined;
    if (
      status === "ACTIVE" &&
      (integration.publishOnlineStore || integration.publishShopChannel)
    ) {
      try {
        const publications = await listShopifyPublications(
          domain,
          input.accessToken,
        );
        const targets = publications.filter((p) => {
          const name = p.name.toLowerCase();
          if (integration.publishOnlineStore && name.includes("online store")) {
            return true;
          }
          if (integration.publishShopChannel && name.includes("shop")) {
            return true;
          }
          return false;
        });
        const warnings = await publishShopifyProduct({
          shopDomain: domain,
          accessToken: input.accessToken,
          productId: created.productId,
          publicationIds: targets.map((t) => t.id),
        });
        if (warnings.length) publishWarning = warnings.join("; ");
      } catch (err) {
        publishWarning =
          err instanceof Error ? err.message : "Publish step failed";
      }
    }

    const updated: InventoryItem = {
      ...item,
      status: "listed",
      listedAt: now,
      shopifyListing: {
        sku,
        productId: created.productId,
        variantId: created.variantId,
        inventoryItemId: created.inventoryItemId ?? "",
        exportPrice: price,
        exportedAt: now,
        exportedBy: input.exportedBy,
        productAdminUrl: created.adminUrl,
        productOnlineUrl:
          status === "ACTIVE"
            ? `https://${domain.replace(".myshopify.com", "")}.com/products/${created.handle}`
            : undefined,
        syncedQuantity: integration.defaultLocationId ? quantity : undefined,
        syncedStatus: status === "ACTIVE" ? "ACTIVE" : "DRAFT",
        syncedAt: integration.defaultLocationId ? now : undefined,
        syncError: publishWarning,
      },
    };

    return {
      item: updated,
      result: {
        ...base,
        ok: true,
        productId: created.productId,
        productAdminUrl: created.adminUrl,
        quantity,
        exportPrice: price,
        error: publishWarning,
      },
    };
  } catch (err) {
    return {
      result: {
        ...base,
        error: formatShopifyApiErrorMessage(err),
        quantity,
        exportPrice: price,
      },
    };
  }
}

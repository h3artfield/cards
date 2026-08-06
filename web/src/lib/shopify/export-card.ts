import type { BuybackOrder, InventoryItem, ScannedCard, StoreSettings, StoreRule } from "../types";
import {
  createShopifyDraftProduct,
  formatShopifyApiErrorMessage,
  listShopifyPublications,
  publishShopifyProduct,
} from "./client";
import type {
  ShopifyExportCardInput,
  ShopifyExportCardResult,
  ShopifyExportStatus,
  ShopifyIntegration,
} from "./types";
import {
  buildShopifyDescriptionHtml,
  buildShopifyProductTitle,
  buildShopifyTags,
  buildShopifyVendor,
  resolveShopifyExportSku,
  shopifyProductImageUrls,
} from "./product-builder";
import {
  isShopifyAlreadyExported,
  shopifyExportEligibility,
  shopifyInventoryExportEligibility,
} from "./eligibility";

/** Drop stored Shopify export metadata so a new listing can be created. */
export function clearShopifyExportState(card: ScannedCard): ScannedCard {
  const { shopifyExport: _removed, ...rest } = card;
  return rest;
}

export async function exportCardToShopify(input: {
  card: ScannedCard;
  order: BuybackOrder;
  settings: StoreSettings;
  integration: ShopifyIntegration;
  accessToken: string;
  storeRules: StoreRule[];
  exportPrice: number;
  productStatus?: "DRAFT" | "ACTIVE";
  cardIndex: number;
  exportedBy?: string;
  inventoryOnly?: boolean;
  inventoryItem?: InventoryItem;
  reexport?: boolean;
}): Promise<{
  card: ScannedCard;
  inventoryItem?: InventoryItem;
  result: ShopifyExportCardResult;
}> {
  const { card, order, integration, settings } = input;
  const now = new Date().toISOString();
  let workingCard = input.reexport ? clearShopifyExportState(card) : card;

  const eligibility =
    input.inventoryOnly && input.inventoryItem
      ? shopifyInventoryExportEligibility(
          workingCard,
          input.inventoryItem,
          integration,
          { allowReexport: input.reexport },
        )
      : shopifyExportEligibility(
          workingCard,
          order,
          integration,
          input.storeRules,
        );
  if (!eligibility.eligible) {
    return {
      card: {
        ...workingCard,
        shopifyExport: {
          status: "skipped",
          error: eligibility.message,
          lastAttemptAt: now,
        },
      },
      result: {
        cardId: card.id,
        ok: false,
        status: "skipped",
        skippedReason: eligibility.reason,
        error: eligibility.message,
      },
    };
  }

  if (isShopifyAlreadyExported(workingCard)) {
    return {
      card: workingCard,
      result: {
        cardId: card.id,
        ok: false,
        status: "skipped",
        skippedReason: "already_exported",
        error: "Already exported to Shopify.",
      },
    };
  }

  if (!input.exportPrice || input.exportPrice <= 0) {
    return {
      card: {
        ...workingCard,
        shopifyExport: {
          status: "skipped",
          error: "Export price required",
          lastAttemptAt: now,
        },
      },
      result: {
        cardId: card.id,
        ok: false,
        status: "skipped",
        skippedReason: "missing_price",
        error: "Manual export price required.",
      },
    };
  }

  const token = input.accessToken;
  const domain = integration.shopDomain;
  if (!token || !domain) {
    return {
      card: {
        ...workingCard,
        shopifyExport: {
          status: "failed",
          error: "Shopify credentials not configured",
          lastAttemptAt: now,
        },
      },
      result: {
        cardId: card.id,
        ok: false,
        status: "failed",
        error: "Shopify credentials not configured",
      },
    };
  }

  const status = input.productStatus ?? integration.defaultProductStatus;
  const imageUrls = shopifyProductImageUrls(workingCard);
  if (!imageUrls.length) {
    return {
      card: {
        ...workingCard,
        shopifyExport: {
          status: "failed",
          error: "Card has no catalog reference image for Shopify listing",
          lastAttemptAt: now,
        },
      },
      result: {
        cardId: card.id,
        ok: false,
        status: "failed",
        error: "No catalog reference image — confirm printing in V2 first.",
      },
    };
  }

  try {
    const sku = resolveShopifyExportSku({
      inventoryItem: input.inventoryItem,
      order,
      card: workingCard,
      cardIndex: input.cardIndex,
    });

    const created = await createShopifyDraftProduct({
      shopDomain: domain,
      accessToken: token,
      title: buildShopifyProductTitle(workingCard, order),
      descriptionHtml: buildShopifyDescriptionHtml(workingCard, order),
      vendor: buildShopifyVendor(integration, settings.storeName),
      productType: integration.defaultProductType ?? "Trading Card",
      tags: buildShopifyTags(workingCard, order, integration),
      status,
      sku,
      price: input.exportPrice.toFixed(2),
      quantity: 1,
      locationId: integration.defaultLocationId,
      imageUrls,
    });

    let exportStatus: ShopifyExportStatus = "exported";
    let publishWarning: string | undefined;

    if (
      status === "ACTIVE" &&
      (integration.publishOnlineStore || integration.publishShopChannel)
    ) {
      try {
        const publications = await listShopifyPublications(domain, token);
        const targets = publications.filter((p) => {
          const n = p.name.toLowerCase();
          if (integration.publishOnlineStore && n.includes("online store")) {
            return true;
          }
          if (integration.publishShopChannel && n.includes("shop")) {
            return true;
          }
          return false;
        });
        const warnings = await publishShopifyProduct({
          shopDomain: domain,
          accessToken: token,
          productId: created.productId,
          publicationIds: targets.map((t) => t.id),
        });
        if (warnings.length) {
          exportStatus = "exported_with_publish_warning";
          publishWarning = warnings.join("; ");
        }
      } catch (err) {
        exportStatus = "exported_with_publish_warning";
        publishWarning =
          err instanceof Error ? err.message : "Publish step failed";
      }
    }

    const shopifyExport = {
      status: exportStatus as "exported" | "exported_with_publish_warning",
      productId: created.productId,
      variantId: created.variantId,
      inventoryItemId: created.inventoryItemId,
      sku,
      productAdminUrl: created.adminUrl,
      productOnlineUrl:
        status === "ACTIVE"
          ? `https://${domain.replace(".myshopify.com", "")}.com/products/${created.handle}`
          : undefined,
      exportedAt: now,
      exportedBy: input.exportedBy,
      exportPrice: input.exportPrice,
      productStatus: status,
      error: publishWarning,
      lastAttemptAt: now,
    };

    let updatedInventory: InventoryItem | undefined;
    if (input.inventoryItem) {
      updatedInventory = {
        ...input.inventoryItem,
        status: "listed",
        listedAt: now,
        shopifyListing: {
          sku,
          productId: created.productId,
          variantId: created.variantId,
          inventoryItemId: created.inventoryItemId ?? "",
          exportPrice: input.exportPrice,
          exportedAt: now,
          exportedBy: input.exportedBy,
          productAdminUrl: created.adminUrl,
          productOnlineUrl: shopifyExport.productOnlineUrl,
        },
      };
    }

    return {
      card: { ...workingCard, shopifyExport },
      inventoryItem: updatedInventory,
      result: {
        cardId: card.id,
        ok: true,
        status: shopifyExport.status,
        productId: created.productId,
        productAdminUrl: created.adminUrl,
        error: publishWarning,
      },
    };
  } catch (err) {
    const message = formatShopifyApiErrorMessage(err);

    return {
      card: {
        ...workingCard,
        shopifyExport: {
          status: "failed",
          error: message,
          lastAttemptAt: now,
          exportPrice: input.exportPrice,
          productStatus: status,
        },
      },
      result: {
        cardId: card.id,
        ok: false,
        status: "failed",
        error: message,
      },
    };
  }
}

export async function exportCardsToShopify(input: {
  cards: ScannedCard[];
  order: BuybackOrder;
  settings: StoreSettings;
  integration: ShopifyIntegration;
  accessToken: string;
  storeRules: StoreRule[];
  items: ShopifyExportCardInput[];
  exportedBy?: string;
}): Promise<{
  results: ShopifyExportCardResult[];
  updatedCards: ScannedCard[];
}> {
  const cardById = new Map(input.cards.map((c) => [c.id, c]));
  const results: ShopifyExportCardResult[] = [];
  const updatedCards: ScannedCard[] = [];

  for (let i = 0; i < input.items.length; i++) {
    const item = input.items[i]!;
    const card = cardById.get(item.cardId);
    if (!card) {
      results.push({
        cardId: item.cardId,
        ok: false,
        status: "skipped",
        error: "Card not found",
      });
      continue;
    }

    const cardIndex = input.cards.findIndex((c) => c.id === card.id);
    const out = await exportCardToShopify({
      card,
      order: input.order,
      settings: input.settings,
      integration: input.integration,
      accessToken: input.accessToken,
      storeRules: input.storeRules,
      exportPrice: item.exportPrice,
      productStatus: item.productStatus,
      cardIndex: cardIndex >= 0 ? cardIndex : i,
      exportedBy: input.exportedBy,
    });
    updatedCards.push(out.card);
    results.push(out.result);
  }

  return { results, updatedCards };
}

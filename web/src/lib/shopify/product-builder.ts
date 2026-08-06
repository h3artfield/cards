import type { BuybackOrder, InventoryItem, ScannedCard } from "../types";
import { resolveClerkDisplayOffers } from "../card-flow-v2/clerk-card-insights";
import { referenceImagesFromSuspect } from "../card-flow-v2/suspect-reference-image";
import { cardDisplayName } from "../processing/card-display-name";
import { isStaffPrintingConfirmationSettled } from "../processing/clerk-visual-review-state";
import { getStaffSelectedSuspect } from "../card-flow-v2/staff-suspect-selection";
import type { ShopifyIntegration as ShopifyIntegrationConfig } from "./types";
import { requiresManualShopifyPrice } from "./eligibility";

/** Store-facing condition for Shopify — no pregrade scan grades in title/description. */
export function formatShopifyStoreCondition(
  card: ScannedCard,
): string | undefined {
  const cond = card.conditionOverride?.condition ?? card.conditionEstimate;
  if (!cond) return undefined;
  if (card.itemType === "graded" && card.slabCompany) {
    const grade = card.slabGrade?.trim();
    return grade ? `${card.slabCompany} ${grade}` : card.slabCompany;
  }
  return cond;
}

/** Authoritative resale market for Shopify — matches clerk / V2 preview when available. */
export function resolveShopifyListingMarketPrice(
  card: ScannedCard,
): number | undefined {
  const versionConfirmed = isStaffPrintingConfirmationSettled(card);
  const clerk = resolveClerkDisplayOffers({
    card,
    offerPreview: card.cardFlowV2OfferPreview,
    versionConfirmed,
  });
  if (clerk.market != null && clerk.market > 0) return clerk.market;

  const preview =
    card.cardFlowV2OfferPreview?.previewMarketValue ??
    card.cardFlowV2OfferPreview?.marketDecision?.marketValue;
  if (preview != null && preview > 0) return preview;

  if (card.marketPrice != null && card.marketPrice > 0) return card.marketPrice;
  return undefined;
}

export function resolveDefaultShopifyExportPrice(
  card: ScannedCard,
  integration: ShopifyIntegrationConfig,
): { price: number | null; requiresManual: boolean } {
  const requiresManual =
    integration.priceStrategy === "manual" ||
    requiresManualShopifyPrice(card);

  const market = resolveShopifyListingMarketPrice(card) ?? 0;
  if (requiresManual && market <= 0) {
    return { price: null, requiresManual: true };
  }

  let price = market;
  if (integration.priceStrategy === "marketPlusMarkup") {
    const pct = integration.markupPercent ?? 0;
    price = market * (1 + pct / 100);
  }

  if (price <= 0) {
    return { price: null, requiresManual: true };
  }

  return {
    price: Math.round(price * 100) / 100,
    requiresManual: requiresManual && integration.priceStrategy === "manual",
  };
}

function categoryLabel(category?: string): string {
  switch (category) {
    case "magic":
      return "Magic: The Gathering";
    case "pokemon":
      return "Pokémon";
    case "yugioh":
      return "Yu-Gi-Oh!";
    case "sports":
      return "Sports";
    default:
      return category ?? "Trading Card";
  }
}

function finishLabel(card: ScannedCard): string | undefined {
  const suspect = card.cardFlowV2Identity
    ? getStaffSelectedSuspect(card.cardFlowV2Identity)
    : undefined;
  const finish = suspect?.finish ?? card.variant;
  return finish?.replace(/_/g, " ");
}

export function buildShopifyProductTitle(
  card: ScannedCard,
  order: BuybackOrder,
): string {
  const name = cardDisplayName(card);
  const set = card.setName?.trim();
  const num = card.cardNumber?.trim();
  const condition =
    formatShopifyStoreCondition(card) ?? card.conditionEstimate ?? "NM";
  const language = card.cardFlowV2Identity
    ? getStaffSelectedSuspect(card.cardFlowV2Identity)?.language
    : undefined;

  const setPart = [set, num ? `#${num}` : undefined].filter(Boolean).join(" ");
  const parts = [name];
  if (setPart) parts.push(setPart);
  if (language && language !== "en") parts.push(language.toUpperCase());
  parts.push(condition);
  return parts.join(" — ");
}

export function buildShopifySku(
  order: BuybackOrder,
  card: ScannedCard,
  cardIndex: number,
): string {
  const orderToken = order.orderNumber.replace(/[^A-Za-z0-9-]/g, "");
  const seq = String(cardIndex + 1).padStart(3, "0");
  const shortId = card.id.replace(/-/g, "").slice(0, 6).toUpperCase();
  return `CS9K-${orderToken}-${seq}-${shortId}`;
}

/** Canonical SKU tied to inventory item id (preferred for new listings). */
export function buildShopifySkuForInventory(inventoryItemId: string): string {
  const token = inventoryItemId.replace(/-/g, "").toUpperCase();
  return `CS9K-${token}`;
}

const INVENTORY_SKU_RE = /^CS9K-([A-F0-9]{32})$/i;
const LEGACY_SKU_RE = /^CS9K-(.+)-([A-F0-9]{6})$/i;

/** Reconstruct UUID from 32 hex chars. */
export function inventoryIdFromSkuToken(token: string): string | null {
  const hex = token.replace(/-/g, "").toUpperCase();
  if (!/^[A-F0-9]{32}$/.test(hex)) return null;
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-").toLowerCase();
}

export type ParsedShopifySku =
  | { kind: "inventory"; inventoryItemId: string }
  | { kind: "legacy"; cardIdPrefix: string };

/** Parse CS9K SKU from a Shopify order line item. */
export function parseShopifySku(sku: string): ParsedShopifySku | null {
  const trimmed = sku.trim();
  if (!trimmed.startsWith("CS9K-")) return null;

  const inventoryMatch = trimmed.match(INVENTORY_SKU_RE);
  if (inventoryMatch) {
    const inventoryItemId = inventoryIdFromSkuToken(inventoryMatch[1]!);
    if (inventoryItemId) {
      return { kind: "inventory", inventoryItemId };
    }
  }

  const legacyMatch = trimmed.match(LEGACY_SKU_RE);
  if (legacyMatch) {
    return { kind: "legacy", cardIdPrefix: legacyMatch[2]!.toUpperCase() };
  }

  return null;
}

/** Resolve SKU for export — inventory-based when item is known. */
export function resolveShopifyExportSku(input: {
  inventoryItem?: InventoryItem;
  order: BuybackOrder;
  card: ScannedCard;
  cardIndex: number;
}): string {
  if (input.inventoryItem?.id) {
    return buildShopifySkuForInventory(input.inventoryItem.id);
  }
  return buildShopifySku(input.order, input.card, input.cardIndex);
}

export function buildShopifyTags(
  card: ScannedCard,
  order: BuybackOrder,
  integration: ShopifyIntegrationConfig,
): string[] {
  const tags = new Set<string>(integration.defaultTags ?? []);
  tags.add("cardscanner9000");
  tags.add("buyback");
  tags.add("single");
  if (order.orderNumber) tags.add(order.orderNumber.toLowerCase());

  const cat = card.category;
  if (cat === "pokemon") tags.add("pokemon");
  if (cat === "magic") tags.add("magic").add("mtg");
  if (cat === "yugioh") tags.add("yugioh");
  if (cat === "sports") tags.add("sports");

  const cond = card.conditionOverride?.condition ?? card.conditionEstimate;
  if (cond) tags.add(cond.toLowerCase());

  const suspect = card.cardFlowV2Identity
    ? getStaffSelectedSuspect(card.cardFlowV2Identity)
    : undefined;
  if (suspect?.language) tags.add(suspect.language.toLowerCase());
  if (suspect?.setCode) tags.add(suspect.setCode.toLowerCase());
  const finish = finishLabel(card);
  if (finish) tags.add(finish.toLowerCase().replace(/\s+/g, "-"));

  return [...tags].slice(0, 250);
}

export function buildShopifyDescriptionHtml(
  card: ScannedCard,
  order: BuybackOrder,
): string {
  const name = cardDisplayName(card);
  const suspect = card.cardFlowV2Identity
    ? getStaffSelectedSuspect(card.cardFlowV2Identity)
    : undefined;
  const shopifyCondition = formatShopifyStoreCondition(card);
  const lines = [
    `<p><strong>${escapeHtml(name)}</strong></p>`,
    "<ul>",
    `<li>Game: ${escapeHtml(categoryLabel(card.category))}</li>`,
    card.setName ? `<li>Set: ${escapeHtml(card.setName)}</li>` : "",
    card.cardNumber ? `<li>Number: ${escapeHtml(card.cardNumber)}</li>` : "",
    suspect?.rarity ? `<li>Rarity: ${escapeHtml(suspect.rarity)}</li>` : "",
    finishLabel(card)
      ? `<li>Finish: ${escapeHtml(finishLabel(card)!)}</li>`
      : "",
    suspect?.language
      ? `<li>Language: ${escapeHtml(suspect.language)}</li>`
      : "",
    shopifyCondition
      ? `<li>Condition: ${escapeHtml(shopifyCondition)}</li>`
      : "",
    card.itemType === "graded" && card.slabCompany
      ? `<li>Grade: ${escapeHtml(`${card.slabCompany} ${card.slabGrade ?? ""}`.trim())}</li>`
      : "",
    "</ul>",
    "<p><em>Condition and final inventory details are verified by store staff.</em></p>",
  ].filter(Boolean);
  return lines.join("\n");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function shopifyProductImageUrls(card: ScannedCard): string[] {
  const identity = card.cardFlowV2Identity;
  if (identity?.suspects?.length) {
    const suspect =
      getStaffSelectedSuspect(identity) ??
      identity.suspects.find(
        (s) => referenceImagesFromSuspect(s).hasReferenceImage,
      );
    if (suspect) {
      const refs = referenceImagesFromSuspect(suspect);
      if (refs.referenceImageUrl) {
        return [refs.referenceImageUrl];
      }
    }
  }
  return [];
}

export function buildShopifyVendor(
  integration: ShopifyIntegrationConfig,
  storeName: string,
): string {
  return integration.defaultVendor?.trim() || storeName;
}

// Re-export type alias fix - BuybackOrder import uses types from ../types
// ShopifyIntegration in product-builder refers to ShopifyIntegrationConfig from ./types

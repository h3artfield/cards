import type { BuybackOrder, InventoryItem, ScannedCard, StoreRule } from "../types";
import type { ShopifyCardExport, ShopifyIntegration } from "./types";
import { resolveCardClerkReviewContext } from "../processing/card-buy-decision";
import { isStaffPrintingConfirmationSettled } from "../processing/clerk-visual-review-state";
import { isInventorySold } from "./inventory-status";

export type ShopifyEligibilityReason =
  | "eligible"
  | "integration_disabled"
  | "not_accepted"
  | "do_not_buy"
  | "pending_review"
  | "staff_confirmation_required"
  | "already_exported"
  | "order_cancelled"
  | "missing_price"
  | "not_on_hand"
  | "card_missing"
  | "sold";

export function isShopifyAlreadyExported(card: ScannedCard): boolean {
  const exp = card.shopifyExport;
  return Boolean(
    exp?.productId ||
      exp?.status === "exported" ||
      exp?.status === "exported_with_publish_warning",
  );
}

export function shopifyExportEligibility(
  card: ScannedCard,
  order: BuybackOrder,
  integration: ShopifyIntegration | undefined,
  storeRules: StoreRule[] = [],
): { eligible: boolean; reason: ShopifyEligibilityReason; message: string } {
  if (!integration?.enabled) {
    return {
      eligible: false,
      reason: "integration_disabled",
      message: "Shopify integration is not enabled.",
    };
  }

  if (order.status === "cancelled") {
    return {
      eligible: false,
      reason: "order_cancelled",
      message: "Order is cancelled.",
    };
  }

  if (isShopifyAlreadyExported(card)) {
    return {
      eligible: false,
      reason: "already_exported",
      message: "Already exported to Shopify.",
    };
  }

  if (card.status === "do_not_buy" || card.staffDecision === "no") {
    return {
      eligible: false,
      reason: "do_not_buy",
      message: "Card marked do not buy.",
    };
  }

  const clerk = resolveCardClerkReviewContext(card, storeRules);
  if (clerk.decision !== "yes") {
    return {
      eligible: false,
      reason: clerk.decision === "pending" ? "pending_review" : "not_accepted",
      message:
        clerk.decision === "pending"
          ? "Card still pending review."
          : "Card not accepted for buyback.",
    };
  }

  if (
    integration.requireStaffConfirmedOnly &&
    card.cardFlowV2Identity &&
    !isStaffPrintingConfirmationSettled(card)
  ) {
    return {
      eligible: false,
      reason: "staff_confirmation_required",
      message: "Staff must confirm printing before Shopify export.",
    };
  }

  return {
    eligible: true,
    reason: "eligible",
    message: "Eligible for Shopify export.",
  };
}

export function shopifyExportStatusLabel(
  exp: ShopifyCardExport | undefined,
): string {
  if (!exp?.status || exp.status === "not_exported") return "Not exported";
  switch (exp.status) {
    case "queued":
      return "Queued";
    case "exported":
      return "Exported to Shopify";
    case "exported_with_publish_warning":
      return "Exported (publish warning)";
    case "failed":
      return "Export failed";
    case "skipped":
      return "Skipped";
    default:
      return exp.status;
  }
}

export type ShopifyExportStatusTone =
  | "neutral"
  | "success"
  | "warning"
  | "error";

/** Label + optional error detail for inventory and order export UIs. */
export function shopifyExportStatusDisplay(
  exp: ShopifyCardExport | undefined,
): {
  label: string;
  error?: string;
  lastAttemptAt?: string;
  tone: ShopifyExportStatusTone;
} {
  const label = shopifyExportStatusLabel(exp);
  if (!exp?.status || exp.status === "not_exported") {
    return { label, tone: "neutral" };
  }

  switch (exp.status) {
    case "exported":
      return { label, tone: "success", lastAttemptAt: exp.exportedAt };
    case "exported_with_publish_warning":
      return {
        label,
        error: exp.error,
        tone: "warning",
        lastAttemptAt: exp.exportedAt ?? exp.lastAttemptAt,
      };
    case "failed":
      return {
        label,
        error: exp.error ?? "No error detail was saved. Try exporting again.",
        tone: "error",
        lastAttemptAt: exp.lastAttemptAt,
      };
    case "skipped":
      return {
        label,
        error: exp.error,
        tone: "warning",
        lastAttemptAt: exp.lastAttemptAt,
      };
    default:
      return {
        label,
        error: exp.error,
        tone: "neutral",
        lastAttemptAt: exp.lastAttemptAt,
      };
  }
}

export function requiresManualShopifyPrice(card: ScannedCard): boolean {
  const preview = card.cardFlowV2OfferPreview;
  if (
    preview?.recommendedAction === "manual_price_required" ||
    preview?.recommendedAction === "identity_confirmation_required" ||
    preview?.recommendedAction === "staff_review_required" ||
    preview?.recommendedAction === "insufficient_market_data"
  ) {
    return true;
  }
  if (card.status === "manual_review" && card.staffDecision !== "yes") {
    return true;
  }
  return false;
}

/** Inventory page — only purchased on-hand stock may be exported to Shopify. */
export function shopifyInventoryExportEligibility(
  card: ScannedCard | null | undefined,
  inventoryItem: InventoryItem,
  integration: ShopifyIntegration | undefined,
  options?: { allowReexport?: boolean },
): { eligible: boolean; reason: ShopifyEligibilityReason; message: string } {
  if (!integration?.enabled) {
    return {
      eligible: false,
      reason: "integration_disabled",
      message: "Shopify integration is not enabled.",
    };
  }

  if (!inventoryItem?.id || !inventoryItem.cardId) {
    return {
      eligible: false,
      reason: "not_on_hand",
      message: "Not in store inventory.",
    };
  }

  if (isInventorySold(inventoryItem)) {
    return {
      eligible: false,
      reason: "sold",
      message: "Card already sold — cannot export again.",
    };
  }

  if (!card) {
    return {
      eligible: false,
      reason: "card_missing",
      message: "Source card record missing.",
    };
  }

  if (isShopifyAlreadyExported(card) && !options?.allowReexport) {
    return {
      eligible: false,
      reason: "already_exported",
      message: "Already exported to Shopify — use Export again if the listing was removed.",
    };
  }

  if (
    integration.requireStaffConfirmedOnly &&
    card.cardFlowV2Identity &&
    !isStaffPrintingConfirmationSettled(card)
  ) {
    return {
      eligible: false,
      reason: "staff_confirmation_required",
      message: "Staff must confirm printing before Shopify export.",
    };
  }

  return {
    eligible: true,
    reason: "eligible",
    message: options?.allowReexport
      ? "Ready to create a new Shopify listing."
      : "On hand — ready for Shopify export.",
  };
}

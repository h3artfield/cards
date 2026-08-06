import type { InventoryItem } from "../types";

/** Terminal identity outcome set during manual review or enrichment. */
export type InventoryLinkOutcome =
  | "confirmed_printing"
  | "confirmed_oracle_only"
  | "token_product"
  | "composite_product"
  | "non_card_product"
  | "identity_conflict"
  | "unresolved";

export type CompositeProductIdentityType =
  | "double_sided_token"
  | "paired_card_product"
  | "composite";

export interface CompositeInventoryIdentity {
  listingId: string;
  componentPrintingIds: string[];
  componentOracleIds: string[];
  productIdentityType: CompositeProductIdentityType;
}

export interface InventoryIdentityDecisionAudit {
  previousOracleId?: string;
  previousScryfallId?: string;
  selectedOracleId?: string;
  selectedScryfallId?: string;
  outcome: InventoryLinkOutcome;
  decisionMethod:
    | "set_search"
    | "tcgplayer_id"
    | "manual"
    | "token_classification"
    | "composite_classification"
    | "non_card_classification"
    | "conflict_detected"
    | "unresolved";
  reviewer: string;
  decidedAt: string;
  supportingEvidence: string[];
  compositeIdentity?: CompositeInventoryIdentity;
}

const TOKEN_NAME =
  /\btoken\b|\btokens\b|\bfood token\b|\btreasure token\b|\bclue token\b|\bblood token\b/i;
const DOUBLE_SIDED_TOKEN = /\s\/\/\s|\bdouble[- ]sided token\b/i;
const COMPOSITE_NAME = /\s-\s|\bpaired with\b|\bsurge foil\)\s*$/i;
const SECRET_LAIR_CROSSOVER =
  /recyclops|slash clone|eco-friendly|rainbow foil\)/i;

function normalizedBlob(item: InventoryItem): string {
  return `${item.productName ?? ""} ${item.displayName ?? ""}`.toLowerCase();
}

/** Detect token, composite, or non-card product before card lookup. */
export function classifyProductIdentityForReview(item: InventoryItem): {
  outcome: InventoryLinkOutcome | "pending_card_lookup";
  productIdentityType?: CompositeProductIdentityType;
  evidence: string[];
} {
  const blob = normalizedBlob(item);
  const name =
    item.productName?.trim() ||
    item.displayName.split(" — ")[0]?.trim() ||
    "";

  if (DOUBLE_SIDED_TOKEN.test(name) || DOUBLE_SIDED_TOKEN.test(blob)) {
    return {
      outcome: "composite_product",
      productIdentityType: "double_sided_token",
      evidence: ["Name contains // or double-sided token marker"],
    };
  }

  if (TOKEN_NAME.test(name) || TOKEN_NAME.test(blob)) {
    return {
      outcome: "token_product",
      evidence: ["Product name indicates token"],
    };
  }

  if (
    COMPOSITE_NAME.test(name) ||
    SECRET_LAIR_CROSSOVER.test(name) ||
    SECRET_LAIR_CROSSOVER.test(blob)
  ) {
    return {
      outcome: "composite_product",
      productIdentityType: name.includes(" - ")
        ? "paired_card_product"
        : "composite",
      evidence: ["Composite or crossover Secret Lair product name"],
    };
  }

  return { outcome: "pending_card_lookup", evidence: [] };
}

export function detectSetCollectorConflict(
  item: InventoryItem,
  catalog: { setName?: string; set?: string; collectorNumber: string },
): { conflict: boolean; evidence: string[] } {
  const evidence: string[] = [];
  if (!item.setName?.trim() || !item.cardNumber?.trim()) {
    return { conflict: false, evidence };
  }

  const invSet = item.setName.trim().toLowerCase();
  const invCn = item.cardNumber.trim().toLowerCase();
  const catSet = (catalog.setName ?? catalog.set ?? "").trim().toLowerCase();
  const catCn = catalog.collectorNumber.trim().toLowerCase();

  const setMismatch =
    catSet.length > 0 &&
    !invSet.includes(catSet) &&
    !catSet.includes(invSet) &&
    invSet !== catSet;
  const cnMismatch = invCn !== catCn && invCn.replace(/^0+/, "") !== catCn.replace(/^0+/, "");

  if (setMismatch) {
    evidence.push(
      `Inventory set "${item.setName}" differs from catalog set "${catalog.setName ?? catalog.set}"`,
    );
  }
  if (cnMismatch) {
    evidence.push(
      `Inventory collector #${item.cardNumber} differs from catalog #${catalog.collectorNumber}`,
    );
  }

  return { conflict: setMismatch || cnMismatch, evidence };
}

export function parseCompositeComponentNames(productName: string): string[] {
  const base = productName.split(" — ")[0]?.trim() ?? productName;
  if (base.includes(" // ")) {
    return base
      .replace(/\([^)]*\)/g, "")
      .split(" // ")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (base.includes(" - ")) {
    return base
      .replace(/\([^)]*\)/g, "")
      .split(" - ")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

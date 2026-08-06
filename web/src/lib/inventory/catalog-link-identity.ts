import type { InventoryItem } from "../types";
import {
  isEnrichableMagicSingle,
  isInventoryCatalogSkipped,
  isInventoryCatalogUnresolved,
  isMagicInventoryItem,
} from "./magic-items";
import { inventoryQuantityAvailable } from "./status";

/** Mutually exclusive inventory catalog link status for audit reporting. */
export type InventoryLinkCategory =
  | "fully_linked"
  | "oracle_only_linked"
  | "printing_only_linked"
  | "manual_review_candidate"
  | "ambiguous"
  | "conflict"
  | "unresolved"
  | "excluded_non_card_product"
  | "invalid_inventory_row"
  | "other";

export type InventoryIdentityExclusionReason =
  | "manual_review"
  | "ambiguous"
  | "conflict"
  | "unresolved"
  | "oracle_only"
  | "printing_only"
  | "not_fully_linked"
  | "zero_quantity"
  | "excluded_non_card"
  | "invalid_row";

export interface InventoryLinkClassification {
  category: InventoryLinkCategory;
  clerkEligible: boolean;
  exclusionReason?: InventoryIdentityExclusionReason;
}

const DETERMINISTIC_METHODS = new Set([
  "tcgplayer_id",
  "set_search",
  "manual",
]);

function hasOracleId(item: InventoryItem): boolean {
  return Boolean(item.catalogOracleId?.trim());
}

function hasPrintingId(item: InventoryItem): boolean {
  return Boolean(item.catalogScryfallId?.trim());
}

function isFullyLinkedDeterministic(item: InventoryItem): boolean {
  return (
    hasOracleId(item) &&
    hasPrintingId(item) &&
    DETERMINISTIC_METHODS.has(item.catalogMatchMethod ?? "")
  );
}

/** Classify a Magic inventory row into exactly one audit category. */
export function classifyInventoryLinkStatus(
  item: InventoryItem,
): InventoryLinkClassification {
  if (!isMagicInventoryItem(item)) {
    return {
      category: "other",
      clerkEligible: false,
      exclusionReason: "invalid_row",
    };
  }

  if (!item.id?.trim()) {
    return {
      category: "invalid_inventory_row",
      clerkEligible: false,
      exclusionReason: "invalid_row",
    };
  }

  if (!isEnrichableMagicSingle(item)) {
    return {
      category: "excluded_non_card_product",
      clerkEligible: false,
      exclusionReason: "excluded_non_card",
    };
  }

  if (isInventoryCatalogSkipped(item)) {
    return {
      category: "excluded_non_card_product",
      clerkEligible: false,
      exclusionReason: "excluded_non_card",
    };
  }

  if (isFullyLinkedDeterministic(item)) {
    return { category: "fully_linked", clerkEligible: true };
  }

  if (hasOracleId(item) && !hasPrintingId(item)) {
    return {
      category: "oracle_only_linked",
      clerkEligible: false,
      exclusionReason: "oracle_only",
    };
  }

  if (hasPrintingId(item) && !hasOracleId(item)) {
    return {
      category: "printing_only_linked",
      clerkEligible: false,
      exclusionReason: "printing_only",
    };
  }

  const method = item.catalogMatchMethod;
  if (method === "name_search") {
    return {
      category: "manual_review_candidate",
      clerkEligible: false,
      exclusionReason: "manual_review",
    };
  }
  if (method === "name_fuzzy") {
    return {
      category: "ambiguous",
      clerkEligible: false,
      exclusionReason: "ambiguous",
    };
  }
  if (method === "manual" && hasOracleId(item) && hasPrintingId(item)) {
    return { category: "fully_linked", clerkEligible: true };
  }
  if (isInventoryCatalogUnresolved(item) || method === "unresolved") {
    return {
      category: "unresolved",
      clerkEligible: false,
      exclusionReason: "unresolved",
    };
  }

  if (hasOracleId(item) && hasPrintingId(item)) {
    return {
      category: "conflict",
      clerkEligible: false,
      exclusionReason: "conflict",
    };
  }

  if (!item.catalogSyncedAt) {
    return {
      category: "unresolved",
      clerkEligible: false,
      exclusionReason: "unresolved",
    };
  }

  return {
    category: "other",
    clerkEligible: false,
    exclusionReason: "not_fully_linked",
  };
}

/** Customer-facing clerk paths may only use fully linked, sellable inventory. */
export function isClerkEligibleInventory(item: InventoryItem): boolean {
  const qty = inventoryQuantityAvailable(item);
  if (qty <= 0) return false;

  const status = classifyInventoryLinkStatus(item);
  if (status.category !== "fully_linked") return false;
  return status.clerkEligible;
}

export interface InventoryIdentityExclusionTrace {
  excludedForIdentity: number;
  excludedZeroQuantity: number;
  excludedByReason: Partial<Record<InventoryIdentityExclusionReason, number>>;
  eligibleCount: number;
  inputCount: number;
}

export function buildInventoryIdentityExclusionTrace(input: {
  items: InventoryItem[];
  magicOnly?: boolean;
}): InventoryIdentityExclusionTrace {
  const magicOnly = input.magicOnly ?? true;
  const items = magicOnly
    ? input.items.filter(isMagicInventoryItem)
    : input.items;

  const trace: InventoryIdentityExclusionTrace = {
    excludedForIdentity: 0,
    excludedZeroQuantity: 0,
    excludedByReason: {},
    eligibleCount: 0,
    inputCount: items.length,
  };

  for (const item of items) {
    const qty = inventoryQuantityAvailable(item);
    if (qty <= 0) {
      trace.excludedZeroQuantity += 1;
      continue;
    }

    if (isClerkEligibleInventory(item)) {
      trace.eligibleCount += 1;
      continue;
    }

    trace.excludedForIdentity += 1;
    const reason =
      classifyInventoryLinkStatus(item).exclusionReason ?? "not_fully_linked";
    trace.excludedByReason[reason] = (trace.excludedByReason[reason] ?? 0) + 1;
  }

  return trace;
}

export function filterClerkEligibleInventory(
  items: InventoryItem[],
): InventoryItem[] {
  return items.filter(isClerkEligibleInventory);
}

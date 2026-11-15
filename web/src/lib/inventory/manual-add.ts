import type { CardCategory, ConditionEstimate, InventoryItem } from "../types";

/**
 * Cards a clerk enters by hand — packs we cracked, or a trade-in that never
 * went through the buyback flow. These rows are quantity-tracked like a CSV
 * import, but they carry no tcgplayerListingKey, which is what keeps a later
 * TCGplayer import from withdrawing stock it has never heard of.
 */
export type ManualAddInput = {
  storeId: string;
  displayName: string;
  category?: CardCategory;
  setName?: string;
  cardNumber?: string;
  condition: ConditionEstimate;
  quantity: number;
  /** Shelf price per copy. */
  price: number;
  /** What we paid per copy, when it came from a trade rather than a pack. */
  unitCost?: number;
  imageUrl?: string;
  addedBy?: string;
  /** Caller-supplied so tests stay deterministic. */
  id?: string;
  now?: string;
};

export class ManualAddError extends Error {
  constructor(
    message: string,
    readonly field: string,
  ) {
    super(message);
    this.name = "ManualAddError";
  }
}

const CONDITION_LABELS: Record<ConditionEstimate, string> = {
  NM: "Near Mint",
  LP: "Lightly Played",
  MP: "Moderately Played",
  HP: "Heavily Played",
  DMG: "Damaged",
};

export function manualConditionLabel(condition: ConditionEstimate): string {
  return CONDITION_LABELS[condition];
}

const MAX_QUANTITY = 10_000;
const MAX_PRICE = 1_000_000;

function money(value: number, field: string, label: string): number {
  if (!Number.isFinite(value)) throw new ManualAddError(`${label} must be a number`, field);
  if (value < 0) throw new ManualAddError(`${label} cannot be negative`, field);
  if (value >= MAX_PRICE) {
    throw new ManualAddError(`${label} is unrealistically high`, field);
  }
  return Math.round(value * 100) / 100;
}

/**
 * Build one inventory row from clerk input. Pure and total: it either returns a
 * row that is valid everywhere downstream, or throws with the offending field.
 */
export function buildManualInventoryItem(input: ManualAddInput): InventoryItem {
  const displayName = input.displayName?.trim();
  if (!displayName) throw new ManualAddError("Card name is required", "displayName");

  if (!CONDITION_LABELS[input.condition]) {
    throw new ManualAddError("Pick a condition", "condition");
  }

  if (!Number.isInteger(input.quantity)) {
    throw new ManualAddError("Quantity must be a whole number", "quantity");
  }
  if (input.quantity < 1) {
    throw new ManualAddError("Add at least one copy", "quantity");
  }
  if (input.quantity > MAX_QUANTITY) {
    throw new ManualAddError(
      `Quantity cannot exceed ${MAX_QUANTITY.toLocaleString()}`,
      "quantity",
    );
  }

  const price = money(input.price, "price", "Price");
  if (price === 0) {
    // Shopify export skips rows with no price, so a zero would silently sit
    // in inventory and never reach the storefront.
    throw new ManualAddError("Set a price so the card can be listed", "price");
  }

  const now = input.now ?? new Date().toISOString();
  const quantity = input.quantity;

  return {
    id: input.id ?? crypto.randomUUID(),
    storeId: input.storeId,
    source: "manual",
    displayName,
    productName: displayName,
    category: input.category ?? "magic",
    setName: input.setName?.trim() || undefined,
    cardNumber: input.cardNumber?.trim() || undefined,
    condition: input.condition,
    // Shopify titles and tags read the human label, matching CSV rows.
    tcgplayerCondition: CONDITION_LABELS[input.condition],
    itemType: "raw",
    frontImageUrl: input.imageUrl?.trim() || undefined,
    quantity,
    quantityOnHand: quantity,
    quantityAvailable: quantity,
    listPrice: price,
    purchasePrice:
      input.unitCost == null
        ? undefined
        : money(input.unitCost, "unitCost", "Cost"),
    purchaseType: input.unitCost == null ? undefined : "trade",
    status: "on_hand",
    acquiredAt: now,
    addedBy: input.addedBy?.trim() || undefined,
  };
}

/**
 * Shopping cart for store singles. Held in the browser because Shopify owns
 * checkout and the money; the server revalidates every line before handoff.
 */
export type CartLine = {
  inventoryItemId: string;
  name: string;
  setName?: string;
  imageUrl?: string;
  /** Shelf price when the card was added — Shopify shows the authoritative price. */
  unitPrice: number;
  quantity: number;
  /** Units on the shelf when added, used to cap the stepper. */
  maxQuantity: number;
};

export const CART_STORAGE_PREFIX = "cs9k-cart:";
const MAX_LINE_QUANTITY = 99;

export function cartStorageKey(slug: string): string {
  return `${CART_STORAGE_PREFIX}${slug}`;
}

function clampQuantity(quantity: number, max: number): number {
  const ceiling = Math.min(
    MAX_LINE_QUANTITY,
    Math.max(1, Math.trunc(max) || 1),
  );
  return Math.min(ceiling, Math.max(1, Math.trunc(quantity) || 1));
}

export function addCartLine(
  lines: CartLine[],
  line: Omit<CartLine, "quantity"> & { quantity?: number },
): CartLine[] {
  const max = Math.max(1, Math.trunc(line.maxQuantity) || 1);
  const existing = lines.find(
    (l) => l.inventoryItemId === line.inventoryItemId,
  );

  if (!existing) {
    return [
      ...lines,
      {
        ...line,
        maxQuantity: max,
        quantity: clampQuantity(line.quantity ?? 1, max),
      },
    ];
  }

  return lines.map((l) =>
    l.inventoryItemId === line.inventoryItemId
      ? {
          ...l,
          maxQuantity: max,
          quantity: clampQuantity(l.quantity + (line.quantity ?? 1), max),
        }
      : l,
  );
}

export function setCartLineQuantity(
  lines: CartLine[],
  inventoryItemId: string,
  quantity: number,
): CartLine[] {
  if (quantity <= 0) return removeCartLine(lines, inventoryItemId);
  return lines.map((l) =>
    l.inventoryItemId === inventoryItemId
      ? { ...l, quantity: clampQuantity(quantity, l.maxQuantity) }
      : l,
  );
}

export function removeCartLine(
  lines: CartLine[],
  inventoryItemId: string,
): CartLine[] {
  return lines.filter((l) => l.inventoryItemId !== inventoryItemId);
}

export function cartItemCount(lines: CartLine[]): number {
  return lines.reduce((sum, l) => sum + l.quantity, 0);
}

export function cartSubtotal(lines: CartLine[]): number {
  const total = lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
  return Math.round(total * 100) / 100;
}

/** Drop anything that can no longer be bought, keeping the rest of the cart. */
export function pruneCartLines(
  lines: CartLine[],
  unavailableIds: string[],
): CartLine[] {
  if (!unavailableIds.length) return lines;
  const drop = new Set(unavailableIds);
  return lines.filter((l) => !drop.has(l.inventoryItemId));
}

function isCartLine(value: unknown): value is CartLine {
  if (!value || typeof value !== "object") return false;
  const line = value as Partial<CartLine>;
  return (
    typeof line.inventoryItemId === "string" &&
    line.inventoryItemId.length > 0 &&
    typeof line.name === "string" &&
    typeof line.unitPrice === "number" &&
    typeof line.quantity === "number"
  );
}

export function parseStoredCart(raw: string | null): CartLine[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isCartLine).map((line) => ({
      ...line,
      maxQuantity: Math.max(1, Math.trunc(line.maxQuantity) || 1),
      quantity: clampQuantity(line.quantity, line.maxQuantity),
    }));
  } catch {
    return [];
  }
}

export function readCart(slug: string): CartLine[] {
  if (typeof window === "undefined") return [];
  try {
    return parseStoredCart(window.localStorage.getItem(cartStorageKey(slug)));
  } catch {
    return [];
  }
}

export function writeCart(slug: string, lines: CartLine[]): void {
  if (typeof window === "undefined") return;
  try {
    if (!lines.length) {
      window.localStorage.removeItem(cartStorageKey(slug));
      return;
    }
    window.localStorage.setItem(cartStorageKey(slug), JSON.stringify(lines));
  } catch {
    /* private mode or full storage — the cart just won't persist */
  }
}

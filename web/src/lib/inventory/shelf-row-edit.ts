import { shelfLocationV1 } from "./shelf-location";
import { inventoryEffectiveQuantity, inventoryOnlineQuantity } from "./status";
import type { ConditionEstimate, InventoryChangeLogEntry, InventoryItem } from "../types";

const NAME_SPLIT = " — ";

export const SHELF_CONDITIONS: ReadonlyArray<{
  label: string;
  condition: ConditionEstimate;
}> = [
  { label: "Near Mint", condition: "NM" },
  { label: "Lightly Played", condition: "LP" },
  { label: "Moderately Played", condition: "MP" },
  { label: "Heavily Played", condition: "HP" },
  { label: "Damaged", condition: "DMG" },
];

export type ShelfRowEdit = {
  displayName?: string;
  listPrice?: number;
  quantity?: number;
  /** Copies that can be bought online; the rest are in-store only. */
  onlineQuantity?: number;
  condition?: string;
  shelfLocation?: string;
  staffNote?: string;
};

/** The name shoppers see, without the set suffix stored on older rows. */
export function shelfCustomerName(item: Pick<InventoryItem, "displayName" | "productName">): string {
  const product = item.productName?.trim();
  if (product) return product;
  return item.displayName.split(NAME_SPLIT)[0]?.trim() || item.displayName.trim();
}

export function shelfConditionLabel(
  item: Pick<InventoryItem, "tcgplayerCondition" | "condition">,
): string {
  if (item.tcgplayerCondition?.trim()) return item.tcgplayerCondition.trim();
  const estimate = SHELF_CONDITIONS.find((row) => row.condition === item.condition);
  return estimate?.label ?? "";
}

const CHANGE_FIELD_LABEL: Record<InventoryChangeLogEntry["field"], string> = {
  location: "Location",
  condition: "Condition",
  online: "Online copies",
  quantity: "Qty",
  price: "Price",
  name: "Name",
  note: "Note",
};

export function describeShelfChange(c: InventoryChangeLogEntry): string {
  if (c.field === "note") return c.to ? `Note: "${c.to}"` : "Note cleared";
  return `${CHANGE_FIELD_LABEL[c.field]}: ${c.from || "—"} → ${c.to || "—"}`;
}

/** "Near Mint Foil" → "NM Foil"; unknown wording is left as is. */
export function shelfConditionShort(label: string): string {
  let out = label;
  for (const row of SHELF_CONDITIONS) {
    out = out.replace(new RegExp(`\\b${row.label}\\b`, "i"), row.condition);
  }
  return out;
}

function conditionFields(label: string): Pick<InventoryItem, "tcgplayerCondition" | "condition"> {
  const trimmed = label.replace(/\s+/g, " ").trim();
  const known = SHELF_CONDITIONS.find(
    (row) => row.label.toLowerCase() === trimmed.toLowerCase() || row.condition === trimmed,
  );
  if (!known) return { tcgplayerCondition: trimmed };
  return { tcgplayerCondition: known.label, condition: known.condition };
}

function withCustomerName(item: InventoryItem, name: string): InventoryItem {
  const next = name.replace(/\s+/g, " ").trim();
  const suffix = item.displayName.split(NAME_SPLIT).slice(1).join(NAME_SPLIT).trim();
  return {
    ...item,
    displayName: suffix ? `${next}${NAME_SPLIT}${suffix}` : next,
    productName: next,
  };
}

function withSellableQuantity(item: InventoryItem, quantity: number): InventoryItem {
  const reserved = Math.max(0, item.quantityReserved ?? 0);
  const committed = Math.max(0, item.quantityCommitted ?? 0);
  const damaged = Math.max(0, item.quantityDamaged ?? 0);
  const holds =
    item.quantityReserved != null ||
    item.quantityCommitted != null ||
    item.quantityDamaged != null;
  const onHand = holds ? quantity + reserved + committed + damaged : quantity;
  return {
    ...item,
    quantity: onHand,
    quantityOnHand: onHand,
    quantityAvailable: quantity,
  };
}

function withOnlineSplit(item: InventoryItem, online: number, total: number): InventoryItem {
  return { ...item, quantityOnline: online, quantityInStore: Math.max(0, total - online) };
}

/** Apply one spreadsheet edit. Set, collector number, and catalog links stay as they are. */
export function applyShelfRowEdit(
  item: InventoryItem,
  edit: ShelfRowEdit,
  now: string = new Date().toISOString(),
): { ok: true; item: InventoryItem } | { ok: false; error: string } {
  let next = item;

  if (edit.displayName != null) {
    const name = edit.displayName.replace(/\s+/g, " ").trim();
    if (!name) return { ok: false, error: "Name is required" };
    if (name.length > 180) return { ok: false, error: "Name is too long" };
    next = withCustomerName(next, name);
  }

  if (edit.listPrice != null) {
    if (!Number.isFinite(edit.listPrice) || edit.listPrice < 0) {
      return { ok: false, error: "Price must be zero or more" };
    }
    next = { ...next, listPrice: Math.round(edit.listPrice * 100) / 100 };
  }

  if (edit.quantity != null) {
    if (!Number.isInteger(edit.quantity) || edit.quantity < 0 || edit.quantity > 9999) {
      return { ok: false, error: "Quantity must be a whole number from 0 to 9999" };
    }
    const tracked = next.quantityOnline != null || next.quantityInStore != null;
    const online = inventoryOnlineQuantity(next);
    next = withSellableQuantity(next, edit.quantity);
    if (tracked) next = withOnlineSplit(next, Math.min(online, edit.quantity), edit.quantity);
  }

  if (edit.onlineQuantity != null) {
    const total = inventoryEffectiveQuantity(next);
    if (!Number.isInteger(edit.onlineQuantity) || edit.onlineQuantity < 0) {
      return { ok: false, error: "Online quantity must be a whole number" };
    }
    if (edit.onlineQuantity > total) {
      return { ok: false, error: `Only ${total} in stock — online can't be more than that` };
    }
    next = withOnlineSplit(next, edit.onlineQuantity, total);
  }

  if (edit.condition != null) {
    const label = edit.condition.replace(/\s+/g, " ").trim();
    if (!label) return { ok: false, error: "Condition is required" };
    next = { ...next, ...conditionFields(label) };
  }

  if (edit.shelfLocation != null) {
    const location = edit.shelfLocation.replace(/\s+/g, " ").trim();
    if (!location) return { ok: false, error: "Pick a location" };
    if (location.length > 60) return { ok: false, error: "Location is too long" };
    next = withManualLocation(next, location);
  }

  if (edit.staffNote != null) {
    const note = edit.staffNote.replace(/\s+/g, " ").trim();
    if (note.length > 500) return { ok: false, error: "Note is too long (500 characters max)" };
    next = { ...next, staffNote: note };
  }

  return { ok: true, item: withChangeLog(item, next, now) };
}

/**
 * A hand move wins over the price rules: the rules' current answer is marked
 * as kept so the nightly refresh doesn't suggest moving it straight back.
 */
function withManualLocation(item: InventoryItem, location: string): InventoryItem {
  const ruled = shelfLocationV1({
    productLine: item.productLine ?? "",
    market: item.tcgMarketPrice ?? item.listPrice ?? null,
    colors: item.catalogColors,
    colorIdentity: item.catalogColorIdentity,
    typeLine: item.catalogTypeLine,
  });
  return {
    ...item,
    shelfLocation: location,
    keptLocationFor: ruled && ruled !== location ? ruled : "",
    suggestedLocation: "",
    suggestedLocationAt: "",
  };
}

const MAX_CHANGE_LOG = 30;

function withChangeLog(before: InventoryItem, after: InventoryItem, now: string): InventoryItem {
  const changes: InventoryChangeLogEntry[] = [];
  const add = (field: InventoryChangeLogEntry["field"], from: string, to: string) => {
    if (from !== to) changes.push({ at: now, field, from, to });
  };
  add("location", before.shelfLocation?.trim() ?? "", after.shelfLocation?.trim() ?? "");
  add("condition", shelfConditionLabel(before), shelfConditionLabel(after));
  add("online", String(inventoryOnlineQuantity(before)), String(inventoryOnlineQuantity(after)));
  add("quantity", String(inventoryEffectiveQuantity(before)), String(inventoryEffectiveQuantity(after)));
  add("price", before.listPrice?.toFixed(2) ?? "", after.listPrice?.toFixed(2) ?? "");
  add("name", shelfCustomerName(before), shelfCustomerName(after));
  add("note", before.staffNote ?? "", after.staffNote ?? "");
  if (!changes.length) return after;
  return { ...after, changeLog: [...(before.changeLog ?? []), ...changes].slice(-MAX_CHANGE_LOG) };
}

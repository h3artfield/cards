import { SHELF_CONTENTS_V1 } from "../inventory/shelf-location";

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

/** "$1,234.50". Missing or non-finite amounts show as a dash. */
export function formatMoney(amount: number | null | undefined): string {
  if (amount == null || !Number.isFinite(amount)) return "—";
  return usd.format(amount);
}

/** "1 card", "3 cards". */
export function plural(count: number, one: string, many: string): string {
  return `${count.toLocaleString("en-US")} ${count === 1 ? one : many}`;
}

/** Whole percent, the way the Inventory report shows sell-through. */
export function formatPercent(fraction: number): string {
  return `${(fraction * 100).toFixed(0)}%`;
}

/**
 * "1-2 · Blue", "Binder U": a shelf the way the Inventory report names it.
 * The contents label is left off when it only repeats the binder's own name.
 */
export function shelfName(location: string): string {
  const contents = SHELF_CONTENTS_V1[location];
  const bareName = location.replace(/^Binder /, "").replace(/ Binder$/, "");
  return contents && contents.label !== bareName
    ? `${location} · ${contents.label}`
    : location;
}

/** Collapse whitespace and trim: for names typed into the box. */
export function tidy(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

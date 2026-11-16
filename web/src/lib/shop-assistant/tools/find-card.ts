import { inventoryItemMatchesFinishFilter } from "../../inventory/inventory-finish-v1";
import { sellPrice } from "../../inventory/sell-price";
import { shelfConditionLabel, shelfCustomerName } from "../../inventory/shelf-row-edit";
import {
  inventoryEffectiveQuantity,
  inventoryOnlineQuantity,
  isInventoryAvailable,
} from "../../inventory/status";
import type { InventoryItem } from "../../types";
import { formatMoney, plural, shelfName, tidy } from "../format";
import type { ShopAnswer, ShopToolArgs } from "../types";

export const FIND_CARD_MAX_ROWS = 8;

/**
 * How well a card's name answers the name staff typed.
 *   4  the name itself ("Lightning Bolt", also "Lightning Bolt (Borderless)")
 *   3  the name starts with it as whole words ("Aang" for "Aang's Iceberg")
 *   2  it appears as whole words inside the name ("Bolt" for "Lightning Bolt")
 *   1  it is only part of a word ("bolt" inside "Thunderbolt")
 *   0  no match
 */
export type NameMatchRank = 0 | 1 | 2 | 3 | 4;

function normalize(text: string): string {
  return tidy(
    text
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[‘’`]/g, "'")
      .toLowerCase(),
  );
}

/** "Enlightened Confidant (Borderless) (0321)" → "Enlightened Confidant". */
function withoutTrailingNotes(name: string): string {
  let out = name;
  for (;;) {
    const next = out.replace(/\s*\([^()]*\)\s*$/, "");
    if (next === out || !next.trim()) return out.trim();
    out = next;
  }
}

function isWordChar(ch: string | undefined): boolean {
  return ch != null && /[a-z0-9]/.test(ch);
}

export function rankNameMatch(cardName: string, typed: string): NameMatchRank {
  const query = normalize(typed);
  if (!query) return 0;
  const full = normalize(cardName);
  const bare = normalize(withoutTrailingNotes(cardName));
  if (full === query || bare === query) return 4;
  if (bare.startsWith(query) && !isWordChar(bare[query.length])) return 3;

  let from = 0;
  let partOfWord = false;
  for (;;) {
    const at = full.indexOf(query, from);
    if (at < 0) break;
    if (!isWordChar(full[at - 1]) && !isWordChar(full[at + query.length])) return 2;
    partOfWord = true;
    from = at + 1;
  }
  return partOfWord ? 1 : 0;
}

export type FoundCard = {
  item: InventoryItem;
  rank: NameMatchRank;
  name: string;
  /** Sellable copies on hand. */
  quantity: number;
  /** How many of those can be sold online. */
  online: number;
};

export type FindCardResult = {
  /** Only part-of-a-word matches were found, so these are near misses. */
  closestOnly: boolean;
  /** Every match, best first. */
  matches: FoundCard[];
  copies: number;
};

/**
 * In-stock cards whose name matches. An exact name hides looser matches; a
 * whole-word match hides part-of-a-word ones, so "bolt" finds Lightning Bolt
 * and not Thunderbolt.
 */
export function findCards(
  inventory: InventoryItem[],
  args: ShopToolArgs["find_card"],
): FindCardResult {
  const found: FoundCard[] = [];
  for (const item of inventory) {
    if (!isInventoryAvailable(item)) continue;
    if (!inventoryItemMatchesFinishFilter(item, args.finish)) continue;
    const name = shelfCustomerName(item);
    const rank = rankNameMatch(name, args.name);
    if (!rank) continue;
    found.push({
      item,
      rank,
      name,
      quantity: inventoryEffectiveQuantity(item),
      online: inventoryOnlineQuantity(item),
    });
  }

  const best = found.reduce<NameMatchRank>((max, row) => (row.rank > max ? row.rank : max), 0);
  const floor: NameMatchRank = best === 4 ? 4 : best >= 2 ? 2 : 1;
  const matches = found
    .filter((row) => row.rank >= floor)
    .sort(
      (a, b) =>
        b.rank - a.rank ||
        a.name.localeCompare(b.name) ||
        (a.item.setName ?? "").localeCompare(b.item.setName ?? "") ||
        shelfConditionLabel(a.item).localeCompare(shelfConditionLabel(b.item)) ||
        a.item.id.localeCompare(b.item.id),
    );

  return {
    closestOnly: best === 1,
    matches,
    copies: matches.reduce((sum, row) => sum + row.quantity, 0),
  };
}

function printing(item: InventoryItem): string {
  const number = item.cardNumber?.trim();
  return [item.setName?.trim(), number ? `#${number.replace(/^#/, "")}` : ""]
    .filter(Boolean)
    .join(" · ");
}

/** "Do we have <card>?" */
export function findCardAnswer(
  inventory: InventoryItem[],
  args: ShopToolArgs["find_card"],
  now: Date,
): ShopAnswer {
  const result = findCards(inventory, args);
  const finish = args.finish === "foil" ? "foil " : args.finish === "nonfoil" ? "non-foil " : "";
  const base = {
    title: `In stock: ${args.name}`,
    href: "/admin/reports?section=inventory",
    hrefLabel: "Open Inventory",
    asOf: now.toISOString(),
  };

  if (!result.matches.length) {
    return {
      ...base,
      lines: [`No ${finish}copies of "${args.name}" in stock.`],
      note: "Checked in-stock cards by name.",
    };
  }

  const shown = result.matches.slice(0, FIND_CARD_MAX_ROWS);
  const summary =
    `${plural(result.copies, `${finish}copy`, `${finish}copies`)} in stock ` +
    `across ${plural(result.matches.length, "listing", "listings")}.`;
  const notes = ["Online is how many of those copies can be sold online."];
  if (result.matches.length > shown.length) {
    notes.unshift(`Showing ${shown.length}, and ${result.matches.length - shown.length} more.`);
  }

  return {
    ...base,
    lines: result.closestOnly
      ? [`No card named "${args.name}" in stock. Closest names:`, summary]
      : [summary],
    columns: ["Card", "Printing", "Condition", "Qty", "Online", "Shelf", "Price"],
    rows: shown.map(({ item, name, quantity, online }) => [
      name,
      printing(item),
      shelfConditionLabel(item),
      String(quantity),
      String(online),
      item.shelfLocation?.trim() ? shelfName(item.shelfLocation.trim()) : "No location",
      // The register's own price, so the box quotes what will ring up.
      sellPrice(item) > 0 ? formatMoney(sellPrice(item)) : "—",
    ]),
    note: notes.join(" "),
  };
}

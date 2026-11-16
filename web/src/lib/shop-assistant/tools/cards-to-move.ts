import { listCardsToMove } from "../../inventory/cards-to-move";
import { BULK_BELOW_V1, CABINET_MIN_V1 } from "../../inventory/shelf-location";
import type { InventoryItem } from "../../types";
import { formatMoney, plural, shelfName } from "../format";
import type { ShopAnswer } from "../types";

export const CARDS_TO_MOVE_MAX_ROWS = 15;

/** "What should I re-shelve?" Same rows and order as the Cards to move panel. */
export function cardsToMoveAnswer(inventory: InventoryItem[], now: Date): ShopAnswer {
  const cards = listCardsToMove(inventory);
  const base = {
    title: "Cards to move",
    href: "/admin/reports?section=inventory",
    hrefLabel: "Open Inventory",
    asOf: now.toISOString(),
  };
  const rule =
    `A card lands here when a price change puts it over a shelf line ` +
    `($${CABINET_MIN_V1} for cabinets, ${Math.round(BULK_BELOW_V1 * 100)}¢ for bulk).`;

  if (!cards.length) {
    return { ...base, lines: ["Nothing to move right now."], note: rule };
  }

  const shown = cards.slice(0, CARDS_TO_MOVE_MAX_ROWS);
  return {
    ...base,
    lines: [`${plural(cards.length, "card", "cards")} to move.`],
    columns: ["Card", "Set · condition", "Qty", "Market", "Move"],
    rows: shown.map((card) => [
      card.name,
      [card.setName, card.condition].filter(Boolean).join(" · "),
      String(card.quantity),
      formatMoney(card.market),
      `${card.from ? shelfName(card.from) : "No location"} → ${shelfName(card.to)}`,
    ]),
    note:
      cards.length > shown.length
        ? `Showing the first ${shown.length} of ${cards.length}. ${rule}`
        : rule,
  };
}

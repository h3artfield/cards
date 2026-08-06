import type { StoreInventoryCard } from "../../deck-builder/store-inventory-browse";
import {
  colorIdentitySearchLabel,
  isColorIdentityInventoryRequest,
  isSemanticFilterActive,
  parseClerkInventoryQuery,
} from "../clerk-tools/clerk-query-parser";

function unitPrice(card: StoreInventoryCard): number | undefined {
  const p = card.listPrice ?? card.tcgLowPrice;
  return p != null && p > 0 ? p : undefined;
}

function lowestPriced(cards: StoreInventoryCard[]): StoreInventoryCard | undefined {
  return [...cards].sort((a, b) => (unitPrice(a) ?? 9999) - (unitPrice(b) ?? 9999))[0];
}

/** Deterministic inventory reply — no LLM required for straightforward stock/price questions. */
export function renderSimpleInventoryReply(input: {
  question: string;
  conversationSummary?: string;
  items: StoreInventoryCard[];
  total?: number;
  resolvedCardName?: string;
}): string | null {
  const q = input.question.trim().toLowerCase();
  const items = input.items.filter((c) => c.qty > 0);
  const total = input.total ?? items.length;
  const parsed = parseClerkInventoryQuery({
    userQuestion: input.question,
    conversationSummary: input.conversationSummary,
  });

  if (items.length === 0) {
    const parsed = parseClerkInventoryQuery({
      userQuestion: input.question,
      conversationSummary: input.conversationSummary,
    });
    if (/\bdo you have\b|\bin stock\b|\bgot any\b/i.test(input.question)) {
      const nameMatch = input.question.match(
        /\b(?:do you have|got any|have any)\s+(.+?)\??\s*$/i,
      );
      const name = nameMatch?.[1]?.trim().replace(/\?$/, "");
      if (name && !/\bunder \$|\bbelow \$/i.test(name)) {
        const display = input.resolvedCardName ?? name;
        return `No — we don't currently have **${display}** in stock.`;
      }
    }
    if (isColorIdentityInventoryRequest({ userQuestion: input.question })) {
      const label = colorIdentitySearchLabel(parsed);
      return `I checked our Magic inventory for ${label} but don't have matching cards in stock right now.`;
    }
    if (isSemanticFilterActive(parsed.semantic)) {
      return `I checked our Magic inventory for that search but don't have matching cards in stock right now.`;
    }
    return null;
  }

  if (items.length === 1) {
    const card = items[0]!;
    const price = unitPrice(card);
    const pricePart =
      price != null ? ` The lowest-priced available copy is $${price.toFixed(2)}.` : "";
    if (/\bhow much\b|\bprice\b|\bcost\b/i.test(q)) {
      return price != null
        ? `**${card.name}** is $${price.toFixed(2)} (${card.qty} in stock).`
        : `We have **${card.name}** in stock (${card.qty} available), but I don't have a listed price yet.`;
    }
    return `Yes. We currently have ${card.qty} ${card.qty === 1 ? "copy" : "copies"} of **${card.name}**.${pricePart}`;
  }

  if (/\bhow much\b|\bprice\b|\bcheapest\b|\blowest\b/i.test(q)) {
    const cheapest = lowestPriced(items);
    if (cheapest) {
      const price = unitPrice(cheapest);
      if (price != null) {
        return `Our lowest-priced match is **${cheapest.name}** at $${price.toFixed(2)} (${cheapest.qty} in stock). Showing ${items.length} of ${total} matches.`;
      }
    }
  }

  if (isSemanticFilterActive(parsed.semantic) || isColorIdentityInventoryRequest({ userQuestion: input.question })) {
    const label = colorIdentitySearchLabel(parsed);
    return `I found ${total} ${label} cards in stock — showing ${items.length} below.`;
  }

  if (/\bdo you have\b|\bin stock\b/i.test(q)) {
    const names = items.slice(0, 3).map((c) => c.name).join(", ");
    return `Yes — we have ${total} matches in stock, including ${names}${total > 3 ? ", and more" : ""}.`;
  }

  return `Found ${total} matches in stock — check the picks below.`;
}

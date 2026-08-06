import type { StoreInventoryCard } from "../../deck-builder/store-inventory-browse";
import type { ClerkDeckCard, ClerkDeckList } from "../clerk-types";
import {
  pickArchetypeTemplate,
  type PokemonDeckSlot,
} from "../knowledge/pokemon-charizard-ex-standard";

function unitPrice(c: StoreInventoryCard): number {
  return c.listPrice ?? c.tcgLowPrice ?? 0;
}

function nameMatches(item: StoreInventoryCard, slot: PokemonDeckSlot): boolean {
  const name = item.name.toLowerCase();
  if (slot.exclude?.some((re) => re.test(item.name))) return false;
  return slot.searchTerms.some((term) => name.includes(term.toLowerCase()));
}

function scoreMatch(item: StoreInventoryCard, slot: PokemonDeckSlot): number {
  if (!nameMatches(item, slot)) return -1;
  let score = 100;
  const name = item.name.toLowerCase();
  if (slot.prefer?.length) {
    score += slot.prefer.some((p) => name.includes(p.toLowerCase())) ? 50 : -30;
  }
  if (slot.label.toLowerCase().includes("ex") && !name.includes(" ex")) score -= 40;
  if (slot.category === "energy" && !name.includes("energy")) score -= 20;
  const price = unitPrice(item);
  score -= price * 0.5;
  return score;
}

function pickInventoryForSlot(
  inventory: StoreInventoryCard[],
  slot: PokemonDeckSlot,
  usedQty: Map<string, number>,
): StoreInventoryCard | null {
  const candidates = inventory
    .map((item) => ({ item, score: scoreMatch(item, slot) }))
    .filter((x) => x.score >= 0)
    .sort((a, b) => b.score - a.score);

  for (const { item } of candidates) {
    const used = usedQty.get(item.inventoryItemId) ?? 0;
    if (used < item.qty) return item;
  }
  return null;
}

export function buildPokemonDeckFromInventory(input: {
  featured: string;
  formatLabel: string;
  budget?: number;
  inventory: StoreInventoryCard[];
}): ClerkDeckList {
  const { strategy, slots, name: archetypeName } = pickArchetypeTemplate(
    input.featured,
  );
  const usedQty = new Map<string, number>();
  const lines: ClerkDeckCard[] = [];
  const missing: string[] = [];
  let spent = 0;

  function addLine(
    slot: PokemonDeckSlot,
    item: StoreInventoryCard | null,
    qty: number,
    note?: string,
  ) {
    const price = item ? unitPrice(item) : 0;
    const lineTotal = price * qty;
    if (input.budget != null && item && spent + lineTotal > input.budget) return false;

    lines.push({
      slot: slot.label,
      name: item?.name ?? slot.label,
      qty,
      category: slot.category,
      inventoryItemId: item?.inventoryItemId,
      imageUrl: item?.imageUrl,
      imageProxyUrl: item?.imageProxyUrl,
      listPrice: item ? price : undefined,
      lineTotal: item ? lineTotal : undefined,
      inStock: Boolean(item),
      substituteNote: note,
    });

    if (item) {
      usedQty.set(item.inventoryItemId, (usedQty.get(item.inventoryItemId) ?? 0) + qty);
      spent += lineTotal;
    }
    return true;
  }

  for (const slot of slots) {
    let remaining = slot.qty;
    while (remaining > 0) {
      const item = pickInventoryForSlot(input.inventory, slot, usedQty);
      if (!item) {
        missing.push(`${remaining}x ${slot.label}`);
        addLine(slot, null, remaining, "Not in stock — substitute needed");
        break;
      }
      const used = usedQty.get(item.inventoryItemId) ?? 0;
      const available = Math.max(0, item.qty - used);
      const take = Math.min(remaining, available, 4);
      if (take <= 0) break;
      if (!addLine(slot, item, take)) break;
      remaining -= take;
    }
  }

  let totalCards = lines.reduce((s, l) => s + l.qty, 0);

  if (totalCards < 60) {
    const fillerTrainers = input.inventory
      .filter(
        (c) =>
          /ball|research|switch|rod|candy|iono|arven|boss|festival|ticket|art rare/i.test(
            c.name,
          ) && !lines.some((l) => l.inventoryItemId === c.inventoryItemId),
      )
      .sort((a, b) => unitPrice(a) - unitPrice(b));

    for (const item of fillerTrainers) {
      if (totalCards >= 60) break;
      const take = Math.min(4, item.qty, 60 - totalCards);
      if (take <= 0) continue;
      if (
        input.budget != null &&
        spent + unitPrice(item) * take > input.budget
      ) {
        continue;
      }
      addLine(
        { label: item.name, searchTerms: [item.name], qty: take, category: "trainer" },
        item,
        take,
        "Extra trainer from stock",
      );
      totalCards += take;
    }
  }

  if (totalCards < 60) {
    const fillerEnergy = input.inventory.filter((c) =>
      /fire energy|basic fire/i.test(c.name),
    );
    for (const item of fillerEnergy) {
      if (totalCards >= 60) break;
      const take = Math.min(item.qty, 60 - totalCards);
      if (take <= 0) continue;
      addLine(
        {
          label: "Basic Fire Energy",
          searchTerms: ["Fire Energy"],
          qty: take,
          category: "energy",
        },
        item,
        take,
      );
      totalCards += take;
    }
  }

  const inStockCards = lines.filter((l) => l.inStock).reduce((s, l) => s + l.qty, 0);
  const deckTotal = lines
    .filter((l) => l.inStock && l.lineTotal != null)
    .reduce((s, l) => s + (l.lineTotal ?? 0), 0);

  return {
    game: "pokemon",
    format: input.formatLabel,
    archetype: archetypeName,
    strategy,
    totalCards: lines.reduce((s, l) => s + l.qty, 0),
    targetCards: 60,
    inStockCards,
    deckTotal,
    budget: input.budget,
    withinBudget: input.budget == null || deckTotal <= input.budget,
    lines,
    missingSlots: missing,
  };
}

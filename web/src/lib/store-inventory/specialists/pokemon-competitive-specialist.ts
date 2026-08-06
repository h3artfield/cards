import type {
  ClerkOrchestratorContext,
  ClerkRouterResult,
  SpecialistResponse,
} from "../clerk-types";
import type { ClerkToolResults } from "../clerk-tools";
import type { VerifierRevisionContext } from "../clerk-verifier";
import { buildPokemonDeckFromInventory } from "../clerk-tools/pokemon-deck-builder";
import type { StoreInventoryCard } from "../../deck-builder/store-inventory-browse";

function isPokemonItem(c: StoreInventoryCard): boolean {
  return (
    c.category === "pokemon" ||
    (c.productLine ?? "").toLowerCase().includes("pokemon")
  );
}

export async function runPokemonCompetitiveSpecialist(input: {
  ctx: ClerkOrchestratorContext;
  route: ClerkRouterResult;
  tools: ClerkToolResults;
  verifierRevision?: VerifierRevisionContext;
}): Promise<SpecialistResponse> {
  const { route, tools, verifierRevision } = input;
  const inventory = tools.inventoryByName.filter(isPokemonItem);
  const budget = route.constraints.budget;
  const formatLabel =
    route.format === "expanded" ? "Expanded" : "Standard";
  const featured =
    route.entities.featured_card ??
    route.entities.archetype ??
    route.entities.card_names[0] ??
    "Pokémon";

  if (
    route.intent === "build_deck" ||
    verifierRevision?.instructions.some((i) => i.includes("60-card"))
  ) {
    const deckList = buildPokemonDeckFromInventory({
      featured,
      formatLabel,
      budget,
      inventory,
    });

    const missingSummary =
      deckList.missingSlots.length > 0
        ? ` We're missing ${deckList.missingSlots.length} slot(s) from stock (${deckList.missingSlots.slice(0, 4).join(", ")}${deckList.missingSlots.length > 4 ? "…" : ""}).`
        : "";

    const budgetNote =
      budget != null
        ? deckList.withinBudget
          ? ` Total for in-stock cards: $${deckList.deckTotal.toFixed(2)} (under your $${budget} budget).`
          : ` In-stock total is $${deckList.deckTotal.toFixed(2)} — slightly over your $${budget} budget; we can swap printings.`
        : ` In-stock total: $${deckList.deckTotal.toFixed(2)}.`;

    const direct_answer = `${deckList.strategy}

I built a ${deckList.archetype} list (${deckList.inStockCards}/${deckList.targetCards} cards from our shelves).${budgetNote}${missingSummary} The full list is below — only cards we actually carry are included.`;

    const recommendations = deckList.lines
      .filter((l) => l.inStock && l.inventoryItemId)
      .map((l) => ({
        card_name: l.name,
        inventoryItemId: l.inventoryItemId,
        qty: l.qty,
        price: l.listPrice,
        reason: l.substituteNote ?? l.slot,
      }));

    return {
      direct_answer,
      recommendations,
      inventory_queries: [{ card_name: featured, quantity_needed: 2 }],
      missing_information: [],
      warnings:
        deckList.inStockCards < 60
          ? [
              `${60 - deckList.inStockCards} cards still needed — not all meta pieces are in stock.`,
              "Regulation-mark validation for a specific tournament date is not automated yet.",
            ]
          : ["Regulation-mark validation for a specific tournament date is not automated yet."],
      confidence: deckList.inStockCards >= 40 ? 0.88 : 0.65,
      deckList,
    };
  }

  let candidates = inventory;
  if (featured) {
    const token = featured.toLowerCase().split(/\s+/)[0] ?? featured.toLowerCase();
    const matches = inventory.filter((c) =>
      c.name.toLowerCase().includes(token),
    );
    if (matches.length) candidates = matches;
  }

  return {
    direct_answer:
      candidates.length > 0
        ? `Here's what we have in stock for Pokémon.`
        : `No matching Pokémon singles in stock for that search.`,
    recommendations: candidates.slice(0, 10).map((c) => ({
      card_name: c.name,
      inventoryItemId: c.inventoryItemId,
      qty: c.qty,
      price: c.listPrice ?? c.tcgLowPrice,
      reason: "In stock",
    })),
    inventory_queries: [],
    missing_information: [],
    warnings: [],
    confidence: 0.65,
  };
}

import type { ClerkRouterResult, SpecialistResponse } from "../../clerk-types";
import type { FormatRulePack } from "../types";
import type { VerifierCheckDetail } from "../types";

export function checkIntentFulfillment(input: {
  route: ClerkRouterResult;
  specialist: SpecialistResponse | null;
  rulePack: FormatRulePack | null;
}): VerifierCheckDetail {
  const { route, specialist, rulePack } = input;
  const warnings: string[] = [];

  const toolOnlyRequest =
    route.required_agents.length === 0 &&
    (route.intent === "inventory_lookup" ||
      route.intent === "price_check" ||
      route.intent === "general_chat");

  if (!specialist) {
    return {
      score: toolOnlyRequest ? 85 : 50,
      passed: toolOnlyRequest,
      reason: toolOnlyRequest
        ? undefined
        : "No specialist response was produced for a routed request.",
    };
  }

  if (route.intent === "build_deck") {
    if (!specialist.deckList) {
      const recCount = specialist.recommendations.length;
      return {
        score: 15,
        passed: false,
        reason:
          recCount > 0 && recCount < 20
            ? `A complete deck was requested but only ${recCount} card recommendation(s) were returned.`
            : "A complete deck was requested but no deck list was returned.",
      };
    }

    const deck = specialist.deckList;
    const target = deck.targetCards;
    const total = deck.totalCards;
    const inStock = deck.inStockCards;

    if (rulePack?.formatKey === "mtg_commander") {
      const mainCount = deck.mainDeckCount ?? 0;
      const hasCommander = deck.lines.some((l) => l.category === "commander");
      if (!hasCommander) {
        return {
          score: 25,
          passed: false,
          reason: "Commander deck is missing the commander slot.",
        };
      }
      if (deck.complete === false && mainCount < 99) {
        warnings.push(
          `Partial deck (${mainCount}/99 maindeck) — customer must be told inventory cannot fill all slots.`,
        );
        const explained =
          specialist.missing_information.length > 0 ||
          specialist.warnings.length > 0 ||
          deck.missingSlots.length > 0;
        return {
          score: explained ? 55 : 35,
          passed: explained,
          reason: explained
            ? undefined
            : "Incomplete Commander deck without clearly explaining missing inventory.",
          warnings,
        };
      }
    }

    if (rulePack?.formatKey === "pokemon_standard") {
      if (inStock < 60 && deck.missingSlots.length === 0) {
        return {
          score: 40,
          passed: false,
          reason: `Pokémon deck has only ${inStock}/60 in-stock cards without marking missing slots.`,
        };
      }
    }

    if (total < target * 0.5 && deck.missingSlots.length === 0) {
      return {
        score: 30,
        passed: false,
        reason: `Deck has ${total}/${target} cards with no missing-slot explanation.`,
      };
    }

    return { score: 95, passed: true, warnings };
  }

  if (route.intent === "recommendation") {
    if (specialist.recommendations.length === 0) {
      const hasExplanation =
        specialist.direct_answer.length > 40 ||
        specialist.missing_information.length > 0;
      return {
        score: hasExplanation ? 70 : 30,
        passed: hasExplanation,
        reason: hasExplanation
          ? undefined
          : "Recommendation request returned no picks and no explanation.",
      };
    }
    return { score: 90, passed: true };
  }

  if (
    route.intent === "inventory_lookup" ||
    route.intent === "price_check"
  ) {
    const hasInventoryRef =
      specialist.recommendations.some((r) => r.inventoryItemId) ||
      specialist.inventory_queries.length > 0;
    return {
      score: hasInventoryRef ? 90 : 60,
      passed: hasInventoryRef || specialist.missing_information.length > 0,
      reason: hasInventoryRef
        ? undefined
        : "Inventory or price question without inventory evidence.",
    };
  }

  return { score: 80, passed: true };
}

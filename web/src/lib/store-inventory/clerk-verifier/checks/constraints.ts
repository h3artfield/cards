import type { ClerkRouterResult, SpecialistResponse } from "../../clerk-types";
import type { VerifierCheckDetail } from "../types";

export function checkConstraintCompliance(input: {
  route: ClerkRouterResult;
  specialist: SpecialistResponse | null;
  userQuestion: string;
}): VerifierCheckDetail {
  const warnings: string[] = [];
  const { route, specialist } = input;

  if (!specialist) {
    return { score: 100, passed: true };
  }

  const maxPrice =
    route.constraints.max_price ?? route.constraints.budget;
  const inventoryOnly = route.constraints.inventory_only;

  if (maxPrice != null) {
    for (const rec of specialist.recommendations) {
      if (rec.price != null && rec.price > maxPrice) {
        return {
          score: 20,
          passed: false,
          reason: `"${rec.card_name}" exceeds the customer's $${maxPrice} budget constraint.`,
        };
      }
    }
  }

  if (inventoryOnly && specialist.deckList) {
    const outOfStockPresented = specialist.deckList.lines.filter(
      (l) => !l.inStock && !l.substituteNote?.includes("Not in stock"),
    );
    if (outOfStockPresented.length > 0) {
      return {
        score: 40,
        passed: false,
        reason:
          "Inventory-only mode but deck includes slots not marked as unavailable.",
      };
    }
  }

  if (
    inventoryOnly &&
    specialist.recommendations.some((r) => !r.inventoryItemId)
  ) {
    return {
      score: 35,
      passed: false,
      reason:
        "Inventory-only mode but recommendations include cards without store records.",
    };
  }

  const rankingClaim =
    /\b(best|top|most popular|#1|ranked)\b/i.test(input.userQuestion) ||
    /\b(best|top|most popular|#1|ranked)\b/i.test(specialist.direct_answer);
  const hasRankEvidence = specialist.recommendations.some((r) =>
    /EDHREC|rank|#\d+/i.test(r.reason),
  );
  if (rankingClaim && specialist.recommendations.length > 0 && !hasRankEvidence) {
    warnings.push(
      "Response implies ranking but recommendations lack supporting deck-statistics evidence.",
    );
  }

  return {
    score: warnings.length ? 75 : 95,
    passed: true,
    warnings: warnings.length ? warnings : undefined,
  };
}

export function checkStrategicQuality(input: {
  route: ClerkRouterResult;
  specialist: SpecialistResponse | null;
  userQuestion: string;
}): VerifierCheckDetail {
  if (!input.specialist) {
    return { score: 70, passed: true };
  }

  if (input.route.intent === "build_deck" && input.specialist.deckList) {
    const deck = input.specialist.deckList;
    if (!deck.complete && deck.inStockCards < deck.targetCards * 0.6) {
      return {
        score: 50,
        passed: true,
        warnings: [
          "Less than 60% of deck slots filled from inventory — strategy may be incomplete.",
        ],
      };
    }
    if (deck.complete) {
      return { score: 90, passed: true };
    }
    return {
      score: 65,
      passed: true,
      warnings: ["Partial deck — customer should receive a clear game plan anyway."],
    };
  }

  if (
    input.route.intent === "recommendation" &&
    input.specialist.recommendations.length === 1
  ) {
    const asksForList = /\b(best|top|recommend|options|commanders)\b/i.test(
      input.userQuestion,
    );
    if (asksForList) {
      return {
        score: 55,
        passed: true,
        warnings: [
          "Only one valid recommendation — avoid calling this a ranked list of the best options.",
        ],
      };
    }
  }

  return { score: 80, passed: true };
}

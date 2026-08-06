import {
  isSemanticFilterActive,
  parseClerkInventoryQuery,
} from "./clerk-query-parser";
import {
  isEducationThenInventoryRequest,
  questionMentionsEducationTopic,
} from "./education-topics";
import { isRulesQuestion } from "./rules-question";
import {
  isDeckBuildConversation,
  isDeckBuildCommanderPickFollowUp,
  isInventoryOrPriceClerkQuestion,
  parseCommanderMaxPriceFromConversation,
  wantsPowerfulCommander,
} from "./deck-build-context";
import {
  isClerkClarificationFollowUp,
  isGameNameReply,
} from "./clerk-clarification-followup";

export { isInventoryOrPriceClerkQuestion } from "./deck-build-context";

/** Customer explicitly wants a complete deck list built from stock. */
export function isExplicitDeckBuildRequest(
  question: string,
  conversationSummary?: string,
): boolean {
  const q = question.toLowerCase();

  if (conversationSummary && isDeckBuildCommanderPickFollowUp({ question, conversationSummary })) {
    return true;
  }

  if (conversationSummary && isDeckBuildConversation({ question, conversationSummary })) {
    if (DECK_BUILD_IN_CURRENT_MESSAGE.test(q)) return true;
    if (/\bcommander(s)?\b/i.test(q)) return true;
    if (isDeckBuildCommanderPickFollowUp({ question, conversationSummary })) return true;
  }

  if (/\b(looking for|need|got any|do you have|show me|find me|any)\b/i.test(q)) {
    if (!/\b(build|make|assemble|brew)\s+(?:me\s+)?(?:a\s+)?(?:full|complete)\s+deck\b/i.test(q)) {
      return false;
    }
  }

  if (
    /\b(build|make|assemble|brew)\s+(?:me\s+)?(?:(?:the\s+)?(?:best\s+|a\s+|an\s+)|(?:full\s+)?(?:complete\s+)?)(?:commander\s+)?deck\b/i.test(
      q,
    )
  ) {
    return true;
  }

  if (/\bbuild(?:\s+me)?\s+(?:a\s+|an\s+|the\s+)?.+\s+deck\b/i.test(q)) {
    return true;
  }

  if (
    /\b(build|make|assemble|brew)\b/i.test(q) &&
    /\b(?:commander\s+deck|99|100-?card|full\s+deck)\b/i.test(q)
  ) {
    return true;
  }

  if (
    /\bdeck\s+(?:list|around|with|using)\b/i.test(q) &&
    /\b(build|make|assemble|brew)\b/i.test(q)
  ) {
    return true;
  }

  return false;
}

const DECK_BUILD_IN_CURRENT_MESSAGE =
  /\b(build|make|assemble|brew)\s+(?:me\s+)?(?:(?:the\s+)?(?:best\s+|a\s+)|(?:full\s+)?(?:complete\s+)?)(?:commander\s+)?deck\b/i;

/** @deprecated Use isExplicitDeckBuildRequest */
export function isCommanderDeckBuildRequest(question: string): boolean {
  return isExplicitDeckBuildRequest(question);
}

/** Looking for specific cards, types, or effects — not a deck build or commander pick list. */
export function isCardOrTypeInventoryRequest(
  question: string,
  conversationSummary?: string,
): boolean {
  const q = question.toLowerCase();

  if (isExplicitDeckBuildRequest(question, conversationSummary)) return false;
  if (isDeckBuildConversation({ question, conversationSummary })) return false;
  if (isInventoryOrPriceClerkQuestion(question)) return false;
  if (isEducationThenInventoryRequest(question, conversationSummary)) return false;

  const parsed = parseClerkInventoryQuery({ userQuestion: question });
  if (isSemanticFilterActive(parsed.semantic)) return true;

  if (
    /\b(do you have|in stock|how much|price|worth|got any|looking for|need|show me|find me|any|you have|we have)\b/i.test(
      q,
    )
  ) {
    return true;
  }

  if (/\bwant\b/i.test(q) && !/\b(i just want|want an? op\b|want a powerful)\b/i.test(q)) {
    return true;
  }

  if (
    /\b(specific|type of|kind of)\b.*\bcards?\b/i.test(q) ||
    /\bcards?\s+(?:with|that|for)\b/i.test(q)
  ) {
    return true;
  }

  return false;
}

/** Any query that should list or rank verified commander candidates (not deck builds or card facts). */
export function isCommanderCandidateQuery(question: string): boolean {
  const q = question.toLowerCase();
  if (isExplicitDeckBuildRequest(question)) return false;
  if (isEducationThenInventoryRequest(question)) return false;
  if (!/\bcommanders?\b/i.test(q)) return false;

  return (
    isCommanderRecommendationRequest(question) ||
    /\b(cheapest|lowest|most expensive|highest|priciest)\b.*\bcommanders?\b/i.test(q) ||
    /\bcommanders?\b.*\b(cheapest|lowest|most expensive|highest|priciest)\b/i.test(q) ||
    /\bcommanders?\s+in\s+stock\b/i.test(q) ||
    /\b(mono-?|blue|red|green|white|black)\b.*\bcommanders?\b/i.test(q) ||
    /\bcommanders?\b.*\b(that|who|which|cares?|for)\b/i.test(q) ||
    /\b(good|best)\s+\w+\s+commanders?\b/i.test(q)
  );
}

/** Customer wants commander suggestions (best mono-blue, budget commanders, etc.). */
export function isCommanderRecommendationRequest(question: string): boolean {
  const q = question.toLowerCase();
  if (isExplicitDeckBuildRequest(question)) return false;
  if (isEducationThenInventoryRequest(question)) return false;

  const priceSortedCommander =
    /\b(cheapest|lowest|most expensive|highest|priciest)\b.*\bcommanders?\b/i.test(q) ||
    /\bcommanders?\b.*\b(cheapest|lowest|most expensive|highest|priciest)\b/i.test(q);

  if (
    isCardOrTypeInventoryRequest(question) &&
    !/\bbest\b.*\bcommander/i.test(q) &&
    !priceSortedCommander
  ) {
    return false;
  }

  return (
    /\b(best|top|suggest|recommend|which|good)\b.*\bcommanders?\b/i.test(q) ||
    /\bcommanders?\b.*\b(under|budget|recommend|suggest|best|top)\b/i.test(q) ||
    (/\bmono-?\s*(blue|red|green|white|black)\b/i.test(q) && /\bbest\b/i.test(q)) ||
    priceSortedCommander ||
    /\bcommanders?\b.*\b(that|who|which|cares?|for)\b/i.test(q) ||
    /\b(good|best)\s+\w+\s+commanders?\b/i.test(q)
  );
}

/** Simple stock/price lookup — no specialist agent needed. */
export function isSimpleInventoryIntent(intent: string): boolean {
  return intent === "inventory_lookup" || intent === "price_check";
}

/** Bare card name or very short lookup — use inventory search, not full agent. */
export function isSimpleCardNameLookup(
  question: string,
  conversationSummary?: string,
): boolean {
  const q = question.trim();
  if (!q || q.length > 60) return false;
  if (/\?/.test(q) && q.split(/\s+/).length > 6) return false;

  if (
    isGameNameReply(q) ||
    isClerkClarificationFollowUp({ question: q, conversationSummary }) ||
    isExplicitDeckBuildRequest(q, conversationSummary)
  ) {
    return false;
  }

  if (
    isExplicitDeckBuildRequest(q, conversationSummary) ||
    isMagicStrategyAdviceRequest(q) ||
    isInventoryOrPriceClerkQuestion(q) ||
    isCardOrTypeInventoryRequest(q, conversationSummary) ||
    isEducationThenInventoryRequest(q, conversationSummary)
  ) {
    return false;
  }

  if (
    /\b(build|brew|deck|commander|recommend|strategy|rule|explain|what is|what are|why|how)\b/i.test(
      q,
    )
  ) {
    return false;
  }

  const words = q.replace(/[?.!]/g, "").trim().split(/\s+/);
  if (words.length >= 1 && words.length <= 5) {
    return true;
  }

  return false;
}

/** Strategy, opinion, synergy, or general MTG advice — not stock search or CR rules. */
export function isMagicStrategyAdviceRequest(question: string): boolean {
  if (isRulesQuestion(question)) return false;

  const q = question.toLowerCase();

  if (questionMentionsEducationTopic(question)) {
    if (
      !/\b(do you have|got any|in stock|looking for|need|show me|find me)\b/i.test(
        q,
      ) ||
      /\b(what is|what are|explain|define|how does|how do|good|best|which)\b/i.test(
        q,
      )
    ) {
      return true;
    }
  }

  if (
    /\b(rule \d|comprehensive rules|state-based|stack|priority|layers?|timestamp|sb?a)\b/i.test(
      q,
    )
  ) {
    return false;
  }

  if (
    /\b(color pairing|color pair|what (\d+|four|4|three|3|two|2) colors?)\b/i.test(
      q,
    ) ||
    /\bwhat colors? (?:are|is) (?:in|for|on)\b/i.test(q)
  ) {
    return true;
  }

  if (/\b(is it legal|illegal|rules question|how does .+ work|what happens when)\b/i.test(q)) {
    return false;
  }

  return (
    /\b(sleeper|hidden gem|underrated|overrated|off-meta|obscure|lesser known|lesser-known|spicy)\b/i.test(
      q,
    ) ||
    /\b(crazy synergy|synergies|combo|archetype|game plan|win condition|engine)\b/i.test(q) ||
    /\b(who do you think|what do you think|in your opinion|your pick|would you recommend)\b/i.test(
      q,
    ) ||
    /\b(badass|cool commander|fun commander|interesting commander|unique commander|unusual commander|weird commander|offbeat commander|non-meta commander)\b/i.test(
      q,
    ) ||
    /\b(out of the ordinary|not ordinary|unconventional|off the beaten path)\b/i.test(q) ||
    /\b(strategy for|how to play|how does .+ commander|explain .+ in commander)\b/i.test(q) ||
    /\b(what is|what are|what does|define|explain)\b.*\b(magic|mtg|commander|edh)\b/i.test(q) ||
    /\b(blink|flicker|tribal|typal|harmonicon|prepared spell)\b/i.test(q)
  );
}

export {
  isEducationThenInventoryRequest,
  questionMentionsEducationTopic,
} from "./education-topics";
export { isRulesQuestion, extractRequestedRuleNumbers } from "./rules-question";

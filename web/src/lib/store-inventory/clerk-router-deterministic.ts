import {
  isCardOrTypeInventoryRequest,
  isCommanderRecommendationRequest,
  isEducationThenInventoryRequest,
  isExplicitDeckBuildRequest,
  isInventoryOrPriceClerkQuestion,
  isMagicStrategyAdviceRequest,
  isRulesQuestion,
} from "./clerk-tools/clerk-intent";
import { parseCommanderMaxPriceFromConversation } from "./clerk-tools/deck-build-context";
import { parseCommanderMaxPrice } from "./clerk-tools/commander-context";
import { parseClerkInventoryQuery } from "./clerk-tools/clerk-query-parser";
import { isExplicitCommanderInventoryRequest } from "./clerk-tools/clerk-browse-sync";
import type {
  ClerkOrchestratorContext,
  ClerkRouterResult,
} from "./clerk-types";
import {
  classifySimpleClerkQuestion,
  type SimpleClerkCategory,
} from "./simple-clerk/simple-clerk-intent";

function parseBudgetFromQuestion(q: string): number | undefined {
  const patterns = [
    /\bunder\s+\$?\s*(\d+(?:\.\d{2})?)\s*\$?/i,
    /\bbelow\s+\$?\s*(\d+(?:\.\d{2})?)\s*\$?/i,
    /\b(?:budget|max)\s+\$?\s*(\d+(?:\.\d{2})?)\s*\$?/i,
  ];
  for (const pattern of patterns) {
    const match = q.match(pattern);
    if (match?.[1]) return Number.parseFloat(match[1]);
  }
  return undefined;
}

function intentForCategory(category: SimpleClerkCategory): ClerkRouterResult["intent"] {
  switch (category) {
    case "card_fact":
    case "rules_legality":
      return "rules_legality";
    case "inventory_lookup":
      return "inventory_lookup";
    case "commander_recommendation":
      return "recommendation";
    case "terminology":
    case "mixed_education_inventory":
      return "general_chat";
    default:
      return "general_chat";
  }
}

/** Build a clerk route without LLM — for simple-question pipeline. */
export function buildDeterministicClerkRoute(input: {
  ctx: ClerkOrchestratorContext;
  category: SimpleClerkCategory;
}): ClerkRouterResult {
  const q = input.ctx.user_question;
  const summary = input.ctx.conversation_summary;
  const budget = parseBudgetFromQuestion(q);
  const commanderMax =
    parseCommanderMaxPriceFromConversation({
      question: q,
      conversationSummary: summary,
    }) ?? parseCommanderMaxPrice(q);

  const parsed = parseClerkInventoryQuery({ userQuestion: q });
  const cardNames: string[] = [];
  const stockMatch = q.match(
    /(?:do you have|got any|in stock|looking for|need a?)\s+(.+?)(?:\?|$)/i,
  );
  if (stockMatch?.[1]) cardNames.push(stockMatch[1].trim());

  let intent = intentForCategory(input.category);
  if (
    input.category === "inventory_lookup" &&
    /\b(price|worth|how much)\b/i.test(q)
  ) {
    intent = "price_check";
  }

  let required_agents: ClerkRouterResult["required_agents"] = [];
  if (input.category === "commander_recommendation") {
    required_agents = ["mtg_commander"];
  }

  const required_tools: ClerkRouterResult["required_tools"] =
    input.category === "card_fact"
      ? ["card_catalog"]
      : input.category === "rules_legality" || input.category === "terminology"
        ? ["knowledge_retrieval"]
        : input.category === "commander_recommendation"
          ? ["inventory_search", "card_catalog"]
          : ["inventory_search", "price_lookup"];

  return {
    game:
      parsed.browseGame && parsed.browseGame !== "all"
        ? (parsed.browseGame as ClerkRouterResult["game"])
        : "magic",
    format: isExplicitCommanderInventoryRequest(q) ? "commander" : "unknown",
    intent,
    entities: {
      card_names: cardNames,
      archetype: parsed.q,
    },
    constraints: {
      budget,
      inventory_only:
        input.category === "commander_recommendation" ||
        input.category === "inventory_lookup",
      max_price: commanderMax ?? budget,
      tournament_date: null,
    },
    required_agents,
    required_tools,
    clarification_needed: false,
    confidence: 0.95,
  };
}

/** Whether heuristic routing fully covers this question (skip LLM router). */
export function shouldSkipLlmRouter(input: {
  question: string;
  conversationSummary?: string;
}): boolean {
  const q = input.question.trim();
  const summary = input.conversationSummary ?? "";

  if (isExplicitDeckBuildRequest(q, summary)) return false;

  const category = classifySimpleClerkQuestion({
    question: q,
    conversationSummary: summary,
  });

  if (category !== "complex" && category !== "deck_build") return true;

  if (
    isInventoryOrPriceClerkQuestion(q) ||
    isCardOrTypeInventoryRequest(q, summary) ||
    isCommanderRecommendationRequest(q) ||
    isRulesQuestion(q) ||
    isEducationThenInventoryRequest(q, summary)
  ) {
    return true;
  }

  if (isMagicStrategyAdviceRequest(q) && !isExplicitDeckBuildRequest(q, summary)) {
    return true;
  }

  return false;
}

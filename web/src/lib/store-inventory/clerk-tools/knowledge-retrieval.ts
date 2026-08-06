import { isMtgRagEnabled } from "../../mtg-rag/constants";
import { hybridRetrieveMtgKnowledge } from "../../mtg-rag/hybrid-retrieval";
import type { MtgQueryIntent } from "../../mtg-rag/types";
import {
  routeMtgKnowledgeQuery,
  shouldUseKnowledgeRetrieval,
  type MtgQueryRouterResult,
} from "../../mtg-rag/mtg-query-router";
import type { MtgHybridRetrievalResult } from "../../mtg-rag/hybrid-retrieval";
import type { ClerkOrchestratorContext, ClerkIntent } from "../clerk-types";
import {
  isEducationThenInventoryRequest,
  isMagicStrategyAdviceRequest,
  isRulesQuestion,
} from "./clerk-intent";

export interface KnowledgeRetrievalResult {
  mtgRoute: MtgQueryRouterResult;
  knowledge: MtgHybridRetrievalResult;
}

function emptyEntities(): MtgQueryRouterResult["entities"] {
  return {
    commanderNames: [],
    cardNames: [],
    colorIdentities: [],
    formats: [],
    requestedRuleNumbers: [],
  };
}

function knowledgeIntentForClerkQuestion(input: {
  question: string;
  clerkIntent?: ClerkIntent;
}): MtgQueryIntent | null {
  if (isRulesQuestion(input.question)) {
    return "rules_question";
  }

  const q = input.question.toLowerCase();

  if (
    /\b(color pairing|color pair|what (\d+|four|4|three|3|two|2) colors?)\b/i.test(
      q,
    )
  ) {
    return "color_identity_question";
  }

  if (isMagicStrategyAdviceRequest(input.question)) {
    if (
      /\b(rule \d|comprehensive rules|state-based|stack|priority|legal|illegal|sb?a)\b/i.test(
        input.question,
      ) ||
      input.clerkIntent === "rules_legality"
    ) {
      return "rules_question";
    }
    if (/\b(blink|flicker|harmonicon|tribal|typal|prepared)\b/i.test(input.question)) {
      return "terminology_question";
    }
    return "commander_strategy";
  }

  if (isEducationThenInventoryRequest(input.question)) {
    if (/\b(commander|commanders)\b/i.test(input.question)) {
      return "commander_strategy";
    }
    return "terminology_question";
  }

  if (input.clerkIntent === "rules_legality") return "rules_question";
  if (input.clerkIntent === "general_chat") return "mixed";

  return null;
}

function clerkQuestionUsesKnowledge(input: {
  question: string;
  clerkIntent?: ClerkIntent;
  conversationSummary?: string;
}): boolean {
  if (isEducationThenInventoryRequest(input.question, input.conversationSummary)) {
    return true;
  }
  if (isRulesQuestion(input.question)) return true;
  if (isMagicStrategyAdviceRequest(input.question)) return true;
  if (
    input.clerkIntent === "inventory_lookup" ||
    input.clerkIntent === "price_check" ||
    input.clerkIntent === "build_deck"
  ) {
    return false;
  }
  if (
    input.clerkIntent === "general_chat" ||
    input.clerkIntent === "rules_legality" ||
    input.clerkIntent === "recommendation"
  ) {
    return true;
  }
  return false;
}

function shouldSkipKnowledgeForClerkIntent(input: {
  question: string;
  clerkIntent?: ClerkIntent;
  conversationSummary?: string;
}): boolean {
  if (
    isEducationThenInventoryRequest(input.question, input.conversationSummary) ||
    isMagicStrategyAdviceRequest(input.question)
  ) {
    return false;
  }
  return (
    input.clerkIntent === "inventory_lookup" ||
    input.clerkIntent === "price_check" ||
    input.clerkIntent === "build_deck"
  );
}

export async function knowledgeRetrievalTool(input: {
  ctx: ClerkOrchestratorContext;
  clerkIntent?: ClerkIntent;
}): Promise<KnowledgeRetrievalResult | null> {
  const educationRequest = isEducationThenInventoryRequest(
    input.ctx.user_question,
    input.ctx.conversation_summary,
  );
  const strategyRequest = isMagicStrategyAdviceRequest(input.ctx.user_question);

  if (!isMtgRagEnabled()) {
    if (isRulesQuestion(input.ctx.user_question)) {
      return {
        mtgRoute: {
          intent: "rules_question",
          confidence: 0.95,
          entities: emptyEntities(),
          requiresInventory: false,
          requiresKnowledge: true,
        },
        knowledge: {
          hits: [],
          intent: "rules_question",
          corpora: ["comprehensive_rules"],
          aliasMatches: 0,
          vectorMatches: 0,
        },
      };
    }
    if (educationRequest || strategyRequest) {
      const intent = educationRequest ? "mixed" : "commander_strategy";
      return {
        mtgRoute: {
          intent,
          confidence: 0.85,
          entities: emptyEntities(),
          requiresInventory: educationRequest,
          requiresKnowledge: true,
        },
        knowledge: {
          hits: [],
          intent,
          corpora: [],
          aliasMatches: 0,
          vectorMatches: 0,
        },
      };
    }
    return null;
  }

  if (shouldSkipKnowledgeForClerkIntent({
    question: input.ctx.user_question,
    clerkIntent: input.clerkIntent,
    conversationSummary: input.ctx.conversation_summary,
  })) {
    return null;
  }

  const forcedIntent = knowledgeIntentForClerkQuestion({
    question: input.ctx.user_question,
    clerkIntent: input.clerkIntent,
  });

  if (
    forcedIntent ||
    clerkQuestionUsesKnowledge({
      question: input.ctx.user_question,
      clerkIntent: input.clerkIntent,
      conversationSummary: input.ctx.conversation_summary,
    })
  ) {
    const intent =
      forcedIntent ??
      (await routeMtgKnowledgeQuery({
        question: input.ctx.user_question,
        conversationSummary: input.ctx.conversation_summary,
      })).intent;

    const knowledge = await hybridRetrieveMtgKnowledge({
      question: input.ctx.user_question,
      intent,
      limit: intent === "rules_question" ? 12 : undefined,
    });

    return {
      mtgRoute: {
        intent,
        confidence: 0.9,
        entities: emptyEntities(),
        requiresInventory: false,
        requiresKnowledge: true,
      },
      knowledge,
    };
  }

  const mtgRoute = await routeMtgKnowledgeQuery({
    question: input.ctx.user_question,
    conversationSummary: input.ctx.conversation_summary,
  });

  if (!shouldUseKnowledgeRetrieval(mtgRoute)) return null;

  const knowledge = await hybridRetrieveMtgKnowledge({
    question: input.ctx.user_question,
    intent: mtgRoute.intent,
    limit: mtgRoute.intent === "rules_question" ? 12 : undefined,
  });

  return { mtgRoute, knowledge };
}

export function shouldRunKnowledgeSpecialist(input: {
  question: string;
  conversationSummary?: string;
  mtgRoute: MtgQueryRouterResult;
  clerkIntent: string;
  hasKnowledge: boolean;
}): boolean {
  if (isRulesQuestion(input.question)) return true;
  if (!input.hasKnowledge) return false;
  if (isEducationThenInventoryRequest(input.question, input.conversationSummary)) {
    return true;
  }
  if (isMagicStrategyAdviceRequest(input.question)) {
    return true;
  }
  return isKnowledgeOnlyClerkPath({
    mtgRoute: input.mtgRoute,
    clerkIntent: input.clerkIntent,
  });
}

export function isKnowledgeOnlyClerkPath(input: {
  mtgRoute: MtgQueryRouterResult;
  clerkIntent: string;
}): boolean {
  if (!shouldUseKnowledgeRetrieval(input.mtgRoute)) {
    if (
      input.mtgRoute.requiresKnowledge &&
      (input.clerkIntent === "general_chat" ||
        input.clerkIntent === "rules_legality")
    ) {
      return true;
    }
    return false;
  }
  if (input.mtgRoute.requiresInventory) return false;
  if (input.clerkIntent === "inventory_lookup" || input.clerkIntent === "price_check") {
    return false;
  }
  if (input.clerkIntent === "build_deck") return false;
  return true;
}

/** RAG-first path for category inventory (ramp, draw, wipes, etc.). */
export async function retrieveCategoryInventoryKnowledge(input: {
  ctx: ClerkOrchestratorContext;
}): Promise<KnowledgeRetrievalResult | null> {
  if (!isMtgRagEnabled()) return null;

  const knowledge = await hybridRetrieveMtgKnowledge({
    question: input.ctx.user_question,
    intent: "deckbuilding_education",
  });

  return {
    mtgRoute: {
      intent: "deckbuilding_education",
      confidence: 0.9,
      entities: emptyEntities(),
      requiresInventory: true,
      requiresKnowledge: true,
    },
    knowledge,
  };
}

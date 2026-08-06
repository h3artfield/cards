import {
  isCardOrTypeInventoryRequest,
  isEducationThenInventoryRequest,
  isExplicitDeckBuildRequest,
  isInventoryOrPriceClerkQuestion,
  isMagicStrategyAdviceRequest,
  isRulesQuestion,
  isSimpleCardNameLookup,
} from "./clerk-tools/clerk-intent";
import {
  isDeckBuildConversation,
  isDeckBuildCommanderPickFollowUp,
} from "./clerk-tools/deck-build-context";
import { isDeckBuildClarificationFollowUp, isClerkClarificationFollowUp } from "./clerk-tools/clerk-clarification-followup";

/** High-level clerk handling mode (server + client shared). */
export type ClerkRequestMode =
  | "inventory_direct"
  | "deck_build"
  | "knowledge"
  | "mixed";

export type ClerkAnswerSource =
  | "inventory"
  | "knowledge"
  | "deck_build"
  | "mixed";

export interface ClerkRequestClassification {
  mode: ClerkRequestMode;
  answerSource: ClerkAnswerSource;
  useStagedDeckBuild: boolean;
  /** Server hint for inventory search bar (authoritative routing stays on server). */
  redirectToInventorySearch?: string;
}

function extractCardNameFromStockQuestion(question: string): string | undefined {
  const patterns = [
    /\b(?:do you have|got any|in stock|looking for|need|show me|find me|you have|we have|carry)\s+(.+?)(?:\?|$)/i,
    /\bhow much (?:is|for|does)\s+(.+?)(?:\?|$)/i,
    /\bprice (?:on|of|for)\s+(.+?)(?:\?|$)/i,
  ];
  for (const pattern of patterns) {
    const match = question.match(pattern);
    const phrase = match?.[1]?.trim();
    if (phrase && phrase.length >= 2 && phrase.length <= 80) {
      return phrase.replace(/\s+in stock$/i, "").trim();
    }
  }
  return undefined;
}

/** Single source of truth for how a clerk message should be handled. */
export function classifyClerkRequest(input: {
  question: string;
  conversationSummary?: string;
}): ClerkRequestClassification {
  const q = input.question.trim();
  const summary = input.conversationSummary ?? "";

  const useStagedDeckBuild =
    isExplicitDeckBuildRequest(q, summary) ||
    isDeckBuildClarificationFollowUp({ question: q, conversationSummary: summary }) ||
    isDeckBuildCommanderPickFollowUp({ question: q, conversationSummary: summary }) ||
    (isDeckBuildConversation({ question: q, conversationSummary: summary }) &&
      isExplicitDeckBuildRequest(q, summary));

  if (useStagedDeckBuild) {
    return {
      mode: "deck_build",
      answerSource: "deck_build",
      useStagedDeckBuild: true,
    };
  }

  if (isRulesQuestion(q)) {
    return {
      mode: "knowledge",
      answerSource: "knowledge",
      useStagedDeckBuild: false,
    };
  }

  if (isEducationThenInventoryRequest(q, summary)) {
    return {
      mode: "mixed",
      answerSource: "mixed",
      useStagedDeckBuild: false,
    };
  }

  if (
    isInventoryOrPriceClerkQuestion(q) ||
    isCardOrTypeInventoryRequest(q, summary)
  ) {
    const cardPhrase = extractCardNameFromStockQuestion(q);
    return {
      mode: "inventory_direct",
      answerSource: "inventory",
      useStagedDeckBuild: false,
      redirectToInventorySearch: cardPhrase,
    };
  }

  if (
    isClerkClarificationFollowUp({ question: q, conversationSummary: summary })
  ) {
    return {
      mode: "mixed",
      answerSource: "mixed",
      useStagedDeckBuild: false,
    };
  }

  if (isSimpleCardNameLookup(q, summary)) {
    return {
      mode: "inventory_direct",
      answerSource: "inventory",
      useStagedDeckBuild: false,
      redirectToInventorySearch: q,
    };
  }

  if (isMagicStrategyAdviceRequest(q)) {
    return {
      mode: "knowledge",
      answerSource: "knowledge",
      useStagedDeckBuild: false,
    };
  }

  if (/\b(build|brew|assemble)\b.*\bdeck\b/i.test(q)) {
    return {
      mode: "mixed",
      answerSource: "mixed",
      useStagedDeckBuild: false,
    };
  }

  return {
    mode: "mixed",
    answerSource: "mixed",
    useStagedDeckBuild: false,
  };
}

export function answerSourceLabel(source: ClerkAnswerSource): string {
  switch (source) {
    case "inventory":
      return "Checked our in-stock inventory";
    case "knowledge":
      return "Answered from MTG/Pokémon knowledge";
    case "deck_build":
      return "Built from in-stock cards";
    case "mixed":
      return "Knowledge + in-stock picks";
  }
}

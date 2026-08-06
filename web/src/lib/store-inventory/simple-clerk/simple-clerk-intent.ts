import {
  isCardOrTypeInventoryRequest,
  isCommanderCandidateQuery,
  isCommanderRecommendationRequest,
  isEducationThenInventoryRequest,
  isExplicitDeckBuildRequest,
  isInventoryOrPriceClerkQuestion,
  isRulesQuestion,
} from "../clerk-tools/clerk-intent";
import { isDeckBuildConversation } from "../clerk-tools/deck-build-context";
import { questionMentionsEducationTopic } from "../clerk-tools/education-topics";
import { lookupEmbeddedClerkKnowledge } from "../../mtg-rag/embedded-clerk-knowledge";

export type SimpleClerkCategory =
  | "card_fact"
  | "inventory_lookup"
  | "commander_recommendation"
  | "terminology"
  | "rules_legality"
  | "mixed_education_inventory"
  | "deck_build"
  | "complex";

const CARD_FACT_PATTERNS: Array<{
  kind: import("./simple-card-fact").CardFactKind;
  pattern: RegExp;
}> = [
  {
    kind: "commander_eligibility",
    pattern: /\b(?:is|are)\s+(.+?)\s+(?:a|an)\s+commander\b/i,
  },
  {
    kind: "commander_eligibility",
    pattern:
      /\bcan\s+(.+?)\s+be\s+(?:my|a|the)\s+commander\b/i,
  },
  {
    kind: "planeswalker_commander",
    pattern:
      /\bcan\s+(?:this|that)\s+planeswalker\s+be\s+(?:my|a)\s+commander\b/i,
  },
  {
    kind: "color_identity",
    pattern: /\bwhat\s+colors?\s+(?:is|are)\s+(.+?)\??\s*$/i,
  },
  {
    kind: "card_type",
    pattern: /\bwhat\s+(?:type|kind)\s+of\s+card\s+is\s+(.+?)\??\s*$/i,
  },
  {
    kind: "legendary",
    pattern: /\b(?:is|are)\s+(.+?)\s+legendary\b/i,
  },
];

const GENERIC_CARD_PHRASES = new Set([
  "a sorcery",
  "an instant",
  "an artifact",
  "a creature",
  "a planeswalker",
  "a land",
  "an enchantment",
  "this card",
  "that card",
  "this planeswalker",
  "that planeswalker",
]);

function isGenericCardPhrase(phrase: string): boolean {
  return GENERIC_CARD_PHRASES.has(phrase.trim().toLowerCase());
}

export function extractCardPhraseFromFactQuestion(
  question: string,
): { kind: import("./simple-card-fact").CardFactKind; cardPhrase: string } | null {
  const q = question.trim();
  for (const { kind, pattern } of CARD_FACT_PATTERNS) {
    const match = q.match(pattern);
    const phrase = match?.[1]?.trim().replace(/\?$/, "");
    if (
      phrase &&
      phrase.length >= 2 &&
      phrase.length <= 80 &&
      !isGenericCardPhrase(phrase)
    ) {
      return { kind, cardPhrase: phrase };
    }
  }

  if (/\bcan\s+(.+?)\s+be\s+my\s+commander\b/i.test(q)) {
    const m = q.match(/\bcan\s+(.+?)\s+be\s+my\s+commander\b/i);
    const phrase = m?.[1]?.trim();
    if (phrase && !isGenericCardPhrase(phrase)) {
      return { kind: "commander_eligibility", cardPhrase: phrase };
    }
  }

  return null;
}

export function isCardFactQuestion(question: string): boolean {
  return extractCardPhraseFromFactQuestion(question) != null;
}

export function isPureTerminologyQuestion(question: string): boolean {
  const q = question.trim();
  if (isCardFactQuestion(q)) return false;
  if (isInventoryOrPriceClerkQuestion(q)) return false;
  if (isCommanderRecommendationRequest(q)) return false;
  if (isExplicitDeckBuildRequest(q)) return false;

  return (
    (/^\s*what\s+is\s+(?:an?\s+)?[\w\s-]+\??\s*$/i.test(q) &&
      questionMentionsEducationTopic(q)) ||
    (/^\s*what\s+is\s+(?:an?\s+)?[\w\s-]+\??\s*$/i.test(q) &&
      lookupEmbeddedClerkKnowledge(q).length > 0)
  );
}

/** Classify simple clerk questions — deck builds and complex chats return complex. */
export function classifySimpleClerkQuestion(input: {
  question: string;
  conversationSummary?: string;
}): SimpleClerkCategory {
  const q = input.question.trim();
  const summary = input.conversationSummary ?? "";

  if (
    isExplicitDeckBuildRequest(q, summary) ||
    isDeckBuildConversation({ question: q, conversationSummary: summary })
  ) {
    return "deck_build";
  }

  if (isCardFactQuestion(q)) return "card_fact";

  if (isEducationThenInventoryRequest(q, summary)) {
    return "mixed_education_inventory";
  }

  if (isRulesQuestion(q)) return "rules_legality";

  if (isPureTerminologyQuestion(q)) return "terminology";

  if (isCommanderCandidateQuery(q)) return "commander_recommendation";

  if (
    isInventoryOrPriceClerkQuestion(q) ||
    isCardOrTypeInventoryRequest(q, summary)
  ) {
    return "inventory_lookup";
  }

  if (questionMentionsEducationTopic(q)) return "terminology";

  return "complex";
}

export function shouldUseSimpleClerkPipeline(input: {
  question: string;
  conversationSummary?: string;
}): boolean {
  const category = classifySimpleClerkQuestion(input);
  return category !== "complex" && category !== "deck_build";
}

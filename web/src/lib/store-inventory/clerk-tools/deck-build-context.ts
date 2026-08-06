import { parseCommanderMaxPrice } from "./commander-context";

export const DECK_BUILD_SIGNAL =
  /\b(build(?:\s+me)?\s+(?:(?:the\s+)?best\s+|a\s+|an\s+|complete\s+|full\s+)?(?:(?:[\w'-]+\s+)+)?(?:commander\s+)?deck|build(?:\s+me)?\s+(?:a\s+|an\s+|the\s+)?.+\s+deck|100-?card(?:\s+deck)?|deck\s+(?:around|with|using))\b/i;

const COMMANDER_PICK_SIGNAL =
  /\b(you can pick|your pick|pick one|pick something|surprise me|whatever you|any commander|dealer'?s choice|up to you)\b/i;

const POWERFUL_COMMANDER_SIGNAL =
  /\b(op\b|overpowered|most powerful|strongest|best one|best commander|competitive|cEDH|high power)\b/i;

/** Inventory, price, or stock lookup — not a deck-build continuation. */
export function isInventoryOrPriceClerkQuestion(question: string): boolean {
  const q = question.toLowerCase();
  return (
    /\b(do you have|in stock|how much|what'?s the price|price of|worth|got any|looking for|show me|find me|you have|we have|carry)\b/i.test(
      q,
    ) ||
    /\b(highest|lowest|cheapest|most expensive|priciest|best price)\b/i.test(q) ||
    /\bwhat(?:'s| is| are)\s+(?:the\s+)?(?:highest|lowest|cheapest|most expensive|best)\b/i.test(q)
  );
}

/** Prior turns show the customer wants a full Commander deck built from stock. */
export function isDeckBuildConversation(input: {
  question: string;
  conversationSummary?: string;
}): boolean {
  const q = input.question.trim();
  if (!q) return false;

  if (isInventoryOrPriceClerkQuestion(q)) return false;

  if (DECK_BUILD_SIGNAL.test(q)) return true;

  const summary = input.conversationSummary ?? "";
  const priorDeckBuild = DECK_BUILD_SIGNAL.test(summary);
  if (!priorDeckBuild) return false;

  if (COMMANDER_PICK_SIGNAL.test(q) || POWERFUL_COMMANDER_SIGNAL.test(q)) {
    return true;
  }

  if (
    /\bcommander(s)?\b/i.test(q) &&
    /\b(under|below|less than|budget|\$\d+|costs?)\b/i.test(q)
  ) {
    return true;
  }

  return false;
}

/** Follow-up where customer delegates commander choice during a deck build thread. */
export function isDeckBuildCommanderPickFollowUp(input: {
  question: string;
  conversationSummary?: string;
}): boolean {
  if (!isDeckBuildConversation(input)) return false;
  return (
    COMMANDER_PICK_SIGNAL.test(input.question) ||
    POWERFUL_COMMANDER_SIGNAL.test(input.question) ||
    (/\bcommander(s)?\b/i.test(input.question) &&
      !/\b(build|make|assemble|brew)\s+(?:me\s+)?(?:a\s+)?deck\b/i.test(input.question))
  );
}

/** Combined question text for RAG + planner (current message + recent deck-build context). */
export function deckBuildQuestionForPlanning(input: {
  question: string;
  conversationSummary?: string;
}): string {
  const customerLines = (input.conversationSummary ?? "")
    .split("\n")
    .filter((line) => line.startsWith("Customer:"))
    .map((line) => line.replace(/^Customer:\s*/, "").trim())
    .slice(-3);

  const relevant = customerLines.filter(
    (line) =>
      DECK_BUILD_SIGNAL.test(line) ||
      (/\bcommander(s)?\b/i.test(line) && /\b(under|below|less than|budget|\$\d+|costs?)\b/i.test(line)) ||
      COMMANDER_PICK_SIGNAL.test(line) ||
      POWERFUL_COMMANDER_SIGNAL.test(line),
  );

  const parts = [...relevant, input.question.trim()].filter(Boolean);
  return [...new Set(parts)].join(" ");
}

/** Commander price cap from current message or recent deck-build turns. */
export function parseCommanderMaxPriceFromConversation(input: {
  question: string;
  conversationSummary?: string;
}): number | undefined {
  const combined = deckBuildQuestionForPlanning(input);
  return (
    parseCommanderMaxPrice(input.question) ??
    parseCommanderMaxPrice(combined) ??
    parseLoosePriceCap(combined)
  );
}

/** Whole-deck budget from current message or recent deck-build turns. */
export function parseDeckMaxPriceFromConversation(input: {
  question: string;
  conversationSummary?: string;
}): number | undefined {
  const combined = deckBuildQuestionForPlanning(input);
  return parseDeckMaxPrice(input.question) ?? parseDeckMaxPrice(combined);
}

/** Whole-deck budget (distinct from commander-only cap). */
export function parseDeckMaxPrice(text: string): number | undefined {
  const patterns = [
    /\b(?:whole|full|entire|total)\s+deck\s+(?:under|below|for under|less than)\s+\$?\s*(\d+(?:\.\d{2})?)/i,
    /\bdeck\s+(?:under|below|less than|for under)\s+\$?\s*(\d+(?:\.\d{2})?)\s*(?:total|dollars?)?/i,
    /\bunder\s+\$?\s*(\d+(?:\.\d{2})?)\s*(?:for the|for a|total|whole)\s+deck/i,
    /\bbuild(?:\s+me)?\s+(?:a\s+)?(?:commander\s+)?deck\s+under\s+\$?\s*(\d+(?:\.\d{2})?)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return Number.parseFloat(match[1]);
  }
  return undefined;
}

export function deckBudgetNote(input: {
  question: string;
  conversationSummary?: string;
  deckTotal?: number;
}): string | undefined {
  const combined = deckBuildQuestionForPlanning({
    question: input.question,
    conversationSummary: input.conversationSummary,
  });
  const commanderCap = parseCommanderMaxPrice(combined);
  const deckCap = parseDeckMaxPrice(combined);
  if (deckCap != null) {
    const over =
      input.deckTotal != null && input.deckTotal > deckCap
        ? ` (currently $${input.deckTotal.toFixed(2)} — over your $${deckCap} deck budget)`
        : "";
    return `Deck budget: $${deckCap} total${over}.`;
  }
  if (commanderCap != null) {
    return `Commander budget: under $${commanderCap} (maindeck not capped).`;
  }
  return undefined;
}

function parseLoosePriceCap(text: string): number | undefined {
  const patterns = [
    /\bless than\s+\$?\s*(\d+(?:\.\d{2})?)\s*dollars?/i,
    /\bunder\s+\$?\s*(\d+(?:\.\d{2})?)\s*dollars?/i,
    /\b(?:costs?|price)\s+(?:less than|under|below)\s+\$?\s*(\d+(?:\.\d{2})?)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return Number.parseFloat(match[1]);
  }
  return undefined;
}

/** Customer wants a powerful / optimized commander (not a literal card named "op"). */
export function wantsPowerfulCommander(question: string): boolean {
  return POWERFUL_COMMANDER_SIGNAL.test(question);
}

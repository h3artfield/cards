import { DECK_BUILD_SIGNAL } from "./deck-build-context";

export { DECK_BUILD_SIGNAL };

const CLERK_CLARIFICATION_QUESTION =
  /\b(what game|which game|magic or pokemon|pokémon or magic|mtg or pokemon|for magic or|what format|which format)\b/i;

const GAME_NAME_REPLY =
  /^(?:magic(?:\s+the\s+gathering)?|mtg|pok[eé]mon(?:\s+tcg)?|yugioh|yu-gi-oh|lorcana|one piece|flesh and blood)$/i;

/** Short reply naming a TCG — not a card title. */
export function isGameNameReply(question: string): boolean {
  const q = question.trim().replace(/[?.!]+$/g, "").trim();
  if (!q || q.length > 40) return false;
  return GAME_NAME_REPLY.test(q);
}

function lastClerkLine(conversationSummary: string): string | undefined {
  const lines = conversationSummary.split("\n").filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (lines[i].startsWith("Clerk:")) {
      return lines[i].replace(/^Clerk:\s*/, "").trim();
    }
  }
  return undefined;
}

/** Customer is answering a clarifying question the clerk just asked. */
export function isClerkClarificationFollowUp(input: {
  question: string;
  conversationSummary?: string;
}): boolean {
  const summary = input.conversationSummary?.trim();
  if (!summary) return false;

  const clerkAsked = lastClerkLine(summary);
  if (!clerkAsked || !CLERK_CLARIFICATION_QUESTION.test(clerkAsked)) {
    return false;
  }

  const q = input.question.trim();
  if (!q || q.length > 80 || q.includes("?")) return false;

  return (
    isGameNameReply(q) ||
    /\b(magic|mtg|pok[eé]mon|commander|standard|expanded|yugioh|lorcana)\b/i.test(q)
  );
}

/** Answering "what game?" after a deck-build request — continue the deck build. */
export function isDeckBuildClarificationFollowUp(input: {
  question: string;
  conversationSummary?: string;
}): boolean {
  if (!isClerkClarificationFollowUp(input)) return false;
  const summary = input.conversationSummary ?? "";
  return (
    DECK_BUILD_SIGNAL.test(summary) ||
    /\bbuild(?:\s+me)?\s+(?:a\s+|an\s+|the\s+)?.+\s+deck\b/i.test(summary)
  );
}

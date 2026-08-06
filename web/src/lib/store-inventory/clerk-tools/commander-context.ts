import { isDeckThemePhrase } from "./deck-theme-phrases";
const RESERVED_COMMANDER_TOKENS = new Set([
  "unknown",
  "commander",
  "commanders",
  "something",
  "anything",
  "pick",
  "op",
  "best",
  "powerful",
  "deck",
  "decks",
  "card",
  "cards",
  "legendary",
  "creature",
  "standard",
  "modern",
  "magic",
  "mtg",
]);

/** True when the string looks like a real card name, not a budget/constraint phrase. */
export function isConcreteCommanderName(name: string | undefined): boolean {
  if (!name?.trim()) return false;
  const n = name.trim();
  const lower = n.toLowerCase();

  if (lower.length < 3) return false;
  if (RESERVED_COMMANDER_TOKENS.has(lower)) return false;
  if (/^(a|an|the|some|any|my|your|pick|something|anything)\b/i.test(n)) return false;
  if (/^(pick|something|anything)\s+/i.test(n)) return false;
  if (/^\bcommander(s)?\b$/i.test(n)) return false;
  if (/\bcommander(s)?\s+(that|under|below|less|cost|who|which|with)\b/i.test(lower)) {
    return false;
  }
  if (/\b(under|below|less than|budget|cheaper than|costs? less)\b/i.test(lower)) {
    return false;
  }
  if (/\$\d+/.test(n)) return false;
  if (/\d+\s*dollars?/i.test(lower)) return false;
  if (/\b(in stock|we have|available|from stock)\b/i.test(lower)) return false;
  if (isDeckThemePhrase(n)) return false;

  return true;
}

/** Max price for the commander itself (not the whole deck). */
export function parseCommanderMaxPrice(question: string): number | undefined {
  const patterns = [
    /\bcommander(?:s)?\s+(?:that\s+)?(?:costs?|is|are|priced?\s+at)\s+(?:less than|under|below)\s+\$?\s*(\d+(?:\.\d{2})?)/i,
    /\b(?:with\s+)?(?:a|an)\s+commander\s+(?:that\s+)?(?:costs?|under|below|less than)\s+\$?\s*(\d+(?:\.\d{2})?)/i,
    /\bcommander\s+(?:under|below|for under|less than|cheaper than)\s+\$?\s*(\d+(?:\.\d{2})?)/i,
    /\bcommander\s+(?:under|below)\s+(\d+(?:\.\d{2})?)\s*dollars?/i,
  ];
  for (const pattern of patterns) {
    const match = question.match(pattern);
    if (match?.[1]) return Number.parseFloat(match[1]);
  }
  return undefined;
}

/** Parse commander name from message + recent conversation context. */
export function parseCommanderFromMessage(input: {
  question: string;
  conversationSummary: string;
  deckBuildOnly?: boolean;
}): string | undefined {
  const q = input.question;
  const combined = `${input.conversationSummary}\n${q}`;

  if (input.deckBuildOnly && !/\b(build|make|assemble|brew)\b/i.test(q)) {
    return undefined;
  }

  const explicitPatterns = [
    /\bcommander\s+'(.+?)'(?:\s*,|\s+and|\s*$)/i,
    /\bcommander\s+"([^"]+)"/i,
    /\b(?:around|with|using)\s+(?:the\s+)?commander\s+'(.+?)'(?:\s*,|\s+and|\s*$)/i,
    /\bfocused\s+around\s+(?:the\s+)?commander\s+'(.+?)'(?:\s*,|\s+and|\s*$)/i,
    /\busing\s+(.+?)\s+as\s+(?:the\s+)?commander/i,
    /\bwith\s+(.+?)\s+as\s+(?:the\s+)?commander/i,
    /\bbuild(?:\s+me)?\s+a\s+commander\s+deck\s+(?:around|with|using)\s+(.+?)(?:\?|$)/i,
    /\bbuild(?:\s+me)?\s+(?:a\s+)?(?:complete\s+)?deck\s+(?:around|with|using)\s+(.+?)(?:\s+as\s+commander)?(?:\?|$)/i,
    /\b(?:deck\s+)?(?:around|with|using)\s+([A-Z][^,?]+(?:,\s+[A-Z][^,?]+)*)/,
  ];

  for (const pattern of explicitPatterns) {
    const match = q.match(pattern);
    if (!match?.[1]) continue;
    const name = match[1].trim().replace(/\.$/, "");
    if (/^(him|her|it|that|this|the iron man one)$/i.test(name)) continue;
    if (isDeckThemePhrase(name)) continue;
    if (/^iron man/i.test(name)) {
      return (
        combined.match(/Iron Man, [^—$\n]+/)?.[0]?.trim() ?? "Iron Man, Modern Marvel"
      );
    }
    if (!isConcreteCommanderName(name)) continue;
    return name;
  }

  if (/\b(?:lets?|let's)\s+use\s+(?:the\s+)?(.+?)(?:\s+one)?[.!?\s]*$/i.test(q)) {
    const useMatch = q.match(
      /\b(?:lets?|let's)\s+use\s+(?:the\s+)?(.+?)(?:\s+one)?[.!?\s]*$/i,
    );
    const target = useMatch?.[1]?.trim() ?? "";
    if (/iron man/i.test(target)) {
      return (
        combined.match(/Iron Man, [^—$\n]+/)?.[0]?.trim() ?? "Iron Man, Modern Marvel"
      );
    }
  }

  if (/\b(him|her|the iron man one|that one|this one)\b/i.test(q)) {
    const iron = combined.match(/Iron Man, [^—$\n]+/)?.[0]?.trim();
    if (iron) return iron;
  }

  if (/\bbuild\b/i.test(q) && /\bdeck\b/i.test(q)) {
    const fromList = combined.match(
      /\d+\.\s+([^—$\n]+?)\s+—\s+\$[\d.]+/,
    )?.[1]?.trim();
    if (fromList && !/lorien|revealed|sorcery/i.test(fromList)) {
      return fromList;
    }
    const iron = combined.match(/Iron Man, [^—$\n]+/)?.[0]?.trim();
    if (iron) return iron;
  }

  return undefined;
}
